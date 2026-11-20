/**
 * Proving Ground game loop: owns the circuit world, the car's physics state, race control, tyre FX,
 * the best-lap ghost, drive audio and the drive cameras. The React stage calls `update()` once per
 * frame while in drive mode; the HUD subscribes to `hud` (published ~20×/s, so only the HUD
 * re-renders instead of the whole stage).
 */
import * as THREE from 'three';
import type { AstonCar } from '../data/cars';
import { DRIVE_PHYSICS_PROFILES, type DrivePhysicsProfile } from '../data/engineeringData';
import { engineAudio, type ExhaustValveMode } from '../audio/engineAudio';
import { driveSfx } from '../audio/driveSfx';
import type { Car3DInstance } from '../three/buildCar3D';
import { buildCircuitWorld, type CircuitWorld } from '../three/circuitWorld';
import { createDriveFx, type DriveFx } from '../three/driveFx';
import { buildGhostCar, type GhostCar } from '../three/ghostCar';
import type { Studio } from '../three/studio';
import { DriveInput, type DriveAction, type DriveControl } from './driveInput';
import { RaceSession, samplePose, type RaceToast, type SessionSnapshot } from './raceSession';
import { buildTrack, locateOnTrack, poseAt, type TrackData } from './trackLayout';
import {
  createVehicleState,
  makeVehicleSpec,
  placeVehicle,
  shiftGear,
  stepVehicle,
  type DriveAssist,
  type StepEvents,
  type SurfaceKind,
  type VehicleInput,
  type VehicleSpec,
} from './vehiclePhysics';

export type DriveCameraMode = 'chase' | 'cockpit' | 'bonnet';
export type DriveModeName = DriveAssist;
export const DRIVE_MODES: DriveModeName[] = ['GT', 'SPORT', 'SPORT+', 'TRACK'];

export interface DriveTelemetry {
  speedKmh: number;
  rpm: number;
  /** −1 = reverse. */
  gear: number;
  throttle: number;
  brake: number;
  steer: number;
  latG: number;
  longG: number;
  downforceKg: number;
  brakeTempC: number;
  boostPct: number;
  boosting: boolean;
  zeroTo100Sec: number | null;
  zeroTo200Sec: number | null;
  peakSpeedKmh: number;
  surface: SurfaceKind;
  sliding: number;
  assistActive: boolean;
  handbrake: boolean;
}

export interface DriveHudState {
  loading: boolean;
  paused: boolean;
  telemetry: DriveTelemetry;
  session: SessionSnapshot;
  toasts: RaceToast[];
  pose: { x: number; z: number; heading: number };
  ghostPose: { x: number; z: number } | null;
  camera: DriveCameraMode;
  mode: DriveModeName;
  manual: boolean;
  ghostEnabled: boolean;
  audioOn: boolean;
  usingGamepad: boolean;
  hasBest: boolean;
}

class HudStore {
  private state: DriveHudState;
  private listeners = new Set<() => void>();
  constructor(initial: DriveHudState) {
    this.state = initial;
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  set(next: DriveHudState) {
    this.state = next;
    this.listeners.forEach((l) => l());
  }
}

const POWER_SCALE: Record<DriveModeName, number> = { GT: 0.86, SPORT: 0.94, 'SPORT+': 1.0, TRACK: 1.04 };
const EXHAUST_FOR: Record<DriveModeName, ExhaustValveMode> = { GT: 'QUIET', SPORT: 'SPORT', 'SPORT+': 'TRACK', TRACK: 'TRACK' };
const GRID_LATERAL = -3.2;

const emptyTelemetry = (): DriveTelemetry => ({
  speedKmh: 0,
  rpm: 900,
  gear: 1,
  throttle: 0,
  brake: 0,
  steer: 0,
  latG: 0,
  longG: 0,
  downforceKg: 0,
  brakeTempC: 145,
  boostPct: 100,
  boosting: false,
  zeroTo100Sec: null,
  zeroTo200Sec: null,
  peakSpeedKmh: 0,
  surface: 'road',
  sliding: 0,
  assistActive: false,
  handbrake: false,
});

export class DriveGame {
  readonly track: TrackData;
  readonly hud: HudStore;
  /** Fullscreen needs the DOM element, so the stage handles it. */
  onFullscreenRequest: (() => void) | null = null;
  /**
   * Testing seam: when set, its result overrides the player's inputs each frame (used by the
   * headless verification scripts to drive real laps in the browser).
   */
  debugAutopilot: ((car: { x: number; z: number; heading: number; speed: number; s: number; lateral: number }, track: TrackData) => Partial<VehicleInput>) | null = null;

