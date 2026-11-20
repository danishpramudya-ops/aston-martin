import React, { useEffect, useState } from 'react';
import { Compass, Layers, ShieldCheck, Sliders, Sparkles, Volume2 } from 'lucide-react';
import type { AstonCar, CabinElement, QCabinTrim } from '../data/cars';
import {
  COCKPIT_SWITCHGEAR,
  DRIVE_PHYSICS_PROFILES,
  type SwitchgearControlSpec,
} from '../data/engineeringData';
import { engineAudio } from '../audio/engineAudio';

interface ChassisCabinLabProps {
  car: AstonCar;
  cabinTrim: QCabinTrim;
  onSitInsidePov?: () => void;
  onLaunchDrive?: () => void;
}

/**
 * Interactive Gaydon Cabin Craft, Tactile Switchgear Specification & Structural Material Atelier.
 * Showcases Bridge of Weir hide & stitching pairings alongside every machined physical cockpit button.
 */
export const ChassisCabinLab: React.FC<ChassisCabinLabProps> = ({
  car,
  cabinTrim,
  onSitInsidePov,
  onLaunchDrive,
}) => {
  const switchgearList = COCKPIT_SWITCHGEAR[car.id] || [];
  const [activeEl, setActiveEl] = useState<CabinElement>(car.cabinElements[0]);
  const [activeSwitch, setActiveSwitch] = useState<SwitchgearControlSpec>(switchgearList[0]);
  const [activeSwitchPulse, setActiveSwitchPulse] = useState<string | null>(null);

  // Sync selections cleanly whenever the user switches to a different Aston Martin model
  useEffect(() => {
    setActiveEl(car.cabinElements[0]);
    const nextSwitches = COCKPIT_SWITCHGEAR[car.id] || [];
    if (nextSwitches[0]) setActiveSwitch(nextSwitches[0]);
    setActiveSwitchPulse(null);
  }, [car]);

  const handleTestSwitch = (sw: SwitchgearControlSpec) => {
    setActiveSwitch(sw);
    engineAudio.playSwitchClick(sw.actionType === 'ignition' || sw.actionType === 'paddles');
    const phys = DRIVE_PHYSICS_PROFILES[car.id] || DRIVE_PHYSICS_PROFILES.valkyrie;

    if (sw.actionType === 'ignition') {
      if (engineAudio.active) {
        engineAudio.stop();
        setActiveSwitchPulse('Ignition Cycle: Standby');
      } else {
        engineAudio.triggerColdStart(car.topology, phys.idleRpm);
        setActiveSwitchPulse('Cold-Start Solenoid & Idle Bark Fired');
      }
    } else if (sw.actionType === 'exhaust') {
      engineAudio.setExhaustValve('TRACK');
      if (!engineAudio.active) engineAudio.start(car.topology, 1600);
      engineAudio.triggerBlip(car.specs.redlineRpm * 0.65, 1300);
      setActiveSwitchPulse('Bypass Flaps Open — Full Acoustic Valve');
    } else if (sw.actionType === 'paddles') {
      if (!engineAudio.active) engineAudio.start(car.topology, 2500);
      engineAudio.triggerGearShift('down', car.specs.redlineRpm * 0.72);
      setActiveSwitchPulse('Rev-Match Downshift Detent Verified');
    } else if (sw.actionType === 'kers') {
      if (!engineAudio.active) engineAudio.start(car.topology, 2400);
      engineAudio.triggerBlip(car.specs.redlineRpm * 0.9, 1600);
      setActiveSwitchPulse('Electric Torque-Fill Supplement Primed');
    } else {
      setActiveSwitchPulse(`${sw.shortLabel} Detent Verified · ${sw.actuationForce}`);
    }
  };

  return (
    <>
      <div
        className="studio-viewport switchgear-atelier-viewport"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.15fr 0.85fr',
          padding: '62px 24px 22px',
          gap: 20,
          background:
            'radial-gradient(circle at 24% 48%, rgba(0, 72, 43, 0.16) 0%, rgba(7, 9, 8, 0.97) 68%)',
          overflowY: 'auto',
        }}
      >
        <div className="hud-top-bar">
          <div className="hud-top-left">
            <div className="hud-badge">
              <span className="hud-dot" />
              <span>SADDLERY &amp; TACTILE SWITCHGEAR // {cabinTrim.name}</span>
            </div>
          </div>
          <div className="hud-top-right">
            {onSitInsidePov && (
              <button type="button" className="hud-tool-btn active" onClick={onSitInsidePov}>
                <Compass size={12} />
                <span>3D Cockpit POV</span>
              </button>
            )}
            {onLaunchDrive && (
              <button type="button" className="hud-tool-btn" onClick={onLaunchDrive}>
                <Sparkles size={12} />
                <span>Test Drive</span>
              </button>
            )}
          </div>
        </div>

        {/* Left: Interactive Gaydon Tactile Switchgear & Button Blueprint */}
        <div className="switchgear-panel">
          <div className="switchgear-panel-head">
            <div>
              <div className="inspector-category" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={11} /> Cockpit Switchgear &amp; Tactile Controls ({car.name})
              </div>
              <div className="switchgear-subtitle">
                Click any physical Gaydon switch to audition tactile actuation &amp; engineering spec
              </div>
            </div>
          </div>

          <div className="switchgear-btn-grid">
            {switchgearList.map((sw) => {
              const selected = activeSwitch?.id === sw.id;
              return (
                <button
                  key={sw.id}
                  type="button"
                  className={`tactile-switch-tile ${selected ? 'active' : ''}`}
                  onClick={() => handleTestSwitch(sw)}
                >
                  <div className="tactile-switch-top">
                    <span className="tactile-switch-code">{sw.code}</span>
                    <span className="tactile-switch-zone">{sw.zone.toUpperCase()}</span>
                  </div>
                  <div className="tactile-switch-name">{sw.shortLabel}</div>
                  <div className="tactile-switch-force">{sw.actuationForce}</div>
                </button>
              );
            })}
          </div>

          {activeSwitch && (
            <div className="switchgear-detail-box">
              <div className="switchgear-detail-head">
                <div>
                  <div className="switchgear-detail-title">{activeSwitch.name}</div>
                  <div className="switchgear-detail-mat">
                    {activeSwitch.material} · {activeSwitch.actuationForce}
                  </div>
                </div>
                {activeSwitch.modes && (
                  <div className="switchgear-modes-row">
                    {activeSwitch.modes.map((m) => (
                      <span key={m} className="switchgear-mode-tag">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {activeSwitchPulse && <div className="stage-spec-live-badge">{activeSwitchPulse}</div>}

              <p className="switchgear-detail-desc">{activeSwitch.description}</p>
              <div className="switchgear-tactile-note">
                Tactile Calibration: <span>{activeSwitch.tactileNote}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Bridge of Weir Saddlery Swatch + Cabin Structural Architecture */}
        <div className="saddlery-right-col">
          <div className="saddlery-hide-card">
            <div className="inspector-category">Bespoke Bridge of Weir Hide Sample</div>
            <div
              style={{
                marginTop: 10,
                height: 92,
                border: `1px solid ${cabinTrim.stitchHex}`,
                background: `repeating-linear-gradient(-45deg, ${cabinTrim.primaryHex}, ${cabinTrim.primaryHex} 14px, rgba(255,255,255,0.035) 14px, rgba(255,255,255,0.035) 15px)`,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  borderBottom: `1px dashed ${cabinTrim.stitchHex}`,
                  paddingBottom: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  letterSpacing: '0.16em',
                  color: '#f2f3f0',
                }}
              >
                <span>QUILT STITCH SPEC</span>
                <span style={{ color: cabinTrim.stitchHex }}>{cabinTrim.accentName}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, color: '#f2f3f0' }}>
                {cabinTrim.material}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <div style={{ border: '1px solid var(--border-hairline)', padding: 10, background: 'var(--bg-void)' }}>
                <div className="lineup-metric-k" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Layers size={10} color="#c8a96e" /> Chassis Tub
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, marginTop: 4, lineHeight: 1.4 }}>
                  {car.aero.chassisType}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border-hairline)', padding: 10, background: 'var(--bg-void)' }}>
                <div className="lineup-metric-k" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ShieldCheck size={10} color="#c4d600" /> Balance &amp; Braking
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, marginTop: 4, lineHeight: 1.4 }}>
                  {car.specs.weightDist} · {car.specs.brakes}
                </div>
              </div>
            </div>
          </div>

          <div className="saddlery-elements-card">
            <div className="inspector-category" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Volume2 size={11} /> Cabin Architecture &amp; Acoustics
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {car.cabinElements.map((el) => {
                const selected = el.id === activeEl.id;
                return (
                  <button
                    key={el.id}
                    type="button"
                    onClick={() => setActiveEl(el)}
                    style={{
                      textAlign: 'left',
                      padding: '9px 12px',
                      background: selected ? 'rgba(0, 72, 43, 0.25)' : 'var(--bg-surface)',
                      border: `1px solid ${selected ? 'var(--am-lime)' : 'var(--border-hairline)'}`,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8.5,
                        color: selected ? '#c4d600' : '#c8a96e',
                        letterSpacing: '0.16em',
                      }}
                    >
                      {el.code}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginTop: 1 }}>{el.title}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#c8a96e', letterSpacing: '0.12em' }}>
                {activeEl.material} · {activeEl.spec}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {activeEl.detail}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="compass-bar">
        <div className="azimuth-readout">
          <span className="azimuth-deg">{car.specs.wheelbaseMm}</span>
          <span className="azimuth-label">mm Wheelbase</span>
        </div>
        <div className="compass-track">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
            Dimensions: {car.specs.dimensionsMm} · Transmission: {car.specs.gearbox}
          </span>
        </div>
        <div className="compass-controls">
          <span className="azimuth-label">{car.origin}</span>
        </div>
      </div>
    </>
  );
};
