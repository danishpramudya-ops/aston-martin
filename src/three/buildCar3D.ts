import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import type { QWheelFinish } from '../data/engineeringData';
import { buildCabin3D, type Cabin3DResult } from './cabinBuilder';
import { getBlueprintForCar, type Car3DBlueprint } from './carProfiles';
import {
  buildDoorLeaves,
  disposeDoorLeaves,
  findNodeByName,
  retargetDoorLeaves,
  updateDoorLeaves,
  type DoorLeaf,
  type DoorLeafSpec,
} from './doorRig';
import { createClusterTexture, createLeatherTextures, getCarbonWeaveTexture, getRotorTextures } from './textures';
import { createXrayMaterial, installMetallicFlake, installTriplanarCarbon, smoothCreasedNormals } from './surfaceShaders';
import { straightenSteering } from './wheelAlignment';
import { buildMechanicals, measureWheelCorners, type Mechanicals } from './mechanicals';

export interface Car3DInstance {
  root: THREE.Group;
  blueprint: Car3DBlueprint;
  setPaint: (paint: QPaintFinish) => void;
  setCaliper: (caliper: QCaliperFinish) => void;
  setWheelFinish: (wheel: QWheelFinish) => void;
  setCabinTrim: (trim: QCabinTrim) => void;
  setDoorsOpen: (open: boolean) => void;
  setLightsMode: (nightMode: boolean) => void;
  setXRay: (xray: boolean) => void;
  setInteriorMode: (inside: boolean) => void;
  setActiveAero: (speedKmh: number) => void;
  setBrakeThermal: (tempNorm: number) => void;
  setDriveDynamics: (pitchRad: number, rollRad: number, braking01: number, rpmNorm: number) => void;
  /** Resolves once the GLB coachwork is mounted, shaded and rigged (rejects on load failure). */
  ready: Promise<void>;
  /** Advances animation; returns true while any door leaf is still moving. */
  update: (dt: number) => boolean;
  dispose: () => void;
}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const glbTemplateCache = new Map<string, Promise<THREE.Group>>();

/** Starts (or joins) a car's GLB download early, so a deferred build only pays for parsing. */
export function preloadCarModel(carId: string): void {
  loadGlbTemplate(carId).catch(() => undefined);
}

function loadGlbTemplate(carId: string): Promise<THREE.Group> {
  const existing = glbTemplateCache.get(carId);
  if (existing) return existing;

  const url = `./models/${carId}.glb`;
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        glbTemplateCache.delete(carId);
        reject(err);
      }
    );
  });

  glbTemplateCache.set(carId, promise);
  return promise;
}

/**
 * Preloads all 4 Aston Martin high-polygon GLB models into memory cache.
 */
export function preloadAllCarGlbs(): void {
  ['valkyrie', 'valhalla', 'vanquish', 'db12'].forEach((id) => {
    loadGlbTemplate(id).catch(() => {
      // Ignore background preload errors
    });
  });
}

function getFullNodePath(obj: THREE.Object3D): string {
  const parts: string[] = [];
  let curr: THREE.Object3D | null = obj;
  while (curr) {
    if (curr.name) parts.push(curr.name);
    curr = curr.parent;
  }
  return parts.join('/');
}

/**
 * Builds the left leaf, then mirrors it across the car centreline for the right leaf.
 * A reflection turns rotation R(axis, φ) into R(mirroredAxis, −φ), so the right door
 * gets the x-flipped hinge/axis and the negated angle.
 */
function mirroredPair(left: Omit<DoorLeafSpec, 'side'>, rightNodes?: string[], rightDelay = 0.14): DoorLeafSpec[] {
  const leftCut = left.cut;
  return [
    { ...left, side: -1 },
    {
      ...left,
      side: 1,
      nodes: rightNodes,
      cut: leftCut
        ? (b, name) => {
            const flipped = new THREE.Box3(
              new THREE.Vector3(-b.max.x, b.min.y, b.min.z),
              new THREE.Vector3(-b.min.x, b.max.y, b.max.z)
            );
            return leftCut(flipped, name);
          }
        : undefined,
      hinge: new THREE.Vector3(-left.hinge.x, left.hinge.y, left.hinge.z),
      axis: new THREE.Vector3(-left.axis.x, left.axis.y, left.axis.z),
      openAngle: -left.openAngle,
      delay: rightDelay,
    },
  ];
}

const SWAN_TILT = THREE.MathUtils.degToRad(12);

/**
 * Real-world door kinematics per model, in car space (metres, nose −Z, left −X):
 *  - Vanquish / DB12: Aston "swan-wing" – front hinge whose axis leans back 12°, so the door
 *    climbs as it swings out (kerb clearance).
 *  - Valhalla: dihedral – hinge low on the A-pillar, axis tilted out of vertical so the door
 *    rotates up and forward.
 *  - Valkyrie: roof-hinged gullwing canopy – each half swings up about the roof spine and
 *    carries its side glass and upper side skin with it.
 */