  private readonly studio: Studio;
  private readonly camera: THREE.PerspectiveCamera;
  private world: CircuitWorld | null = null;
  private fx: DriveFx | null = null;
  private ghost: GhostCar | null = null;
  private ghostFor: Car3DInstance | null = null;
  private session: RaceSession;
  private readonly st = createVehicleState();
  private spec: VehicleSpec | null = null;
  private car: AstonCar | null = null;
  private car3d: Car3DInstance | null = null;
  private phys: DrivePhysicsProfile | null = null;
  private readonly input = new DriveInput();
  private readonly vin: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  private readonly events: StepEvents = { shift: null, impact: 0 };

  private active = false;
  private loading = false;
  private paused = false;
  private cameraMode: DriveCameraMode = 'chase';
  private mode: DriveModeName = 'SPORT+';
  private manual = false;
  private ghostEnabled = true;
  private audioOn = true;
  private audioStarted = false;
  private nightTarget = 0;
  private night = 0;
  private visible = true;

  private camHeading = 0;
  private camHeadingV = 0;
  private camDist = 6;
  private camDistV = 0;
  private camFov = 54;
  private camSnap = true;
  private shake = 0;
  /** Sprung-body springs (rad, rad, m) and the cockpit head springs. */
  private readonly susp = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0, heaveV: 0 };
  private readonly head = { x: 0, xV: 0, z: 0, zV: 0, yaw: 0, yawV: 0 };
  private bumpDist = 0;
  private clock = 0;
  private brakeTemp = 145;
  private peakKmh = 0;
  private runStart: number | null = null;
  private t100: number | null = null;
  private t200: number | null = null;
  private lastHud = 0;
  private impactCooldown = 0;
  private smokeAcc = 0;
  private shadowAcc = 0;
  private enterToken = 0;
  private readonly ghostPose = { x: 0, z: 0, heading: 0 };
  private readonly tmpV = new THREE.Vector3();
  private readonly lookV = new THREE.Vector3();
  private readonly bufferSize = new THREE.Vector2();
  private savedNear = 0.04;
  private savedFar = 160;

  constructor(studio: Studio, camera: THREE.PerspectiveCamera) {
    this.studio = studio;
    this.camera = camera;
    this.track = buildTrack();
    this.session = new RaceSession(this.track, 'valkyrie');
    this.hud = new HudStore(this.composeHud());
    this.input.onAction = (a) => this.handleAction(a);
    this.input.onFocusLost = () => {
      if (this.active && this.session.isRacing && !this.paused) this.setPaused(true);
    };
  }

  get isActive() {
    return this.active;
  }

  get isLoading() {
    return this.loading;
  }

  // ------------------------------------------------------------------ lifecycle

  /** Builds (first time) and reveals the circuit, puts `car3d` on the grid and arms the lights. */
  async enter(car3d: Car3DInstance, car: AstonCar): Promise<void> {
    const token = ++this.enterToken;
    this.active = true;
    this.loading = true;
    this.publish(true);
    this.studio.setFade(1, 7);
    // let the fade reach black before the (one-off) world build blocks the main thread
    await new Promise((r) => window.setTimeout(r, this.world ? 60 : 160));
    if (token !== this.enterToken) return;
    const world = this.ensureWorld();
    this.studio.setDriveMode(true, world.sunDirTrack);
    world.group.visible = true;
    world.setContactShadow(this.studio.contactShadowTexture, this.studio.contactShadowRect);
    this.savedNear = this.camera.near;
    this.savedFar = this.camera.far;
    this.camera.far = 3200;
    this.bindCar(car3d, car);
    this.restart(false);
    this.input.attach();
    this.input.enabled = this.visible;
    await this.studio.precompile(world.group, this.camera, null, 6000);
    if (token !== this.enterToken) return;
    this.loading = false;
    this.studio.setFade(0, 1.8);
    this.startAudio();
    this.publish(true);
  }

