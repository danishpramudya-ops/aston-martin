/**
 * Time-trial race control: start lights, lap & sector timing, live delta to the best lap, track
 * limits, wrong-way detection, a drift score, and the best-lap ghost (recorded here, persisted per
 * car in localStorage, replayed by the renderer). Pure logic – no three.js, no React.
 */
import { lapDelta, type TrackData } from './trackLayout';
import type { SurfaceKind } from './vehiclePhysics';

export type SessionPhase = 'countdown' | 'racing';
export type SectorColour = 'purple' | 'green' | 'yellow' | null;

export interface GhostTrace {
  dt: number;
  xs: number[];
  zs: number[];
  hs: number[];
}

export interface BestLap {
  time: number;
  sectors: [number, number, number];
  /** Lap time at every 10 m of the lap (for the live delta). */
  timeAt: number[];
  ghost: GhostTrace;
  date: number;
}

export type ToastKind = 'best' | 'lap' | 'invalid' | 'wrong' | 'launch' | 'drift' | 'info';

export interface RaceToast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  ttl: number;
}

export interface SessionSnapshot {
  phase: SessionPhase;
  lightsOn: number;
  lightsOut: boolean;
  lap: number;
  lapActive: boolean;
  lapTime: number;
  lastLap: number | null;
  lastLapValid: boolean;
  bestLap: number | null;
  sessionBest: number | null;
  theoreticalBest: number | null;
  delta: number | null;
  sectors: [number | null, number | null, number | null];
  sectorColours: [SectorColour, SectorColour, SectorColour];
  lapValid: boolean;
  wrongWay: boolean;
  driftCombo: number;
  driftTotal: number;
  progress: number;
  lapsCompleted: number;
  /** Seconds since the lights went out (null on the grid). */
  sinceGo: number | null;
}

export interface SessionCarInput {
  x: number;
  z: number;
  heading: number;
  s: number;
  lateral: number;
  speed: number;
  /** Velocity component along the track tangent (m/s); negative when driving the wrong way. */
  alongTrack: number;
  slipAngle: number;
  surface: SurfaceKind;
  impact: number;
  carHalfWidth: number;
}

const GHOST_DT = 0.1;
const STORAGE_PREFIX = 'aston-pg-best:v1:';

/**
 * Track-limits rule: is this position bad enough to void the lap?
 *
 * Racing rules vary: F1 voids a lap once all four wheels cross the white line, while most arcade
 * racers only care when the car leaves the kerbs entirely. `lateral` is the car centre's offset
 * from the centre line (m), `halfWidth` the white-line offset, `kerbWidth` the kerb strip outside
 * it, `carHalfWidth` half the car's track width.
 */
export function breachesTrackLimits(lateral: number, halfWidth: number, kerbWidth: number, carHalfWidth: number): boolean {
  // Default: the lap is voided once the car's inner edge is past the middle of the kerb –
  // using every bit of kerb is fine, putting all four wheels on the grass is not.
  const innerEdge = Math.abs(lateral) - carHalfWidth;
  return innerEdge > halfWidth + kerbWidth * 0.5;
}

export class RaceSession {
  readonly track: TrackData;
  private carId: string;
  phase: SessionPhase = 'countdown';
  private clock = 0;
  private countdownStart = 0;
  private lightsOutAt = 0;
  lightsOn = 0;
  private lightsOut = false;

  lap = 0;
  private lapActive = false;
  private lapStart = 0;
  private lapDistance = 0;
  private prevS = 0;
  private lapValid = true;
  private sectorIdx = 0;
  private sectors: [number | null, number | null, number | null] = [null, null, null];
  private sectorColours: [SectorColour, SectorColour, SectorColour] = [null, null, null];
  private lastLap: number | null = null;
  private lastLapValid = true;
  private sessionBest: number | null = null;
  private sessionBestSectors: [number, number, number] = [Infinity, Infinity, Infinity];
  private allTimeSectors: [number, number, number] = [Infinity, Infinity, Infinity];
  best: BestLap | null = null;
  private lapsCompleted = 0;

  private recording: GhostTrace = { dt: GHOST_DT, xs: [], zs: [], hs: [] };
  private recordAcc = 0;
  private timeAt: number[] = [];

  private wrongWayTimer = 0;
  private wrongWay = false;
  private driftCombo = 0;
  private driftHold = 0;
  private driftTotal = 0;

  private toastSeq = 0;
  toasts: RaceToast[] = [];
  /** One-shot cues for audio (consumed by the caller each frame). */
  cues: ('light' | 'go' | 'lap' | 'best' | 'invalid')[] = [];

