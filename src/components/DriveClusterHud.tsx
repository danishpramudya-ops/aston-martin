import React from 'react';
import { Camera, Flame, Gauge, RotateCcw, Volume2, VolumeX, Zap } from 'lucide-react';
import type { AstonCar } from '../data/cars';
import type { DrivePhysicsProfile } from '../data/engineeringData';

export type DriveCameraMode = 'chase' | 'cockpit' | 'bonnet';
export type DriveModeName = 'GT' | 'SPORT' | 'SPORT+' | 'TRACK';

export interface DriveTelemetrySnapshot {
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steer: number;
  latG: number;
  longG: number;
  downforceKg: number;
  brakeTempC: number;
  kersPct: number;
  kersActive: boolean;
  zeroTo100Sec: number | null;
  zeroTo200Sec: number | null;
  peakSpeedKmh: number;
  launchArmed: boolean;
}

interface DriveClusterHudProps {
  car: AstonCar;
  physics: DrivePhysicsProfile;
  telemetry: DriveTelemetrySnapshot;
  driveCamera: DriveCameraMode;
  driveMode: DriveModeName;
  manualShift: boolean;
  audioOn: boolean;
  onCameraChange: (cam: DriveCameraMode) => void;
  onModeChange: (mode: DriveModeName) => void;
  onToggleManual: () => void;
  onToggleAudio: () => void;
  onShift: (dir: 'up' | 'down') => void;
  onTriggerLaunch: () => void;
  onResetRun: () => void;
  onControlInput: (control: 'throttle' | 'brake' | 'left' | 'right' | 'boost', active: boolean) => void;
}