  exit() {
    this.enterToken++;
    if (!this.active) return;
    this.active = false;
    this.loading = false;
    this.paused = false;
    this.input.detach();
    if (this.world) this.world.group.visible = false;
    this.ghost?.setFade(0);
    this.studio.setDriveMode(false);
    this.studio.setFade(0, 2);
    this.camera.near = this.savedNear;
    this.camera.far = this.savedFar;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (this.car3d) {
      this.car3d.setSteer(0);
      this.car3d.setDriveDynamics(0, 0, 0, 0);
      this.car3d.setActiveAero(0);
      this.car3d.setBrakeThermal(0);
    }
    this.stopAudio();
    this.publish(true);
  }

  /** Swap the car while staying on the circuit (back to the grid, the new car's best lap loads). */
  setCar(car3d: Car3DInstance, car: AstonCar) {
    if (!this.active) {
      this.car3d = car3d;
      this.car = car;
      return;
    }
    this.bindCar(car3d, car);
    this.restart(false);
    if (this.audioOn) {
      engineAudio.stop();
      this.audioStarted = false;
      this.startAudio();
    }
  }

  /** The stage tells us whether it is on screen: keys are only captured while it is. */
  setVisible(visible: boolean) {
    this.visible = visible;
    this.input.enabled = this.active && visible;
    if (!visible) this.input.clear();
  }

  dispose() {
    this.exit();
    this.ghost?.dispose();
    this.fx?.dispose();
    this.world?.dispose();
    this.world = null;
  }

  private ensureWorld(): CircuitWorld {
    if (this.world) return this.world;
    const world = buildCircuitWorld(this.track);
    const fx = createDriveFx();
    world.group.add(fx.group);
    this.studio.scene.add(world.group);
    // hidden while the contact shadow and AO passes render (they should only see the car)
    this.studio.props.push(world.group);
    this.world = world;
    this.fx = fx;
    world.setNight(this.night);
    fx.setNight(this.night);
    return world;
  }