function getDoorSpecs(carId: string): DoorLeafSpec[] {
  switch (carId) {
    case 'vanquish':
      return mirroredPair(
        {
          motion: 'swan',
          nodes: ['amdb11_door_L', 'amdb11_doorpanel_L', 'amdb11_doorglass_L', 'amdb11_mirror_L'],
          hinge: new THREE.Vector3(-0.97, 0.74, -0.69),
          axis: new THREE.Vector3(0, Math.cos(SWAN_TILT), Math.sin(SWAN_TILT)),
          openAngle: -THREE.MathUtils.degToRad(64),
          delay: 0,
        },
        ['amdb11_door_R', 'amdb11_doorpanel_R', 'amdb11_doorglass_R', 'amdb11_mirror_R']
      );
    case 'db12':
      // DB12 ships its door skins inside the one-piece body meshes; cut them out by region.
      return mirroredPair(
        {
          motion: 'swan',
          cut: (b) =>
            b.max.x < -0.6 &&
            b.min.z > -0.665 &&
            b.max.z < 0.9 &&
            b.min.y > 0.15 &&
            b.max.y > 0.45,
          hinge: new THREE.Vector3(-0.9, 0.62, -0.6),
          axis: new THREE.Vector3(0, Math.cos(SWAN_TILT), Math.sin(SWAN_TILT)),
          openAngle: -THREE.MathUtils.degToRad(64),
          delay: 0,
        },
        undefined
      );
    case 'valhalla':
      return mirroredPair(
        {
          motion: 'dihedral',
          nodes: ['detach_door_L_50'],
          hinge: new THREE.Vector3(-0.82, 0.76, -0.98),
          axis: new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(40)), Math.sin(THREE.MathUtils.degToRad(40)), -0.12),
          openAngle: -THREE.MathUtils.degToRad(62),
          delay: 0,
        },
        ['detach_door_R_50']
      );
    case 'valkyrie':
      return mirroredPair(
        {
          motion: 'gullwing',
          nodes: ['Plane.016', 'Plane.023'],
          cutMeshes: /Windows/i,
          cut: (b) => b.max.x < -0.3,
          hinge: new THREE.Vector3(-0.15, 1.04, -0.15),
          axis: new THREE.Vector3(0, 0.06, 1),
          openAngle: -THREE.MathUtils.degToRad(68),
          delay: 0,
        },
        ['Plane.015', 'Plane.025']
      );
    default:
      return [];
  }
}

/**
 * Builds the complete photorealistic 3D Aston Martin vehicle assembly using
 * authentic high-polygon GLB coachwork models paired with dynamic Q by Aston Martin
 * clearcoat paint shaders, metallic flake normal maps, articulated doors, and
 * our bespoke 3D cockpit interior for close-up POV inspection.
 */
