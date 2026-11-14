import React from 'react';
import { Download, Printer, X } from 'lucide-react';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import { AstonCrest } from './AstonCrest';

interface CommissionModalProps {
  open: boolean;
  onClose: () => void;
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  cabinTrim: QCabinTrim;
}

export const CommissionModal: React.FC<CommissionModalProps> = ({
  open,
  onClose,
  car,
  paint,
  caliper,
  cabinTrim,
}) => {
  if (!open) return null;

  const buildCode = `AML-GDN-${car.id.toUpperCase().slice(0, 4)}-${paint.id.toUpperCase().slice(0, 4)}-26`;

  const handleDownloadJson = () => {
    const payload = {
      atelier: 'Aston Martin Gaydon Studio',
      commissionCode: buildCode,
      generatedAt: new Date().toISOString(),
      vehicle: {
        model: car.name,
        subtitle: car.subtitle,
        chassisCode: car.chassisCode,
        origin: car.origin,
      },
      qSpecification: {
        exteriorCoachwork: { name: paint.name, collection: paint.collection, hex: paint.hex },
        caliperFinish: { name: caliper.name, hex: caliper.hex },
        cabinSaddlery: { name: cabinTrim.name, material: cabinTrim.material, accent: cabinTrim.accentName },
      },
      technicalData: car.specs,
      aerodynamics: car.aero,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${buildCode}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Q by Aston Martin Commission Dossier">
      <div className="modal-dossier">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--border-hairline)',
            paddingBottom: 18,
            marginBottom: 22,
          }}
        >
          <div>
            <AstonCrest width={76} />
            <div className="inspector-category" style={{ marginTop: 12 }}>
              Q BY ASTON MARTIN // COMMISSION SPECIFICATION
            </div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 300 }}>
              {car.name} — <em>{paint.name}</em>
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border-hairline)',
              color: 'var(--text-primary)',
              padding: 8,
              cursor: 'pointer',
            }}
            aria-label="Close commission dossier"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 22,
          }}
        >
          <div style={{ border: '1px solid var(--border-hairline)', padding: 14, background: 'var(--bg-void)' }}>
            <div className="spec-k">Commission Reference</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#c4d600', marginTop: 6 }}>
              {buildCode}
            </div>
          </div>
          <div style={{ border: '1px solid var(--border-hairline)', padding: 14, background: 'var(--bg-void)' }}>
            <div className="spec-k">Exterior Coachwork</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ width: 12, height: 12, background: paint.hex, border: '1px solid rgba(255,255,255,0.25)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{paint.name}</span>
            </div>
          </div>
          <div style={{ border: '1px solid var(--border-hairline)', padding: 14, background: 'var(--bg-void)' }}>
            <div className="spec-k">Brake Calipers</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: caliper.hex }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{caliper.name}</span>
            </div>
          </div>
          <div style={{ border: '1px solid var(--border-hairline)', padding: 14, background: 'var(--bg-void)' }}>
            <div className="spec-k">Saddlery & Trim</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 6 }}>{cabinTrim.name}</div>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-hairline)', padding: 18, marginBottom: 24, background: 'var(--bg-void)' }}>
          <div className="inspector-category" style={{ marginBottom: 12 }}>
            Engineering & Homologation Summary
          </div>
          <div className="spec-kv-list">
            <div className="spec-kv-row">
              <span className="spec-k">Powertrain</span>
              <span className="spec-v">{car.specs.engine}</span>
            </div>
            <div className="spec-kv-row">
              <span className="spec-k">Peak Output</span>
              <span className="spec-v">{car.specs.powerLabel}</span>
            </div>
            <div className="spec-kv-row">
              <span className="spec-k">Torque</span>
              <span className="spec-v">{car.specs.torqueLabel}</span>
            </div>
            <div className="spec-kv-row">
              <span className="spec-k">0–100 km/h / Vmax</span>
              <span className="spec-v">
                {car.specs.zeroToHundred} · {car.specs.topSpeedKmh} km/h ({car.specs.topSpeedMph} mph)
              </span>
            </div>
            <div className="spec-kv-row">
              <span className="spec-k">Structure</span>
              <span className="spec-v">{car.aero.chassisType}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="cta-ghost" onClick={() => window.print()}>
            <Printer size={13} />
            <span>Print Dossier</span>
          </button>
          <button type="button" className="cta-solid" onClick={handleDownloadJson}>
            <Download size={13} />
            <span>Export Build Spec (.JSON)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