export const DriveClusterOverlay: React.FC<{
  car: AstonCar;
  physics: DrivePhysicsProfile;
  telemetry: DriveTelemetrySnapshot;
  driveMode: DriveModeName;
  manualShift: boolean;
}> = ({ car, physics, telemetry, driveMode, manualShift }) => {
  const rpmRatio = Math.max(0, Math.min(1, telemetry.rpm / physics.redlineRpm));
  const arcLen = 208;
  const dashOffset = arcLen * (1 - rpmRatio);
  const redlineZone = rpmRatio > 0.88;

  const shiftLeds = 10;
  const activeLeds = Math.floor(Math.max(0, (rpmRatio - 0.55) / 0.42) * shiftLeds);

  // G-force dot offset clamped within circle
  const gX = Math.max(-18, Math.min(18, telemetry.latG * 10));
  const gY = Math.max(-18, Math.min(18, -telemetry.longG * 10));

  return (
    <div className="drive-cluster-overlay" aria-label="Aston Martin Driving Telemetry Cluster">
      {/* Left Wing: Stopwatch & Aero / Thermal Telemetry */}
      <div className="drive-wing-card">
        <div className="drive-wing-head">
          <span>PROVING GROUND TELEMETRY</span>
          <span className="drive-mode-pill">{driveMode}</span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">0–100 km/h</span>
          <span className="drive-metric-v accent">
            {telemetry.zeroTo100Sec !== null ? `${telemetry.zeroTo100Sec.toFixed(2)} s` : `REF ${car.specs.zeroToHundred}`}
          </span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">0–200 km/h</span>
          <span className="drive-metric-v">
            {telemetry.zeroTo200Sec !== null ? `${telemetry.zeroTo200Sec.toFixed(2)} s` : '—'}
          </span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">Aero Load</span>
          <span className="drive-metric-v">{telemetry.downforceKg} kg</span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">CCM Rotor</span>
          <span className="drive-metric-v" style={{ color: telemetry.brakeTempC > 460 ? '#ff6a33' : undefined }}>
            {telemetry.brakeTempC}°C
          </span>
        </div>
      </div>

      {/* Center: Aston Martin Radial Tachometer, Shift Ladder, Gear & Speed */}
      <div className={`drive-tacho-core ${redlineZone ? 'near-redline' : ''}`}>
        <div className="drive-shift-ladder" aria-hidden="true">
          {Array.from({ length: shiftLeds }, (_, i) => {
            const lit = i < activeLeds;
            const cls = i >= 8 ? 'led-red' : i >= 5 ? 'led-amber' : 'led-lime';
            return <span key={i} className={`shift-led ${lit ? `lit ${cls}` : ''}`} />;
          })}
        </div>

        <svg viewBox="0 0 180 120" className="drive-tacho-svg">
          <path
            d="M 22 104 A 72 72 0 1 1 158 104"
            fill="none"
            stroke="rgba(242,243,240,0.12)"
            strokeWidth="7"
            strokeLinecap="butt"
          />
          <path
            d="M 22 104 A 72 72 0 1 1 158 104"
            fill="none"
            stroke={redlineZone ? '#e03e3e' : '#c4d600'}
            strokeWidth="7"
            strokeDasharray={arcLen}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.05s linear' }}
          />
        </svg>

        <div className="drive-tacho-readout">
          <div className="drive-gear-badge">
            <span className="drive-gear-tag">{manualShift ? 'M' : 'D'}</span>
            <span className="drive-gear-num">{telemetry.speedKmh < 1 && telemetry.throttle < 0.05 ? 'N' : telemetry.gear}</span>
          </div>
          <div className="drive-speed-big">{Math.round(telemetry.speedKmh)}</div>
          <div className="drive-speed-unit">
            KM/H · {Math.round(telemetry.rpm).toLocaleString()} RPM
          </div>
        </div>
      </div>

      {/* Right Wing: G-Force Friction Circle + KERS / Pedal Bars */}
      <div className="drive-wing-card">
        <div className="drive-wing-head">
          <span>DYNAMICS &amp; {physics.hasHybridBoost ? 'HYBRID KERS' : 'PEDAL LOAD'}</span>
          <span>PEAK {Math.round(telemetry.peakSpeedKmh)} KM/H</span>
        </div>

        <div className="drive-dynamics-row">
          <div className="g-circle-wrap" title="Real-Time Longitudinal & Lateral G-Force">
            <div className="g-circle-ring" />
            <div className="g-circle-cross-h" />
            <div className="g-circle-cross-v" />
            <div
              className="g-circle-dot"
              style={{ transform: `translate(${gX}px, ${gY}px)` }}
            />
            <span className="g-circle-label">
              {Math.hypot(telemetry.latG, telemetry.longG).toFixed(2)}G
            </span>
          </div>

          <div className="drive-bars-col">
            <div className="drive-bar-item">
              <div className="drive-bar-lbl">
                <span>THR</span>
                <span>{Math.round(telemetry.throttle * 100)}%</span>
              </div>
              <div className="drive-bar-track">
                <div className="drive-bar-fill thr" style={{ width: `${telemetry.throttle * 100}%` }} />
              </div>
            </div>

            <div className="drive-bar-item">
              <div className="drive-bar-lbl">
                <span>BRK</span>
                <span>{Math.round(telemetry.brake * 100)}%</span>
              </div>
              <div className="drive-bar-track">
                <div className="drive-bar-fill brk" style={{ width: `${telemetry.brake * 100}%` }} />
              </div>
            </div>

            {physics.hasHybridBoost && (
              <div className="drive-bar-item">
                <div className="drive-bar-lbl">
                  <span style={{ color: telemetry.kersActive ? '#c4d600' : undefined }}>
                    {car.id === 'valkyrie' ? 'KERS' : 'E-AXLE'}
                  </span>
                  <span>{Math.round(telemetry.kersPct)}%</span>
                </div>
                <div className="drive-bar-track">
                  <div className="drive-bar-fill kers" style={{ width: `${telemetry.kersPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DriveControlDeck: React.FC<DriveClusterHudProps> = ({
  physics,
  telemetry,
  driveCamera,
  driveMode,
  manualShift,
  audioOn,
  onCameraChange,
  onModeChange,
  onToggleManual,
  onToggleAudio,
  onShift,
  onTriggerLaunch,
  onResetRun,
  onControlInput,
}) => {
  const holdProps = (control: 'throttle' | 'brake' | 'left' | 'right' | 'boost') => ({
    onMouseDown: () => onControlInput(control, true),
    onMouseUp: () => onControlInput(control, false),
    onMouseLeave: () => onControlInput(control, false),
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      onControlInput(control, true);
    },
    onTouchEnd: () => onControlInput(control, false),
  });

  return (
    <div className="drive-control-deck">
      <div className="drive-deck-row">
        {/* Interactive Pedals & Steering */}
        <div className="drive-pedal-cluster">
          <button
            type="button"
            className={`drive-pedal-btn steer ${telemetry.steer < -0.1 ? 'active' : ''}`}
            {...holdProps('left')}
            title="Steer Left (A / Left Arrow)"
          >
            ◀ A
          </button>
          <button
            type="button"
            className={`drive-pedal-btn steer ${telemetry.steer > 0.1 ? 'active' : ''}`}
            {...holdProps('right')}
            title="Steer Right (D / Right Arrow)"
          >
            D ▶
          </button>
          <button
            type="button"
            className={`drive-pedal-btn brake ${telemetry.brake > 0.1 ? 'active' : ''}`}
            {...holdProps('brake')}
            title="Brake (S / Down Arrow)"
          >
            <Flame size={12} />
            <span>BRAKE (S)</span>
          </button>
          <button
            type="button"
            className={`drive-pedal-btn throttle ${telemetry.throttle > 0.1 ? 'active' : ''}`}
            {...holdProps('throttle')}
            title="Full Throttle (W / Up Arrow)"
          >
            <Gauge size={12} />
            <span>THROTTLE (W)</span>
          </button>
        </div>

        {/* Carbon Shift Paddles & Launch / KERS */}
        <div className="drive-paddle-cluster">
          <button type="button" className="drive-chip-btn" onClick={() => onShift('down')} title="Downshift (Q)">
            − Q
          </button>
          <button
            type="button"
            className={`drive-chip-btn ${manualShift ? 'active' : ''}`}
            onClick={onToggleManual}
            title="Toggle Auto / Manual Paddles"
          >
            {manualShift ? 'MANUAL' : 'AUTO DCT'}
          </button>
          <button type="button" className="drive-chip-btn" onClick={() => onShift('up')} title="Upshift (E)">
            E +
          </button>

          {physics.hasHybridBoost ? (
            <button
              type="button"
              className={`drive-chip-btn kers-btn ${telemetry.kersActive ? 'active' : ''}`}
              {...holdProps('boost')}
              title="Deploy Electric Boost (Space)"
            >
              <Zap size={12} />
              <span>E-BOOST</span>
            </button>
          ) : (
            <button
              type="button"
              className={`drive-chip-btn kers-btn ${telemetry.launchArmed ? 'active' : ''}`}
              onClick={onTriggerLaunch}
              title="Engage Launch Control (Space)"
            >
              <Zap size={12} />
              <span>LAUNCH</span>
            </button>
          )}
        </div>

        {/* Drive Camera, Drive Mode & Sound */}
        <div className="drive-meta-cluster">
          <div className="drive-cam-group" role="group" aria-label="Drive Camera POV">
            {(['chase', 'cockpit', 'bonnet'] as DriveCameraMode[]).map((cam) => (
              <button
                key={cam}
                type="button"
                className={`drive-chip-btn ${driveCamera === cam ? 'active' : ''}`}
                onClick={() => onCameraChange(cam)}
              >
                <Camera size={11} />
                <span>{cam === 'chase' ? 'Chase' : cam === 'cockpit' ? 'Cockpit' : 'Bonnet'}</span>
              </button>
            ))}
          </div>

          <div className="drive-mode-group" role="group" aria-label="Drive Mode Selector">
            {physics.driveModes.map((m) => (
              <button
                key={m}
                type="button"
                className={`drive-chip-btn ${driveMode === m ? 'active' : ''}`}
                onClick={() => onModeChange(m)}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`drive-chip-btn ${audioOn ? 'active' : ''}`}
            onClick={onToggleAudio}
            title="Toggle Driving Engine Sound"
          >
            {audioOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </button>

          <button
            type="button"
            className="drive-chip-btn"
            onClick={onResetRun}
            title="Reset Run & Stopwatch"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      <div className="drive-kbd-hint">
        <span>KEYBOARD: [W/↑] THROTTLE · [S/↓] BRAKE · [A/D] STEER · [Q/E] PADDLES · [SPACE] {physics.hasHybridBoost ? 'KERS BOOST' : 'LAUNCH CONTROL'} · [C] CAMERA</span>
      </div>
    </div>
  );
};
