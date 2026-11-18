import * as THREE from 'three';

/**
 * Articulated door rigging for GLB coachwork.
 *
 * Two ways a door leaf gets its geometry:
 *  1. `nodes`  – whole GLB nodes that are already modelled as separate door parts.
 *  2. `cut`    – panels that live inside a shared body mesh (e.g. DB12). Each body mesh is
 *                split into position-welded connected components; components whose car-space
 *                bounds pass the filter are moved into a new mesh that shares the original
 *                vertex buffers, so materials, UVs and quantisation stay untouched.
 *
 * Every leaf rotates about a real hinge axis (axis-angle quaternion), not an Euler hack,
 * which is what makes swan, dihedral and gullwing motions read correctly.
 */

export type DoorMotion = 'swan' | 'dihedral' | 'gullwing';

export interface DoorLeafSpec {
  side: -1 | 1;
  motion: DoorMotion;
  /** GLB node names (raw or loader-sanitised) to hinge as a unit. */
  nodes?: string[];
  /** Component filter for panels that must be cut out of shared body meshes. */
  cut?: (bounds: THREE.Box3, meshName: string) => boolean;
  /** Only meshes whose name passes this test are scanned by `cut`. */
  cutMeshes?: RegExp;
  /** Hinge pivot in car space (metres, nose −Z, left −X). */
  hinge: THREE.Vector3;
  /** Hinge axis in car space; normalised on build. */
  axis: THREE.Vector3;
  /** Signed full-open angle in radians. */
  openAngle: number;
  /** Stagger in seconds so both leaves never move as one rigid block. */
  delay: number;
}

export interface DoorLeaf {
  spec: DoorLeafSpec;
  pivot: THREE.Group;
  axis: THREE.Vector3;
  /** Tween state – value is the eased open fraction actually applied. */
  from: number;
  to: number;
  t: number;
  duration: number;
  wait: number;
  value: number;
  ownedGeometries: THREE.BufferGeometry[];
}

/**
 * GLTFLoader runs node names through PropertyBinding.sanitizeNodeName, which strips
 * `[ ] . : /` and turns whitespace into `_`. Lookups must use the same rule or a name like
 * `Plane.047` silently resolves to nothing – the original cause of the dead Valkyrie doors.
 */
export function findNodeByName(root: THREE.Object3D, rawName: string): THREE.Object3D | undefined {
  return (
    root.getObjectByName(rawName) ??
    root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(rawName))
  );
}

function computeIndexedBounds(
  geometry: THREE.BufferGeometry,
  index: ArrayLike<number>
): { box: THREE.Box3; sphere: THREE.Sphere } {
  const pos = geometry.getAttribute('position');
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < index.length; i++) {
    v.fromBufferAttribute(pos, index[i]);
    box.expandByPoint(v);
  }
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return { box, sphere };
}

function makeSubGeometry(source: THREE.BufferGeometry, index: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    geo.setAttribute(name, source.attributes[name]);
  }
  const maxIndex = source.getAttribute('position').count;
  const IndexArray = maxIndex > 65535 ? Uint32Array : Uint16Array;
  geo.setIndex(new THREE.BufferAttribute(new IndexArray(index), 1));
  const { box, sphere } = computeIndexedBounds(geo, index);
  geo.boundingBox = box;
  geo.boundingSphere = sphere;
  return geo;
}

/**
 * Splits `mesh` into body + panel meshes. Returns the new panel mesh (already parented next to
 * the source mesh with an identical transform), or null when no component matched.
 * The source mesh keeps the remaining triangles via a fresh geometry, so the cached GLB
 * template shared by other stages is never mutated.
 */
