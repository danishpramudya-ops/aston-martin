/**
 * Proving Ground sound effects layered on top of the engine synthesizer: tyre squeal, kerb / grass
 * rumble, wind rush, barrier impacts, start-light beeps and lap chimes. Shares the engine's
 * AudioContext; one looping noise source feeds every filtered layer.
 */
import { engineAudio } from './engineAudio';

type SurfaceKind = 'road' | 'kerb' | 'grass';

class DriveSfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private squealGain: GainNode | null = null;
  private squealBand: BiquadFilterNode | null = null;
  private squealBand2: BiquadFilterNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private running = false;
  private kerbPhase = 0;

  start() {
    if (this.running) return;
    const ctx = engineAudio.context;
    if (!ctx) return;
    this.ctx = ctx;
    const now = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, now);
    this.out.gain.exponentialRampToValueAtTime(1, now + 0.4);
    this.out.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;

    // Squeal: two narrow resonant bands give the tonal "screech" of a sliding tyre.
    this.squealBand = ctx.createBiquadFilter();
    this.squealBand.type = 'bandpass';
    this.squealBand.frequency.value = 1150;
    this.squealBand.Q.value = 18;
    this.squealBand2 = ctx.createBiquadFilter();
    this.squealBand2.type = 'bandpass';
    this.squealBand2.frequency.value = 1720;
    this.squealBand2.Q.value = 14;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.noise.connect(this.squealBand);
    this.noise.connect(this.squealBand2);
    this.squealBand.connect(this.squealGain);
    this.squealBand2.connect(this.squealGain);
    this.squealGain.connect(this.out);

    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 160;
    this.rumbleFilter.Q.value = 2;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.noise.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.out);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 700;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.out);

    this.noise.start();
    this.running = true;
  }

  stop() {
    if (!this.running || !this.ctx || !this.out) return;
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0.0001, now, 0.08);
    const noise = this.noise;
    const out = this.out;
    this.running = false;
    this.noise = null;
    window.setTimeout(() => {
      try {
        noise?.stop();
        noise?.disconnect();
        out.disconnect();
      } catch {
        // already stopped
      }
    }, 400);
  }

  /** Called every frame while driving. */
  update(dt: number, sliding: number, surface: SurfaceKind, speedKmh: number, muted = false) {
    if (!this.running || !this.ctx || !this.squealGain || !this.rumbleGain || !this.windGain) return;
    const now = this.ctx.currentTime;
    const m = muted ? 0 : 1;
    const speedN = Math.min(1, speedKmh / 300);
    const squeal = surface === 'road' || surface === 'kerb' ? Math.max(0, sliding - 0.18) : 0;
    this.squealGain.gain.setTargetAtTime(Math.min(0.14, squeal * 0.16) * m * (speedKmh > 8 ? 1 : 0), now, 0.05);
    this.squealBand?.frequency.setTargetAtTime(980 + squeal * 520 + speedN * 160, now, 0.08);
    this.squealBand2?.frequency.setTargetAtTime(1600 + squeal * 380, now, 0.08);
    this.kerbPhase += dt * (6 + speedKmh * 0.25);
    const kerbPulse = 0.55 + 0.45 * Math.sign(Math.sin(this.kerbPhase));
    const rumble =
      surface === 'grass' ? Math.min(1, speedKmh / 90) * 0.32 : surface === 'kerb' ? Math.min(1, speedKmh / 60) * 0.22 * kerbPulse : 0;
    this.rumbleGain.gain.setTargetAtTime(rumble * m, now, 0.03);
    this.rumbleFilter?.frequency.setTargetAtTime(surface === 'grass' ? 220 : 120 + speedKmh * 0.6, now, 0.05);
    this.windGain.gain.setTargetAtTime(speedN * speedN * 0.07 * m, now, 0.2);
    this.windFilter?.frequency.setTargetAtTime(600 + speedN * 1400, now, 0.2);
  }

  impact(strength: number) {
    const ctx = engineAudio.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const amt = Math.min(1, strength / 14);
    const dur = 0.35;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ch.length * 0.12));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + amt * 1800;
    const g = ctx.createGain();
    g.gain.value = 0.18 + amt * 0.45;
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    // body thump
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    og.gain.setValueAtTime(0.25 + amt * 0.35, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  beep(kind: 'light' | 'go') {
    const ctx = engineAudio.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = kind === 'go' ? 1320 : 660;
    const len = kind === 'go' ? 0.42 : 0.16;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    g.gain.setValueAtTime(0.06, now + len - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + len + 0.02);
  }

  chime(kind: 'lap' | 'best' | 'invalid') {
    const ctx = engineAudio.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = kind === 'best' ? [784, 988, 1319] : kind === 'lap' ? [880, 1175] : [330, 247];
    notes.forEach((f, i) => {
      const t = now + i * 0.11;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = kind === 'invalid' ? 'sawtooth' : 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === 'invalid' ? 0.035 : 0.07, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }
}

export const driveSfx = new DriveSfx();