  /** Launch evaluation result, consumed by the game loop at lights-out. */
  launchPending = false;
  private reactionStart: number | null = null;

  constructor(track: TrackData, carId: string) {
    this.track = track;
    this.carId = carId;
    this.best = loadBest(carId);
    if (this.best) this.allTimeSectors = [...this.best.sectors];
  }

  setCar(carId: string) {
    this.carId = carId;
    this.best = loadBest(carId);
    this.allTimeSectors = this.best ? [...this.best.sectors] : [Infinity, Infinity, Infinity];
    this.sessionBest = null;
    this.sessionBestSectors = [Infinity, Infinity, Infinity];
    this.driftTotal = 0;
  }

  /** Back to the grid with the start lights armed. */
  restart(startS: number) {
    this.phase = 'countdown';
    this.countdownStart = this.clock;
    this.lightsOutAt = this.clock + 3.9 + 0.5 + Math.random() * 1.1;
    this.lightsOn = 0;
    this.lightsOut = false;
    this.lap = 0;
    this.lapActive = false;
    this.lapDistance = lapDelta(this.track, 0, startS);
    this.prevS = startS;
    this.lapValid = true;
    this.sectorIdx = 0;
    this.sectors = [null, null, null];
    this.sectorColours = [null, null, null];
    this.lastLap = null;
    this.recording = { dt: GHOST_DT, xs: [], zs: [], hs: [] };
    this.timeAt = [];
    this.wrongWay = false;
    this.wrongWayTimer = 0;
    this.driftCombo = 0;
    this.driftHold = 0;
    this.launchPending = false;
    this.reactionStart = null;
    this.toasts = [];
  }

  /** Respawn on the racing line: keeps the lap running but voids it. */
  noteRespawn(s: number) {
    this.prevS = s;
    if (this.lapActive && this.lapValid) {
      this.lapValid = false;
      this.toast('invalid', 'Lap invalidated', 'Car recovered to track');
    }
    this.driftCombo = 0;
  }

  get isRacing() {
    return this.phase === 'racing';
  }

  /** Lap time (s) the ghost should be shown at, or null when there is nothing to show. */
  ghostTime(): number | null {
    if (!this.best || !this.lapActive) return null;
    return this.clock - this.lapStart;
  }

  noteThrottle(throttle: number) {
    if (this.reactionStart !== null && throttle > 0.5) {
      const r = this.clock - this.reactionStart;
      this.reactionStart = null;
      this.toast('launch', `Reaction ${r.toFixed(3)} s`, r < 0.25 ? 'Lightning start' : r < 0.45 ? 'Good getaway' : 'Lights are out — go!');
    }
  }

  update(dt: number, car: SessionCarInput, throttle: number) {
    this.clock += dt;
    for (const t of this.toasts) t.ttl -= dt;
    this.toasts = this.toasts.filter((t) => t.ttl > 0);

    if (this.phase === 'countdown') {
      const t = this.clock - this.countdownStart;
      const lit = Math.min(5, Math.max(0, Math.floor((t - 0.7) / 0.8) + 1));
      if (lit > this.lightsOn) this.cues.push('light');
      this.lightsOn = lit;
      if (this.clock >= this.lightsOutAt) {
        this.phase = 'racing';
        this.lightsOut = true;
        this.lightsOn = 0;
        this.cues.push('go');
        this.launchPending = true;
        if (throttle < 0.5) this.reactionStart = this.clock;
      }
      this.prevS = car.s;
      return;
    }

    // ---- lap progress ----
    const ds = lapDelta(this.track, this.prevS, car.s);
    this.prevS = car.s;
    this.lapDistance += ds;
    const L = this.track.length;

    if (!this.lapActive) {
      if (this.lapDistance >= 0 && this.lapDistance < 60) this.beginLap(this.lapDistance, car);
    } else {
      const lapT = this.clock - this.lapStart;
      // sectors
      if (this.sectorIdx < 2 && this.lapDistance >= this.track.sectorS[this.sectorIdx]) {
        const prev = this.sectors.slice(0, this.sectorIdx).reduce<number>((a, b) => a + (b ?? 0), 0);
        this.closeSector(this.sectorIdx, lapT - prev);
        this.sectorIdx++;
      }
      // delta to best (every 10 m table)
      const bucket = Math.floor(this.lapDistance / 10);
      while (this.timeAt.length <= bucket && this.timeAt.length * 10 <= L) this.timeAt.push(lapT);
      // ghost recording
      this.recordAcc += dt;
      while (this.recordAcc >= GHOST_DT) {
        this.recordAcc -= GHOST_DT;
        this.recording.xs.push(car.x);
        this.recording.zs.push(car.z);
        this.recording.hs.push(car.heading);
      }
      if (this.lapValid && breachesTrackLimits(car.lateral, this.track.halfWidth, this.track.kerbWidth, car.carHalfWidth)) {
        this.lapValid = false;
        this.cues.push('invalid');
        this.toast('invalid', 'Track limits', 'Lap time will not count');
      }
      if (this.lapDistance >= L) this.completeLap(lapT, car);
    }

    // ---- wrong way ----
    if (car.alongTrack < -2.5) this.wrongWayTimer += dt;
    else this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dt * 2);
    const ww = this.wrongWayTimer > 1.2;
    if (ww && !this.wrongWay) this.toast('wrong', 'Wrong way', 'Turn around');
    this.wrongWay = ww;