function cutComponents(
  mesh: THREE.Mesh,
  carSpace: THREE.Matrix4,
  filter: (bounds: THREE.Box3, meshName: string) => boolean,
  owned: THREE.BufferGeometry[]
): THREE.Mesh | null {
  const geometry = mesh.geometry;
  if (geometry.groups.length > 0) return null;
  const pos = geometry.getAttribute('position');
  if (!pos) return null;
  const vertexCount = pos.count;
  const index: ArrayLike<number> =
    geometry.index?.array ?? Array.from({ length: vertexCount }, (_, i) => i);

  // Union-find over vertices; weld coincident positions so UV/normal seams don't split panels.
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  geometry.computeBoundingBox();
  const diag = geometry.boundingBox!.getSize(new THREE.Vector3()).length() || 1;
  const quant = 1 / (diag * 2e-5);
  const welded = new Map<string, number>();
  const carPos = new Float32Array(vertexCount * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < vertexCount; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${Math.round(v.x * quant)},${Math.round(v.y * quant)},${Math.round(v.z * quant)}`;
    const hit = welded.get(key);
    if (hit === undefined) welded.set(key, i);
    else union(i, hit);
    v.applyMatrix4(carSpace);
    carPos[i * 3] = v.x;
    carPos[i * 3 + 1] = v.y;
    carPos[i * 3 + 2] = v.z;
  }
  for (let t = 0; t < index.length; t += 3) {
    union(index[t], index[t + 1]);
    union(index[t], index[t + 2]);
  }

  const bounds = new Map<number, THREE.Box3>();
  for (let t = 0; t < index.length; t += 3) {
    const root = find(index[t]);
    let b = bounds.get(root);
    if (!b) {
      b = new THREE.Box3();
      bounds.set(root, b);
    }
    for (let k = 0; k < 3; k++) {
      const vi = index[t + k] * 3;
      v.set(carPos[vi], carPos[vi + 1], carPos[vi + 2]);
      b.expandByPoint(v);
    }
  }

  const selected = new Set<number>();
  bounds.forEach((b, root) => {
    if (filter(b, mesh.name)) selected.add(root);
  });
  if (selected.size === 0) return null;

  const keep: number[] = [];
  const take: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const bucket = selected.has(find(index[t])) ? take : keep;
    bucket.push(index[t], index[t + 1], index[t + 2]);
  }

  const bodyGeo = makeSubGeometry(geometry, keep);
  const panelGeo = makeSubGeometry(geometry, take);
  owned.push(bodyGeo, panelGeo);
  mesh.geometry = bodyGeo;

  const panel = new THREE.Mesh(panelGeo, mesh.material);
  panel.name = `${mesh.name}__door`;
  panel.castShadow = mesh.castShadow;
  panel.receiveShadow = mesh.receiveShadow;
  panel.renderOrder = mesh.renderOrder;
  panel.position.copy(mesh.position);
  panel.quaternion.copy(mesh.quaternion);
  panel.scale.copy(mesh.scale);
  mesh.parent?.add(panel);
  return panel;
}

/**
 * Builds hinge pivots inside `container` (car space) for every spec.
 * `glbRoot` must already be parented under `container` with world matrices up to date.
 */
export function buildDoorLeaves(
  container: THREE.Object3D,
  glbRoot: THREE.Object3D,
  specs: DoorLeafSpec[]
): DoorLeaf[] {
  container.updateMatrixWorld(true);
  const toCar = new THREE.Matrix4().copy(container.matrixWorld).invert();

  // Gather candidate meshes once (cuts mutate geometry, so snapshot first).
  const meshes: THREE.Mesh[] = [];
  glbRoot.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  const leaves: DoorLeaf[] = [];
  for (const spec of specs) {
    const parts: THREE.Object3D[] = [];
    const owned: THREE.BufferGeometry[] = [];

    spec.nodes?.forEach((name) => {
      const node = findNodeByName(glbRoot, name);
      if (node) parts.push(node);
      else console.warn(`[doorRig] node not found: ${name}`);
    });

    if (spec.cut) {
      for (const mesh of meshes) {
        if (spec.cutMeshes && !spec.cutMeshes.test(mesh.name)) continue;
        const carSpace = new THREE.Matrix4().multiplyMatrices(toCar, mesh.matrixWorld);
        const panel = cutComponents(mesh, carSpace, spec.cut, owned);
        if (panel) {
          panel.updateMatrixWorld(true);
          parts.push(panel);
        }
      }
    }

    if (parts.length === 0) {
      console.warn(`[doorRig] no geometry for ${spec.motion} door on side ${spec.side}`);
      continue;
    }

    const pivot = new THREE.Group();
    pivot.name = `door_pivot_${spec.side < 0 ? 'L' : 'R'}`;
    pivot.position.copy(spec.hinge);
    container.add(pivot);
    pivot.updateMatrixWorld(true);
    parts.forEach((p) => {
      p.updateMatrixWorld(true);
      pivot.attach(p);
    });

    leaves.push({
      spec,
      pivot,
      axis: spec.axis.clone().normalize(),
      from: 0,
      to: 0,
      t: 1,
      duration: 1,
      wait: 0,
      value: 0,
      ownedGeometries: owned,
    });
  }
  return leaves;
}

/** Full-travel time of a door, in seconds. */
export const DOOR_TRAVEL_SECONDS = 1.55;

/**
 * Motion profile of a door leaf: maps linear time progress t∈[0,1] to open fraction.
 *
 * Luxury doors are gas-strut damped: they leave the latch gently, carry momentum through
 * the middle of the arc, then settle with no bounce. Smootherstep (C2-continuous) gives
 * zero velocity *and* zero acceleration at both ends, so there is no visible "kick".
 */
export function doorEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Re-times every leaf toward a new target from wherever it currently is. */
export function retargetDoorLeaves(leaves: DoorLeaf[], open: boolean): void {
  const to = open ? 1 : 0;
  const maxDelay = leaves.reduce((m, l) => Math.max(m, l.spec.delay), 0);
  leaves.forEach((leaf) => {
    if (leaf.to === to && leaf.t < 1) return;
    leaf.from = leaf.value;
    leaf.to = to;
    leaf.t = 0;
    // Shorter remaining arc → proportionally shorter travel, never snappier than 35%.
    leaf.duration = DOOR_TRAVEL_SECONDS * Math.max(0.35, Math.abs(to - leaf.from));
    // Closing reverses the stagger so the last door opened is the first to close.
    leaf.wait = open ? leaf.spec.delay : maxDelay - leaf.spec.delay;
  });
}

const _q = new THREE.Quaternion();

export function updateDoorLeaves(leaves: DoorLeaf[], dt: number): boolean {
  let moving = false;
  for (const leaf of leaves) {
    if (leaf.t >= 1 && leaf.value === leaf.to) continue;
    moving = true;
    if (leaf.wait > 0) {
      leaf.wait -= dt;
      continue;
    }
    leaf.t = Math.min(1, leaf.t + dt / leaf.duration);
    leaf.value = leaf.from + (leaf.to - leaf.from) * doorEase(leaf.t);
    if (leaf.t >= 1) leaf.value = leaf.to;
    _q.setFromAxisAngle(leaf.axis, leaf.spec.openAngle * leaf.value);
    leaf.pivot.quaternion.copy(_q);
  }
  return moving;
}

export function disposeDoorLeaves(leaves: DoorLeaf[]): void {
  leaves.forEach((leaf) => leaf.ownedGeometries.forEach((g) => g.dispose()));
}
