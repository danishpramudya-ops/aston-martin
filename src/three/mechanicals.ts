import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { evaluateLowerCoachwork, type Car3DBlueprint } from './carProfiles';

/**
 * Procedural running gear shown inside the X-ray cutaway: engine, transmission, hybrid system,
 * suspension, steering, cooling, fuel and exhaust, laid out per car from its blueprint and from the
 * wheel positions measured on the GLB. Only the hypercars ship as empty shells; the GTs get what
 * their models lack (the Vanquish already carries its own V12 and most of its suspension).
 * Every part is merged per material, so the whole package costs about a dozen draw calls.
 */

export interface WheelCorner {
  center: THREE.Vector3;
  radius: number;
  width: number;
}

export interface WheelCorners {
  fl: WheelCorner;
  fr: WheelCorner;
  rl: WheelCorner;
  rr: WheelCorner;
}

interface EngineSpec {
  cylinders: 8 | 12;
  bankDeg: number;
  /** Leading face of the engine (toward the nose), car-space metres. */
  zStart: number;
  length: number;
  crankY: number;
  turbo: boolean;
  coverColor: string;
}

interface MechSpec {
  layout: 'mid' | 'front';
  engine?: EngineSpec;
  /** Gearbox / transaxle body of our own (false when the GLB models one). */
  gearbox: boolean;
  torqueTube: boolean;
  frontMotors: boolean;
  rearMotor: boolean;
  battery: 'behind-seats' | 'tunnel' | null;
  suspension: 'pushrod' | 'wishbone' | 'coilovers-front';
  steering: boolean;
  radiators: 'side' | 'front' | null;
  exhaust: 'high-centre' | 'top' | 'rear-quad';
  /** Where exhaust runs start when there is no procedural engine (the GLB's own headers). */
  exhaustStarts?: THREE.Vector3[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

const SPECS: Record<string, MechSpec> = {
  // Cosworth 6.5 L NA 65° V12 + Rimac KERS, Ricardo gearbox, F1-style pushrod suspension.
  valkyrie: {
    layout: 'mid',
    engine: { cylinders: 12, bankDeg: 65, zStart: 0.52, length: 0.74, crankY: 0.3, turbo: false, coverColor: '#9e222e' },
    gearbox: true,
    torqueTube: false,
    frontMotors: false,
    rearMotor: true,
    battery: 'behind-seats',
    suspension: 'pushrod',
    steering: true,
    radiators: 'side',
    exhaust: 'high-centre',
  },
  // 4.0 L twin-turbo flat-plane V8 (hot-V) + three e-motors, 8-speed DCT.
  valhalla: {
    layout: 'mid',
    engine: { cylinders: 8, bankDeg: 90, zStart: 0.6, length: 0.58, crankY: 0.3, turbo: true, coverColor: '#2b3036' },
    gearbox: true,
    torqueTube: false,
    frontMotors: true,
    rearMotor: true,
    battery: 'tunnel',
    suspension: 'pushrod',
    steering: true,
    radiators: 'side',
    exhaust: 'top',
  },
  // GLB already models the 5.2 V12, intake, radiator, subframes, arms, tie rods, anti-roll bars and diff.
  vanquish: {
    layout: 'front',
    gearbox: false,
    torqueTube: true,
    frontMotors: false,
    rearMotor: false,
    battery: null,
    suspension: 'coilovers-front',
    steering: false,
    radiators: null,
    exhaust: 'rear-quad',
    exhaustStarts: [v(-0.3, 0.27, -0.42), v(0.3, 0.27, -0.42)],
  },
  // 4.0 L twin-turbo V8 up front, torque tube to a rear transaxle.
  db12: {
    layout: 'front',
    engine: { cylinders: 8, bankDeg: 90, zStart: -1.3, length: 0.58, crankY: 0.38, turbo: true, coverColor: '#2b3036' },
    gearbox: true,
    torqueTube: true,
    frontMotors: false,
    rearMotor: false,
    battery: null,
    suspension: 'wishbone',
    steering: true,
    radiators: 'front',
    exhaust: 'rear-quad',
  },
};

class HelixCurve extends THREE.Curve<THREE.Vector3> {
  private readonly start: THREE.Vector3;
  private readonly axis: THREE.Vector3;
  private readonly u: THREE.Vector3;
  private readonly w: THREE.Vector3;
  private readonly radius: number;
  private readonly turns: number;

  constructor(start: THREE.Vector3, end: THREE.Vector3, radius: number, turns: number) {
    super();
    this.start = start.clone();
    this.axis = end.clone().sub(start);
    this.radius = radius;
    this.turns = turns;
    const dir = this.axis.clone().normalize();
    const ref = Math.abs(dir.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
    this.u = new THREE.Vector3().crossVectors(dir, ref).normalize();
    this.w = new THREE.Vector3().crossVectors(dir, this.u).normalize();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * this.turns * Math.PI * 2;
    return target
      .copy(this.start)
      .addScaledVector(this.axis, t)
      .addScaledVector(this.u, Math.cos(angle) * this.radius)
      .addScaledVector(this.w, Math.sin(angle) * this.radius);
  }
}

/** Collects primitive geometry per material, then merges each bucket into one mesh. */
class PartKit {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geometry: THREE.BufferGeometry) {
    const list = this.parts.get(material) ?? [];
    list.push(geometry);
    this.parts.set(material, list);
  }

  box(material: THREE.Material, w: number, h: number, d: number, at: THREE.Vector3, rotZ = 0, rotX = 0, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ)));
    g.translate(at.x, at.y, at.z);
    this.add(material, g);
  }

  /** Cylinder whose axis runs from a (radius rA) to b (radius rB). */
  span(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, rA: number, rB = rA, segments = 12) {
    const dir = b.clone().sub(a);
    const length = dir.length();
    if (length < 1e-5) return;
    const g = new THREE.CylinderGeometry(rB, rA, length, segments, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    this.add(material, g);
  }

  sphere(material: THREE.Material, r: number, at: THREE.Vector3) {
    const g = new THREE.SphereGeometry(r, 12, 8);
    g.translate(at.x, at.y, at.z);
    this.add(material, g);
  }

  tube(material: THREE.Material, points: THREE.Vector3[], r: number, segments = 40, radial = 8, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    this.add(material, new THREE.TubeGeometry(curve, segments, r, radial, closed));
  }

  helix(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, coilRadius: number, turns: number, wire: number) {
    const curve = new HelixCurve(a, b, coilRadius, turns);
    this.add(material, new THREE.TubeGeometry(curve, Math.round(turns * 22), wire, 6, false));
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'xray_mechanicals';
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      group.add(new THREE.Mesh(merged, material));
    }
    this.parts.clear();
    return group;
  }
}