export function buildAstonCar3D(
  car: AstonCar,
  initialPaint: QPaintFinish,
  initialCaliper: QCaliperFinish,
  initialTrim: QCabinTrim
): Car3DInstance {
  const bp = getBlueprintForCar(car);
  const root = new THREE.Group();
  const glbContainer = new THREE.Group();
  root.add(glbContainer);

  // Kick off background preload of other models
  preloadAllCarGlbs();

  const carbonWeave = getCarbonWeaveTexture();
  const rotorTex = getRotorTextures();

  // Automotive paint = tinted metallic base (satin, flake-sparkled) under a glass-smooth clearcoat.
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPaint.isNeutral ? '#c3c9cc' : initialPaint.hex),
    clearcoat: 1.0,
    clearcoatRoughness: 0.028,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
  });
  const applyPaintFinish = (paint: QPaintFinish) => {
    paintMat.color.set(paint.isNeutral ? '#c3c9cc' : paint.hex);
    paintMat.metalness = paint.isNeutral ? 0.84 : 0.62;
    paintMat.roughness = paint.isNeutral ? 0.3 : 0.36;
  };
  applyPaintFinish(initialPaint);
  installMetallicFlake(paintMat);

  const carbonMat = new THREE.MeshPhysicalMaterial({
    map: carbonWeave,
    roughness: 0.3,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
  });
  installTriplanarCarbon(carbonMat, 10);

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: '#111514',
    roughness: 0.58,
    metalness: 0.25,
    envMapIntensity: 0.8,
    side: THREE.DoubleSide,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#e3e8ea',
    metalness: 1.0,
    roughness: 0.07,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });

  const grilleMetalMat = new THREE.MeshStandardMaterial({
    color: '#9aa29f',
    metalness: 0.95,
    roughness: 0.2,
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
  });

  const wheelAlloyMat = new THREE.MeshPhysicalMaterial({
    color: '#b9bfc1',
    metalness: 0.96,
    roughness: 0.2,
    clearcoat: 0.7,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
  });

  const darkAlloyMat = new THREE.MeshPhysicalMaterial({
    color: '#1d2121',
    metalness: 0.9,
    roughness: 0.3,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: '#0d0f0f',
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.55,
    side: THREE.DoubleSide,
  });

  // Alpha-blended glass also scales its reflections by opacity, so the env term is boosted to
  // keep a convincing sheen while the dark tint stays see-through to the cabin.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0a0f0e',
    transparent: true,
    opacity: 0.34,
    roughness: 0.0,
    metalness: 0.0,
    ior: 1.52,
    specularIntensity: 1.0,
    envMapIntensity: 1.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const clearLensMat = new THREE.MeshPhysicalMaterial({
    color: '#eef4f7',
    transparent: true,
    opacity: 0.16,
    roughness: 0.0,
    metalness: 0.0,
    ior: 1.49,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const caliperMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialCaliper.hex),
    metalness: 0.3,
    roughness: 0.3,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
  });

  const rotorMat = new THREE.MeshStandardMaterial({
    map: rotorTex.map,
    bumpMap: rotorTex.bumpMap,
    bumpScale: 0.008,
    metalness: 0.72,
    roughness: 0.34,
    emissive: new THREE.Color('#ff3b00'),
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });

  // HDR emissive values: day DRLs sit just over the bloom threshold, night mode flares them.
  const drlMat = new THREE.MeshStandardMaterial({
    color: '#f5faff',
    emissive: new THREE.Color('#e4f3ff'),
    emissiveIntensity: 2.2,
    roughness: 0.1,
    side: THREE.DoubleSide,
  });

  const tailBladeMat = new THREE.MeshStandardMaterial({
    color: '#ff1f2d',
    emissive: new THREE.Color('#ff1424'),
    emissiveIntensity: 2.4,
    roughness: 0.12,
    side: THREE.DoubleSide,
  });

  let glbLeatherTex = createLeatherTextures(initialTrim.primaryHex, initialTrim.stitchHex, false);
  const glbLeatherMat = new THREE.MeshStandardMaterial({
    map: glbLeatherTex.map,
    bumpMap: glbLeatherTex.bumpMap,
    bumpScale: 0.006,
    roughness: 0.62,
    metalness: 0.0,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
  });

  const glbLeatherSecondaryMat = new THREE.MeshStandardMaterial({
    color: initialTrim.primaryHex,
    roughness: 0.66,
    metalness: 0.0,
    envMapIntensity: 0.85,
    side: THREE.DoubleSide,
  });

  const glbStitchMat = new THREE.MeshStandardMaterial({
    color: initialTrim.stitchHex,
    emissive: new THREE.Color(initialTrim.stitchHex),
    emissiveIntensity: 0.12,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });

  let glbClusterTex = createClusterTexture(car, false);
  const glbScreenMat = new THREE.MeshBasicMaterial({
    map: glbClusterTex,
    side: THREE.DoubleSide,
  });

  // Build bespoke 3D cockpit interior for close-up interior POVs & hypercar canopy interior
  const cabinResult: Cabin3DResult = buildCabin3D(car, bp, initialTrim, paintMat, glassMat);
  root.add(cabinResult.group);

  // State tracking so async GLB load immediately syncs with current user selections
  let isDisposed = false;
  let isInteriorPov = false;
  let isNightLights = false;
  let isXray = false;
  let doorsWantOpen = false;
  let brakeHeatTarget = 0;
  let brakeHeatCurrent = 0;
  let aeroSpeed = 0;

  let doorLeaves: DoorLeaf[] = [];
  const wheelSpinNodes: THREE.Object3D[] = [];
  const customClonedMats: THREE.Material[] = [];
  const customHeadlightMats: THREE.MeshStandardMaterial[] = [];

  // X-ray: every body panel swaps to one shared ghost shader, while running gear, cabin trim and
  // engines keep their own materials, so each car reads as a cutaway (not only its paint fading).
  const xrayMat = createXrayMaterial(bp.L);
  const xraySolidMats = new Set<THREE.Material>([
    tireMat,
    wheelAlloyMat,
    darkAlloyMat,
    caliperMat,
    rotorMat,
    glbLeatherMat,
    glbLeatherSecondaryMat,
    glbStitchMat,
    glbScreenMat,
  ]);
  const xraySolidMeshes = new Set<THREE.Object3D>();
  const xraySwaps: {
    mesh: THREE.Mesh;
    original: THREE.Material | THREE.Material[];
    renderOrder: number;
    prepass: THREE.Mesh | null;
  }[] = [];
  // Depth-only pre-pass: shells overlap many layers deep (skin, inner wings, bay walls) and
  // additive layers sum to a milky fog. Writing the shell's depth first means only the front-most
  // layer glows, while the opaque running gear (drawn earlier) still shows through it.
  const xrayDepthMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    transparent: true,
    side: THREE.DoubleSide,
    // Nudged back a hair so the ghost pass on the very same surface always passes its depth test.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  xrayDepthMat.forceSinglePass = true;
  // Procedural running gear (engine, gearbox, suspension…) that only the X-ray cutaway reveals.
  let mechanicals: Mechanicals | null = null;
  const wheelCloneMats = new Set<THREE.Material>();
  const applyXray = () => {
    xraySwaps.forEach((s) => {
      if (isXray && !s.prepass) {
        s.prepass = new THREE.Mesh(s.mesh.geometry, xrayDepthMat);
        s.prepass.renderOrder = 1;
        s.mesh.add(s.prepass);
      }
      if (s.prepass) s.prepass.visible = isXray;
      s.mesh.material = isXray ? xrayMat : s.original;
      s.mesh.renderOrder = isXray ? 2 : s.renderOrder;
    });
    if (mechanicals) mechanicals.group.visible = isXray;
  };

  // Vanquish & DB12 GLBs carry fully modelled cabins (real wheel, binnacle, console, seats),
  // so their cockpit POVs stay inside the coachwork instead of swapping to the bespoke cabin.
  const hasNativeCockpit = car.id === 'vanquish' || car.id === 'db12';

  // Warm studio interior fill lights so real GLB cabins (DB12 & Vanquish) reveal every leather stitch
  // and machined metal switch when stepping into 06 Driver POV / 07 HMI Console / 08 Cabin Sweep.
  const cabinDomeLight = new THREE.PointLight('#fff4e2', 0, 2.8, 1.35);
  cabinDomeLight.position.set(0, bp.windscreenTopY - 0.14, (bp.dashZ + bp.eyeZ) * 0.5 + 0.08);
  root.add(cabinDomeLight);

  const dashFillLight = new THREE.PointLight('#d6ebff', 0, 1.8, 1.5);
  dashFillLight.position.set(bp.driverX * 0.5, bp.wheelY + 0.18, bp.dashZ + 0.18);
  root.add(dashFillLight);

  let drivePitchTarget = 0;
  let driveRollTarget = 0;
  let drivePitchCurrent = 0;
  let driveRollCurrent = 0;
  let driveBraking = 0;
  let driveRpmNorm = 0;
  let driveVibPhase = 0;
  const valhallaRimMats: THREE.MeshStandardMaterial[] = [];

  function syncInteriorExteriorVisibility() {
    const showNativeLights = isInteriorPov && hasNativeCockpit;
    cabinDomeLight.intensity = showNativeLights ? (isNightLights ? 2.4 : 1.95) : 0;
    dashFillLight.intensity = showNativeLights ? (isNightLights ? 1.55 : 0.95) : 0;

    if (isInteriorPov && hasNativeCockpit) {
      glbContainer.visible = true;
      cabinResult.group.visible = false;
      cabinResult.setCockpitSurroundVisible(false);
    } else if (isInteriorPov) {
      glbContainer.visible = false;
      cabinResult.group.visible = true;
      cabinResult.group.scale.set(1, 1, 1);
      cabinResult.group.position.set(0, 0, 0);
      cabinResult.setCockpitSurroundVisible(true);
    } else {
      glbContainer.visible = true;
      cabinResult.setCockpitSurroundVisible(false);
      if (car.id === 'valkyrie') {
        cabinResult.group.visible = true;
        cabinResult.group.scale.setScalar(0.74);
        cabinResult.group.position.set(0, 0.15, -0.32);
      } else if (car.id === 'valhalla') {
        cabinResult.group.visible = true;
        cabinResult.group.scale.setScalar(0.82);
        cabinResult.group.position.set(0, 0.06, -0.18);
      } else {
        // Vanquish and DB12 have full native 3D interiors inside their GLB models
        cabinResult.group.visible = false;
      }
    }
  }

  syncInteriorExteriorVisibility();

  // Add subtle glowing brake rotor discs at the 4 wheel positions so thermal glow works on all models
  const thermalRotorDiscs: THREE.Mesh[] = [];
  const flX = -bp.W * 0.42;
  const frX = bp.W * 0.42;
  [
    [flX, bp.wheelRadiusF, bp.zFrontAxle],
    [frX, bp.wheelRadiusF, bp.zFrontAxle],
    [flX, bp.wheelRadiusR, bp.zRearAxle],
    [frX, bp.wheelRadiusR, bp.zRearAxle],
  ].forEach(([wx, wy, wz]) => {
    const rMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(wy * 0.56, wy * 0.56, 0.024, 28),
      rotorMat
    );
    rMesh.rotation.z = Math.PI / 2;
    rMesh.position.set(wx, wy, wz);
    glbContainer.add(rMesh);
    thermalRotorDiscs.push(rMesh);
  });

  const ready = loadGlbTemplate(car.id)
    .then((template) => {
      if (isDisposed) return;

      const glbScene = template.clone(true);

      // 1. Pre-normalization cleanup of model-specific redundant nodes
      glbScene.traverse((obj) => {
        const n = obj.name || '';
        if (car.id === 'vanquish') {
          // Keep twin-turbo V12 (amdb11_engine_v12), hide optional V8/i6 meshes
          if (/engine_v8|intake_v8|etk_engine_i6/i.test(n)) {
            obj.visible = false;
          }
        }
        if (car.id === 'valkyrie') {
          // Lower the internal flat box (Plane.011) slightly so it doesn't slice across the cockpit seats
          if (n === 'Plane.011' || n === 'Plane.011_AstonMartinValkyrieThirdMain_0') {
            obj.position.y -= 0.22;
          }
        }
      });

      // The Valkyrie GLB is posed at ~36° of steering lock; square its front wheels up.
      if (car.id === 'valkyrie') {
        for (const side of ['FrontLeftWheel', 'FrontRightWheel']) {
          const wheel = findNodeByName(glbScene, side);
          const tyre = findNodeByName(glbScene, `${side}_AstonMartinValkyrieTires_0`);
          if (wheel && tyre instanceof THREE.Mesh) straightenSteering(glbScene, wheel, tyre);
        }
      }

      // 2. Rotate 180 deg around Y so Nose faces -Z, Tail faces +Z, Left is -X, Right is +X
      const glbWrapper = new THREE.Group();
      glbScene.rotation.y = Math.PI;
      glbWrapper.add(glbScene);

      glbScene.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(glbScene);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const rawCenter = rawBox.getCenter(new THREE.Vector3());

      const scale = bp.L / Math.max(rawSize.z, 0.001);
      glbWrapper.scale.setScalar(scale);
      glbScene.position.set(-rawCenter.x, -rawBox.min.y, -rawCenter.z);

      // 3. Classify every mesh in the GLB and bind Q by Aston Martin PBR shaders
      glbWrapper.updateMatrixWorld(true); // car-space matrices for positional classification
      const tmpBox = new THREE.Box3();
      const tmpCenter = new THREE.Vector3();
      const centerOf = (o: THREE.Object3D) => tmpBox.setFromObject(o).getCenter(tmpCenter);

      // Valhalla ships one texture atlas for rims, lamps and badges: share one clone per role
      // (instead of ~300 per-mesh clones) and let the headlamp cluster glow from its own texture.
      const atlasMats = new Map<string, THREE.MeshStandardMaterial>();
      const sharedAtlasMat = (role: 'rim' | 'lamp' | 'trim', source: THREE.MeshStandardMaterial) => {
        let m = atlasMats.get(role);
        if (!m) {
          m = source.clone();
          m.roughness = role === 'rim' ? 0.22 : 0.3;
          m.metalness = role === 'rim' ? 0.9 : 0.55;
          m.envMapIntensity = 1.05;
          if (role === 'lamp') {
            m.emissive = new THREE.Color('#ffffff');
            m.emissiveMap = m.map;
            m.emissiveIntensity = isNightLights ? 5.0 : 1.4;
            customHeadlightMats.push(m);
          }
          if (role === 'rim') xraySolidMats.add(m);
          customClonedMats.push(m);
          atlasMats.set(role, m);
        }
        return m;
      };
      const isValhallaHeadlamp = (o: THREE.Object3D) => {
        const c = centerOf(o);
        const ax = Math.abs(c.x);
        return ax > 0.74 && ax < 0.96 && c.y > 0.42 && c.y < 0.62 && c.z > -1.92 && c.z < -1.62;
      };

      glbScene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.castShadow = true;
        obj.receiveShadow = true;

        const pathName = getFullNodePath(obj);
        const origMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        const matName = origMat?.name || '';

        if (car.id === 'valkyrie') {
          if (
            matName === 'AstonMartinValkyrieMainBody' ||
            matName === 'AstonMartinValkyrieSecondMain'
          ) {
            obj.material = paintMat;
          } else if (matName === 'AstonMartinValkyrieWindows') {
            obj.material = glassMat;
          } else if (matName === 'AstonMartinValkyrieLightsCover') {
            obj.material = clearLensMat;
          } else if (matName === 'AstonMartinValkyrieBrakes') {
            obj.material = caliperMat;
          } else if (matName === 'AstonMartinValkyrieBackLights') {
            obj.material = tailBladeMat;
          } else if (/FronLights2|FrontLights|FrontLights3/i.test(matName)) {
            obj.material = drlMat;
          } else if (matName === 'AstonMartinValkyrieTires') {
            obj.material = tireMat;
          } else if (/AstonMartinValkyrieWheel[1235]/i.test(matName)) {
            obj.material = darkAlloyMat;
          } else if (matName === 'AstonMartinValkyrieWheel4' || matName === 'AstonMartinValkyrie6') {
            obj.material = wheelAlloyMat;
          } else if (
            matName === 'AstonMartinValkyrieThirdMain' ||
            matName === 'AstonMartinValkyrie1' ||
            matName === 'AstonMartinValkyrie2' ||
            matName === 'Plane.103__0'
          ) {
            obj.material = carbonMat;
          } else {
            obj.material = darkTrimMat;
          }
        } else if (car.id === 'valhalla') {
          if (/carpaint/i.test(pathName) || matName === 'Material.001') {
            obj.material = paintMat;
          } else if (/glass_windows|glasses/i.test(pathName)) {
            obj.material = glassMat;
          } else if (/bone_caliper/i.test(pathName)) {
            obj.material = caliperMat;
          } else if (matName === 'Material.004') {
            // chassis_pivot_details.033 rear LED light blade
            obj.material = tailBladeMat;
          } else if (/Wheel.*_tyres/i.test(pathName)) {
            obj.material = tireMat;
          } else if (/carbon_fiber|chassis_pivot_bottom/i.test(pathName)) {
            obj.material = carbonMat;
          } else if (origMat instanceof THREE.MeshStandardMaterial && origMat.map) {
            // Material.002 atlas (rims, headlamp internals, grille & badging)
            const role = /Wheel.*_rims/i.test(pathName) ? 'rim' : isValhallaHeadlamp(obj) ? 'lamp' : 'trim';
            const mat = sharedAtlasMat(role, origMat);
            obj.material = mat;
            if (role === 'rim' && !valhallaRimMats.includes(mat)) valhallaRimMats.push(mat);
          }
        } else if (car.id === 'vanquish') {
          // Engine bay and cabin furniture share trim materials with the body, so pick them by node.
          if (
            /engine|intake|exhaust|radiator|subframe|lowerarm|upperarm|tierod|swaybar|steeringbox|spring|shock|diff|seat|steer|dash|console|gauge|pedal|doorpanel|belt|shifter|paddle|hub/i.test(
              pathName
            )
          ) {
            xraySolidMeshes.add(obj);
          }
          if (matName === 'amdb11' || matName === 'amdb11_roof') {
            obj.material = paintMat;
          } else if (matName === 'amdb11_caliper') {
            obj.material = caliperMat;
          } else if (matName === 'amdb11_brake') {
            obj.material = rotorMat;
          } else if (matName === 'amdb11_wheel_grey') {
            obj.material = wheelAlloyMat;
          } else if (matName === 'Scene_-_Root' || /Object_4\./i.test(pathName)) {
            obj.material = tireMat;
          } else if (matName === 'amdb11_glass' || matName === 'amdb11_glass_tint') {
            obj.material = /headlight|bumper/i.test(pathName) ? clearLensMat : glassMat;
          } else if (matName === 'amdb11_rearglass') {
            obj.material = /backlight/i.test(pathName) ? glassMat : tailBladeMat;
          } else if (/taillight|chmsl/i.test(matName)) {
            obj.material = tailBladeMat;
          } else if (/runninglight|highbeam|headlight/i.test(matName)) {
            obj.material = drlMat;
          } else if (matName === 'amdb11_leather' || matName === 'amdb11_leather_2') {
            obj.material = glbLeatherMat;
          } else if (matName === 'amdb11_leather_3' || matName === 'amdb11_interior') {
            obj.material = glbLeatherSecondaryMat;
          } else if (matName === 'amdb11_stitch_1' || matName === 'amdb11_stitch_2') {
            obj.material = glbStitchMat;
          } else if (/amdb11_gauge|amdb11_screen/i.test(matName)) {
            obj.material = glbScreenMat;
          } else if (matName === 'amdb11_black_ext' || matName === 'amdb11_black_2' || matName === 'amdb11_trim') {
            obj.material = carbonMat;
          } else if (/chrome|silver|mirror|badging/i.test(matName)) {
            obj.material = chromeMat;
          } else if (matName === 'amdb11_grille') {
            obj.material = grilleMetalMat;
          } else {
            obj.material = darkTrimMat;
          }
        } else if (car.id === 'db12') {
          if (matName === 'OEMPaint' || matName === 'Coloured') {
            obj.material = paintMat;
          } else if (matName === 'CaliperAZonePaint' || matName === 'CaliperAZone') {
            obj.material = caliperMat;
          } else if (matName === 'Carbon1M' || matName === 'Carbon1') {
            obj.material = carbonMat;
          } else if (matName === 'GlassMtl') {
            obj.material = /Glass_21|GlassInside_20|Object_46/i.test(pathName)
              ? glassMat
              : clearLensMat;
          } else if (matName === 'GlassRed') {
            obj.material = tailBladeMat;
          } else if (matName === 'InteriorColour1A') {
            obj.material = glbLeatherMat;
          } else if (matName === 'InteriorColour2A') {
            obj.material = glbStitchMat;
          } else if (matName === 'LightA' && origMat instanceof THREE.MeshStandardMaterial) {
            const cloned = origMat.clone();
            cloned.emissive = new THREE.Color('#dff2ff');
            if (cloned.map) cloned.emissiveMap = cloned.map;
            cloned.emissiveIntensity = isNightLights ? 5.0 : 1.4;
            cloned.envMapIntensity = 1.2;
            obj.material = cloned;
            customClonedMats.push(cloned);
            customHeadlightMats.push(cloned);
          } else if (/Grille[1-8]A/i.test(matName)) {
            obj.material = /Grille[123]A/i.test(matName) ? grilleMetalMat : darkTrimMat;
          } else if (origMat instanceof THREE.MeshStandardMaterial) {
            const cloned = origMat.clone();
            if (/Wheel[12]A/i.test(matName)) {
              cloned.metalness = 0.9;
              cloned.roughness = 0.22;
              cloned.envMapIntensity = 1.1;
            } else if (matName === 'InteriorA' || matName === 'TexturedA') {
              // Cabin trims read as chrome with the source PBR values; make them soft-touch.
              cloned.metalness = Math.min(cloned.metalness, 0.12);
              cloned.roughness = Math.max(cloned.roughness, 0.58);
              cloned.envMapIntensity = 0.9;
            } else {
              cloned.envMapIntensity = 0.95;
            }
            obj.material = cloned;
            customClonedMats.push(cloned);
            // EngineA is the whole bay (inner wings, bulkhead) in one pale mesh: let it ghost so the
            // procedural V8 reads through it instead of a white mass.
            if (/Wheel[12]A|InteriorA|TexturedA/i.test(matName)) xraySolidMats.add(cloned);
            if (/Wheel[12]A/i.test(matName)) wheelCloneMats.add(cloned);
          }
        }
      });

      // 3b. Rebuild faceted per-face normals (Valhalla/Valkyrie are triangle soup; Vanquish's
      //     low-poly panels too) so coachwork reflects the studio as continuous surfaces.
      glbScene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const wholeModel = car.id === 'valhalla' || car.id === 'valkyrie';
        const paintedPanel = car.id === 'vanquish' && obj.material === paintMat;
        if (wholeModel || paintedPanel) {
          obj.geometry = smoothCreasedNormals(obj.geometry, 48);
        }
      });

      // 4. Mount coachwork, then rig hinged doors in glbContainer (car-space metres)
      glbContainer.add(glbWrapper);
      glbContainer.updateMatrixWorld(true);
      doorLeaves = buildDoorLeaves(glbContainer, glbScene, getDoorSpecs(car.id));
      // The user may have pressed "Open Doors" while the GLB was still streaming in.
      if (doorsWantOpen) retargetDoorLeaves(doorLeaves, true);

      // X-ray targets: every coachwork mesh (door leaves included) that isn't running gear or cabin.
      glbContainer.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || thermalRotorDiscs.includes(obj)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        if (xraySolidMeshes.has(obj) || mats.some((m) => xraySolidMats.has(m))) return;
        xraySwaps.push({ mesh: obj, original: obj.material, renderOrder: obj.renderOrder, prepass: null });
      });
      // Built after the swap list so the running gear keeps its own materials in X-ray.
      const wheelCorners = measureWheelCorners(glbContainer, (m) => m === tireMat || wheelCloneMats.has(m), bp);
      mechanicals = buildMechanicals(car.id, bp, wheelCorners);
      if (mechanicals) glbContainer.add(mechanicals.group);
      applyXray();

      const wheelNames: Record<string, string[]> = {
        valhalla: ['WheelFL', 'WheelFR', 'WheelBL', 'WheelBR'],
        db12: ['Wheel2A_LF_24', 'Wheel2A_RF_25', 'Wheel1A_LR_26', 'Wheel1A_RR_27'],
        valkyrie: ['FrontLeftWheel', 'FrontRightWheel', 'RearLeftWheel', 'RearRightWheel'],
        vanquish: ['amdb11_wheel_03', 'amdb11_wheel_03.001', 'amdb11_wheel_03.002', 'amdb11_wheel_03.003'],
      };
      (wheelNames[car.id] || []).forEach((wName) => {
        const wNode = findNodeByName(glbScene, wName);
        if (wNode) wheelSpinNodes.push(wNode);
      });
    })
    .catch((err) => {
      console.error(`Failed to load GLB for ${car.id}:`, err);
      throw err;
    });

  return {
    root,
    blueprint: bp,
    ready,
    setPaint: (paint: QPaintFinish) => {
      // Uniform-only change: no shader recompile, so swatch clicks are instant.
      applyPaintFinish(paint);
    },
    setCaliper: (caliper: QCaliperFinish) => {
      caliperMat.color.set(caliper.hex);
      caliperMat.needsUpdate = true;
    },
    setWheelFinish: (wheel: QWheelFinish) => {
      const tint = new THREE.Color(wheel.hex);
      wheelAlloyMat.color.copy(tint);
      wheelAlloyMat.metalness = wheel.metalness;
      wheelAlloyMat.roughness = wheel.roughness;
      wheelAlloyMat.needsUpdate = true;

      // Dark spoke accents shift softly toward chosen wheel finish on Valkyrie
      darkAlloyMat.color.copy(tint).multiplyScalar(wheel.id === 'gloss-obsidian' ? 0.65 : 0.42);
      darkAlloyMat.roughness = wheel.roughness + 0.06;
      darkAlloyMat.needsUpdate = true;

      // Textured rim materials on DB12 & Valhalla tint subtly via color multiplier
      wheelCloneMats.forEach((m) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.color.copy(tint).lerp(new THREE.Color('#ffffff'), wheel.id === 'gloss-obsidian' ? 0.12 : 0.35);
          m.metalness = wheel.metalness;
          m.roughness = wheel.roughness;
          m.needsUpdate = true;
        }
      });
      valhallaRimMats.forEach((m) => {
        m.color.copy(tint).lerp(new THREE.Color('#ffffff'), wheel.id === 'gloss-obsidian' ? 0.18 : 0.38);
        m.metalness = wheel.metalness;
        m.roughness = wheel.roughness;
        m.needsUpdate = true;
      });
    },
    setCabinTrim: (trim: QCabinTrim) => {
      cabinResult.updateTrim(trim);

      const nextTex = createLeatherTextures(trim.primaryHex, trim.stitchHex, false);
      glbLeatherTex.map.dispose();
      glbLeatherTex.bumpMap.dispose();
      glbLeatherTex = nextTex;
      glbLeatherMat.map = nextTex.map;
      glbLeatherMat.bumpMap = nextTex.bumpMap;
      glbLeatherMat.needsUpdate = true;

      glbLeatherSecondaryMat.color.set(trim.primaryHex);
      glbStitchMat.color.set(trim.stitchHex);
      glbStitchMat.emissive.set(trim.stitchHex);
    },
    setDoorsOpen: (open: boolean) => {
      if (doorsWantOpen === open) return;
      doorsWantOpen = open;
      retargetDoorLeaves(doorLeaves, open);
    },
    setLightsMode: (nightMode: boolean) => {
      isNightLights = nightMode;
      drlMat.emissiveIntensity = nightMode ? 7.5 : 2.2;
      tailBladeMat.emissiveIntensity = nightMode ? 6.5 : 2.4;
      customHeadlightMats.forEach((m) => {
        m.emissiveIntensity = nightMode ? 5.0 : 1.4;
      });
      cabinResult.setLightsMode(nightMode);
      syncInteriorExteriorVisibility();

      const nextCluster = createClusterTexture(car, nightMode);
      glbClusterTex.dispose();
      glbClusterTex = nextCluster;
      glbScreenMat.map = nextCluster;
      glbScreenMat.needsUpdate = true;
    },
    setXRay: (xray: boolean) => {
      if (isXray === xray) return;
      isXray = xray;
      applyXray();
    },
    setInteriorMode: (inside: boolean) => {
      if (isInteriorPov === inside) return;
      isInteriorPov = inside;
      syncInteriorExteriorVisibility();
    },
    setActiveAero: (speedKmh: number) => {
      aeroSpeed = speedKmh;
    },
    setBrakeThermal: (tempNorm: number) => {
      brakeHeatTarget = Math.max(0, Math.min(2.2, tempNorm));
    },
    setDriveDynamics: (pitchRad: number, rollRad: number, braking01: number, rpmNorm: number) => {
      drivePitchTarget = pitchRad;
      driveRollTarget = rollRad;
      driveBraking = Math.max(0, Math.min(1, braking01));
      driveRpmNorm = Math.max(0, Math.min(1, rpmNorm));
    },
    update: (dt: number) => {
      const doorsMoving = updateDoorLeaves(doorLeaves, dt);
      xrayMat.uniforms.uTime.value += dt;

      // Smooth suspension pitch (squat/dive) & cornering roll + subtle engine idle/rev tremor
      drivePitchCurrent += (drivePitchTarget - drivePitchCurrent) * Math.min(1, dt * 8.0);
      driveRollCurrent += (driveRollTarget - driveRollCurrent) * Math.min(1, dt * 7.5);
      driveVibPhase += dt * (28 + driveRpmNorm * 95);
      const vib = driveRpmNorm > 0.01 ? Math.sin(driveVibPhase) * 0.00055 * (0.4 + driveRpmNorm * 0.6) : 0;
      glbContainer.rotation.x = drivePitchCurrent;
      glbContainer.rotation.z = driveRollCurrent;
      glbContainer.position.y = vib;
      cabinResult.group.rotation.x = drivePitchCurrent * 0.85;
      cabinResult.group.rotation.z = driveRollCurrent * 0.85;

      // Tail-blade brake light flare under hard deceleration
      const baseTail = isNightLights ? 6.5 : 2.4;
      tailBladeMat.emissiveIntensity = baseTail + driveBraking * 6.5;

      brakeHeatCurrent += (brakeHeatTarget - brakeHeatCurrent) * Math.min(1, dt * 5.0);
      rotorMat.emissiveIntensity = brakeHeatCurrent;
      thermalRotorDiscs.forEach((d) => {
        d.visible = brakeHeatCurrent > 0.05 || isXray;
      });

      if (aeroSpeed > 1) {
        const angular = (aeroSpeed / 3.6) * dt;
        wheelSpinNodes.forEach((wNode, idx) => {
          const r = idx < 2 ? bp.wheelRadiusF : bp.wheelRadiusR;
          if (car.id === 'valkyrie') {
            // Valkyrie wheel bones use local Z/Y depending on FBX orientation; spin smoothly
            wNode.rotation.z += angular / r;
          } else {
            wNode.rotation.x += angular / r;
          }
        });
      }
      return doorsMoving;
    },
    dispose: () => {
      isDisposed = true;
      mechanicals?.dispose();
      disposeDoorLeaves(doorLeaves);
      doorLeaves = [];
      cabinResult.dispose();
      glbLeatherTex.map.dispose();
      glbLeatherTex.bumpMap.dispose();
      glbClusterTex.dispose();
      customClonedMats.forEach((m) => m.dispose());
      [
        paintMat,
        carbonMat,
        darkTrimMat,
        chromeMat,
        grilleMetalMat,
        wheelAlloyMat,
        darkAlloyMat,
        tireMat,
        glassMat,
        clearLensMat,
        caliperMat,
        rotorMat,
        drlMat,
        tailBladeMat,
        glbLeatherMat,
        glbLeatherSecondaryMat,
        glbStitchMat,
        glbScreenMat,
        xrayMat,
        xrayDepthMat,
      ].forEach((m) => m.dispose());
    },
  };
}
