import React from 'react';
import { Camera, Download, Printer, ShieldCheck, X } from 'lucide-react';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import {
  COCKPIT_SWITCHGEAR,
  POWERTRAIN_DEEP_SPECS,
  type QWheelFinish,
} from '../data/engineeringData';
import { AstonCrest } from './AstonCrest';

interface CommissionModalProps {
  open: boolean;
  onClose: () => void;
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  wheelFinish: QWheelFinish;
  cabinTrim: QCabinTrim;
  snapshotUrl?: string | null;
}

const formatGbp = (amount: number) =>
  `£${amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

export const CommissionModal: React.FC<CommissionModalProps> = ({
  open,
  onClose,
  car,
  paint,
  caliper,
  wheelFinish,
  cabinTrim,
  snapshotUrl,
}) => {
  if (!open) return null;

  const deepSpec = POWERTRAIN_DEEP_SPECS[car.id] || POWERTRAIN_DEEP_SPECS.valkyrie;
  const switches = COCKPIT_SWITCHGEAR[car.id] || [];
  const buildCode = `AML-GDN-${car.id.toUpperCase().slice(0, 4)}-${paint.id.toUpperCase().slice(0, 4)}-26`;

  const paintOptionGbp = paint.id === 'aluminite-silver' ? 0 : 12500;
  const caliperOptionGbp = caliper.id === 'anodized-black' ? 0 : 2400;
  const wheelOptionGbp = wheelFinish.priceGbp;
  const saddleryOptionGbp = cabinTrim.id === 'onyx-lime' ? 0 : 8900;
  const totalCommissionGbp =
    deepSpec.basePriceGbp +
    paintOptionGbp +
    caliperOptionGbp +
    wheelOptionGbp +
    saddleryOptionGbp;

  const handleDownloadJson = () => {
    const payload = {
      atelier: 'Q by Aston Martin — Gaydon Commissioning Studio',
      commissionCode: buildCode,
      generatedAt: new Date().toISOString(),
      vehicle: {
        model: car.name,
        subtitle: car.subtitle,
        chassisCode: car.chassisCode,
        origin: car.origin,
      },
      qSpecification: {
        exteriorCoachwork: {
          name: paint.name,
          collection: paint.collection,
          hex: paint.hex,
          optionGbp: paintOptionGbp,
        },
        forgedWheels: {
          name: wheelFinish.name,
          finishType: wheelFinish.finishType,
          optionGbp: wheelOptionGbp,
        },
        caliperFinish: {
          name: caliper.name,
          hex: caliper.hex,
          optionGbp: caliperOptionGbp,
        },
        cabinSaddlery: {
          name: cabinTrim.name,
          material: cabinTrim.material,
          accent: cabinTrim.accentName,
          optionGbp: saddleryOptionGbp,
        },
      },
      indicativeValuationGbp: {
        baseCommissionGbp: deepSpec.basePriceGbp,
        bespokeOptionsGbp:
          paintOptionGbp + caliperOptionGbp + wheelOptionGbp + saddleryOptionGbp,
        estimatedTotalGbp: totalCommissionGbp,
      },
      powertrainArchitecture: deepSpec,
      cockpitSwitchgearCount: switches.length,
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
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Q by Aston Martin Commission Dossier"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-dossier">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--border-hairline)',
            paddingBottom: 18,
            marginBottom: 20,
          }}
        >
          <div>
            <AstonCrest width={76} />
            <div className="inspector-category" style={{ marginTop: 12 }}>
              Q BY ASTON MARTIN // GAYDON COMMISSION CERTIFICATE
            </div>
            <h3
              style={{
                margin: '4px 0 0',
                fontFamily: 'var(--font-display)',
                fontSize: 34,
                fontWeight: 300,
              }}
            >
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

        {/* Live Captured 3D Studio Render Snapshot */}
        {snapshotUrl && (
          <div className="dossier-snapshot-wrap">
            <img
              src={snapshotUrl}
              alt={`${car.name} configured in ${paint.name}`}
              className="dossier-snapshot-img"
            />
            <div className="dossier-snapshot-caption">
              <span>
                <Camera size={11} style={{ display: 'inline', marginRight: 6 }} />
                LIVE WEBGL2 STUDIO CAPTURE · {buildCode}
              </span>
              <span>{wheelFinish.name.toUpperCase()}</span>
            </div>
          </div>
        )}

        {/* Bespoke Finishes Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              border: '1px solid var(--border-hairline)',
              padding: 13,
              background: 'var(--bg-void)',
            }}
          >
            <div className="spec-k">Commission Code</div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                color: '#c4d600',
                marginTop: 6,
              }}
            >
              {buildCode}
            </div>
          </div>
          <div
            style={{
              border: '1px solid var(--border-hairline)',
              padding: 13,
              background: 'var(--bg-void)',
            }}
          >
            <div className="spec-k">Q Coachwork</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  background: paint.hex,
                  border: '1px solid rgba(255,255,255,0.28)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{paint.name}</span>
            </div>
          </div>
          <div
            style={{
              border: '1px solid var(--border-hairline)',
              padding: 13,
              background: 'var(--bg-void)',
            }}
          >
            <div className="spec-k">Forged Wheels</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: wheelFinish.hex,
                  border: '1px solid rgba(255,255,255,0.3)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                {wheelFinish.name}
              </span>
            </div>
          </div>
          <div
            style={{
              border: '1px solid var(--border-hairline)',
              padding: 13,
              background: 'var(--bg-void)',
            }}
          >
            <div className="spec-k">Brake Calipers</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: caliper.hex,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{caliper.name}</span>
            </div>
          </div>
          <div
            style={{
              border: '1px solid var(--border-hairline)',
              padding: 13,
              background: 'var(--bg-void)',
            }}
          >
            <div className="spec-k">Bridge of Weir Hide</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, marginTop: 6 }}>
              {cabinTrim.name}
            </div>
          </div>
        </div>

        {/* Two-Column Engineering + Indicative GBP Valuation */}
        <div className="dossier-valuation-grid">
          <div
            style={{
              border: '1px solid var(--border-hairline)',
              padding: 16,
              background: 'var(--bg-void)',
            }}
          >
            <div className="inspector-category" style={{ marginBottom: 10 }}>
              Powertrain &amp; Homologation Blueprint
            </div>
            <div className="spec-kv-list">
              <div className="spec-kv-row">
                <span className="spec-k">Engine Code</span>
                <span className="spec-v">{deepSpec.codeName}</span>
              </div>
              <div className="spec-kv-row">
                <span className="spec-k">Peak Output</span>
                <span className="spec-v">{car.specs.powerLabel}</span>
              </div>
              <div className="spec-kv-row">
                <span className="spec-k">Firing Order</span>
                <span className="spec-v">{deepSpec.firingOrder}</span>
              </div>
              <div className="spec-kv-row">
                <span className="spec-k">0–100 / Vmax</span>
                <span className="spec-v">
                  {car.specs.zeroToHundred} · {car.specs.topSpeedKmh} km/h
                </span>
              </div>
              <div className="spec-kv-row">
                <span className="spec-k">Tactile Cockpit</span>
                <span className="spec-v">{switches.length} Machined Gaydon Controls</span>
              </div>
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--border-gold)',
              padding: 16,
              background:
                'linear-gradient(160deg, rgba(0, 72, 43, 0.16) 0%, rgba(7, 9, 8, 0.96) 100%)',
            }}
          >
            <div
              className="inspector-category"
              style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ShieldCheck size={11} /> Indicative Q Bespoke Valuation
            </div>
            <div className="spec-kv-list">
              <div className="spec-kv-row">
                <span className="spec-k">Base Gaydon Allocation</span>
                <span className="spec-v">{formatGbp(deepSpec.basePriceGbp)}</span>
              </div>
              <div className="spec-kv-row">
                <span className="spec-k">Q Paint ({paint.collection})</span>
                <span className="spec-v">
                  {paintOptionGbp > 0 ? `+${formatGbp(paintOptionGbp)}` : 'Included'}
                </span>
              </div>
              <div className="spec-kv-row">
                <span className="spec-k">Forged Wheel Finish</span>
                <span className="spec-v">
                  {wheelOptionGbp > 0 ? `+${formatGbp(wheelOptionGbp)}` : 'Included'}
                </span>
              </div>
              <div className="spec-kv-row">
                <span className="spec-k">Calipers &amp; Hide Pairing</span>
                <span className="spec-v">
                  {caliperOptionGbp + saddleryOptionGbp > 0
                    ? `+${formatGbp(caliperOptionGbp + saddleryOptionGbp)}`
                    : 'Included'}
                </span>
              </div>
            </div>

            <div className="dossier-total-row">
              <span>ESTIMATED COMMISSION</span>
              <span className="dossier-total-val">{formatGbp(totalCommissionGbp)}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 20,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--text-muted)',
              letterSpacing: '0.12em',
            }}
          >
            ASTON MARTIN LAGONDA · BANBURY ROAD, GAYDON, WARWICKSHIRE
          </span>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="cta-ghost" onClick={() => window.print()}>
              <Printer size={13} />
              <span>Print Certificate</span>
            </button>
            <button type="button" className="cta-solid" onClick={handleDownloadJson}>
              <Download size={13} />
              <span>Export Q Build (.JSON)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