    // ---- drift score ----
    const slipDeg = (Math.abs(car.slipAngle) * 180) / Math.PI;
    if (car.impact > 3 && this.driftCombo > 0) {
      this.driftCombo = 0;
      this.driftHold = 0;
      this.toast('drift', 'Drift lost', 'Barrier contact');
    } else if (slipDeg > 9 && car.speed > 11 && car.surface !== 'grass' && car.alongTrack > 0) {
      this.driftCombo += slipDeg * car.speed * dt * 0.12;
      this.driftHold = 0.7;
    } else if (this.driftCombo > 0) {
      this.driftHold -= dt;
      if (this.driftHold <= 0) {
        const pts = Math.round(this.driftCombo);
        this.driftTotal += pts;
        this.driftCombo = 0;
        if (pts >= 40) this.toast('drift', `Drift +${pts.toLocaleString()}`, `Session ${this.driftTotal.toLocaleString()} pts`);
      }
    }
  }

  private beginLap(offset: number, car: SessionCarInput) {
    this.lapActive = true;
    this.lap += 1;
    this.lapStart = this.clock;
    this.lapDistance = offset;
    this.lapValid = true;
    this.sectorIdx = 0;
    this.sectors = [null, null, null];
    this.sectorColours = [null, null, null];
    // Sample 0 is the pose on the line: ghost sample k must mean lap time k·dt, or the replay runs
    // one sample (~5 m at speed) ahead of where the lap really was.
    this.recording = { dt: GHOST_DT, xs: [car.x], zs: [car.z], hs: [car.heading] };
    this.recordAcc = 0;
    this.timeAt = [];
  }

  private closeSector(i: number, t: number) {
    this.sectors[i] = t;
    let colour: SectorColour = 'yellow';
    if (this.lapValid && t < this.allTimeSectors[i]) {
      colour = 'purple';
      this.allTimeSectors[i] = t;
    } else if (this.lapValid && t < this.sessionBestSectors[i]) {
      colour = 'green';
    }
    if (this.lapValid) this.sessionBestSectors[i] = Math.min(this.sessionBestSectors[i], t);
    this.sectorColours[i] = colour;
  }

  private completeLap(lapT: number, car: SessionCarInput) {
    const s3 = lapT - ((this.sectors[0] ?? 0) + (this.sectors[1] ?? 0));
    this.closeSector(2, s3);
    this.lapsCompleted++;
    this.lastLap = lapT;
    this.lastLapValid = this.lapValid;
    const valid = this.lapValid;
    if (valid && (this.sessionBest === null || lapT < this.sessionBest)) this.sessionBest = lapT;
    const isBest = valid && (!this.best || lapT < this.best.time);
    if (isBest) {
      this.best = {
        time: lapT,
        sectors: [this.sectors[0] ?? 0, this.sectors[1] ?? 0, s3],
        timeAt: this.timeAt.slice(),
        ghost: this.recording,
        date: Date.now(),
      };
      saveBest(this.carId, this.best);
      this.cues.push('best');
      this.toast('best', `New best lap ${formatLapTime(lapT)}`, 'Ghost saved — race yourself');
    } else {
      this.cues.push('lap');
      const ref = this.best ? `${lapT - this.best.time >= 0 ? '+' : '−'}${Math.abs(lapT - this.best.time).toFixed(3)} to best` : undefined;
      this.toast(valid ? 'lap' : 'invalid', `Lap ${this.lap} · ${formatLapTime(lapT)}`, valid ? ref : 'Invalid — track limits');
    }
    const carry = this.lapDistance - this.track.length;
    this.beginLap(carry, car);
  }

  /** Race-control message from the game loop (launch result, etc.). */
  announce(kind: ToastKind, title: string, detail?: string) {
    this.toast(kind, title, detail);
  }

  private toast(kind: ToastKind, title: string, detail?: string) {
    this.toasts.push({ id: ++this.toastSeq, kind, title, detail, ttl: kind === 'best' ? 4.2 : 2.8 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  snapshot(): SessionSnapshot {
    const lapT = this.lapActive ? this.clock - this.lapStart : 0;
    let delta: number | null = null;
    if (this.lapActive && this.best && this.lapDistance > 30) {
      const f = this.lapDistance / 10;
      const i = Math.floor(f);
      const a = this.best.timeAt[i];
      const b = this.best.timeAt[i + 1] ?? a;
      if (a !== undefined) delta = lapT - (a + (b - a) * (f - i));
    }
    const sec = this.best?.sectors;
    const theoretical =
      Number.isFinite(this.allTimeSectors[0] + this.allTimeSectors[1] + this.allTimeSectors[2])
        ? this.allTimeSectors[0] + this.allTimeSectors[1] + this.allTimeSectors[2]
        : sec
          ? sec[0] + sec[1] + sec[2]
          : null;
    return {
      phase: this.phase,
      lightsOn: this.lightsOn,
      lightsOut: this.lightsOut,
      lap: this.lap,
      lapActive: this.lapActive,
      lapTime: lapT,
      lastLap: this.lastLap,
      lastLapValid: this.lastLapValid,
      bestLap: this.best?.time ?? null,
      sessionBest: this.sessionBest,
      theoreticalBest: theoretical,
      delta,
      sectors: [...this.sectors] as [number | null, number | null, number | null],
      sectorColours: [...this.sectorColours] as [SectorColour, SectorColour, SectorColour],
      lapValid: this.lapValid,
      wrongWay: this.wrongWay,
      driftCombo: this.driftCombo,
      driftTotal: this.driftTotal,
      progress: Math.max(0, Math.min(1, this.lapDistance / this.track.length)),
      lapsCompleted: this.lapsCompleted,
      sinceGo: this.phase === 'racing' ? this.clock - this.lightsOutAt : null,
    };
  }

  clearBest() {
    this.best = null;
    this.allTimeSectors = [Infinity, Infinity, Infinity];
    try {
      localStorage.removeItem(STORAGE_PREFIX + this.carId);
    } catch {
      // storage unavailable (private mode) – nothing to clear
    }
  }
}

/** Ghost pose at lap time t (linear interpolation, heading unwrapped). */
export function samplePose(g: GhostTrace, t: number, out: { x: number; z: number; heading: number }): boolean {
  const n = g.xs.length;
  if (n < 2) return false;
  const f = t / g.dt;
  if (f < 0 || f >= n - 1) return false;
  const i = Math.floor(f);
  const u = f - i;
  out.x = g.xs[i] + (g.xs[i + 1] - g.xs[i]) * u;
  out.z = g.zs[i] + (g.zs[i + 1] - g.zs[i]) * u;
  const dh = Math.atan2(Math.sin(g.hs[i + 1] - g.hs[i]), Math.cos(g.hs[i + 1] - g.hs[i]));
  out.heading = g.hs[i] + dh * u;
  return true;
}

export function formatLapTime(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return '—:——.———';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function loadBest(carId: string): BestLap | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + carId);
    if (!raw) return null;
    const p = JSON.parse(raw) as {
      time: number;
      sectors: [number, number, number];
      timeAt: number[];
      ghost: { dt: number; xs: number[]; zs: number[]; hs: number[] };
      date: number;
    };
    if (!Number.isFinite(p.time) || !Array.isArray(p.timeAt) || !p.ghost || !Array.isArray(p.ghost.xs)) return null;
    return {
      time: p.time,
      sectors: p.sectors,
      timeAt: p.timeAt.map((v) => v / 1000),
      ghost: {
        dt: p.ghost.dt,
        xs: p.ghost.xs.map((v) => v / 100),
        zs: p.ghost.zs.map((v) => v / 100),
        hs: p.ghost.hs.map((v) => v / 1000),
      },
      date: p.date,
    };
  } catch {
    return null;
  }
}

function saveBest(carId: string, b: BestLap) {
  try {
    const packed = {
      time: b.time,
      sectors: b.sectors,
      timeAt: b.timeAt.map((v) => Math.round(v * 1000)),
      ghost: {
        dt: b.ghost.dt,
        xs: b.ghost.xs.map((v) => Math.round(v * 100)),
        zs: b.ghost.zs.map((v) => Math.round(v * 100)),
        hs: b.ghost.hs.map((v) => Math.round(v * 1000)),
      },
      date: b.date,
    };
    localStorage.setItem(STORAGE_PREFIX + carId, JSON.stringify(packed));
  } catch {
    // Quota or privacy mode: the best lap still lives for this session.
  }
}
