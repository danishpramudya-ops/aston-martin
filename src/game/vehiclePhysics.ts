/**
 * Arcade-sim vehicle model for the Proving Ground: a planar rigid body whose world-space velocity
 * is bent toward the body heading by grip-limited tyre forces. When the steering (or the handbrake)
 * rotates the body faster than the tyres can turn the velocity, the gap is the slip angle – which is
 * what produces understeer, slides and drifts without scripting any of them.
 *
 * Longitudinal behaviour (power-to-weight, gearing, drag, brakes) keeps the calibration of the
 * original test-drive simulator so 0–100 / 0–200 times still track each car's real figures.
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
  /** Lateral grip without aero load (g). */
  mechGripG: number;
  /** Lateral grip at the downforce reference speed (g). */
  maxLatG: number;
  downforceRefMps: number;
  brakeDecelG: number;
  gearRatios: number[];
  finalDrive: number;
  tireRadius: number;
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  /** Extra power fraction while the boost (ERS / overboost) is deployed. */
  boostPower: number;
  awd: boolean;
}

export interface VehicleInput {
  throttle: number;
  brake: number;
  /** −1 (left) … +1 (right). */
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
  /** Visual front-wheel angle (rad, + = right). */
  steerAngle: number;
  /** 1…n, or −1 for reverse. */
  gear: number;
  rpm: number;
  shiftTimer: number;
  boostPct: number;
  reverseTimer: number;
  /** Launch quality multiplier applied for `launchTimer` seconds after the start. */
  launchGain: number;
  launchTimer: number;
  // ---- derived every step ----
  forwardSpeed: number;
  lateralSpeed: number;
  speed: number;
  slipAngle: number;
  latG: number;
  longG: number;
  surface: SurfaceKind;
  /** Peak wall impact speed (m/s, normal to the barrier) during the last step. */
  impact: number;
  wheelspin: number;
  /** 0…1 tyre slide intensity (smoke, squeal, skid marks). */
  sliding: number;
  assistActive: boolean;
  boosting: boolean;
  loc: TrackLocation;
  odometer: number;
}

export interface VehicleOptions {
  assist: DriveAssist;
  manual: boolean;
  /** Drive-mode power map (GT is softer, TRACK full). */
  powerScale: number;
}

export interface StepEvents {
  shift: 'up' | 'down' | null;
  impact: number;
}

/** Maps a car's homologation data + drivetrain profile onto the handling model. */
export function makeVehicleSpec(car: AstonCar, phys: DrivePhysicsProfile, wheelbase?: number, width?: number): VehicleSpec {
  const hyper = car.id === 'valkyrie' || car.id === 'valhalla';
  return {
    massKg: car.specs.weightKg,
    powerPS: car.specs.powerPS,
    topSpeedMps: car.specs.topSpeedKmh / 3.6,
    dragCd: car.aero.dragCd,
    wheelbase: wheelbase ?? car.aero.wheelbaseM,
    halfWidth: (width ?? car.aero.widthM) / 2,
    // A touch more grip than the road-car figures: keyboard steering is digital, so the game
    // leaves a margin for imperfect inputs.
    mechGripG: hyper ? 1.42 : 1.2,
    maxLatG: Math.max(phys.maxLateralG * 1.05, hyper ? 1.42 : 1.2),
    downforceRefMps: car.aero.downforceRefKmh / 3.6,
    brakeDecelG: phys.brakeDecelG,
    gearRatios: phys.gearRatios,
    finalDrive: phys.finalDrive,
    tireRadius: phys.tireRadiusM,
    idleRpm: phys.idleRpm,
    redlineRpm: phys.redlineRpm,
    shiftUpRpm: phys.shiftUpRpm,
    boostPower: phys.hasHybridBoost ? (car.id === 'valkyrie' ? 0.14 : 0.2) : 0.1,
    awd: car.id === 'valhalla',
  };
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
  st.latG = 0;
  st.longG = 0;
  st.impact = 0;
  st.wheelspin = 0;
  st.sliding = 0;
  st.assistActive = false;
  st.boosting = false;
  locateOnTrack(track, x, z, -1, st.loc);
}

