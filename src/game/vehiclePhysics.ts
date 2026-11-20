/**
 * Sim-arcade vehicle model for the Proving Ground – a dynamic "bicycle" model, the same family of
 * model Forza / Gran Turismo build on:
 *
 *  - two axles with their own tyre forces (Pacejka-style curve with a gentle fall-off past the
 *    peak slip angle), so the car has real yaw inertia: it takes a moment to turn in, settles into
 *    the corner, and lets go progressively at the limit instead of snapping to the steering;
 *  - longitudinal load transfer (braking loads the nose → sharper turn-in, throttle loads the rear)
 *    plus aero downforce split front/rear by each car's aero balance;
 *  - a friction ellipse per axle (braking or wheelspin eats lateral grip → trail-brake rotation,
 *    power oversteer), a handbrake that locks the rear and lets it slide;
 *  - driver aids that scale with the drive mode: speed-sensitive steering range, counter-steer
 *    assist, traction control and stability control.
 *
 * Longitudinal power/gearing keeps the calibration of the original test drive, so 0–100 / 0–200
 * still track each car's figures. Pure TS – validated headless with an autopilot.
 */
import type { AstonCar } from '../data/cars';
import type { DrivePhysicsProfile } from '../data/engineeringData';
import { locateOnTrack, type TrackData, type TrackLocation } from './trackLayout';

const G = 9.81;

export type SurfaceKind = 'road' | 'kerb' | 'grass';
export type DriveAssist = 'GT' | 'SPORT' | 'SPORT+' | 'TRACK';

export interface VehicleSpec {
  massKg: number;
  powerPS: number;
  topSpeedMps: number;
  dragCd: number;
  wheelbase: number;
  halfWidth: number;
  /** Static weight on the front axle (0…1). */
  weightFront: number;
  cgHeight: number;
  yawInertia: number;
  /** Peak tyre friction coefficient (front; the wider rear gets `rearGrip` × this). */
  mu: number;
  rearGrip: number;
  /** Downforce at `downforceRefMps` (N) and the share carried by the front axle. */
  downforceN: number;
  aeroFrontShare: number;
  downforceRefMps: number;
  /** Lateral grip without / with full aero load (g) – used by planners and the HUD. */
  mechGripG: number;
  maxLatG: number;
  brakeDecelG: number;
  gearRatios: number[];
  finalDrive: number;
  tireRadius: number;
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  boostPower: number;
  awd: boolean;
  /** Fraction of drive torque sent to the front axle (0 = RWD). */
  driveFront: number;
}

export interface VehicleInput {
  throttle: number;
  brake: number;
  /** −1 (left) … +1 (right), already smoothed by the input layer. */
  steer: number;
  handbrake: boolean;
  boost: boolean;
}

export interface VehicleState {
  x: number;
  z: number;
  /** Body yaw ψ: forward = (−sin ψ, −cos ψ). */
  heading: number;
  vx: number;
  vz: number;
  /** rad/s, positive while turning right (ψ decreasing). */
  yawRate: number;
  /** Front-wheel angle actually applied (rad, + = right), for the steering visuals. */
  steerAngle: number;
  gear: number;
  rpm: number;
  shiftTimer: number;
  boostPct: number;
  reverseTimer: number;
  launchGain: number;
  launchTimer: number;
  // ---- derived every step ----
  forwardSpeed: number;
  lateralSpeed: number;
  speed: number;
  /** Body slip angle β (rad): direction of travel relative to the nose. */
  slipAngle: number;
  frontSlip: number;
  rearSlip: number;
  /** Longitudinal / lateral acceleration (m/s²) – drive the suspension and the camera. */
  longAccel: number;
  latAccel: number;
  latG: number;
  longG: number;
  surface: SurfaceKind;
  impact: number;
  wheelspin: number;
  sliding: number;
  assistActive: boolean;
  boosting: boolean;
  loc: TrackLocation;
  odometer: number;
}

export interface VehicleOptions {
  assist: DriveAssist;
  manual: boolean;
  powerScale: number;
}

export interface StepEvents {
  shift: 'up' | 'down' | null;
  impact: number;
}

