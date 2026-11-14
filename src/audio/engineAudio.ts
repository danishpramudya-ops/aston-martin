import type { EngineTopology } from '../data/cars';

/**
 * Web Audio API Acoustic Engine Note Synthesizer.
 * Synthesizes distinct firing-order harmonics for Aston Martin V12 and V8 engines
 * without external audio assets that could fail to load.
 */
class AstonEngineSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private oscs: OscillatorNode[] = [];
  private oscGains: GainNode[] = [];
  private subNoise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private isPlaying = false;
  private topology: EngineTopology = 'v12-na';
  private currentRpm = 1100;

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
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
    this.masterGain.gain.exponentialRampToValueAtTime(0.18, this.ctx.currentTime + 0.35);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 3.2;

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 6;

    this.filter.connect(compressor);
    compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Firing harmonics: V12 fires 6 times per revolution (RPM/10 Hz), V8 fires 4 times (RPM/15 Hz)
    const harmonicMultipliers =
      topology === 'v12-na'
        ? [0.5, 1, 1.5, 2, 3, 4]
        : topology === 'v12-tt'
          ? [0.5, 1, 1.5, 2, 2.5, 3]
          : topology === 'v8-hybrid'
            ? [0.5, 1, 2, 3, 4.5, 6]
            : [0.5, 1, 1.5, 2, 3];

    const waveforms: OscillatorType[] =
      topology === 'v12-na'
        ? ['sawtooth', 'sawtooth', 'triangle', 'sawtooth', 'sine', 'triangle']
        : topology === 'v8-hybrid'
          ? ['sawtooth', 'square', 'sawtooth', 'triangle', 'sine', 'sine']
          : ['sawtooth', 'sawtooth', 'square', 'triangle', 'sine'];

    this.oscs = [];
    this.oscGains = [];

    harmonicMultipliers.forEach((mult, idx) => {
      if (!this.ctx || !this.filter) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = waveforms[idx] || 'sawtooth';
      gain.gain.value = idx === 0 ? 0.25 : idx === 1 ? 0.35 : 0.14 / (idx * 0.7);
      osc.connect(gain);
      gain.connect(this.filter);
      osc.start();
      this.oscs.push(osc);
      this.oscGains.push(gain);
      void mult;
    });

    // Subtle mechanical induction / exhaust air hiss
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
    noiseFilter.frequency.value = 420;
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

  public setTopology(topology: EngineTopology) {
    this.topology = topology;
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

  private updateFrequencies() {
    if (!this.ctx || !this.filter || this.oscs.length === 0) return;
    const now = this.ctx.currentTime;
    const isV12 = this.topology === 'v12-na' || this.topology === 'v12-tt';
    const baseFiringHz = isV12 ? this.currentRpm / 10 : this.currentRpm / 15;

    const multipliers =
      this.topology === 'v12-na'
        ? [0.5, 1, 1.5, 2, 3, 4]
        : this.topology === 'v12-tt'
          ? [0.5, 1, 1.5, 2, 2.5, 3]
          : this.topology === 'v8-hybrid'
            ? [0.5, 1, 2, 3, 4.5, 6]
            : [0.5, 1, 1.5, 2, 3];

    this.oscs.forEach((osc, i) => {
      const mult = multipliers[i] ?? 1;
      const targetHz = Math.max(24, Math.min(3400, baseFiringHz * mult));
      osc.frequency.setTargetAtTime(targetHz, now, 0.035);
    });

    const cutoff = this.topology === 'v12-na' ? 420 + this.currentRpm * 0.34 : 300 + this.currentRpm * 0.25;
    this.filter.frequency.setTargetAtTime(Math.min(4800, cutoff), now, 0.04);

    if (this.noiseGain) {
      const airLoad = 0.02 + Math.min(0.11, (this.currentRpm / 11000) * 0.11);
      this.noiseGain.gain.setTargetAtTime(airLoad, now, 0.05);
    }
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
      const curve = t < 0.35 ? Math.sin((t / 0.35) * (Math.PI / 2)) : Math.cos(((t - 0.35) / 0.65) * (Math.PI / 2));
      const rpm = idleRpm + (peakRpm - idleRpm) * Math.max(0, curve);
      this.setRpm(rpm);
      if (frame < total && this.isPlaying) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  public stop() {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
    const oscsToStop = this.oscs;
    const noiseToStop = this.subNoise;
    this.oscs = [];
    this.oscGains = [];
    this.subNoise = null;
    this.isPlaying = false;
    setTimeout(() => {
      oscsToStop.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore already stopped
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
}

export const engineAudio = new AstonEngineSynthesizer();