  private bindCar(car3d: Car3DInstance, car: AstonCar) {
    this.car3d = car3d;
    this.car = car;
    this.phys = DRIVE_PHYSICS_PROFILES[car.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
    const bp = car3d.blueprint;
    this.spec = makeVehicleSpec(car, this.phys, bp.WB, bp.W);
    this.session.setCar(car.id);
    this.world?.setLamps(bp.W * 0.34, -bp.L * 0.5 + 0.12, bp.L * 0.5 - 0.1);
    car3d.setInteriorMode(this.cameraMode === 'cockpit');
    engineAudio.setExhaustValve(EXHAUST_FOR[this.mode]);
    if (this.ghostFor !== car3d) {
      // The ghost shares this car's geometry; rebuild it lazily for the new car.
      this.ghost?.dispose();
      this.ghost = null;
      this.ghostFor = null;
    }
  }

  /** Built on first use (a lap after a best exists), when the doors have long finished closing. */
  private ensureGhost(): GhostCar | null {
    if (this.ghost) return this.ghost;
    if (!this.car3d || !this.world) return null;
    const wasInterior = this.cameraMode === 'cockpit';
    if (wasInterior) this.car3d.setInteriorMode(false);
    this.ghost = buildGhostCar(this.car3d.root);
    if (wasInterior) this.car3d.setInteriorMode(true);
    this.ghostFor = this.car3d;
    this.world.group.add(this.ghost.group);
    return this.ghost;
  }

  // ------------------------------------------------------------------ controls

  restart(click = true) {
    if (!this.spec || !this.world) return;
    if (click) engineAudio.playSwitchClick(true);
    const s = this.track.length - this.track.gridBack;
    const p = poseAt(this.track, s);
    const rx = Math.cos(p.heading);
    const rz = -Math.sin(p.heading);
    placeVehicle(this.st, this.track, p.x + rx * GRID_LATERAL, p.z + rz * GRID_LATERAL, p.heading, this.spec.idleRpm);
    this.st.boostPct = 100;
    this.session.restart(s);
    this.fx?.clear();
    this.brakeTemp = 145;
    this.peakKmh = 0;
    this.runStart = null;
    this.t100 = null;
    this.t200 = null;
    this.camSnap = true;
    this.paused = false;
    this.publish(true);
  }

  respawn() {
    if (!this.spec || !this.session.isRacing) return;
    engineAudio.playSwitchClick(false);
    const loc = locateOnTrack(this.track, this.st.x, this.st.z, -1, this.st.loc);
    const p = poseAt(this.track, loc.s + 4);
    placeVehicle(this.st, this.track, p.x, p.z, p.heading, this.spec.idleRpm);
    this.session.noteRespawn(this.st.loc.s);
    this.camSnap = true;
  }

  setCameraMode(m: DriveCameraMode) {
    this.cameraMode = m;
    this.car3d?.setInteriorMode(m === 'cockpit');
    this.camSnap = true;
    this.publish(true);
  }

  cycleCamera() {
    const order: DriveCameraMode[] = ['chase', 'cockpit', 'bonnet'];
    this.setCameraMode(order[(order.indexOf(this.cameraMode) + 1) % order.length]);
  }

  setMode(m: DriveModeName) {
    this.mode = m;
    engineAudio.playSwitchClick(false);
    engineAudio.setExhaustValve(EXHAUST_FOR[m]);
    this.publish(true);
  }

  toggleManual() {
    this.manual = !this.manual;
    engineAudio.playSwitchClick(false);
    this.publish(true);
  }

  shift(dir: 'up' | 'down') {
    if (!this.spec) return;
    if (!this.manual) {
      // Pulling a paddle in automatic switches to manual, like the real DCT.
      this.manual = true;
    }
    if (shiftGear(this.st, this.spec, dir) && this.audioOn && this.audioStarted) engineAudio.triggerGearShift(dir, this.st.rpm);
    this.publish(true);
  }

  setGhostEnabled(on: boolean) {
    this.ghostEnabled = on;
    if (!on) this.ghost?.setFade(0);
    this.publish(true);
  }

  setAudio(on: boolean) {
    this.audioOn = on;
    if (on) this.startAudio();
    else this.stopAudio();
    this.publish(true);
  }

  setNight(on: boolean) {
    this.nightTarget = on ? 1 : 0;
  }

  setPaused(p: boolean) {
    if (!this.active) return;
    this.paused = p;
    if (p) this.input.clear();
    this.publish(true);
  }

  /** On-screen pedals and steering. */
  control(c: DriveControl, active: boolean) {
    this.input.setControl(c, active);
  }

  clearBestLap() {
    this.session.clearBest();
    this.publish(true);
  }

  private handleAction(a: DriveAction) {
    switch (a) {
      case 'shiftUp':
        this.shift('up');
        break;
      case 'shiftDown':
        this.shift('down');
        break;
      case 'camera':
        this.cycleCamera();
        break;
      case 'respawn':
        this.respawn();
        break;
      case 'restart':
        this.restart();
        break;
      case 'pause':
        this.setPaused(!this.paused);
        break;
      case 'fullscreen':
        this.onFullscreenRequest?.();
        break;
      case 'ghost':
        this.setGhostEnabled(!this.ghostEnabled);
        break;
      case 'mode':
        this.setMode(DRIVE_MODES[(DRIVE_MODES.indexOf(this.mode) + 1) % DRIVE_MODES.length]);
        break;
    }
  }

  private startAudio() {
    if (!this.audioOn || !this.active || this.loading || !this.car || !this.phys) return;
    if (!this.audioStarted) {
      engineAudio.triggerColdStart(this.car.topology, this.phys.idleRpm);
      this.audioStarted = true;
    }
    driveSfx.start();
  }

  private stopAudio() {
    engineAudio.stop();
    driveSfx.stop();
    this.audioStarted = false;
  }

  // ------------------------------------------------------------------ frame

  update(dt: number) {
    const car3d = this.car3d;
    const spec = this.spec;
    const world = this.world;
    if (!this.active || !car3d || !spec || !world || !this.car) return;
    this.clock += dt;
    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 3);
    world.setNight(this.night);
    this.fx?.setNight(this.night);

    const st = this.st;
    const sess = this.session;
    this.input.read(dt, st.speed, this.vin);
    if (this.debugAutopilot) {
      Object.assign(this.vin, this.debugAutopilot({ x: st.x, z: st.z, heading: st.heading, speed: st.speed, s: st.loc.s, lateral: st.loc.lateral }, this.track));
    }
    const inp = this.vin;
    const frozen = this.paused || this.loading;

    if (!frozen) {
      if (sess.phase === 'countdown') {
        // Held on the grid; the throttle revs against launch control (holds ~62 % of redline).
        st.vx = 0;
        st.vz = 0;
        st.yawRate = 0;
        const target = spec.idleRpm + inp.throttle * (spec.redlineRpm * 0.62 - spec.idleRpm);
        st.rpm += (target - st.rpm) * Math.min(1, dt * 8);
        st.steerAngle = inp.steer * 0.5;
        sess.update(dt, this.sessionInput(), inp.throttle);
        if (sess.launchPending) {
          sess.launchPending = false;
          if (inp.throttle > 0.5) {
            this.runStart = this.clock; // launched on the lights
            st.launchGain = 1.12;
            st.launchTimer = 1.3;
            sess.announce('launch', 'Launch control', 'Perfect getaway');
          }
        }
      } else {
        // 0–100 / 0–200 run from the first press of the throttle (reaction time is reported apart)
        if (this.runStart === null && this.t100 === null && inp.throttle > 0.5 && st.speed < 1) this.runStart = this.clock;
        stepVehicle(st, inp, spec, this.track, { assist: this.mode, manual: this.manual, powerScale: POWER_SCALE[this.mode] }, dt, this.events);
        sess.noteThrottle(inp.throttle);
        sess.update(dt, this.sessionInput(), inp.throttle);
        if (this.events.shift && this.audioOn && this.audioStarted) engineAudio.triggerGearShift(this.events.shift, st.rpm);
        this.impactCooldown = Math.max(0, this.impactCooldown - dt);
        if (this.events.impact > 2.5) {
          this.shake = Math.min(1, this.shake + this.events.impact * 0.06);
          this.susp.rollV += Math.sign(st.loc.lateral || 1) * Math.min(0.5, this.events.impact * 0.03);
          this.susp.heaveV += Math.min(0.25, this.events.impact * 0.012);
          if (this.audioOn && this.impactCooldown <= 0) {
            driveSfx.impact(this.events.impact);
            this.impactCooldown = 0.25;
          }
        }
      }
      for (const cue of sess.cues) {
        if (!this.audioOn) continue;
        if (cue === 'light') driveSfx.beep('light');
        else if (cue === 'go') driveSfx.beep('go');
        else if (cue === 'best') driveSfx.chime('best');
        else if (cue === 'lap') driveSfx.chime('lap');
        else if (cue === 'invalid') driveSfx.chime('invalid');
      }
      sess.cues.length = 0;
    }

    // ---- telemetry bookkeeping ----
    const kmh = st.speed * 3.6;
    if (!frozen) {
      this.peakKmh = Math.max(this.peakKmh, kmh);
      if (this.runStart !== null) {
        if (this.t100 === null && kmh >= 100) this.t100 = this.clock - this.runStart;
        if (this.t200 === null && kmh >= 200) this.t200 = this.clock - this.runStart;
      }
      if (inp.brake > 0.1 && kmh > 25 && st.gear > 0) this.brakeTemp = Math.min(860, this.brakeTemp + dt * (115 + kmh * 0.95) * inp.brake);
      else this.brakeTemp = Math.max(145, this.brakeTemp - dt * (28 + kmh * 0.16));
    }

    // ---- car body: spring-damper suspension over planted wheels ----
    // Roll / pitch follow the felt accelerations through under-damped springs, so the body leans
    // into a corner, settles with a hint of overshoot, squats and dives – plus aero squat, road
    // texture, kerb rumble and grass bumps on the heave.
    const hyper = this.car.id === 'valkyrie' || this.car.id === 'valhalla';
    const soft = this.mode === 'GT' ? 1.2 : this.mode === 'SPORT' ? 1 : this.mode === 'SPORT+' ? 0.85 : 0.7;
    const rollTarget = frozen ? 0 : THREE.MathUtils.clamp(st.latG * (hyper ? 0.011 : 0.024) * soft, -0.07, 0.07);
    const pitchTarget = frozen ? 0 : THREE.MathUtils.clamp(st.longG * (hyper ? 0.009 : 0.016) * soft, -0.05, 0.035);
    this.bumpDist += frozen ? 0 : st.speed * dt;
    const b = this.bumpDist;
    let bump = 0;
    if (st.surface === 'kerb') bump = Math.sin(b * 4.19) * 0.009 * Math.min(1, st.speed / 10);
    else if (st.surface === 'grass') bump = (Math.sin(b * 3.1) * 0.5 + Math.sin(b * 7.7) * 0.3 + Math.sin(b * 13.3) * 0.2) * 0.017 * Math.min(1, st.speed / 8);
    else bump = (Math.sin(b * 2.3) * 0.6 + Math.sin(b * 5.9) * 0.4) * 0.0011 * Math.min(1, st.speed / 40);
    const aeroSquat = Math.min(1, (kmh / this.car.aero.downforceRefKmh) ** 2) * (hyper ? 0.024 : 0.008);
    const heaveTarget = frozen ? 0 : bump - aeroSquat;
    const wBody = Math.PI * 2 * (hyper ? 2.3 : 1.6);
    const zeta = hyper ? 0.5 : 0.42;
    const P = this.susp;
    const hs = Math.min(dt, 1 / 30);
    P.rollV += (wBody * wBody * (rollTarget - P.roll) - 2 * zeta * wBody * P.rollV) * hs;
    P.roll += P.rollV * hs;
    P.pitchV += (wBody * wBody * (pitchTarget - P.pitch) - 2 * zeta * wBody * P.pitchV) * hs;
    P.pitch += P.pitchV * hs;
    P.heaveV += (wBody * wBody * (heaveTarget - P.heave) - 2 * zeta * wBody * P.heaveV) * hs;
    P.heave += P.heaveV * hs;
    car3d.setActiveAero(kmh);
    car3d.setBrakeThermal(THREE.MathUtils.clamp((this.brakeTemp - 260) / 360, 0, 2));
    car3d.setDriveDynamics(P.pitch, P.roll, st.gear > 0 ? inp.brake : 0, st.rpm / spec.redlineRpm, P.heave);
    car3d.setSteer(st.steerAngle);
    car3d.update(dt);

    // ---- world (floating origin), sun & reflections ----
    world.setCarPose(st.x, st.z, st.heading);
    world.setStartLights(sess.phase === 'countdown' ? sess.lightsOn : 0);
    this.studio.setWorldYaw(st.heading, world.sunDirScene);
    this.shadowAcc += dt;
    if (this.shadowAcc > 0.06) {
      this.shadowAcc = 0;
      this.studio.invalidateShadow();
    }

    // ---- tyre smoke, dust and rubber ----
    const fx = this.fx;
    if (fx && !frozen) {
      const bp = car3d.blueprint;
      const c = Math.cos(st.heading);
      const s = Math.sin(st.heading);
      const toTrack = (lx: number, lz: number, out: THREE.Vector3) => out.set(st.x + lx * c + lz * s, 0, st.z - lx * s + lz * c);
      const slideFx = st.surface !== 'grass' ? st.sliding : 0;
      const dust = st.surface === 'grass' ? Math.min(1, st.speed / 18) : 0;
      this.smokeAcc += dt * (slideFx > 0.25 ? slideFx * 46 : 0) + dt * dust * 30;
      for (let w = 0; w < 2; w++) {
        const lx = (w === 0 ? -1 : 1) * bp.trackRearHalf;
        toTrack(lx, bp.zRearAxle, this.tmpV);
        fx.skid(w, this.tmpV.x, this.tmpV.z, slideFx > 0.3 ? slideFx : 0);
      }
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        const w = Math.random() < 0.5 ? -1 : 1;
        toTrack(w * bp.trackRearHalf, bp.zRearAxle + 0.2, this.tmpV);
        fx.emit(this.tmpV.x, 0.28, this.tmpV.z, st.vx, st.vz, dust > 0 && slideFx < 0.25 ? dust : Math.max(0.35, slideFx), dust > 0 && slideFx < 0.25 ? 1 : 0);
      }
      const size = this.studio.renderer.getDrawingBufferSize(this.bufferSize);
      const scale = (size.y * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
      fx.update(dt, scale);
    }

    // ---- best-lap ghost ----
    let ghostVisible = false;
    if (this.ghostEnabled && sess.best) {
      const t = sess.ghostTime();
      if (t !== null && samplePose(sess.best.ghost, t, this.ghostPose)) {
        const ghost = this.ensureGhost();
        if (ghost) {
          ghost.setPose(this.ghostPose.x, this.ghostPose.z, this.ghostPose.heading);
          const d = Math.hypot(this.ghostPose.x - st.x, this.ghostPose.z - st.z);
          ghost.setFade(THREE.MathUtils.clamp((d - 2.5) / 7, 0, 1) * 0.85);
          ghostVisible = true;
        }
      }
    }
    if (!ghostVisible) this.ghost?.setFade(0);

    // ---- audio ----
    if (this.audioOn && this.audioStarted) {
      engineAudio.setDriveState(st.rpm, frozen ? 0.08 : Math.max(0.12, inp.throttle), frozen ? 0 : kmh, st.boosting && !frozen);
    }
    driveSfx.update(dt, frozen ? 0 : st.sliding, st.surface, frozen ? 0 : kmh, !this.audioOn || frozen);

    // ---- camera ----
    this.updateCamera(dt, frozen);

    // ---- HUD ----
    if (this.clock - this.lastHud > 0.05) {
      this.lastHud = this.clock;
      this.publish(false);
    }
  }

