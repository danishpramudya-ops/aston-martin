import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, Box, Compass, FileText, Layers, Volume2, VolumeX, Wind } from 'lucide-react';
import {
  ASTON_CARS,
  Q_CABIN_TRIMS,
  Q_CALIPER_FINISHES,
  Q_PAINT_FINISHES,
  type AstonCar,
  type EngineeringHotspot,
} from './data/cars';
import { AstonCrest } from './components/AstonCrest';
import { Turntable360Stage } from './components/Turntable360Stage';
import { AeroWindTunnel3D } from './components/AeroWindTunnel3D';
import { ChassisCabinLab } from './components/ChassisCabinLab';
import { DynoTelemetryLab } from './components/DynoTelemetryLab';
import { CommissionModal } from './components/CommissionModal';
import { engineAudio } from './audio/engineAudio';

type StudioMode = 'studio' | 'aero' | 'cabin';

export function App() {
  const [selectedCarId, setSelectedCarId] = useState<string>('valkyrie');
  const [studioMode, setStudioMode] = useState<StudioMode>('studio');
  const [paintId, setPaintId] = useState<string>('aluminite-silver');
  const [caliperId, setCaliperId] = useState<string>('lime-essence');
  const [cabinTrimId, setCabinTrimId] = useState<string>('onyx-lime');
  const [azimuth, setAzimuth] = useState<number>(45);
  const [selectedHotspot, setSelectedHotspot] = useState<EngineeringHotspot | null>(null);
  const [heroAudioOn, setHeroAudioOn] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  const studioSectionRef = useRef<HTMLElement | null>(null);

  const activeCar: AstonCar = ASTON_CARS.find((c) => c.id === selectedCarId) || ASTON_CARS[0];
  const activePaint = Q_PAINT_FINISHES.find((p) => p.id === paintId) || Q_PAINT_FINISHES[0];
  const activeCaliper = Q_CALIPER_FINISHES.find((c) => c.id === caliperId) || Q_CALIPER_FINISHES[0];
  const activeCabinTrim = Q_CABIN_TRIMS.find((t) => t.id === cabinTrimId) || Q_CABIN_TRIMS[0];

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY || 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const selectCar = (car: AstonCar, scrollToStudio = false) => {
    setSelectedCarId(car.id);
    setAzimuth(car.defaultAzimuth);
    setSelectedHotspot(null);
    if (heroAudioOn) {
      engineAudio.setTopology(car.topology);
    }
    if (scrollToStudio && studioSectionRef.current) {
      studioSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const toggleHeroIgnition = () => {
    if (heroAudioOn) {
      engineAudio.stop();
      setHeroAudioOn(false);
    } else {
      engineAudio.start(activeCar.topology, 1350);
      engineAudio.triggerBlip(activeCar.specs.redlineRpm * 0.85, 1350);
      setHeroAudioOn(true);
    }
  };

  const heroParallaxScale = 1 + Math.min(0.09, scrollY * 0.00014);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-void)' }}>
      {/* Top Architectural Navigation */}
      <header className="atelier-nav">
        <button
          type="button"
          className="nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <AstonCrest width={76} />
          <div className="nav-brand-meta">
            <span className="nav-brand-title">Gaydon Atelier</span>
            <span className="nav-brand-sub">52.1897° N · 1.4828° W</span>
          </div>
        </button>

        <nav className="nav-models-strip" aria-label="Flagship Lineup">
          {ASTON_CARS.map((car) => (
            <button
              key={car.id}
              type="button"
              className={`nav-model-btn ${car.id === activeCar.id ? 'active' : ''}`}
              onClick={() => selectCar(car, true)}
            >
              {car.name}
            </button>
          ))}
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            className={`nav-btn ${heroAudioOn ? 'accent-active' : ''}`}
            onClick={toggleHeroIgnition}
            aria-label="Toggle V12 / V8 Acoustic Ignition"
          >
            {heroAudioOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>{heroAudioOn ? 'Ignition Live' : 'Sound'}</span>
          </button>
          <button
            type="button"
            className="nav-btn nav-btn-primary"
            onClick={() => setDossierOpen(true)}
          >
            <FileText size={13} />
            <span>Q Dossier</span>
          </button>
        </div>
      </header>

      {/* Hero Editorial Stage */}
      <section className="hero-section">
        <div className="hero-backdrop">
          <img
            src={activeCar.heroImage}
            alt={`Aston Martin ${activeCar.name}`}
            className="hero-backdrop-img"
            style={{ transform: `scale(${heroParallaxScale.toFixed(4)})` }}
          />
          <div className="hero-vignette" />
          <div className="hero-grid-overlay" />
        </div>

        <div className="hero-coords">
          <span>ASTON MARTIN LAGONDA // WARWICKSHIRE</span>
          <span>{activeCar.productionNote}</span>
        </div>

        <div className="hero-content">
          <div>
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-rule" />
              <span>
                {activeCar.category} · {activeCar.chassisCode}
              </span>
            </div>
            <h1 className="hero-title">
              Power. <em>Sculpted</em>
              <br />
              in every degree.
            </h1>
            <p className="hero-lead">
              Step inside the Gaydon studio cyclorama. Orbit Aston Martin’s flagship quartet in real-time WebGL2
              coachwork finishes, inspect carbon-ceramic assemblies, and test live CFD wind-tunnel downforce up to{' '}
              {activeCar.specs.topSpeedKmh} km/h.
            </p>
            <div className="hero-cta-row">
              <button
                type="button"
                className="cta-solid"
                onClick={() => studioSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                <span>Enter 360° Observatory</span>
                <ArrowDownRight size={15} />
              </button>
              <button type="button" className="cta-ghost" onClick={toggleHeroIgnition}>
                <Volume2 size={14} />
                <span>{heroAudioOn ? 'Silence Engine' : `Ignite ${activeCar.name}`}</span>
              </button>
            </div>
          </div>

          <div className="hero-telemetry-rail" aria-label="Key Performance Telemetry">
            <div className="hero-stat">
              <div className="hero-stat-label">Peak Output</div>
              <div className="hero-stat-value">
                {activeCar.specs.powerPS.toLocaleString()}
                <span>PS</span>
              </div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-label">Peak Torque</div>
              <div className="hero-stat-value">
                {activeCar.specs.torqueNm.toLocaleString()}
                <span>Nm</span>
              </div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-label">0–100 km/h</div>
              <div className="hero-stat-value">{activeCar.specs.zeroToHundred}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-label">Vmax Velocity</div>
              <div className="hero-stat-value">
                {activeCar.specs.topSpeedKmh}
                <span>km/h</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 01: INTERACTIVE 360° STUDIO & WIND TUNNEL OBSERVATORY */}
      <section id="observatory" ref={studioSectionRef} className="atelier-section">
        <div className="section-header-row">
          <div>
            <div className="section-kicker">
              <Compass size={13} />
              <span>01 // 360° STUDIO OBSERVATORY</span>
            </div>
            <h2 className="section-heading">
              Inspect every surface, <em>airflow &amp; finish</em>.
            </h2>
          </div>
          <p className="section-subcopy">
            Drag to rotate inside the dark obsidian studio, apply bespoke Q metallic paint coats in real time, or enter
            the Three.js wind-tunnel to examine underfloor Venturi aerodynamics.
          </p>
        </div>

        <div className="studio-shell">
          {/* Left Main Interactive Stage */}
          <div className="studio-stage-column">
            <div className="studio-topbar">
              <div className="model-selector-tabs" role="tablist" aria-label="Select Aston Martin Model">
                {ASTON_CARS.map((car) => (
                  <button
                    key={car.id}
                    type="button"
                    role="tab"
                    aria-selected={car.id === activeCar.id}
                    className={`model-tab ${car.id === activeCar.id ? 'active' : ''}`}
                    onClick={() => selectCar(car, false)}
                  >
                    <span className="model-tab-code">{car.isClosed360 ? '360° ORBIT' : '180° + 3D'}</span>
                    <span className="model-tab-name">{car.name}</span>
                  </button>
                ))}
              </div>

              <div className="studio-mode-switch" role="tablist" aria-label="Inspection Mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioMode === 'studio'}
                  className={`mode-btn ${studioMode === 'studio' ? 'active' : ''}`}
                  onClick={() => setStudioMode('studio')}
                >
                  <Box size={12} />
                  <span>Studio Orbit</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioMode === 'aero'}
                  className={`mode-btn ${studioMode === 'aero' ? 'active' : ''}`}
                  onClick={() => setStudioMode('aero')}
                >
                  <Wind size={12} />
                  <span>360° 3D Aero</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioMode === 'cabin'}
                  className={`mode-btn ${studioMode === 'cabin' ? 'active' : ''}`}
                  onClick={() => setStudioMode('cabin')}
                >
                  <Layers size={12} />
                  <span>Saddlery &amp; Chassis</span>
                </button>
              </div>
            </div>

            {studioMode === 'studio' && (
              <Turntable360Stage
                car={activeCar}
                paint={activePaint}
                azimuth={azimuth}
                onAzimuthChange={setAzimuth}
                selectedHotspot={selectedHotspot}
                onSelectHotspot={setSelectedHotspot}
                onSwitchTo3DAero={() => setStudioMode('aero')}
              />
            )}

            {studioMode === 'aero' && (
              <AeroWindTunnel3D car={activeCar} paint={activePaint} caliper={activeCaliper} />
            )}

            {studioMode === 'cabin' && <ChassisCabinLab car={activeCar} cabinTrim={activeCabinTrim} />}
          </div>

          {/* Right Bespoke Q Configurator & Telemetry Rail */}
          <aside className="studio-inspector">
            <div className="inspector-header">
              <div className="inspector-category">{activeCar.category}</div>
              <h3 className="inspector-car-name">{activeCar.name}</h3>
              <p className="inspector-car-sub">{activeCar.subtitle}</p>
            </div>

            {/* Q Exterior Coachwork Shader */}
            <div className="inspector-block">
              <div className="inspector-block-title">
                <span>Q Coachwork Finish</span>
                <span>{activePaint.name}</span>
              </div>
              <div className="paint-swatch-grid">
                {Q_PAINT_FINISHES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`paint-swatch ${p.id === activePaint.id ? 'active' : ''}`}
                    style={{
                      background: `radial-gradient(circle at 30% 30%, ${p.hex}, #090b0a 140%)`,
                    }}
                    onClick={() => setPaintId(p.id)}
                    title={p.name}
                    aria-label={`Select paint ${p.name}`}
                  />
                ))}
              </div>
              <p className="paint-desc">{activePaint.description}</p>
            </div>

            {/* Caliper & Saddlery */}
            <div className="inspector-block">
              <div className="inspector-block-title">
                <span>Caliper Anodizing</span>
                <span>{activeCaliper.name}</span>
              </div>
              <div className="caliper-row" style={{ marginBottom: 14 }}>
                {Q_CALIPER_FINISHES.map((cal) => (
                  <button
                    key={cal.id}
                    type="button"
                    className={`caliper-chip ${cal.id === activeCaliper.id ? 'active' : ''}`}
                    onClick={() => setCaliperId(cal.id)}
                    title={cal.name}
                  >
                    <span className="caliper-dot" style={{ background: cal.hex }} />
                    <span>{cal.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              <div className="inspector-block-title" style={{ marginTop: 10 }}>
                <span>Cabin Hide</span>
                <span>{activeCabinTrim.name.split('+')[0].trim()}</span>
              </div>
              <div className="caliper-row">
                {Q_CABIN_TRIMS.map((trim) => (
                  <button
                    key={trim.id}
                    type="button"
                    className={`caliper-chip ${trim.id === activeCabinTrim.id ? 'active' : ''}`}
                    onClick={() => setCabinTrimId(trim.id)}
                  >
                    <span
                      className="caliper-dot"
                      style={{ background: trim.primaryHex, border: `1.5px solid ${trim.stitchHex}` }}
                    />
                    <span>{trim.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Key Specifications */}
            <div className="inspector-block">
              <div className="inspector-block-title">
                <span>Homologation Data</span>
                <span>{activeCar.specs.wheelbaseMm} mm WB</span>
              </div>
              <div className="spec-kv-list">
                <div className="spec-kv-row">
                  <span className="spec-k">Output</span>
                  <span className="spec-v">{activeCar.specs.powerLabel}</span>
                </div>
                <div className="spec-kv-row">
                  <span className="spec-k">Torque</span>
                  <span className="spec-v">{activeCar.specs.torqueLabel}</span>
                </div>
                <div className="spec-kv-row">
                  <span className="spec-k">Redline</span>
                  <span className="spec-v">{activeCar.specs.redlineRpm.toLocaleString()} rpm</span>
                </div>
                <div className="spec-kv-row">
                  <span className="spec-k">Mass</span>
                  <span className="spec-v">{activeCar.specs.weightLabel}</span>
                </div>
                <div className="spec-kv-row">
                  <span className="spec-k">Braking</span>
                  <span className="spec-v">{activeCar.specs.brakes}</span>
                </div>
              </div>
            </div>

            <div className="inspector-actions">
              <button type="button" className="cta-solid" style={{ justifyContent: 'center' }} onClick={() => setDossierOpen(true)}>
                <FileText size={14} />
                <span>Compile Q Specification</span>
              </button>
            </div>
          </aside>
        </div>
      </section>

      {/* SECTION 02: THE ROYAL QUARTET LINEUP */}
      <section id="lineup" className="atelier-section">
        <div className="section-header-row">
          <div>
            <div className="section-kicker">
              <span>02 // THE LINEAGE</span>
            </div>
            <h2 className="section-heading">
              Four architectures. <em>One obsession.</em>
            </h2>
          </div>
          <p className="section-subcopy">
            Select any model below to load its studio turntable, active CFD aerodynamics, and mechanical telemetry into
            the Gaydon Observatory.
          </p>
        </div>

        <div className="lineup-grid">
          {ASTON_CARS.map((car) => (
            <article
              key={car.id}
              className={`lineup-card ${car.id === activeCar.id ? 'selected' : ''}`}
              onClick={() => selectCar(car, true)}
            >
              <div className="lineup-media">
                <img src={car.heroImage} alt={`Aston Martin ${car.name}`} loading="lazy" />
                <div className="lineup-badge-row">
                  <span className="lineup-tag">{car.category}</span>
                  <span className="lineup-360-pill">
                    {car.isClosed360 ? '360° Studio + 3D Aero' : 'Studio Arc + 360° 3D'}
                  </span>
                </div>
              </div>

              <div className="lineup-body">
                <div className="lineup-title-row">
                  <h3 className="lineup-name">{car.name}</h3>
                  <span className="lineup-power">{car.specs.powerPS.toLocaleString()} PS</span>
                </div>
                <p className="lineup-tagline">{car.tagline}</p>

                <div className="lineup-metrics">
                  <div>
                    <div className="lineup-metric-k">0–100 km/h</div>
                    <div className="lineup-metric-v">{car.specs.zeroToHundred}</div>
                  </div>
                  <div>
                    <div className="lineup-metric-k">Top Speed</div>
                    <div className="lineup-metric-v">{car.specs.topSpeedKmh} km/h</div>
                  </div>
                  <div>
                    <div className="lineup-metric-k">Peak Downforce</div>
                    <div className="lineup-metric-v">{car.aero.maxDownforceKg} kg</div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* SECTION 03: DYNO & ACOUSTIC TELEMETRY LAB */}
      <section id="telemetry" className="atelier-section">
        <div className="section-header-row">
          <div>
            <div className="section-kicker">
              <span>03 // POWERTRAIN TELEMETRY &amp; ACOUSTICS</span>
            </div>
            <h2 className="section-heading">
              11,100 RPM harmonic <em>precision</em>.
            </h2>
          </div>
          <p className="section-subcopy">
            Compare torque plateaus and horsepower delivery across Aston Martin engines, or fire up the Web Audio
            firing-order synthesizer.
          </p>
        </div>

        <DynoTelemetryLab activeCar={activeCar} />
      </section>

      {/* SECTION 04: COMPLETE ENGINEERING MATRIX */}
      <section id="matrix" className="atelier-section">
        <div className="section-header-row">
          <div>
            <div className="section-kicker">
              <span>04 // HOMOLOGATION ARCHIVE</span>
            </div>
            <h2 className="section-heading">
              Technical specification <em>matrix</em>.
            </h2>
          </div>
          <p className="section-subcopy">
            Click any row in the homologation archive to inspect that chassis inside the 360° Observatory above.
          </p>
        </div>

        <div className="matrix-scroll">
          <table className="spec-matrix">
            <thead>
              <tr>
                <th>Model</th>
                <th>Powertrain</th>
                <th>Output</th>
                <th>Torque</th>
                <th>0–100 km/h</th>
                <th>Vmax</th>
                <th>Mass</th>
                <th>Brakes</th>
              </tr>
            </thead>
            <tbody>
              {ASTON_CARS.map((car) => (
                <tr
                  key={car.id}
                  className={car.id === activeCar.id ? 'highlight-row' : ''}
                  onClick={() => selectCar(car, true)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="model-cell">{car.name}</td>
                  <td>{car.specs.engine}</td>
                  <td>{car.specs.powerPS.toLocaleString()} PS</td>
                  <td>{car.specs.torqueNm.toLocaleString()} Nm</td>
                  <td>{car.specs.zeroToHundred}</td>
                  <td>{car.specs.topSpeedKmh} km/h</td>
                  <td>{car.specs.weightKg.toLocaleString()} kg</td>
                  <td>{car.specs.brakes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="atelier-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AstonCrest width={56} />
          <span>Aston Martin // Gaydon Engineering Showcase</span>
        </div>
        <span>Interactive WebGL2 Studio · Three.js CFD Observatory · Web Audio Acoustics</span>
      </footer>

      <CommissionModal
        open={dossierOpen}
        onClose={() => setDossierOpen(false)}
        car={activeCar}
        paint={activePaint}
        caliper={activeCaliper}
        cabinTrim={activeCabinTrim}
      />
    </div>
  );
}

export default App;