function createMaterials(coverColor: string) {
  return {
    alloy: new THREE.MeshStandardMaterial({ color: '#a7aeb4', metalness: 0.82, roughness: 0.34 }),
    cover: new THREE.MeshPhysicalMaterial({
      color: coverColor,
      metalness: 0.35,
      roughness: 0.38,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
    }),
    polished: new THREE.MeshStandardMaterial({ color: '#eef1f3', metalness: 1, roughness: 0.12 }),
    satin: new THREE.MeshStandardMaterial({ color: '#23272b', metalness: 0.4, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: '#8d949b', metalness: 0.92, roughness: 0.28 }),
    magnesium: new THREE.MeshStandardMaterial({ color: '#717880', metalness: 0.65, roughness: 0.44 }),
    // Heat-tinted titanium: a faint emissive keeps the headers reading "hot" through the X-ray.
    exhaust: new THREE.MeshStandardMaterial({
      color: '#b48a5a',
      metalness: 0.88,
      roughness: 0.3,
      emissive: new THREE.Color('#ff5a1e'),
      emissiveIntensity: 0.16,
    }),
    spring: new THREE.MeshStandardMaterial({ color: '#c4d600', metalness: 0.45, roughness: 0.32 }),
    radiator: new THREE.MeshStandardMaterial({ color: '#3a4146', metalness: 0.72, roughness: 0.5 }),
    battery: new THREE.MeshStandardMaterial({ color: '#25384b', metalness: 0.55, roughness: 0.38 }),
    hv: new THREE.MeshStandardMaterial({
      color: '#ff7a1a',
      metalness: 0.1,
      roughness: 0.42,
      emissive: new THREE.Color('#ff5a00'),
      emissiveIntensity: 0.14,
    }),
    copper: new THREE.MeshStandardMaterial({ color: '#c47a45', metalness: 0.95, roughness: 0.26 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141617', metalness: 0, roughness: 0.82 }),
  };
}

type Mats = ReturnType<typeof createMaterials>;

function deckAt(bp: Car3DBlueprint, z: number) {
  return evaluateLowerCoachwork(bp, THREE.MathUtils.clamp((z + bp.L / 2) / bp.L, 0, 1));
}

function hubInner(w: WheelCorner) {
  const s = Math.sign(w.center.x);
  return v(w.center.x - s * (w.width / 2 + 0.05), w.center.y, w.center.z);
}

interface EngineResult {
  collectors: THREE.Vector3[];
  frontZ: number;
  rearZ: number;
}

function buildEngine(kit: PartKit, M: Mats, e: EngineSpec): EngineResult {
  const zc = e.zStart + e.length / 2;
  const perBank = e.cylinders / 2;
  const a = THREE.MathUtils.degToRad(e.bankDeg / 2);
  const y0 = e.crankY;

  kit.box(M.alloy, 0.36, 0.2, e.length, v(0, y0 - 0.02, zc)); // crankcase
  kit.box(M.satin, 0.3, 0.07, e.length * 0.84, v(0, y0 - 0.155, zc)); // sump

  const collectors: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const dir = v(s * Math.sin(a), Math.cos(a), 0);
    const out = v(s * Math.cos(a), -Math.sin(a), 0);
    const bank = v(0, y0, zc).addScaledVector(dir, 0.2);
    kit.box(M.alloy, 0.17, 0.26, e.length * 0.97, bank, -s * a); // cylinder bank
    const cover = bank.clone().addScaledVector(dir, 0.155);
    kit.box(M.cover, 0.15, 0.05, e.length * 0.93, cover, -s * a); // cam cover
    const collector = v(s * 0.31, y0 - 0.11, e.zStart + e.length + 0.04);
    collectors.push(collector);
    for (let i = 0; i < perBank; i++) {
      const z = e.zStart + (e.length * (i + 0.5)) / perBank;
      const coil = cover.clone().setZ(z).addScaledVector(dir, 0.02);
      kit.span(M.satin, coil, coil.clone().addScaledVector(dir, 0.045), 0.016); // coil packs
      const port = bank.clone().setZ(z).addScaledVector(out, 0.088);
      kit.tube(M.exhaust, [port, port.clone().addScaledVector(out, 0.07), v(s * 0.3, y0 - 0.04, z + 0.05), collector], 0.016, 24, 6);
    }
    kit.sphere(M.exhaust, 0.036, collector);
  }

  if (e.turbo) {
    // Hot-V: plenum on top, a turbo per bank in the valley, charge pipes looping forward.
    kit.box(M.satin, 0.26, 0.08, e.length * 0.78, v(0, y0 + 0.43, zc));
    for (const s of [-1, 1]) {
      const turbo = v(s * 0.1, y0 + 0.37, e.zStart + e.length * 0.78);
      kit.span(M.exhaust, turbo.clone().add(v(-s * 0.04, 0, 0)), turbo.clone().add(v(s * 0.05, 0, 0)), 0.065, 0.065, 20);
      kit.span(M.steel, turbo.clone().add(v(s * 0.05, 0, 0)), turbo.clone().add(v(s * 0.11, 0, 0)), 0.05, 0.04, 16);
      kit.tube(M.polished, [turbo.clone().add(v(s * 0.1, 0.02, 0)), v(s * 0.17, y0 + 0.5, zc + 0.1), v(s * 0.08, y0 + 0.48, e.zStart + 0.06)], 0.028, 32, 8);
    }
  } else {
    // Naturally aspirated: polished trumpet stacks in the V under a carbon airbox and snorkel.
    for (const s of [-1, 1]) {
      for (let i = 0; i < perBank; i++) {
        const z = e.zStart + (e.length * (i + 0.5)) / perBank;
        kit.span(M.polished, v(s * 0.07, y0 + 0.29, z), v(s * 0.075, y0 + 0.41, z), 0.022, 0.034, 14);
      }
    }
    kit.box(M.satin, 0.3, 0.09, e.length * 0.92, v(0, y0 + 0.47, zc));
    kit.tube(M.satin, [v(0, y0 + 0.5, e.zStart + 0.12), v(0, y0 + 0.58, e.zStart + 0.02), v(0, y0 + 0.64, e.zStart - 0.1)], 0.07, 20, 12);
  }

  // Accessory drive on the leading face: crank, alternator and idler pulleys with their belt.
  const fz = e.zStart - 0.03;
  const pulleys: [number, number, number][] = [
    [0, y0 + 0.05, 0.075],
    [0.15, y0 + 0.24, 0.05],
    [-0.15, y0 + 0.2, 0.045],
  ];
  for (const [x, y, r] of pulleys) kit.span(M.polished, v(x, y, fz + 0.015), v(x, y, fz - 0.015), r, r, 24);
  kit.tube(
    M.rubber,
    [v(0, y0 - 0.03, fz), v(0.09, y0 + 0.03, fz), v(0.2, y0 + 0.24, fz), v(0.15, y0 + 0.295, fz), v(-0.15, y0 + 0.25, fz), v(-0.2, y0 + 0.19, fz), v(-0.08, y0 + 0.04, fz)],
    0.006,
    60,
    4,
    true
  );

  return { collectors, frontZ: e.zStart, rearZ: e.zStart + e.length };
}

function coilover(kit: PartKit, M: Mats, a: THREE.Vector3, b: THREE.Vector3) {
  const p = (t: number) => a.clone().lerp(b, t);
  kit.span(M.satin, a, p(0.62), 0.024, 0.024, 12);
  kit.span(M.polished, p(0.6), b, 0.009, 0.009, 8);
  kit.span(M.alloy, p(0.14), p(0.17), 0.05, 0.05, 16);
  kit.span(M.alloy, p(0.9), p(0.93), 0.05, 0.05, 16);
  kit.helix(M.spring, p(0.17), p(0.9), 0.042, 6.5, 0.0075);
}

function driveshaft(kit: PartKit, M: Mats, a: THREE.Vector3, b: THREE.Vector3) {
  kit.span(M.steel, a, b, 0.022);
  kit.sphere(M.rubber, 0.045, a);
  kit.sphere(M.rubber, 0.045, b);
}

function buildSuspension(kit: PartKit, M: Mats, spec: MechSpec, bp: Car3DBlueprint, wheels: WheelCorners) {
  const corners = [wheels.fl, wheels.fr, wheels.rl, wheels.rr];
  corners.forEach((w, i) => {
    const front = i < 2;
    if (spec.suspension === 'coilovers-front' && !front) return;
    const s = Math.sign(w.center.x);
    const r = w.radius;
    const hy = w.center.y;
    const z = w.center.z;
    const ux = w.center.x - s * (w.width / 2 + 0.06);
    const lowY = hy - r * 0.5;
    const upY = hy + r * 0.42;

    if (spec.suspension !== 'coilovers-front') {
      const inLow = s * Math.max(0.2, Math.abs(ux) - 0.4);
      const inUp = s * Math.max(0.26, Math.abs(ux) - 0.33);
      kit.box(M.alloy, 0.05, r * 1.05, 0.1, v(ux, hy, z)); // upright
      for (const dz of [-0.2, 0.2]) kit.span(M.satin, v(ux, lowY, z), v(inLow, lowY + 0.015, z + dz), 0.015);
      for (const dz of [-0.15, 0.15]) kit.span(M.satin, v(ux, upY, z), v(inUp, upY + 0.015, z + dz), 0.012);
      kit.sphere(M.steel, 0.022, v(ux, lowY, z));
      kit.sphere(M.steel, 0.02, v(ux, upY, z));
    }

    if (spec.suspension === 'pushrod') {
      const rocker = v(s * 0.17, hy + r * 0.78, z + (front ? 0.1 : -0.1));
      kit.span(M.steel, v(ux - s * 0.02, lowY + 0.02, z), rocker, 0.011);
      kit.sphere(M.alloy, 0.03, rocker);
      coilover(kit, M, rocker, v(s * 0.17, rocker.y, rocker.z + (front ? 0.3 : -0.3))); // inboard damper
    } else {
      const bottom = v(ux - s * 0.11, lowY + 0.03, z + 0.03);
      const top = v(s * Math.max(0.3, Math.abs(ux) - 0.22), hy + r * 0.95, z + 0.06);
      coilover(kit, M, bottom, top);
    }
  });

  if (spec.suspension === 'coilovers-front') return;

  // Anti-roll bars.
  for (const [l, front] of [[wheels.fl, true], [wheels.rl, false]] as const) {
    const y = l.center.y - l.radius * 0.2;
    const z = l.center.z + (front ? 0.22 : -0.22);
    const xi = Math.abs(l.center.x) - l.width / 2 - 0.2;
    kit.tube(M.satin, [v(-xi, y + 0.02, z - 0.12), v(-xi + 0.05, y, z), v(0, y - 0.01, z), v(xi - 0.05, y, z), v(xi, y + 0.02, z - 0.12)], 0.011, 40, 6);
  }

  if (!spec.steering) return;
  // Rack ahead of the axle when an engine fills the bay behind it, otherwise behind the axle.
  const frontZ = (wheels.fl.center.z + wheels.fr.center.z) / 2;
  const rz = frontZ + (spec.layout === 'front' ? -0.12 : 0.13);
  const ry = wheels.fl.center.y - wheels.fl.radius * 0.35;
  kit.span(M.steel, v(-0.34, ry, rz), v(0.34, ry, rz), 0.022);
  for (const w of [wheels.fl, wheels.fr]) {
    const s = Math.sign(w.center.x);
    const ux = w.center.x - s * (w.width / 2 + 0.06);
    kit.span(M.steel, v(s * 0.34, ry, rz), v(ux, ry + 0.01, w.center.z + (spec.layout === 'front' ? -0.1 : 0.11)), 0.009);
  }
  const wheel = v(bp.driverX, bp.wheelY - 0.06, bp.wheelZ + 0.12);
  const columnPath =
    spec.layout === 'front'
      ? [v(bp.driverX * 0.85, ry + 0.03, rz), v(bp.driverX * 1.25, 0.5, frontZ + 0.5), v(bp.driverX * 1.1, wheel.y - 0.1, wheel.z - 0.35), wheel]
      : [v(bp.driverX * 0.6, ry + 0.03, rz), wheel];
  kit.tube(M.steel, columnPath, 0.016, 32, 8);
}

function buildDrivetrain(kit: PartKit, M: Mats, spec: MechSpec, bp: Car3DBlueprint, wheels: WheelCorners, engine: EngineResult | null) {
  const rearY = (wheels.rl.center.y + wheels.rr.center.y) / 2;
  const rearZ = (wheels.rl.center.z + wheels.rr.center.z) / 2;

  if (spec.layout === 'mid' && engine && spec.engine) {
    const gy = spec.engine.crankY + 0.02;
    const end = rearZ + 0.34;
    kit.span(M.magnesium, v(0, gy, engine.rearZ), v(0, gy, engine.rearZ + 0.12), 0.19, 0.16, 24); // bell housing
    kit.box(M.magnesium, 0.32, 0.28, end - engine.rearZ - 0.12, v(0, gy, (engine.rearZ + 0.12 + end) / 2));
    kit.span(M.magnesium, v(-0.16, rearY, rearZ), v(0.16, rearY, rearZ), 0.12, 0.12, 24); // differential
    if (spec.rearMotor) {
      const m0 = v(0.2, gy + 0.05, engine.rearZ + 0.06);
      kit.span(M.steel, m0, m0.clone().add(v(0, 0, 0.22)), 0.1, 0.1, 24);
      kit.span(M.copper, m0.clone().add(v(0, 0, -0.012)), m0.clone().add(v(0, 0, 0.012)), 0.104, 0.104, 24);
    }
  } else if (spec.layout === 'front') {
    if (spec.gearbox) {
      kit.box(M.magnesium, 0.44, 0.28, 0.46, v(0, rearY + 0.02, rearZ - 0.06)); // transaxle
      kit.span(M.magnesium, v(-0.17, rearY, rearZ), v(0.17, rearY, rearZ), 0.12, 0.12, 24);
    }
    if (spec.torqueTube) {
      const startZ = engine ? engine.rearZ + 0.04 : bp.dashZ - 0.3;
      kit.span(M.steel, v(0, 0.3, startZ), v(0, rearY - 0.02, rearZ - 0.3), 0.055, 0.055, 16);
    }
  }

  for (const w of [wheels.rl, wheels.rr]) driveshaft(kit, M, v(Math.sign(w.center.x) * 0.15, rearY, rearZ), hubInner(w));

  if (spec.frontMotors) {
    const fy = (wheels.fl.center.y + wheels.fr.center.y) / 2;
    const fz = (wheels.fl.center.z + wheels.fr.center.z) / 2;
    for (const w of [wheels.fl, wheels.fr]) {
      const s = Math.sign(w.center.x);
      const m0 = v(s * 0.08, fy, fz);
      const m1 = v(s * 0.28, fy, fz);
      kit.span(M.steel, m0, m1, 0.1, 0.1, 24);
      kit.span(M.copper, m1.clone().add(v(-s * 0.012, 0, 0)), m1.clone().add(v(s * 0.012, 0, 0)), 0.104, 0.104, 24);
      driveshaft(kit, M, m1.clone().add(v(s * 0.02, 0, 0)), hubInner(w));
    }
  }
}

function buildEnergyStores(kit: PartKit, M: Mats, spec: MechSpec, bp: Car3DBlueprint, wheels: WheelCorners, engine: EngineResult | null) {
  // Fuel cell / tank.
  if (spec.layout === 'mid') kit.box(M.rubber, 0.62, 0.26, 0.13, v(0, 0.33, bp.seatBackZ + 0.08));
  else kit.box(M.rubber, 0.8, 0.18, 0.26, v(0, 0.5, bp.seatBackZ + 0.2));

  if (!spec.battery) return;
  let packRear: THREE.Vector3;
  let packFront: THREE.Vector3;
  if (spec.battery === 'behind-seats') {
    const c = v(0, 0.53, bp.seatBackZ + 0.08);
    kit.box(M.battery, 0.5, 0.12, 0.13, c);
    for (let k = -2; k <= 2; k++) kit.box(M.satin, 0.006, 0.124, 0.134, c.clone().add(v(k * 0.09, 0, 0)));
    packRear = c.clone().add(v(0.12, 0, 0.07));
    packFront = c.clone().add(v(-0.12, -0.06, -0.07));
  } else {
    const len = (bp.seatBackZ - bp.dashZ) * 0.85;
    const c = v(0, bp.cabinFloorY + 0.09, (bp.dashZ + bp.seatBackZ) / 2);
    kit.box(M.battery, 0.26, 0.15, len, c);
    for (let k = 0; k < 6; k++) kit.box(M.satin, 0.264, 0.006, 0.006, c.clone().add(v(0, 0.078, -len / 2 + (k + 0.5) * (len / 6))));
    packRear = c.clone().add(v(0.06, 0.03, len / 2));
    packFront = c.clone().add(v(-0.06, 0.03, -len / 2));
  }

  // High-voltage harness (orange) to every motor.
  if (spec.rearMotor && engine && spec.engine) {
    const motor = v(0.2, spec.engine.crankY + 0.07, engine.rearZ + 0.05);
    kit.tube(M.hv, [packRear, v(0.26, 0.36, (packRear.z + motor.z) / 2), motor], 0.012, 40, 6);
  }
  if (spec.frontMotors) {
    const fz = (wheels.fl.center.z + wheels.fr.center.z) / 2;
    const fy = (wheels.fl.center.y + wheels.fr.center.y) / 2;
    for (const s of [-1, 1]) kit.tube(M.hv, [packFront, v(s * 0.1, fy + 0.12, fz + 0.4), v(s * 0.18, fy + 0.11, fz + 0.02)], 0.011, 40, 6);
  }
}

function buildRadiators(kit: PartKit, M: Mats, spec: MechSpec, bp: Car3DBlueprint) {
  if (spec.radiators === 'side') {
    const z = (bp.doorRearZ + bp.zRearAxle) / 2 - 0.08;
    const half = deckAt(bp, z).halfW;
    for (const s of [-1, 1]) {
      // Sidepod coolers stay compact so they don't hide the engine in profile.
      const c = v(s * (half - 0.2), 0.36, z);
      kit.box(M.radiator, 0.04, 0.24, 0.4, c, s * 0.32);
      kit.box(M.satin, 0.055, 0.27, 0.03, c.clone().add(v(0, 0, 0.21)), s * 0.32);
      kit.box(M.satin, 0.055, 0.27, 0.03, c.clone().add(v(0, 0, -0.21)), s * 0.32);
      for (let k = 0; k < 12; k++) kit.box(M.steel, 0.045, 0.22, 0.004, c.clone().add(v(0, 0, -0.18 + k * 0.033)), s * 0.32);
      kit.tube(M.rubber, [c.clone().add(v(-s * 0.03, -0.09, -0.16)), v(s * 0.3, 0.28, z - 0.08), v(s * 0.15, 0.3, z + 0.08)], 0.016, 24, 6);
    }
  } else if (spec.radiators === 'front') {
    const z = -bp.L / 2 + 0.42;
    const c = v(0, 0.37, z);
    const span = bp.W * 0.5;
    kit.box(M.radiator, span, 0.34, 0.05, c, 0, -0.2);
    for (let k = 0; k < 18; k++) kit.box(M.steel, 0.004, 0.32, 0.055, c.clone().add(v(-span / 2 + (k * span) / 17, 0, 0)), 0, -0.2);
    for (const s of [-1, 1]) {
      kit.box(M.satin, 0.05, 0.38, 0.07, c.clone().add(v((s * span) / 2, 0, 0)), 0, -0.2);
      kit.box(M.radiator, 0.26, 0.22, 0.04, v(s * 0.62, 0.33, z + 0.08), 0, 0, s * 0.5);
      kit.tube(M.rubber, [c.clone().add(v(s * 0.28, -0.1, 0.04)), v(s * 0.25, 0.3, z + 0.3), v(s * 0.12, 0.34, z + 0.55)], 0.018, 24, 6);
    }
  }
}

function buildExhaust(kit: PartKit, M: Mats, spec: MechSpec, bp: Car3DBlueprint, starts: THREE.Vector3[]) {
  if (spec.exhaust === 'high-centre') {
    const exitZ = bp.rearWingZ - 0.06;
    const exitY = bp.rearWingY - 0.12;
    for (const st of starts) {
      const s = Math.sign(st.x);
      const tip = v(s * 0.085, exitY, exitZ);
      kit.tube(M.exhaust, [st, v(s * 0.33, st.y, bp.zRearAxle - 0.25), v(s * 0.24, st.y + 0.22, bp.zRearAxle + 0.2), v(s * 0.12, exitY - 0.03, exitZ - 0.2), tip], 0.034, 48, 10);
      kit.span(M.polished, tip, tip.clone().add(v(0, 0.01, 0.1)), 0.045, 0.05, 20);
    }
  } else if (spec.exhaust === 'top') {
    const z = bp.zRearAxle + 0.02;
    const deck = deckAt(bp, z).deckY;
    for (const st of starts) {
      const s = Math.sign(st.x);
      const top = v(s * 0.13, deck + 0.03, z);
      kit.tube(M.exhaust, [st, v(s * 0.3, st.y + 0.05, st.z + 0.2), v(s * 0.2, st.y + 0.3, z - 0.15), v(s * 0.14, deck - 0.12, z), top], 0.034, 48, 10);
      kit.span(M.polished, top.clone().add(v(0, -0.04, 0)), top.clone().add(v(0, 0.06, 0)), 0.046, 0.05, 20);
    }
  } else {
    const silencerZ = bp.zRearAxle + 0.45;
    const silencerY = 0.27;
    kit.box(M.exhaust, 0.92, 0.16, 0.3, v(0, silencerY, silencerZ));
    for (const st of starts) {
      const s = Math.sign(st.x);
      kit.tube(M.exhaust, [st, v(s * 0.26, 0.17, st.z + 0.4), v(s * 0.26, 0.16, bp.zRearAxle - 0.5), v(s * 0.3, 0.22, silencerZ - 0.2), v(s * 0.28, silencerY, silencerZ - 0.14)], 0.03, 64, 8);
      for (const off of [0.38, 0.5]) {
        kit.span(M.polished, v(s * off, silencerY, silencerZ + 0.14), v(s * off, silencerY - 0.01, bp.L / 2 - 0.14), 0.035, 0.042, 18);
      }
    }
  }
}

/**
 * Wheel centres, radii and widths in `container` space, measured from the meshes `isWheel`
 * accepts (blueprint values fill any corner the GLB doesn't expose).
 */
export function measureWheelCorners(
  container: THREE.Object3D,
  isWheel: (material: THREE.Material) => boolean,
  bp: Car3DBlueprint
): WheelCorners {
  container.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const boxes: Record<keyof WheelCorners, THREE.Box3> = {
    fl: new THREE.Box3(),
    fr: new THREE.Box3(),
    rl: new THREE.Box3(),
    rr: new THREE.Box3(),
  };
  const midZ = (bp.zFrontAxle + bp.zRearAxle) / 2;
  const tmp = new THREE.Box3();
  const centre = new THREE.Vector3();
  container.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some(isWheel)) return;
    tmp.setFromObject(o).applyMatrix4(toLocal);
    tmp.getCenter(centre);
    const key = `${centre.z < midZ ? 'f' : 'r'}${centre.x < 0 ? 'l' : 'r'}` as keyof WheelCorners;
    boxes[key].union(tmp);
  });
  const corner = (key: keyof WheelCorners, x: number, z: number, r: number, w: number): WheelCorner => {
    const b = boxes[key];
    if (b.isEmpty()) return { center: v(x, r, z), radius: r, width: w };
    const size = b.getSize(new THREE.Vector3());
    return { center: b.getCenter(new THREE.Vector3()), radius: Math.max(size.y / 2, r * 0.8), width: Math.min(size.x, w * 1.6) };
  };
  return {
    fl: corner('fl', -bp.trackFrontHalf, bp.zFrontAxle, bp.wheelRadiusF, bp.tireWidthF),
    fr: corner('fr', bp.trackFrontHalf, bp.zFrontAxle, bp.wheelRadiusF, bp.tireWidthF),
    rl: corner('rl', -bp.trackRearHalf, bp.zRearAxle, bp.wheelRadiusR, bp.tireWidthR),
    rr: corner('rr', bp.trackRearHalf, bp.zRearAxle, bp.wheelRadiusR, bp.tireWidthR),
  };
}

export interface Mechanicals {
  group: THREE.Group;
  dispose: () => void;
}

export function buildMechanicals(carId: string, bp: Car3DBlueprint, wheels: WheelCorners): Mechanicals | null {
  const spec = SPECS[carId];
  if (!spec) return null;
  const M = createMaterials(spec.engine?.coverColor ?? '#2b3036');
  const kit = new PartKit();

  const engine = spec.engine ? buildEngine(kit, M, spec.engine) : null;
  buildDrivetrain(kit, M, spec, bp, wheels, engine);
  buildSuspension(kit, M, spec, bp, wheels);
  buildEnergyStores(kit, M, spec, bp, wheels, engine);
  buildRadiators(kit, M, spec, bp);
  buildExhaust(kit, M, spec, bp, engine ? engine.collectors : spec.exhaustStarts ?? []);

  const group = kit.build();
  return {
    group,
    dispose: () => {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      Object.values(M).forEach((m) => m.dispose());
    },
  };
}