const ESC_SLIP_LIMIT: Record<DriveAssist, number> = {
  GT: (7 * Math.PI) / 180,
  SPORT: (13 * Math.PI) / 180,
  'SPORT+': (24 * Math.PI) / 180,
  TRACK: Infinity,
};

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
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
 * Advances the car by dt seconds (internally sub-stepped at ≤ 8 ms for stable yaw at speed).
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
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++) substep(st, inp, spec, track, opts, h, events);
  if (!Number.isFinite(st.x + st.z + st.vx + st.vz + st.heading)) {
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

  let vF = st.vx * fx + st.vz * fz;
  const vR = st.vx * rx + st.vz * rz;
  const speed = Math.hypot(st.vx, st.vz);

  // ---- surface under the car (from the previous step's projection) ----
  const lat = Math.abs(st.loc.lateral);
  const idx = st.loc.index;
  let surface: SurfaceKind = 'road';
  if (lat > track.halfWidth + track.kerbWidth) surface = 'grass';
  else if (lat > track.halfWidth && track.kerb[idx] > 0) surface = 'kerb';
  const surfaceGrip = surface === 'grass' ? 0.58 : surface === 'kerb' ? 0.92 : 1;
  const surfaceDrag = surface === 'grass' ? 1.6 + speed * 0.055 : surface === 'kerb' ? 0.25 : 0;

  const df = Math.min(1, (speed / spec.downforceRefMps) ** 2);
  const gripG = spec.mechGripG + (spec.maxLatG - spec.mechGripG) * df;

  // ---- gearbox: reverse engagement ----
  if (st.gear > 0) {
    if (Math.abs(vF) < 0.6 && inp.brake > 0.5 && inp.throttle < 0.1) {
      st.reverseTimer += dt;
      if (st.reverseTimer > 0.35) {
        st.gear = -1;
        st.reverseTimer = 0;
      }
    } else {
      st.reverseTimer = 0;
    }
  } else if (inp.throttle > 0.1 && vF > -0.8) {
    st.gear = 1;
  }

  // ---- longitudinal ----
  st.shiftTimer = Math.max(0, st.shiftTimer - dt);
  const escLimit = ESC_SLIP_LIMIT[opts.assist];
  const slip = Math.atan2(vR, Math.max(1.5, Math.abs(vF)));
  let throttle = inp.throttle;
  let assistActive = false;
  if (Math.abs(slip) > escLimit && speed > 6) {
    throttle *= 0.35;
    assistActive = true;
  }

  const boosting = inp.boost && st.boostPct > 1 && throttle > 0.1 && st.gear > 0;
  if (boosting) st.boostPct = Math.max(0, st.boostPct - dt * 20);
  else if (inp.brake > 0.2 && speed > 5) st.boostPct = Math.min(100, st.boostPct + dt * 14);
  else st.boostPct = Math.min(100, st.boostPct + dt * 3.2);

  let aF = 0;
  let brakeDecel = 0;
  let wheelspin = 0;
  if (st.gear > 0) {
    const ratio = spec.gearRatios[st.gear - 1] || 1;
    const gearFactor = Math.min(1.35, 0.55 + ratio * 0.22);
    const p2w = (spec.powerPS * (boosting ? 1 + spec.boostPower : 1)) / Math.max(1000, spec.massKg);
    const maxAccel = Math.min(13.8, p2w * 15.2 * opts.powerScale * gearFactor);
    const headroom = Math.max(0, 1 - Math.pow(Math.max(0, vF) / spec.topSpeedMps, 2.4));
    const limiter = st.rpm >= spec.redlineRpm * 0.995 && opts.manual ? 0.15 : 1;
    const cut = st.shiftTimer > 0 ? 0.25 : 1;
    let drive = throttle * maxAccel * headroom * limiter * cut;
    if (st.launchTimer > 0) {
      st.launchTimer -= dt;
      drive *= st.launchGain;
    }
    // Wheelspin when asking more than the driven axle can hold (cosmetic smoke + a small penalty
    // without traction control).
    const tractionCap = G * spec.mechGripG * (spec.awd ? 1.2 : 0.95) * surfaceGrip;
    if (drive > tractionCap && vF < 28) {
      wheelspin = Math.min(1, (drive - tractionCap) / tractionCap);
      if (opts.assist === 'TRACK' || opts.assist === 'SPORT+') drive = tractionCap + (drive - tractionCap) * 0.55;
      else wheelspin *= 0.25;
    }
    aF = vF < -0.5 ? 0 : drive;
    brakeDecel = inp.brake * spec.brakeDecelG * G * (0.85 + 0.35 * df);
    if (vF < -0.5 && throttle > 0.1) brakeDecel = Math.max(brakeDecel, throttle * 6); // rolling back
  } else {
    // Reverse: the brake pedal drives backwards, the throttle brakes.
    const revMax = 9;
    const headroom = Math.max(0, 1 - Math.pow(Math.max(0, -vF) / revMax, 2));
    aF = -inp.brake * 4.2 * headroom;
    brakeDecel = throttle * 8;
  }
  if (inp.handbrake) brakeDecel += 0.55 * G;

  const drag = 0.00058 * spec.dragCd * vF * Math.abs(vF);
  const roll = Math.abs(vF) > 0.05 ? Math.sign(vF) * (0.32 + surfaceDrag) : 0;
  vF += (aF - drag - roll) * dt;
  // Brakes never push the car backwards: they only bleed speed toward zero.
  if (brakeDecel > 0) {
    const dv = brakeDecel * dt;
    vF = Math.abs(vF) <= dv ? 0 : vF - Math.sign(vF) * dv;
  }
  vF = Math.min(vF, spec.topSpeedMps);
  const aLong = aF - drag - roll - (brakeDecel > 0 ? Math.sign(vF) * brakeDecel : 0);

  // ---- lateral: tyres pull the velocity toward the heading, limited by grip ----
  // The front axle decides how fast the body can yaw; the rear decides how hard the velocity can be
  // bent. Handbrake and (in TRACK mode) power oversteer only weaken the rear – hence drifts.
  const aLatFront = gripG * G * surfaceGrip;
  let rearScale = 1;
  if (inp.handbrake) rearScale *= 0.42;
  if (!spec.awd && opts.assist === 'TRACK' && throttle > 0.85 && st.gear > 0 && st.gear <= 3 && Math.abs(inp.steer) > 0.35) {
    rearScale *= 0.7;
  }
  const aLatMax = aLatFront * rearScale;
  // Friction circle: hard braking / acceleration leaves less grip for cornering.
  // Kept generous (1.8× radius): the Valkyrie brakes at well over 2 g, and a strict circle turns
  // every trail-braked corner into understeer.
  const combined = Math.sqrt(Math.max(0.35, 1 - (Math.abs(aLong) / (aLatFront * 1.8 + 1e-3)) ** 2));
  const aLatAvail = aLatMax * combined;
  const aR = -Math.sign(vR) * Math.min(Math.abs(vR) * 16, aLatAvail);
  let vRn = vR + aR * dt;
  if (Math.sign(vRn) !== Math.sign(vR)) vRn = 0;

  // ---- steering → yaw ----
  const absVF = Math.abs(vF);
  const steerMax = 0.6 - 0.47 * Math.min(1, absVF / 62);
  const delta = inp.steer * steerMax;
  const kinematic = (vF * Math.tan(delta)) / spec.wheelbase;
  // A full input asks for the grip-limited yaw rate; the handbrake lets the body rotate faster than
  // the velocity can follow – the start of a drift.
  const gripYaw = ((aLatFront * (inp.handbrake ? 2.4 : 1)) / Math.max(absVF, 3)) * Math.abs(inp.steer);
  let yawTarget = Math.sign(kinematic) * Math.min(Math.abs(kinematic), gripYaw);
  // Self-aligning: beyond normal cornering slip (~4°) the rear tyres pull the nose back toward the
  // direction of travel, so slides recover instead of growing into spins. Below the threshold it
  // stays out of the way – otherwise every corner would carry a built-in understeer bias.
  const excessSlip = Math.max(0, Math.abs(slip) - 0.07);
  if (!inp.handbrake && speed > 3) yawTarget += Math.sign(slip) * excessSlip * 2.2 * Math.sign(vF || 1);
  if (assistActive && Number.isFinite(escLimit)) {
    // Stability control: yaw back toward the direction of travel.
    yawTarget += Math.sign(slip) * Math.min(1.2, (Math.abs(slip) - escLimit) * 6) * Math.sign(vF || 1);
  }
  const yawResp = surface === 'grass' ? 4.5 : inp.handbrake ? 6 : 9;
  st.yawRate += (yawTarget - st.yawRate) * (1 - Math.exp(-yawResp * dt));
  st.steerAngle = absVF > 0.5 ? Math.atan((st.yawRate * spec.wheelbase) / Math.max(absVF, 1)) * Math.sign(vF) : delta;
  st.steerAngle = Math.max(-0.6, Math.min(0.6, st.steerAngle));

  // ---- integrate ----
  st.vx = fx * vF + rx * vRn;
  st.vz = fz * vF + rz * vRn;
  st.heading = wrapAngle(st.heading - st.yawRate * dt);
  st.x += st.vx * dt;
  st.z += st.vz * dt;
  st.odometer += speed * dt;

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
        // Glancing hits swing the nose parallel to the wall, like a real barrier strike. Only on
        // the hit itself: damping yaw on every frame of contact would glue the car to the wall.
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
  // Lateral acceleration felt in the seat ≈ v·(dψ/dt) plus the tyres' sideways shove.
  st.latG = (st.forwardSpeed * st.yawRate) / G;
  st.longG = aLong / G;
  st.surface = surface;
  st.assistActive = assistActive;
  st.boosting = boosting;
  st.wheelspin = wheelspin;
  const slideSpeed = Math.abs(st.lateralSpeed);
  st.sliding = Math.min(1, Math.max(0, (slideSpeed - 1.6) / 4.5) + (inp.handbrake && st.speed > 6 ? 0.45 : 0) + wheelspin * 0.8);
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
