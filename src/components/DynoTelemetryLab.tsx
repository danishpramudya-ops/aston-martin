import React, { useEffect, useState } from 'react';
import { Cpu, Gauge, Layers, Play, Square, Volume2 } from 'lucide-react';
import { ASTON_CARS, type AstonCar } from '../data/cars';
import { POWERTRAIN_DEEP_SPECS } from '../data/engineeringData';
import { engineAudio, type ExhaustValveMode } from '../audio/engineAudio';

interface DynoTelemetryLabProps {
  activeCar: AstonCar;
  onInspectXray?: () => void;
}

export const DynoTelemetryLab: React.FC<DynoTelemetryLabProps> = ({ activeCar, onInspectXray }) => {
  const [compareId, setCompareId] = useState<string>(() => (activeCar.id === 'valkyrie' ? 'vanquish' : 'valkyrie'));
  const [metric, setMetric] = useState<'power' | 'torque'>('power');
  const [audioRunning, setAudioRunning] = useState(false);
  const [exhaustMode, setExhaustMode] = useState<ExhaustValveMode>('SPORT');
  const [rpm, setRpm] = useState(1400);

  const compareCar = ASTON_CARS.find((c) => c.id === compareId) || ASTON_CARS[0];
  const deepSpec = POWERTRAIN_DEEP_SPECS[activeCar.id] || POWERTRAIN_DEEP_SPECS.valkyrie;

  useEffect(() => {
    if (activeCar.id === compareId) {
      const next = ASTON_CARS.find((c) => c.id !== activeCar.id);
      if (next) setCompareId(next.id);
    }
    const clampedRpm = Math.min(activeCar.specs.redlineRpm, Math.max(1200, rpm));
    setRpm(clampedRpm);
    if (audioRunning) {
      engineAudio.setTopology(activeCar.topology);
      engineAudio.setRpm(clampedRpm);
    }
  }, [activeCar, compareId, audioRunning, rpm]);

  const toggleAudio = () => {
    if (audioRunning) {
      engineAudio.stop();
      setAudioRunning(false);
    } else {
      engineAudio.setExhaustValve(exhaustMode);
      engineAudio.triggerColdStart(activeCar.topology, rpm);
      setAudioRunning(true);
    }
  };

  const handleExhaustChange = (next: ExhaustValveMode) => {
    engineAudio.playSwitchClick(false);
    setExhaustMode(next);
    engineAudio.setExhaustValve(next);
  };

  const handleBlip = () => {
    setAudioRunning(true);
    engineAudio.setTopology(activeCar.topology);
    engineAudio.triggerBlip(activeCar.specs.redlineRpm * 0.92, 1300);
    // Sync UI needle visually for the blip
    const start = performance.now();
    const peak = activeCar.specs.redlineRpm * 0.92;
    const anim = (now: number) => {
      const t = Math.min(1, (now - start) / 920);
      const curve = t < 0.35 ? Math.sin((t / 0.35) * (Math.PI / 2)) : Math.cos(((t - 0.35) / 0.65) * (Math.PI / 2));
      setRpm(Math.round(1300 + (peak - 1300) * Math.max(0, curve)));
      if (t < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  };

  // SVG Chart coordinate mapping
  const W = 680;
  const H = 290;
  const padL = 52;
  const padR = 24;
  const padT = 22;
  const padB = 36;
  const maxRpm = Math.max(activeCar.specs.redlineRpm, compareCar.specs.redlineRpm, 8000);
  const maxVal = metric === 'power' ? 1250 : 1200;

  const toX = (r: number) => padL + ((r - 1000) / (maxRpm - 1000)) * (W - padL - padR);
  const toY = (v: number) => H - padB - (v / maxVal) * (H - padT - padB);

  const buildPath = (car: AstonCar) =>
    car.dynoCurve
      .map((pt, i) => {
        const val = metric === 'power' ? pt.powerPS : pt.torqueNm;
        return `${i === 0 ? 'M' : 'L'} ${toX(pt.rpm).toFixed(1)} ${toY(val).toFixed(1)}`;
      })
      .join(' ');

  const rpmPct = Math.min(100, Math.max(6, (rpm / activeCar.specs.redlineRpm) * 100));

  return (
    <div className="telemetry-grid">
      {/* Left: SVG Dyno Curve Comparison */}
      <div className="dyno-panel">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <div className="inspector-category">Powertrain Calibration Curve</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 300 }}>
              {activeCar.name} <span style={{ color: 'var(--text-muted)', fontSize: 20 }}>vs</span> {compareCar.name}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div className="studio-mode-switch">
              <button
                type="button"
                className={`mode-btn ${metric === 'power' ? 'active' : ''}`}
                onClick={() => setMetric('power')}
              >
                Output (PS)
              </button>
              <button
                type="button"
                className={`mode-btn ${metric === 'torque' ? 'active' : ''}`}
                onClick={() => setMetric('torque')}
              >
                Torque (Nm)
              </button>
            </div>

            <select
              id="dyno-compare-model"
              name="dynoCompareModel"
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
              aria-label="Compare model"
              style={{
                background: 'var(--bg-void)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-hairline)',
                padding: '9px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {ASTON_CARS.filter((c) => c.id !== activeCar.id).map((c) => (
                <option key={c.id} value={c.id}>
                  Compare: {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          {/* Grid horizontals */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const val = Math.round(maxVal * frac);
            const y = toY(val);
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(242,243,240,0.07)" strokeDasharray="3 4" />
                <text
                  x={padL - 10}
                  y={y + 3}
                  textAnchor="end"
                  fill="#5a645e"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* RPM X-Axis */}
          {[2000, 4000, 6000, 8000, 10000].map((tick) => {
            if (tick > maxRpm) return null;
            const x = toX(tick);
            return (
              <g key={tick}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="rgba(242,243,240,0.05)" />
                <text
                  x={x}
                  y={H - 12}
                  textAnchor="middle"
                  fill="#5a645e"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {(tick / 1000).toFixed(0)}k RPM
                </text>
              </g>
            );
          })}

          {/* Comparison curve */}
          <path d={buildPath(compareCar)} fill="none" stroke="#c8a96e" strokeWidth="1.8" strokeDasharray="5 4" opacity="0.78" />
          {/* Active car curve */}
          <path d={buildPath(activeCar)} fill="none" stroke="#c4d600" strokeWidth="2.5" />

          {/* Current acoustic RPM cursor */}
          <line
            x1={toX(Math.max(1200, rpm))}
            y1={padT}
            x2={toX(Math.max(1200, rpm))}
            y2={H - padB}
            stroke="rgba(196,214,0,0.4)"
            strokeWidth="1"
          />

          {/* Data dots on active car */}
          {activeCar.dynoCurve.map((pt) => {
            const val = metric === 'power' ? pt.powerPS : pt.torqueNm;
            return (
              <circle
                key={pt.rpm}
                cx={toX(pt.rpm)}
                cy={toY(val)}
                r="3.2"
                fill="#070908"
                stroke="#c4d600"
                strokeWidth="1.8"
              />
            );
          })}
        </svg>

        <div style={{ display: 'flex', gap: 24, marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#c4d600' }}>
            <span style={{ width: 18, height: 2, background: '#c4d600', display: 'inline-block' }} />
            {activeCar.name.toUpperCase()} ({metric === 'power' ? `${activeCar.specs.powerPS} PS` : `${activeCar.specs.torqueNm} Nm`})
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#c8a96e' }}>
            <span style={{ width: 18, height: 2, borderTop: '2px dashed #c8a96e', display: 'inline-block' }} />
            {compareCar.name.toUpperCase()} ({metric === 'power' ? `${compareCar.specs.powerPS} PS` : `${compareCar.specs.torqueNm} Nm`})
          </span>
        </div>
      </div>

      {/* Right: Acoustic Engine Ignition & Throttle Lab */}
      <div className="acoustic-panel">
        <div>
          <div className="inspector-category" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Volume2 size={12} /> Web Audio Firing-Order Lab
          </div>
          <h3 style={{ margin: '8px 0 6px', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 300 }}>
            {activeCar.name} Acoustics
          </h3>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {activeCar.specs.engine}. Synthesizes live firing harmonics from idle up to its{' '}
            {activeCar.specs.redlineRpm.toLocaleString()} rpm limit.
          </p>
        </div>

        <div style={{ border: '1px solid var(--border-hairline)', padding: 18, background: 'var(--bg-void)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span className="spec-k" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Gauge size={12} color="#c4d600" /> Crank Speed
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>
              {rpm.toLocaleString()} <span style={{ fontSize: 11, color: '#c8a96e' }}>RPM</span>
            </span>
          </div>

          <div className="rpm-meter-bar" style={{ marginBottom: 14 }}>
            <div className="rpm-meter-fill" style={{ width: `${rpmPct}%` }} />
          </div>

          <input
            id="throttle-rpm-slider"
            name="throttleRpm"
            type="range"
            min={1100}
            max={activeCar.specs.redlineRpm}
            step={50}
            value={rpm}
            onChange={(e) => {
              const next = Number(e.target.value);
              setRpm(next);
              if (audioRunning) engineAudio.setRpm(next);
            }}
            className="range-atelier"
            aria-label="Throttle RPM slider"
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-muted)',
              marginTop: 6,
            }}
          >
            <span>1,100 IDLE</span>
            <span>{activeCar.specs.redlineRpm.toLocaleString()} REDLINE</span>
          </div>

          {/* Active Exhaust Bypass Valve Selector */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
            <div className="inspector-block-title" style={{ marginBottom: 8 }}>
              <span>Exhaust Bypass Valve</span>
              <span>{exhaustMode}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {(['QUIET', 'SPORT', 'TRACK'] as ExhaustValveMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`caliper-chip ${exhaustMode === v ? 'active' : ''}`}
                  style={{ justifyContent: 'center' }}
                  onClick={() => handleExhaustChange(v)}
                >
                  <span>{v}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="cta-solid"
            style={{
              flex: 1,
              justifyContent: 'center',
              background: audioRunning ? 'var(--am-crimson)' : 'var(--text-primary)',
              borderColor: audioRunning ? 'var(--am-crimson)' : 'var(--text-primary)',
              color: audioRunning ? '#f2f3f0' : 'var(--bg-void)',
            }}
            onClick={toggleAudio}
          >
            {audioRunning ? <Square size={13} /> : <Play size={13} />}
            <span>{audioRunning ? 'Engine Stop' : 'Cold-Start Ignition'}</span>
          </button>
          <button type="button" className="cta-ghost" onClick={handleBlip}>
            <span>Rev Blip</span>
          </button>
        </div>
      </div>

      {/* Full-Width Deep Powertrain Engineering Blueprint */}
      <div className="powertrain-blueprint-card">
        <div className="powertrain-blueprint-head">
          <div>
            <div className="inspector-category" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Cpu size={12} /> GAYDON ENGINE ARCHITECTURE DOSSIER // {deepSpec.codeName}
            </div>
            <h3 className="powertrain-blueprint-title">{deepSpec.architecture}</h3>
          </div>
          {onInspectXray && (
            <button type="button" className="cta-ghost" onClick={onInspectXray}>
              <Layers size={13} />
              <span>Inspect in 3D X-Ray Cutaway</span>
            </button>
          )}
        </div>

        <div className="powertrain-spec-grid">
          <div className="pt-cell">
            <span className="pt-k">Displacement &amp; Bore × Stroke</span>
            <span className="pt-v">
              {deepSpec.displacementCc} · {deepSpec.boreStrokeMm}
            </span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Compression Ratio</span>
            <span className="pt-v">{deepSpec.compressionRatio}</span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Firing Order</span>
            <span className="pt-v accent">{deepSpec.firingOrder}</span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Specific Output</span>
            <span className="pt-v">{deepSpec.specificOutput}</span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Valvetrain &amp; Internals</span>
            <span className="pt-v">{deepSpec.valvetrain}</span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Induction &amp; Forced Charging</span>
            <span className="pt-v">{deepSpec.induction}</span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Hybrid / Electric Architecture</span>
            <span className="pt-v">{deepSpec.hybridSystem}</span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Transmission &amp; Differential</span>
            <span className="pt-v">
              {deepSpec.transmissionDetail} · {deepSpec.differential}
            </span>
          </div>
          <div className="pt-cell">
            <span className="pt-k">Lubrication &amp; Thermal Cooling</span>
            <span className="pt-v">
              {deepSpec.lubrication} · {deepSpec.coolingDetail}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
