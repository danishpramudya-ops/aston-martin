import type { EngineTopology } from '../data/cars';

export type ExhaustValveMode = 'QUIET' | 'SPORT' | 'TRACK';

/**
 * Web Audio API Acoustic Engine Note & Cockpit Tactile Synthesizer.
 * Models Aston Martin firing-order harmonics (65°/60° V12 and 90° flat/cross-plane V8),
 * warm exhaust saturation, active exhaust bypass valves, gearshift ignition cuts,
 * turbocharger spool / axial-flux e-motor whine, and machined billet switch clicks.
 */
class AstonEngineSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private shaper: WaveShaperNode | null = null;
  private oscs: OscillatorNode[] = [];
  private oscGains: GainNode[] = [];
  private eMotorOsc: OscillatorNode | null = null;
  private eMotorGain: GainNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private subNoise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private isPlaying = false;
  private topology: EngineTopology = 'v12-na';
  private exhaustMode: ExhaustValveMode = 'SPORT';
  private currentRpm = 1100;
  private currentLoad = 0.25;
  private currentSpeedKmh = 0;
  /** Bumped by stop(): a cold start still cranking when the engine is switched off must not fire. */
  private startToken = 0;

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const k = Math.max(1, amount);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  public start(topology: EngineTopology, initialRpm = 1200) {
    this.ensureContext();
    if (!this.ctx) return;
    if (this.isPlaying) {
      this.setTopology(topology);
      this.setRpm(initialRpm);
      return;
    }

    this.topology = topology;
    this.currentRpm = initialRpm;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    this.masterGain.gain.exponentialRampToValueAtTime(0.2, this.ctx.currentTime + 0.28);

    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = this.makeSaturationCurve(this.exhaustMode === 'TRACK' ? 28 : 14);
    this.shaper.oversample = '2x';

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = this.exhaustMode === 'TRACK' ? 4.4 : 3.0;

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6.5;

    this.shaper.connect(this.filter);
    this.filter.connect(compressor);
    compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    const harmonicMultipliers = this.getHarmonicsFor(topology);
    const waveforms: OscillatorType[] =
      topology === 'v12-na'
        ? ['sawtooth', 'sawtooth', 'triangle', 'sawtooth', 'sine', 'triangle']
        : topology === 'v8-hybrid'
          ? ['sawtooth', 'square', 'sawtooth', 'triangle', 'sine', 'sine']
          : ['sawtooth', 'sawtooth', 'square', 'triangle', 'sine', 'sine'];

    this.oscs = [];
    this.oscGains = [];

    harmonicMultipliers.forEach((_, idx) => {
      if (!this.ctx || !this.shaper) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = waveforms[idx] || 'sawtooth';
      gain.gain.value = idx === 0 ? 0.24 : idx === 1 ? 0.34 : 0.14 / (idx * 0.68);
      osc.connect(gain);
      gain.connect(this.shaper);
      osc.start();
      this.oscs.push(osc);
      this.oscGains.push(gain);
    });

    // Hybrid axial-flux / KERS electric whine (Valkyrie & Valhalla)
    this.eMotorOsc = this.ctx.createOscillator();
    this.eMotorOsc.type = 'sine';
    this.eMotorGain = this.ctx.createGain();
    this.eMotorGain.gain.value = 0.0001;
    this.eMotorOsc.connect(this.eMotorGain);
    this.eMotorGain.connect(this.masterGain);
    this.eMotorOsc.start();

    // Twin-turbo spool whistle (Vanquish, DB12, Valhalla)
    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = 'triangle';
    const turboFilter = this.ctx.createBiquadFilter();
    turboFilter.type = 'bandpass';
    turboFilter.frequency.value = 2400;
    turboFilter.Q.value = 6;
    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.value = 0.0001;
    this.turboOsc.connect(turboFilter);
    turboFilter.connect(this.turboGain);
    this.turboGain.connect(this.masterGain);
    this.turboOsc.start();

    // Mechanical induction / exhaust air rush
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.subNoise = this.ctx.createBufferSource();
    this.subNoise.buffer = noiseBuffer;
    this.subNoise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 460;
    noiseFilter.Q.value = 1.1;

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.045;

    this.subNoise.connect(noiseFilter);
    noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.filter);
    this.subNoise.start();

    this.isPlaying = true;
    this.updateFrequencies();
  }

  private getHarmonicsFor(topology: EngineTopology): number[] {
    return topology === 'v12-na'
      ? [0.5, 1, 1.5, 2, 3, 4]
      : topology === 'v12-tt'
        ? [0.5, 1, 1.5, 2, 2.5, 3]
        : topology === 'v8-hybrid'
          ? [0.5, 1, 2, 3, 4.5, 6]
          : [0.5, 1, 1.5, 2, 3, 3.5];
  }

  public setTopology(topology: EngineTopology) {
    this.topology = topology;
    if (this.isPlaying) {
      this.updateFrequencies();
    }
  }

  public setExhaustValve(mode: ExhaustValveMode) {
    this.exhaustMode = mode;
    if (this.shaper) {
      this.shaper.curve = this.makeSaturationCurve(mode === 'TRACK' ? 32 : mode === 'SPORT' ? 18 : 7);
    }
    if (this.filter) {
      this.filter.Q.value = mode === 'TRACK' ? 4.8 : mode === 'SPORT' ? 3.2 : 1.8;
    }
    if (this.isPlaying) {
      this.updateFrequencies();
    }
  }

  public setRpm(rpm: number) {
    this.currentRpm = rpm;
    if (this.isPlaying) {
      this.updateFrequencies();
    }
  }

  public setDriveState(rpm: number, throttle01: number, speedKmh: number, kersActive = false) {
    this.currentRpm = rpm;
    this.currentLoad = Math.max(0.08, Math.min(1, throttle01));
    this.currentSpeedKmh = Math.max(0, speedKmh);
    if (this.isPlaying) {
      this.updateFrequencies(kersActive);
    }
  }

  private updateFrequencies(kersActive = false) {
    if (!this.ctx || !this.filter || this.oscs.length === 0) return;
    const now = this.ctx.currentTime;
    const isV12 = this.topology === 'v12-na' || this.topology === 'v12-tt';
    const baseFiringHz = isV12 ? this.currentRpm / 10 : this.currentRpm / 15;
    const multipliers = this.getHarmonicsFor(this.topology);

    this.oscs.forEach((osc, i) => {
      const mult = multipliers[i] ?? 1;
      const targetHz = Math.max(24, Math.min(3600, baseFiringHz * mult));
      osc.frequency.setTargetAtTime(targetHz, now, 0.025);
    });

    const valveBoost = this.exhaustMode === 'TRACK' ? 1.42 : this.exhaustMode === 'SPORT' ? 1.12 : 0.72;
    const loadBoost = 0.65 + this.currentLoad * 0.65;
    const baseCutoff = this.topology === 'v12-na' ? 480 + this.currentRpm * 0.36 : 320 + this.currentRpm * 0.27;
    this.filter.frequency.setTargetAtTime(Math.min(5800, baseCutoff * valveBoost * loadBoost), now, 0.03);

    if (this.masterGain) {
      const targetVol = (0.14 + this.currentLoad * 0.1) * (this.exhaustMode === 'QUIET' ? 0.68 : 1.0);
      this.masterGain.gain.setTargetAtTime(targetVol, now, 0.04);
    }

    if (this.noiseGain) {
      const airLoad = (0.02 + Math.min(0.14, (this.currentRpm / 11000) * 0.13)) * loadBoost;
      this.noiseGain.gain.setTargetAtTime(airLoad, now, 0.04);
    }

    // Hybrid whine on Valkyrie / Valhalla
    if (this.eMotorOsc && this.eMotorGain) {
      const isHybrid = this.topology === 'v8-hybrid' || this.topology === 'v12-na';
      const whineHz = 320 + this.currentSpeedKmh * 6.4 + (kersActive ? 420 : 0);
      this.eMotorOsc.frequency.setTargetAtTime(Math.min(3400, whineHz), now, 0.04);
      const whineVol = isHybrid ? (kersActive ? 0.065 : Math.min(0.032, this.currentSpeedKmh * 0.00014)) : 0.0001;
      this.eMotorGain.gain.setTargetAtTime(whineVol, now, 0.05);
    }

    // Twin-turbo spool on Vanquish / DB12 / Valhalla
    if (this.turboOsc && this.turboGain) {
      const hasTurbo = this.topology !== 'v12-na';
      const spoolHz = 1200 + (this.currentRpm / 7500) * 1900 + this.currentLoad * 600;
      this.turboOsc.frequency.setTargetAtTime(Math.min(4200, spoolHz), now, 0.05);
      const spoolVol = hasTurbo && this.currentLoad > 0.35 ? (this.currentLoad - 0.35) * 0.045 : 0.0001;
      this.turboGain.gain.setTargetAtTime(spoolVol, now, 0.06);
    }
  }

  /** Plays a realistic starter crank + cold-start bark into idle. */
  public triggerColdStart(topology: EngineTopology, idleRpm = 1200) {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Brief high-torque starter solenoid crank pulses
    const crankOsc = this.ctx.createOscillator();
    const crankGain = this.ctx.createGain();
    crankOsc.type = 'sawtooth';
    crankOsc.frequency.setValueAtTime(115, now);
    crankOsc.frequency.linearRampToValueAtTime(165, now + 0.34);
    crankGain.gain.setValueAtTime(0.001, now);
    crankGain.gain.linearRampToValueAtTime(0.11, now + 0.05);
    crankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    crankOsc.connect(crankGain);
    crankGain.connect(this.ctx.destination);
    crankOsc.start(now);
    crankOsc.stop(now + 0.4);

    const token = this.startToken;
    setTimeout(() => {
      if (token !== this.startToken) return;
      this.start(topology, idleRpm);
      this.triggerBlip(Math.min(4800, idleRpm * 3.1), idleRpm);
    }, 240);
  }

  /** Plays a crisp motorsport upshift ignition cut or downshift overrun crackle. */
  public triggerGearShift(direction: 'up' | 'down', rpm: number) {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    const now = this.ctx.currentTime;

    if (direction === 'up') {
      // 50ms ignition cut + exhaust bark
      this.masterGain.gain.setValueAtTime(0.025, now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.24, now + 0.06);
    }

    // Exhaust pop / crackle impulse
    const popCount = direction === 'down' ? 3 : 1;
    for (let p = 0; p < popCount; p++) {
      const t0 = now + p * 0.075;
      const dur = 0.045;
      const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ch.length * 0.25));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = direction === 'up' ? 180 + rpm * 0.03 : 260 + p * 75;
      bp.Q.value = 1.6;
      const g = this.ctx.createGain();
      g.gain.value = this.exhaustMode === 'QUIET' ? 0.06 : 0.22;
      src.connect(bp);
      bp.connect(g);
      g.connect(this.ctx.destination);
      src.start(t0);
    }
  }

  /** Plays a crisp, watch-bezel knurled aluminium switch click for cockpit controls. */
  public playSwitchClick(heavy = false) {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 640 : 1280, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 180 : 320, now + 0.032);
    g.gain.setValueAtTime(heavy ? 0.14 : 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.036);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public triggerBlip(peakRpm: number, idleRpm = 1100) {
    if (!this.isPlaying) {
      this.start(this.topology, idleRpm);
    }
    let frame = 0;
    const total = 44;
    const step = () => {
      frame++;
      const t = frame / total;
      const curve =
        t < 0.35
          ? Math.sin((t / 0.35) * (Math.PI / 2))
          : Math.cos(((t - 0.35) / 0.65) * (Math.PI / 2));
      const rpm = idleRpm + (peakRpm - idleRpm) * Math.max(0, curve);
      this.setRpm(rpm);
      if (frame < total && this.isPlaying) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  public stop() {
    this.startToken++;
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
    const oscsToStop = [...this.oscs];
    if (this.eMotorOsc) oscsToStop.push(this.eMotorOsc);
    if (this.turboOsc) oscsToStop.push(this.turboOsc);
    const noiseToStop = this.subNoise;
    this.oscs = [];
    this.oscGains = [];
    this.eMotorOsc = null;
    this.eMotorGain = null;
    this.turboOsc = null;
    this.turboGain = null;
    this.subNoise = null;
    this.isPlaying = false;
    setTimeout(() => {
      oscsToStop.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      });
      if (noiseToStop) {
        try {
          noiseToStop.stop();
          noiseToStop.disconnect();
        } catch {
          // ignore
        }
      }
    }, 240);
  }

  public get active() {
    return this.isPlaying;
  }

  /** Shared AudioContext (created on first use) for the drive-mode sound effects. */
  public get context(): AudioContext | null {
    this.ensureContext();
    return this.ctx;
  }
}

export const engineAudio = new AstonEngineSynthesizer();