  private sessionInput() {
    const st = this.st;
    return {
      x: st.x,
      z: st.z,
      heading: st.heading,
      s: st.loc.s,
      lateral: st.loc.lateral,
      speed: st.speed,
      alongTrack: st.vx * st.loc.tx + st.vz * st.loc.tz,
      slipAngle: st.slipAngle,
      surface: st.surface,
      impact: st.impact,
      carHalfWidth: this.spec ? this.spec.halfWidth : 1,
    };
  }

  private updateCamera(dt: number, frozen: boolean) {
    const car3d = this.car3d!;
    const spec = this.spec!;
    const st = this.st;
    const bp = car3d.blueprint;
    const cam = this.camera;
    const speedNorm = Math.min(1, st.speed / spec.topSpeedMps);
    const t = this.clock;

    // shake: kerbs, grass and impacts
    const surfaceShake = frozen ? 0 : st.surface === 'grass' ? 0.5 * Math.min(1, st.speed / 25) : st.surface === 'kerb' ? 0.22 : 0;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const amp = (surfaceShake * 0.018 + this.shake * 0.07) * (this.cameraMode === 'chase' ? 1 : 0.45);
    const sx = (Math.sin(t * 61.3) + Math.sin(t * 37.1) * 0.6) * amp;
    const sy = (Math.sin(t * 53.7) + Math.sin(t * 29.3) * 0.5) * amp;

    if (this.cameraMode === 'chase') {
      // Forza / GT-style chase cam: the camera is not bolted to the car. Its heading chases the
      // car's heading (blended toward the direction of travel at speed) through a critically
      // damped spring, so turning visibly rotates the car in the frame, slides show its flank, and
      // nothing snaps. Distance and FOV ride their own springs (falls back under acceleration).
      const wrapA = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
      const velHeading = Math.atan2(-st.vx, -st.vz);
      const follow = st.forwardSpeed > 2 ? THREE.MathUtils.clamp((st.speed - 2) / 14, 0, 1) * 0.6 : 0;
      const targetHeading = st.heading + wrapA(velHeading - st.heading) * follow;
      const distTarget = 5.2 + bp.L * 0.22 + speedNorm * 1.5 + THREE.MathUtils.clamp(st.longG, -1.5, 1.5) * 0.35;
      const fovTarget = 52 + speedNorm * 15 + (st.boosting ? 4 : 0);
      if (this.camSnap) {
        this.camHeading = targetHeading;
        this.camHeadingV = 0;
        this.camDist = distTarget;
        this.camDistV = 0;
        this.camFov = fovTarget;
      }
      const hc = Math.min(dt, 1 / 30);
      const wH = 5.2;
      this.camHeadingV += (wH * wH * wrapA(targetHeading - this.camHeading) - 2 * wH * this.camHeadingV) * hc;
      this.camHeading = wrapA(this.camHeading + this.camHeadingV * hc);
      const wD = 3.2;
      this.camDistV += (wD * wD * (distTarget - this.camDist) - 2 * wD * this.camDistV) * hc;
      this.camDist += this.camDistV * hc;
      this.camFov += (fovTarget - this.camFov) * Math.min(1, dt * 2.5);
      // camera bearing around the car, in car-local space
      const phi = THREE.MathUtils.clamp(wrapA(this.camHeading - st.heading), -1.1, 1.1);
      const height = 1.25 + bp.H * 0.62 - speedNorm * 0.12;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      cam.position.set(sp * this.camDist + sx, height + sy, cp * this.camDist);
      // aim ahead along the camera's own bearing: the car stays framed while it rotates under it
      this.lookV.set(-sp * 6.5, bp.H * 0.18, -cp * 6.5);
      cam.lookAt(this.lookV);
      cam.fov = this.camFov;
      cam.near = 0.15;
      // Lens shift (not extra pitch): lifts the car into the upper-middle of the frame, clear of
      // the instrument cluster, with the horizon at ~38 % like a broadcast chase camera.
      cam.setViewOffset(1, 1, 0, 0.12, 1, 1);
    } else if (this.cameraMode === 'cockpit') {
      const native = bp.nativeCockpit?.driver;
      const ex = native ? native.pos[0] : bp.driverX;
      const ey = native ? native.pos[1] : bp.eyeY + 0.03;
      const ez = native ? native.pos[2] : bp.eyeZ + 0.05;
      // Driver's head on springs: pushed outward in corners, back under power, forward under
      // braking, and glancing into the turn like a real driver looks for the apex.
      const H = this.head;
      const hh = Math.min(dt, 1 / 30);
      const wHd = 7;
      const xT = frozen ? 0 : THREE.MathUtils.clamp(-st.latG * 0.018, -0.04, 0.04);
      const zT = frozen ? 0 : THREE.MathUtils.clamp(st.longG * 0.014, -0.035, 0.03);
      const yawT = frozen ? 0 : THREE.MathUtils.clamp(st.yawRate * 0.14 + this.vin.steer * 0.04, -0.16, 0.16);
      if (this.camSnap) {
        H.x = xT;
        H.z = zT;
        H.yaw = yawT;
        H.xV = H.zV = H.yawV = 0;
      }
      H.xV += (wHd * wHd * (xT - H.x) - 2 * 0.7 * wHd * H.xV) * hh;
      H.x += H.xV * hh;
      H.zV += (wHd * wHd * (zT - H.z) - 2 * 0.7 * wHd * H.zV) * hh;
      H.z += H.zV * hh;
      H.yawV += (25 * (yawT - H.yaw) - 2 * 0.8 * 5 * H.yawV) * hh;
      H.yaw += H.yawV * hh;
      cam.position.set(ex + H.x + sx * 0.3, ey + sy * 0.3 + this.susp.heave * 0.6, ez + H.z);
      this.lookV.set(ex + H.x - Math.sin(H.yaw) * 20, ey - 0.16, ez - Math.cos(H.yaw) * 20);
      cam.lookAt(this.lookV);
      cam.fov = 64 + speedNorm * 10;
      cam.near = 0.03;
      cam.setViewOffset(1, 1, 0, 0.07, 1, 1); // a little more road above the dash
    } else {
      // Bonnet cam: high on the scuttle so the nose frames the bottom edge without hiding the road.
      const by = Math.max(bp.windscreenBottomY + 0.34, 0.95);
      cam.position.set(sx * 0.5, by + sy * 0.5, bp.windscreenBottomZ - 0.2);
      this.lookV.set(this.vin.steer * 1.2, by - 0.55, -26);
      cam.lookAt(this.lookV);
      cam.fov = 58 + speedNorm * 14;
      cam.near = 0.05;
      cam.setViewOffset(1, 1, 0, 0.1, 1, 1);
    }
    cam.updateProjectionMatrix();
    this.camSnap = false;
  }

