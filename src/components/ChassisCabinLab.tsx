import React, { useState } from 'react';
import { Compass, Layers, ShieldCheck, Volume2 } from 'lucide-react';
import type { AstonCar, CabinElement, QCabinTrim } from '../data/cars';

interface ChassisCabinLabProps {
  car: AstonCar;
  cabinTrim: QCabinTrim;
  onSitInsidePov?: () => void;
}

/**
 * Interactive Gaydon Cabin Craft & Structural Material Observatory.
 * Visualizes Bridge of Weir hide & stitching pairings, cockpit ergonomics, and acoustic arrays.
 */
export const ChassisCabinLab: React.FC<ChassisCabinLabProps> = ({
  car,
  cabinTrim,
  onSitInsidePov,
}) => {
  const [activeEl, setActiveEl] = useState<CabinElement>(car.cabinElements[0]);

  return (
    <>
      <div
        className="studio-viewport"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          padding: '62px 26px 26px',
          gap: 24,
          background:
            'radial-gradient(circle at 28% 50%, rgba(0, 72, 43, 0.16) 0%, rgba(7, 9, 8, 0.96) 65%)',
        }}
      >
        <div className="hud-top-bar">
          <div className="hud-top-left">
            <div className="hud-badge">
              <span className="hud-dot" />
              <span>SADDLERY &amp; ARCHITECTURE // {cabinTrim.name}</span>
            </div>
          </div>
          {onSitInsidePov && (
            <div className="hud-top-right">
              <button type="button" className="hud-tool-btn active" onClick={onSitInsidePov}>
                <Compass size={12} />
                <span>Sit Inside 3D Cockpit</span>
              </button>
            </div>
          )}
        </div>

        {/* Left: Interactive Saddlery & Ergonomic Blueprint */}
        <div
          style={{
            border: '1px solid var(--border-hairline)',
            background: 'rgba(12, 16, 14, 0.72)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="inspector-category">Bespoke Bridge of Weir Hide Sample</div>
            <div
              style={{
                marginTop: 10,
                height: 112,
                border: `1px solid ${cabinTrim.stitchHex}`,
                background: `repeating-linear-gradient(-45deg, ${cabinTrim.primaryHex}, ${cabinTrim.primaryHex} 14px, rgba(255,255,255,0.035) 14px, rgba(255,255,255,0.035) 15px)`,
                position: 'relative',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  borderBottom: `1px dashed ${cabinTrim.stitchHex}`,
                  paddingBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  color: '#f2f3f0',
                }}
              >
                <span>QUILT STITCH SPEC</span>
                <span style={{ color: cabinTrim.stitchHex }}>{cabinTrim.accentName}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: '#f2f3f0' }}>
                {cabinTrim.material}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 18 }}>
            <div style={{ border: '1px solid var(--border-hairline)', padding: 14, background: 'var(--bg-void)' }}>
              <div className="lineup-metric-k" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={11} color="#c8a96e" /> Chassis Tub
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
                {car.aero.chassisType}
              </div>
            </div>
            <div style={{ border: '1px solid var(--border-hairline)', padding: 14, background: 'var(--bg-void)' }}>
              <div className="lineup-metric-k" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={11} color="#c4d600" /> Balance & Braking
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
                {car.specs.weightDist} · {car.specs.brakes}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Interactive Cabin Elements Selector & Detail */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: '1px solid var(--border-hairline)',
            background: 'rgba(7, 9, 8, 0.85)',
            padding: 22,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="inspector-category" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Volume2 size={12} /> Interior & Human-Machine Elements
            </div>
            {car.cabinElements.map((el) => {
              const selected = el.id === activeEl.id;
              return (
                <button
                  key={el.id}
                  type="button"
                  onClick={() => setActiveEl(el)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    background: selected ? 'rgba(0, 72, 43, 0.25)' : 'var(--bg-surface)',
                    border: `1px solid ${selected ? 'var(--am-lime)' : 'var(--border-hairline)'}`,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: selected ? '#c4d600' : '#c8a96e', letterSpacing: '0.16em' }}>
                    {el.code}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginTop: 2 }}>{el.title}</div>
                </button>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 14, marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#c8a96e', letterSpacing: '0.14em' }}>
              {activeEl.material} · {activeEl.spec}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
              {activeEl.detail}
            </p>
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