/** Driver aids per drive mode. */
const AIDS: Record<DriveAssist, { escSlip: number; counterSteer: number; tc: number | null }> = {
  GT: { escSlip: (7 * Math.PI) / 180, counterSteer: 0.7, tc: 0.88 },
  SPORT: { escSlip: (12 * Math.PI) / 180, counterSteer: 0.6, tc: 0.95 },
  // SPORT+ TC sits exactly on the friction ellipse: flooring it out of a corner (which every
  // keyboard player does – W is 0 or 100 %) never steals the rear's side grip. Power oversteer
  // is reserved for TRACK, where the aids are off.
  'SPORT+': { escSlip: (18 * Math.PI) / 180, counterSteer: 0.5, tc: 1.0 },
  TRACK: { escSlip: Infinity, counterSteer: 0.4, tc: null },
};
/** Tyre curve stiffness: a stiffer rear (per unit of load) keeps the car stable – understeer at the
 *  limit, oversteer only when the rear is unloaded (handbrake, wheelspin, lift-off). */
const FRONT_B = 11.5;
const REAR_B = 13;

const parseFrontWeight = (s: string): number | null => {
  const m = /(\d+(?:\.\d+)?)\s*%?\s*F/i.exec(s);
  return m ? Math.min(0.65, Math.max(0.35, Number(m[1]) / 100)) : null;
};

/** Maps a car's homologation data + drivetrain profile onto the handling model. */
export function makeVehicleSpec(car: AstonCar, phys: DrivePhysicsProfile, wheelbase?: number, width?: number): VehicleSpec {
  const hyper = car.id === 'valkyrie' || car.id === 'valhalla';
  const m = car.specs.weightKg;
  const wb = wheelbase ?? car.aero.wheelbaseM;
  const weightFront = parseFrontWeight(car.specs.weightDist) ?? (hyper ? 0.45 : 0.5);
  // A touch more grip than the road-car figures: keyboard steering is digital, so the game leaves
  // a margin for imperfect inputs.
  const mu = hyper ? 1.42 : 1.2;
  const downforceN = car.aero.maxDownforceKg * G;
  const a = wb * (1 - weightFront);
  const b = wb * weightFront;
  return {
    massKg: m,
    powerPS: car.specs.powerPS,
    topSpeedMps: car.specs.topSpeedKmh / 3.6,
    dragCd: car.aero.dragCd,
    wheelbase: wb,
    halfWidth: (width ?? car.aero.widthM) / 2,
    weightFront,
    cgHeight: hyper ? 0.36 : 0.47,
    yawInertia: m * a * b * 1.1,
    mu,
    rearGrip: hyper ? 1.18 : 1.1, // wider rear tyres
    downforceN,
    aeroFrontShare: car.aero.frontBiasPct / 100,
    downforceRefMps: car.aero.downforceRefKmh / 3.6,
    mechGripG: mu,
    maxLatG: mu * (1 + downforceN / (m * G)),
    brakeDecelG: phys.brakeDecelG,
    gearRatios: phys.gearRatios,
    finalDrive: phys.finalDrive,
    tireRadius: phys.tireRadiusM,
    idleRpm: phys.idleRpm,
    redlineRpm: phys.redlineRpm,
    shiftUpRpm: phys.shiftUpRpm,
    boostPower: phys.hasHybridBoost ? (car.id === 'valkyrie' ? 0.14 : 0.2) : 0.1,
    awd: car.id === 'valhalla',
    driveFront: car.id === 'valhalla' ? 0.35 : 0,
  };
}

/**
 * Steering range at speed (rad of front-wheel angle for a full input), like Forza's "normal
 * steering": the tightest grip-limited radius plus the tyre's peak slip angle. A full keyboard
 * press therefore asks for maximum cornering force instead of scrubbing the fronts.
 */
export function steerLimit(spec: VehicleSpec, speed: number): number {
  const u = Math.max(Math.abs(speed), 1);
  const df = spec.downforceN * Math.min(1, (u / spec.downforceRefMps) ** 2);
  const muG = (spec.mu * (spec.massKg * G + df)) / spec.massKg;
  return Math.min(0.6, Math.atan((spec.wheelbase * muG) / (u * u)) + 0.06);
}