  private composeHud(): DriveHudState {
    const st = this.st;
    const car = this.car;
    const kmh = st.speed * 3.6;
    const sess = this.session;
    let ghostPose: { x: number; z: number } | null = null;
    if (this.ghost?.group.visible) ghostPose = { x: this.ghostPose.x, z: this.ghostPose.z };
    const df = car ? Math.round(car.aero.maxDownforceKg * Math.min(1, (kmh / car.aero.downforceRefKmh) ** 2)) : 0;
    return {
      loading: this.loading,
      paused: this.paused,
      telemetry: {
        speedKmh: kmh,
        rpm: st.rpm,
        gear: st.gear,
        throttle: this.vin.throttle,
        brake: this.vin.brake,
        steer: this.vin.steer,
        latG: st.latG,
        longG: st.longG,
        downforceKg: df,
        brakeTempC: Math.round(this.brakeTemp),
        boostPct: st.boostPct,
        boosting: st.boosting,
        zeroTo100Sec: this.t100,
        zeroTo200Sec: this.t200,
        peakSpeedKmh: this.peakKmh,
        surface: st.surface,
        sliding: st.sliding,
        assistActive: st.assistActive,
        handbrake: this.vin.handbrake,
      },
      session: sess.snapshot(),
      toasts: sess.toasts.map((t) => ({ ...t })),
      pose: { x: st.x, z: st.z, heading: st.heading },
      ghostPose,
      camera: this.cameraMode,
      mode: this.mode,
      manual: this.manual,
      ghostEnabled: this.ghostEnabled,
      audioOn: this.audioOn,
      usingGamepad: this.input.usingGamepad,
      hasBest: Boolean(sess.best),
    };
  }

  private publish(force: boolean) {
    if (!force && !this.active) return;
    this.hud.set(this.composeHud());
  }
}

export { emptyTelemetry };