export function createVehicleState(): VehicleState {
  return {
    x: 0,
    z: 0,
    heading: 0,
    vx: 0,
    vz: 0,
    yawRate: 0,
    steerAngle: 0,
    gear: 1,
    rpm: 900,
    shiftTimer: 0,
    boostPct: 100,
    reverseTimer: 0,
    launchGain: 1,
    launchTimer: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    speed: 0,
    slipAngle: 0,
    frontSlip: 0,
    rearSlip: 0,
    longAccel: 0,
    latAccel: 0,
    latG: 0,
    longG: 0,
    surface: 'road',
    impact: 0,
    wheelspin: 0,
    sliding: 0,
    assistActive: false,
    boosting: false,
    loc: { index: 0, s: 0, lateral: 0, tx: 0, tz: -1, curvature: 0 },
    odometer: 0,
  };
}

/** Puts the car at rest on the track at pose (x, z, heading). */
export function placeVehicle(st: VehicleState, track: TrackData, x: number, z: number, heading: number, idleRpm: number) {
  st.x = x;
  st.z = z;
  st.heading = heading;
  st.vx = 0;
  st.vz = 0;
  st.yawRate = 0;
  st.steerAngle = 0;
  st.gear = 1;
  st.rpm = idleRpm;
  st.shiftTimer = 0;
  st.reverseTimer = 0;
  st.launchGain = 1;
  st.launchTimer = 0;
  st.forwardSpeed = 0;
  st.lateralSpeed = 0;
  st.speed = 0;
  st.slipAngle = 0;
  st.frontSlip = 0;
  st.rearSlip = 0;
  st.longAccel = 0;
  st.latAccel = 0;
  st.latG = 0;
  st.longG = 0;
  st.impact = 0;
  st.wheelspin = 0;
  st.sliding = 0;
  st.assistActive = false;
  st.boosting = false;
  locateOnTrack(track, x, z, -1, st.loc);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Lateral tyre force for slip angle α with peak D: peak near 8°, ~70 % left when fully sliding. */
function tyreForce(alpha: number, peak: number, stiffness: number): number {
  return -peak * Math.sin(1.5 * Math.atan(stiffness * alpha));
}

/** Manual paddle request; returns true when a shift happened. */
export function shiftGear(st: VehicleState, spec: VehicleSpec, dir: 'up' | 'down'): boolean {
  if (st.gear < 0) return false;
  if (dir === 'up' && st.gear < spec.gearRatios.length) {
    st.gear += 1;
    st.shiftTimer = 0.12;
    return true;
  }
  if (dir === 'down' && st.gear > 1) {
    // Refuse a downshift that would over-rev the engine (money-shift protection).
    const ratio = spec.gearRatios[st.gear - 2];
    const wheelRpm = (Math.abs(st.forwardSpeed) / (2 * Math.PI * spec.tireRadius)) * 60;
    if (wheelRpm * ratio * spec.finalDrive > spec.redlineRpm * 1.02) return false;
    st.gear -= 1;
    st.shiftTimer = 0.1;
    return true;
  }
  return false;
}

/**
 * Advances the car by dt seconds (sub-stepped at ≤ 4 ms – tyre forces are stiff at low speed).
 * Fills `events` with the gear change / wall impact that happened, if any.
 */
export function stepVehicle(
  st: VehicleState,
  inp: VehicleInput,
  spec: VehicleSpec,
  track: TrackData,
  opts: VehicleOptions,
  dt: number,
  events: StepEvents
): void {
  events.shift = null;
  events.impact = 0;
  st.impact = 0;
  const n = Math.max(1, Math.ceil(dt / 0.004));
  const h = dt / n;
  for (let i = 0; i < n; i++) substep(st, inp, spec, track, opts, h, events);
  if (!Number.isFinite(st.x + st.z + st.vx + st.vz + st.heading + st.yawRate)) {
    // Never let a numerical blow-up strand the player: drop back onto the centre line.
    st.vx = 0;
    st.vz = 0;
    st.yawRate = 0;
    st.heading = Number.isFinite(st.heading) ? st.heading : 0;
    if (!Number.isFinite(st.x + st.z)) {
      st.x = track.px[st.loc.index];
      st.z = track.pz[st.loc.index];
    }
  }
}

function substep(
  st: VehicleState,
  inp: VehicleInput,
  spec: VehicleSpec,
  track: TrackData,
  opts: VehicleOptions,
  dt: number,
  events: StepEvents
) {
  const sinH = Math.sin(st.heading);
  const cosH = Math.cos(st.heading);
  const fx = -sinH;
  const fz = -cosH;
  const rx = cosH;
  const rz = -sinH;

  let u = st.vx * fx + st.vz * fz; // forward speed
  let v = st.vx * rx + st.vz * rz; // lateral speed, + = sliding right
  let r = st.yawRate; // + = turning right
  const speed = Math.hypot(u, v);
  const aids = AIDS[opts.assist];

  // ---- surface under the car (from the previous step's projection) ----
  const lat = Math.abs(st.loc.lateral);
  let surface: SurfaceKind = 'road';
  if (lat > track.halfWidth + track.kerbWidth) surface = 'grass';
  else if (lat > track.halfWidth && track.kerb[st.loc.index] > 0) surface = 'kerb';
  const surfaceGrip = surface === 'grass' ? 0.55 : surface === 'kerb' ? 0.93 : 1;
  const surfaceDrag = surface === 'grass' ? 1.6 + speed * 0.055 : surface === 'kerb' ? 0.25 : 0;

  // ---- gearbox: reverse engagement ----
  if (st.gear > 0) {
    if (Math.abs(u) < 0.6 && inp.brake > 0.5 && inp.throttle < 0.1) {
      st.reverseTimer += dt;
      if (st.reverseTimer > 0.35) {
        st.gear = -1;
        st.reverseTimer = 0;
      }
    } else {
      st.reverseTimer = 0;
    }
  } else if (inp.throttle > 0.1 && u > -0.8) {
    st.gear = 1;
  }

  // ---- loads: static weight + longitudinal transfer + downforce ----
  const m = spec.massKg;
  const WB = spec.wheelbase;
  const a = WB * (1 - spec.weightFront); // CG → front axle
  const b = WB * spec.weightFront; // CG → rear axle
  const df = Math.min(1, (speed / spec.downforceRefMps) ** 2);
  const dfN = spec.downforceN * df;
  // Anti-dive / anti-squat geometry carries part of the pitch moment through the suspension
  // links, so only ~60 % of the textbook m·a·h/L shows up as load transfer at the tyres.
  const transfer = (0.6 * m * THREE_CLAMP(st.longAccel, -2.6 * G, 1.6 * G) * spec.cgHeight) / WB;
  const Fzf = Math.max(0.12 * m * G, (m * G * b) / WB - transfer + dfN * spec.aeroFrontShare);
  const Fzr = Math.max(0.12 * m * G, (m * G * a) / WB + transfer + dfN * (1 - spec.aeroFrontShare));
  const Df = spec.mu * surfaceGrip * Fzf;
  let Dr = spec.mu * spec.rearGrip * surfaceGrip * Fzr;

  // ---- throttle, stability control, boost ----
  const beta = Math.atan2(v, Math.max(Math.abs(u), 1.5));
  let throttle = inp.throttle;
  let assistActive = false;
  const escExcess = Math.abs(beta) - aids.escSlip;
  if (escExcess > 0 && speed > 6 && st.gear > 0) {
    throttle *= Math.max(0.2, 1 - escExcess * 6);
    assistActive = true;
  }
  const boosting = inp.boost && st.boostPct > 1 && throttle > 0.1 && st.gear > 0;
  if (boosting) st.boostPct = Math.max(0, st.boostPct - dt * 20);
  else if (inp.brake > 0.2 && speed > 5) st.boostPct = Math.min(100, st.boostPct + dt * 14);
  else st.boostPct = Math.min(100, st.boostPct + dt * 3.2);

  // ---- longitudinal demand (N, + = forward) ----
  let driveF = 0;
  st.shiftTimer = Math.max(0, st.shiftTimer - dt);
  if (st.gear > 0) {
    const ratio = spec.gearRatios[st.gear - 1] || 1;
    const gearFactor = Math.min(1.35, 0.55 + ratio * 0.22);
    const p2w = (spec.powerPS * (boosting ? 1 + spec.boostPower : 1)) / Math.max(1000, m);
    const maxAccel = Math.min(13.8, p2w * 15.2 * opts.powerScale * gearFactor);
    const headroom = Math.max(0, 1 - Math.pow(Math.max(0, u) / spec.topSpeedMps, 2.4));
    const limiter = st.rpm >= spec.redlineRpm * 0.995 && opts.manual ? 0.15 : 1;
    const cut = st.shiftTimer > 0 ? 0.25 : 1;
    let accel = throttle * maxAccel * headroom * limiter * cut;
    if (st.launchTimer > 0) {
      st.launchTimer -= dt;
      accel *= st.launchGain;
    }
    driveF = u < -0.5 ? 0 : accel * m;
  } else {
    // Reverse: the brake pedal drives backwards.
    const headroom = Math.max(0, 1 - Math.pow(Math.max(0, -u) / 9, 2));
    driveF = -inp.brake * 4.2 * m * headroom;
  }
  const driveRear = driveF * (1 - spec.driveFront);
  const driveFront = driveF * spec.driveFront;

  // Brakes: requested decel, split 62/38 front/rear.
  let brakeDecel = st.gear > 0 ? inp.brake * spec.brakeDecelG * G * (0.85 + 0.35 * df) : inp.throttle * 8;
  if (st.gear > 0 && u < -0.5 && inp.throttle > 0.1) brakeDecel = Math.max(brakeDecel, inp.throttle * 6); // rolling back
  const brakeF = brakeDecel * m;

  // ---- steering: speed-sensitive range + counter-steer assist ----
  const lim = steerLimit(spec, u);
  let delta = inp.steer * lim;
  // Counter-steer assist only beyond normal cornering slip (~4.5°), so it catches slides without
  // fighting the driver mid-corner.
  const betaEx = Math.sign(beta) * Math.max(0, Math.abs(beta) - 0.08);
  if (u > 3 && !inp.handbrake) {
    delta += Math.max(-0.25, Math.min(0.25, aids.counterSteer * betaEx)) * (1 - 0.4 * Math.abs(inp.steer));
  }
  delta = Math.max(-0.62, Math.min(0.62, delta));

  // ---- tyre slip angles ----
  const uMin = 2.5;
  const cd = Math.cos(delta);
  const sd = Math.sin(delta);
  const vf = v + a * r; // front contact lateral velocity (body frame)
  const uWheelF = u * cd + vf * sd;
  const vWheelF = -u * sd + vf * cd;
  const alphaF = Math.atan2(vWheelF, Math.max(Math.abs(uWheelF), uMin));
  const vr = v - b * r;
  const alphaR = Math.atan2(vr, Math.max(Math.abs(u), uMin));

  // ---- per-axle force allocation (friction ellipse) ----
  // ABS and traction control give cornering priority: longitudinal force gets what the lateral
  // demand leaves (never less than ~30 %), which is what keeps trail-braking and power-on exits
  // driveable on a keyboard. Without TC (TRACK) excess torque spins the rear and it lets go.
  const room = (D: number, f: number) => Math.sqrt(Math.max(0, D * D - f * f));
  const pureF = tyreForce(alphaF, Df, FRONT_B);
  const pureR = tyreForce(alphaR, Dr, REAR_B);

  // Electronic brake-force distribution: the rear's share follows its load (heavy braking moves
  // weight forward), and once the car starts to rotate the assisted modes take the rear brakes off.
  let rearShare = Math.max(0.18, Math.min(0.45, Fzr / (Fzf + Fzr) - 0.12));
  if (opts.assist !== 'TRACK' && Math.abs(beta) > 0.07) rearShare = 0.1;
  const reqF = driveFront - Math.sign(u) * brakeF * (1 - rearShare);
  const capF = Math.max(0.3 * Df, room(Df, pureF)) * 0.98;
  const fLongF = Math.sign(reqF) * Math.min(Math.abs(reqF), capF);
  let fLatF = Math.sign(pureF) * Math.min(Math.abs(pureF), Math.max(0.15 * Df, room(Df, fLongF)));

  let fLongR: number;
  let fLatR: number;
  let wheelspin = 0;
  if (inp.handbrake && Math.abs(u) > 1) {
    // pulled handbrake: strong rear braking and a tyre that has lost most of its side grip
    const brk = Dr * 0.5;
    fLongR = -Math.sign(u) * brk;
    fLatR = tyreForce(alphaR, room(Dr, brk) * 0.55, REAR_B);
  } else {
    const reqR = driveRear - Math.sign(u) * brakeF * rearShare;
    const braking = reqR * Math.sign(u || 1) < 0;
    let capR: number;
    if (braking) capR = Math.max(0.3 * Dr, room(Dr, pureR)) * 0.98;
    else if (aids.tc !== null) capR = Math.min(Dr * 0.98, Math.max(0.25 * Dr, room(Dr, pureR)) * aids.tc);
    else capR = Dr * 0.98;
    if (!braking && Math.abs(reqR) > capR) {
      if (aids.tc === null) wheelspin = Math.min(1, (Math.abs(reqR) / capR - 1) * 2.5);
      else if (Math.abs(u) > 2 && aids.tc < 1) assistActive = true;
      else wheelspin = Math.min(0.4, (Math.abs(reqR) / capR - 1)); // a chirp off the line
    }
    fLongR = Math.sign(reqR) * Math.min(Math.abs(reqR), capR);
    const latCapR = Math.max(0.15 * Dr, room(Dr, fLongR)) * (1 - wheelspin * 0.4);
    fLatR = Math.sign(pureR) * Math.min(Math.abs(pureR), latCapR);
  }
  // below walking pace tyres don't build lateral force from noise
  const lowBlend = Math.min(1, Math.abs(u) / 1.2);
  fLatF *= lowBlend;
  fLatR *= lowBlend;

  // body-frame forces and yaw moment
  const FxF = fLongF * cd - fLatF * sd;
  const FyF = fLongF * sd + fLatF * cd;
  const drag = 0.00058 * spec.dragCd * u * Math.abs(u) * m;
  const roll = Math.abs(u) > 0.05 ? Math.sign(u) * (0.32 + surfaceDrag) * m : 0;
  const sumFx = FxF + fLongR - drag - roll;
  const sumFy = FyF + fLatR;
  let Mz = a * FyF - b * fLatR;
  // Stability control: yaw moment back toward the direction of travel beyond the mode's slip.
  if (escExcess > 0 && speed > 6) Mz += Math.sign(beta) * Math.min(1, escExcess * 4) * spec.yawInertia * 3;

  // ---- integrate ----
  // Forces are applied to the world-space velocity (expressed in this step's body axes); the next
  // substep re-projects it onto the rotated body, which already produces the rotating-frame terms
  // (v·r, −u·r). Adding them here as well would count the frame rotation twice – the car would
  // bend its velocity far less than its tyres push and slowly spin out of every corner.
  const uOld = u;
  u += (sumFx / m) * dt;
  v += (sumFy / m) * dt;
  r += (Mz / spec.yawInertia) * dt;
  // brakes and rolling drag stop the car; they never push it backwards
  if (Math.sign(u) !== Math.sign(uOld) && uOld !== 0 && Math.abs(driveF) < 1) u = 0;

  // Walking pace: blend toward the kinematic (no-slip) motion so parking stays steady.
  const kin = Math.max(0, 1 - Math.abs(u) / 3.5);
  if (kin > 0) {
    const rKin = (u * Math.tan(delta)) / WB;
    const w = Math.min(1, kin * kin * dt * 30);
    r += (rKin - r) * w;
    v += (rKin * b - v) * w;
  }
  if (inp.handbrake && Math.abs(u) <= 1) {
    u *= Math.max(0, 1 - dt * 8);
    v *= Math.max(0, 1 - dt * 8);
  }

  st.vx = fx * u + rx * v;
  st.vz = fz * u + rz * v;
  st.yawRate = r;
  st.heading = wrapAngle(st.heading - r * dt);
  st.x += st.vx * dt;
  st.z += st.vz * dt;
  st.odometer += speed * dt;
  st.steerAngle = delta;

  // ---- barriers ----
  const loc = locateOnTrack(track, st.x, st.z, st.loc.index, st.loc);
  const side = loc.lateral >= 0 ? 1 : -1;
  const barrier = (side > 0 ? track.barrierRight[loc.index] : track.barrierLeft[loc.index]) - spec.halfWidth;
  if (Math.abs(loc.lateral) > barrier) {
    const nx = -loc.tz * side;
    const nz = loc.tx * side;
    const pen = Math.abs(loc.lateral) - barrier;
    st.x -= nx * pen;
    st.z -= nz * pen;
    loc.lateral -= side * pen;
    const vn = st.vx * nx + st.vz * nz;
    if (vn > 0) {
      const strike = vn > 2.5; // a real hit, as opposed to leaning on the wall
      const restitution = strike ? 0.22 : 0;
      st.vx -= nx * vn * (1 + restitution);
      st.vz -= nz * vn * (1 + restitution);
      const scrub = 1 - Math.min(0.55, vn * 0.035 + (strike ? 0.04 : 0.004));
      const vnAfter = st.vx * nx + st.vz * nz;
      st.vx = nx * vnAfter + (st.vx - nx * vnAfter) * scrub;
      st.vz = nz * vnAfter + (st.vz - nz * vnAfter) * scrub;
      if (strike) {
        // Glancing hits swing the nose parallel to the wall; only on the hit itself, otherwise
        // damping yaw on every frame of contact would glue the car to the barrier.
        const along = st.vx * loc.tx + st.vz * loc.tz >= 0 ? 1 : -1;
        const wallHeading = Math.atan2(-loc.tx * along, -loc.tz * along);
        const fwdDot = Math.cos(wrapAngle(st.heading - wallHeading));
        if (fwdDot > 0) st.heading = wrapAngle(st.heading + wrapAngle(wallHeading - st.heading) * Math.min(0.6, vn * 0.05));
        st.yawRate *= 0.5;
        st.impact = Math.max(st.impact, vn);
        events.impact = Math.max(events.impact, vn);
      }
    }
  }

  // ---- derived telemetry ----
  const sH = Math.sin(st.heading);
  const cH = Math.cos(st.heading);
  st.forwardSpeed = st.vx * -sH + st.vz * -cH;
  st.lateralSpeed = st.vx * cH + st.vz * -sH;
  st.speed = Math.hypot(st.vx, st.vz);
  st.slipAngle = Math.atan2(st.lateralSpeed, Math.max(1.5, Math.abs(st.forwardSpeed)));
  st.frontSlip = alphaF;
  st.rearSlip = alphaR;
  // Felt accelerations, smoothed a little: they feed load transfer, suspension and camera.
  const longAccel = (u - uOld) / dt;
  const latAccel = sumFy / m;
  const k = Math.min(1, dt * 25);
  st.longAccel += (THREE_CLAMP(longAccel, -40, 25) - st.longAccel) * k;
  st.latAccel += (THREE_CLAMP(latAccel, -40, 40) - st.latAccel) * k;
  st.latG = st.latAccel / G;
  st.longG = st.longAccel / G;
  st.surface = surface;
  st.assistActive = assistActive;
  st.boosting = boosting;
  st.wheelspin = wheelspin;
  const tyreSlide = Math.max(Math.abs(alphaR) - 0.12, (Math.abs(alphaF) - 0.15) * 0.8, 0) / 0.16;
  st.sliding = Math.min(1, tyreSlide + (inp.handbrake && st.speed > 6 ? 0.5 : 0) + wheelspin * 0.8);
  if (surface === 'grass') st.sliding *= 0.35;

  // ---- engine speed & automatic gearbox ----
  if (st.gear > 0) {
    const ratio = spec.gearRatios[st.gear - 1] || 1;
    const wheelRpm = (Math.abs(st.forwardSpeed) / (2 * Math.PI * spec.tireRadius)) * 60;
    const coupled = wheelRpm * ratio * spec.finalDrive * (1 + wheelspin * 0.35);
    const clutchFloor = spec.idleRpm + throttle * (spec.redlineRpm * 0.32);
    const target = Math.min(spec.redlineRpm, Math.max(clutchFloor, coupled));
    st.rpm += (target - st.rpm) * Math.min(1, dt * 14);
    if (!opts.manual && st.shiftTimer <= 0) {
      if (st.rpm >= spec.shiftUpRpm && st.gear < spec.gearRatios.length && throttle > 0.1) {
        st.gear += 1;
        st.shiftTimer = 0.14;
        events.shift = 'up';
      } else if (st.gear > 1) {
        const lower = spec.gearRatios[st.gear - 2];
        const lowerRpm = wheelRpm * lower * spec.finalDrive;
        const kick = inp.brake > 0.25 ? 0.72 : 0.5;
        if (st.rpm < spec.redlineRpm * 0.38 || (lowerRpm < spec.redlineRpm * kick && inp.brake > 0.25)) {
          st.gear -= 1;
          st.shiftTimer = 0.12;
          events.shift = 'down';
        }
      }
    }
  } else {
    const wheelRpm = (Math.abs(st.forwardSpeed) / (2 * Math.PI * spec.tireRadius)) * 60;
    const target = Math.max(spec.idleRpm + inp.brake * 1400, wheelRpm * 3.2 * spec.finalDrive);
    st.rpm += (Math.min(spec.redlineRpm * 0.6, target) - st.rpm) * Math.min(1, dt * 10);
  }
}

function THREE_CLAMP(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
