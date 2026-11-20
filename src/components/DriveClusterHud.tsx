import React, { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  Camera,
  Flag,
  Flame,
  Gamepad2,
  Gauge,
  Ghost,
  LifeBuoy,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type { AstonCar } from '../data/cars';
import type { DrivePhysicsProfile } from '../data/engineeringData';
import { DRIVE_MODES, type DriveCameraMode, type DriveGame, type DriveHudState } from '../game/driveGame';
import { formatLapTime, type SectorColour } from '../game/raceSession';

export type { DriveCameraMode, DriveModeName } from '../game/driveGame';

/**
 * Subscribes to the game's HUD store with a selector, so a component only re-renders when the
 * slice it shows actually changes (the store publishes ~20×/s while driving).
 */
export function useDriveHud<T>(game: DriveGame | null, select: (s: DriveHudState) => T, equal: (a: T, b: T) => boolean = Object.is): T | null {
  const cache = useRef<{ src: DriveHudState | null; val: T | null }>({ src: null, val: null });
  const subscribe = useCallback((cb: () => void) => (game ? game.hud.subscribe(cb) : () => undefined), [game]);
  const getSnapshot = useCallback(() => {
    if (!game) return null;
    const src = game.hud.getSnapshot();
    if (cache.current.src === src) return cache.current.val;
    const val = select(src);
    if (cache.current.val !== null && equal(cache.current.val, val)) {
      cache.current.src = src;
      return cache.current.val;
    }
    cache.current = { src, val };
    return val;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

const shallowEqual = <T extends object>(a: T, b: T) => {
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
};

const MODE_HINTS: Record<string, string> = {
  GT: 'GT – softest suspension, full stability and traction control',
  SPORT: 'SPORT – balanced: assists catch slides early',
  'SPORT+': 'SPORT+ – lighter assists: handbrake drifts allowed, traction control on the limit',
  TRACK: 'TRACK – assists off: feed the throttle in or the rear will step out',
};

const boostLabel = (car: AstonCar) => (car.id === 'valkyrie' ? 'KERS' : car.id === 'valhalla' ? 'E-BOOST' : 'OVERBOOST');

/* ------------------------------------------------------------------------------------------------
 * Instrument cluster (bottom of the viewport)
 * ---------------------------------------------------------------------------------------------- */

export const DriveClusterOverlay: React.FC<{ game: DriveGame | null; car: AstonCar; physics: DrivePhysicsProfile }> = ({ game, car, physics }) => {
  const hud = useDriveHud(game, (s) => s);
  if (!hud) return null;
  const t = hud.telemetry;
  const rpmRatio = Math.max(0, Math.min(1, t.rpm / physics.redlineRpm));
  const arcLen = 208;
  const dashOffset = arcLen * (1 - rpmRatio);
  const redlineZone = rpmRatio > 0.88;
  const shiftLeds = 10;
  const activeLeds = Math.floor(Math.max(0, (rpmRatio - 0.55) / 0.42) * shiftLeds);
  const gX = Math.max(-18, Math.min(18, t.latG * 10));
  const gY = Math.max(-18, Math.min(18, -t.longG * 10));
  const gearLabel = t.gear < 0 ? 'R' : t.speedKmh < 1 && t.throttle < 0.05 && hud.session.phase === 'countdown' ? 'N' : String(t.gear);

  return (
    <div className="drive-cluster-overlay" aria-label="Aston Martin driving telemetry cluster">
      <div className="drive-wing-card">
        <div className="drive-wing-head">
          <span>Proving ground telemetry</span>
          <span className="drive-mode-pill">{hud.mode}</span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">0–100 km/h</span>
          <span className="drive-metric-v accent">{t.zeroTo100Sec !== null ? `${t.zeroTo100Sec.toFixed(2)} s` : `REF ${car.specs.zeroToHundred}`}</span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">0–200 km/h</span>
          <span className="drive-metric-v">{t.zeroTo200Sec !== null ? `${t.zeroTo200Sec.toFixed(2)} s` : '—'}</span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">Aero load</span>
          <span className="drive-metric-v">{t.downforceKg} kg</span>
        </div>
        <div className="drive-metric-row">
          <span className="drive-metric-k">CCM rotor</span>
          <span className="drive-metric-v" style={{ color: t.brakeTempC > 460 ? '#ff6a33' : undefined }}>
            {t.brakeTempC}°C
          </span>
        </div>
      </div>

      <div className={`drive-tacho-core ${redlineZone ? 'near-redline' : ''}`}>
        <div className="drive-shift-ladder" aria-hidden="true">
          {Array.from({ length: shiftLeds }, (_, i) => {
            const lit = i < activeLeds;
            const cls = i >= 8 ? 'led-red' : i >= 5 ? 'led-amber' : 'led-lime';
            return <span key={i} className={`shift-led ${lit ? `lit ${cls}` : ''}`} />;
          })}
        </div>
        <svg viewBox="0 0 180 120" className="drive-tacho-svg">
          <path d="M 22 104 A 72 72 0 1 1 158 104" fill="none" stroke="rgba(242,243,240,0.12)" strokeWidth="7" strokeLinecap="butt" />
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
            <span className="drive-gear-tag">{hud.manual ? 'M' : 'D'}</span>
            <span className="drive-gear-num">{gearLabel}</span>
          </div>
          <div className="drive-speed-big">{Math.round(t.speedKmh)}</div>
          <div className="drive-speed-unit">KM/H · {Math.round(t.rpm).toLocaleString()} RPM</div>
        </div>
        <div className="drive-status-lamps" aria-hidden="true">
          <span className={`status-lamp ${t.assistActive ? 'on amber' : ''}`}>ESC</span>
          <span className={`status-lamp ${t.handbrake ? 'on red' : ''}`}>(P)</span>
          <span className={`status-lamp ${t.boosting ? 'on lime' : ''}`}>{boostLabel(car)}</span>
        </div>
      </div>

      <div className="drive-wing-card">
        <div className="drive-wing-head">
          <span>Dynamics &amp; {physics.hasHybridBoost ? 'hybrid' : 'overboost'}</span>
          <span>Peak {Math.round(t.peakSpeedKmh)} km/h</span>
        </div>
        <div className="drive-dynamics-row">
          <div className="g-circle-wrap" title="Real-time longitudinal & lateral G-force">
            <div className="g-circle-ring" />
            <div className="g-circle-cross-h" />
            <div className="g-circle-cross-v" />
            <div className="g-circle-dot" style={{ transform: `translate(${gX}px, ${gY}px)` }} />
            <span className="g-circle-label">{Math.hypot(t.latG, t.longG).toFixed(2)}G</span>
          </div>
          <div className="drive-bars-col">
            <div className="drive-bar-item">
              <div className="drive-bar-lbl">
                <span>THR</span>
                <span>{Math.round(t.throttle * 100)}%</span>
              </div>
              <div className="drive-bar-track">
                <div className="drive-bar-fill thr" style={{ width: `${t.throttle * 100}%` }} />
              </div>
            </div>
            <div className="drive-bar-item">
              <div className="drive-bar-lbl">
                <span>BRK</span>
                <span>{Math.round(t.brake * 100)}%</span>
              </div>
              <div className="drive-bar-track">
                <div className="drive-bar-fill brk" style={{ width: `${t.brake * 100}%` }} />
              </div>
            </div>
            <div className="drive-bar-item">
              <div className="drive-bar-lbl">
                <span style={{ color: t.boosting ? '#c4d600' : undefined }}>{boostLabel(car)}</span>
                <span>{Math.round(t.boostPct)}%</span>
              </div>
              <div className="drive-bar-track">
                <div className="drive-bar-fill kers" style={{ width: `${t.boostPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Race HUD (lap timing, minimap, start lights, toasts, overlays)
 * ---------------------------------------------------------------------------------------------- */

const sectorClass = (c: SectorColour) => (c ? `sector-${c}` : '');

const MiniMap: React.FC<{ game: DriveGame }> = ({ game }) => {
  const track = game.track;
  const view = useMemo(() => {
    const pad = 40;
    const { minX, maxX, minZ, maxZ } = track.bounds;
    const w = maxX - minX + pad * 2;
    const h = maxZ - minZ + pad * 2;
    const pts: string[] = [];
    for (let i = 0; i < track.count; i += 3) pts.push(`${(track.px[i] - minX + pad).toFixed(1)},${(track.pz[i] - minZ + pad).toFixed(1)}`);
    const sx = track.px[0] - minX + pad;
    const sz = track.pz[0] - minZ + pad;
    return { w, h, path: pts.join(' '), sx, sz, ox: minX - pad, oz: minZ - pad };
  }, [track]);
  const pose = useDriveHud(game, (s) => ({ x: s.pose.x, z: s.pose.z, h: s.pose.heading, gx: s.ghostPose?.x ?? null, gz: s.ghostPose?.z ?? null }), shallowEqual);
  if (!pose) return null;
  const cx = pose.x - view.ox;
  const cz = pose.z - view.oz;
  const deg = (-pose.h * 180) / Math.PI;
  return (
    <div className="drive-minimap" aria-label="Circuit map">
      <svg viewBox={`0 0 ${view.w.toFixed(0)} ${view.h.toFixed(0)}`} preserveAspectRatio="xMidYMid meet">
        <polygon points={view.path} className="minimap-track-under" />
        <polygon points={view.path} className="minimap-track" />
        <line x1={view.sx - 16} y1={view.sz} x2={view.sx + 16} y2={view.sz} className="minimap-start" />
        {pose.gx !== null && pose.gz !== null && <circle cx={pose.gx - view.ox} cy={pose.gz - view.oz} r={13} className="minimap-ghost" />}
        <g transform={`translate(${cx.toFixed(1)} ${cz.toFixed(1)}) rotate(${deg.toFixed(1)})`}>
          <path d="M 0 -22 L 14 16 L 0 9 L -14 16 Z" className="minimap-car" />
        </g>
      </svg>
      <span className="minimap-label">{track.name}</span>
    </div>
  );
};

export const DriveRaceHud: React.FC<{ game: DriveGame | null; car: AstonCar; isFullscreen: boolean; onToggleFullscreen: () => void }> = ({
  game,
  car,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const hud = useDriveHud(game, (s) => s);
  if (!game || !hud) return null;
  const s = hud.session;
  const delta = s.delta;
  const goFlash = s.sinceGo !== null && s.sinceGo < 1.2;

  return (
    <div className="drive-race-layer">
      <div className="drive-race-panel">
        <div className="race-panel-top">
          <span className="race-lap">{s.lapActive ? `LAP ${s.lap}` : s.phase === 'countdown' ? 'GRID' : 'OUT LAP'}</span>
          {!s.lapValid && s.lapActive && <span className="race-invalid">INVALID</span>}
        </div>
        <div className={`race-time ${!s.lapValid && s.lapActive ? 'invalid' : ''}`}>{formatLapTime(s.lapActive ? s.lapTime : 0)}</div>
        <div className="race-row">
          <span className={`race-delta ${delta === null ? '' : delta <= 0 ? 'ahead' : 'behind'}`}>
            {delta === null ? 'Δ —' : `Δ ${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)}`}
          </span>
          <span className="race-kv">
            BEST <b>{formatLapTime(s.bestLap)}</b>
          </span>
        </div>
        <div className="race-row">
          <span className="race-kv">
            LAST <b className={s.lastLap !== null && !s.lastLapValid ? 'struck' : ''}>{formatLapTime(s.lastLap)}</b>
          </span>
          <span className="race-kv">
            IDEAL <b>{formatLapTime(s.theoreticalBest)}</b>
          </span>
        </div>
        <div className="race-sectors">
          {s.sectors.map((t, i) => (
            <span key={i} className={`race-sector ${sectorClass(s.sectorColours[i])}`}>
              <i>S{i + 1}</i>
              {t !== null ? t.toFixed(3) : '—'}
            </span>
          ))}
        </div>
        <div className="race-progress" aria-hidden="true">
          <span style={{ width: `${(s.lapActive ? s.progress : 0) * 100}%` }} />
        </div>
      </div>

      <MiniMap game={game} />

      <button type="button" className="drive-fs-btn" onClick={onToggleFullscreen} title="Fullscreen (F)" aria-label="Toggle fullscreen">
        {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>

      {s.phase === 'countdown' && !hud.loading && (
        <div className="start-lights" aria-live="polite">
          <div className="start-lights-row">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`start-light ${i < s.lightsOn ? 'lit' : ''}`} />
            ))}
          </div>
          <span className="start-lights-hint">Hold {hud.usingGamepad ? 'RT' : 'W'} for launch control</span>
        </div>
      )}
      {goFlash && <div className="start-go">GO</div>}

      <div className="race-toasts" aria-live="polite">
        {hud.toasts.map((t) => (
          <div key={t.id} className={`race-toast toast-${t.kind}`}>
            <span className="race-toast-title">{t.title}</span>
            {t.detail && <span className="race-toast-detail">{t.detail}</span>}
          </div>
        ))}
      </div>

      {s.wrongWay && <div className="race-wrong-way">WRONG WAY</div>}

      {s.driftCombo > 25 && (
        <div className="race-drift">
          DRIFT <b>{Math.round(s.driftCombo).toLocaleString()}</b>
        </div>
      )}

      {hud.loading && (
        <div className="stage-loading" role="status">
          <span className="stage-loading-label">Building {game.track.name}</span>
          <span className="stage-loading-bar" />
        </div>
      )}

      {hud.paused && (
        <div className="drive-pause-overlay">
          <div className="drive-pause-card">
            <span className="drive-pause-kicker">{car.name} · {game.track.name}</span>
            <h4>Paused</h4>
            <div className="drive-pause-actions">
              <button type="button" className="drive-chip-btn active" onClick={() => game.setPaused(false)}>
                <Play size={12} />
                <span>Resume</span>
              </button>
              <button type="button" className="drive-chip-btn" onClick={() => game.restart()}>
                <Flag size={12} />
                <span>Restart from grid</span>
              </button>
            </div>
            <span className="drive-pause-hint">P / Esc to resume</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Control deck (below the viewport): pedals for touch, paddles, modes, camera, session controls
 * ---------------------------------------------------------------------------------------------- */

export const DriveControlDeck: React.FC<{ game: DriveGame | null; car: AstonCar; physics: DrivePhysicsProfile }> = ({ game, car, physics }) => {
  const ui = useDriveHud(
    game,
    (s) => ({
      mode: s.mode,
      camera: s.camera,
      manual: s.manual,
      audioOn: s.audioOn,
      ghostEnabled: s.ghostEnabled,
      hasBest: s.hasBest,
      paused: s.paused,
      steer: Math.round(s.telemetry.steer * 4) / 4,
      throttle: s.telemetry.throttle > 0.1,
      brake: s.telemetry.brake > 0.1,
      handbrake: s.telemetry.handbrake,
      boosting: s.telemetry.boosting,
      gamepad: s.usingGamepad,
    }),
    shallowEqual
  );
  if (!game || !ui) return null;

  const hold = (control: 'throttle' | 'brake' | 'left' | 'right' | 'boost' | 'handbrake') => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      game.control(control, true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      game.control(control, false);
      e.currentTarget.blur();
    },
    onPointerCancel: () => game.control(control, false),
    onLostPointerCapture: () => game.control(control, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const click = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    fn();
    e.currentTarget.blur(); // keep Space/arrow keys for driving, not for re-clicking this button
  };

  return (
    <div className="drive-control-deck">
      <div className="drive-deck-row">
        <div className="drive-pedal-cluster">
          <button type="button" className={`drive-pedal-btn steer ${ui.steer < -0.1 ? 'active' : ''}`} {...hold('left')} title="Steer left (A / ←)">
            ◀ A
          </button>
          <button type="button" className={`drive-pedal-btn steer ${ui.steer > 0.1 ? 'active' : ''}`} {...hold('right')} title="Steer right (D / →)">
            D ▶
          </button>
          <button type="button" className={`drive-pedal-btn brake ${ui.brake ? 'active' : ''}`} {...hold('brake')} title="Brake / reverse (S / ↓)">
            <Flame size={12} />
            <span>Brake (S)</span>
          </button>
          <button type="button" className={`drive-pedal-btn throttle ${ui.throttle ? 'active' : ''}`} {...hold('throttle')} title="Throttle (W / ↑)">
            <Gauge size={12} />
            <span>Throttle (W)</span>
          </button>
          <button type="button" className={`drive-pedal-btn handbrake ${ui.handbrake ? 'active' : ''}`} {...hold('handbrake')} title="Handbrake – start a drift (Space)">
            <span>Handbrake</span>
          </button>
        </div>

        <div className="drive-paddle-cluster">
          <button type="button" className="drive-chip-btn" onClick={click(() => game.shift('down'))} title="Downshift paddle (Q)">
            − Q
          </button>
          <button type="button" className={`drive-chip-btn ${ui.manual ? 'active' : ''}`} onClick={click(() => game.toggleManual())} title="Automatic DCT / manual paddles">
            {ui.manual ? 'Manual' : 'Auto DCT'}
          </button>
          <button type="button" className="drive-chip-btn" onClick={click(() => game.shift('up'))} title="Upshift paddle (E)">
            E +
          </button>
          <button type="button" className={`drive-chip-btn kers-btn ${ui.boosting ? 'active' : ''}`} {...hold('boost')} title={`Deploy ${boostLabel(car)} (Shift)`}>
            <Zap size={12} />
            <span>{boostLabel(car)}</span>
          </button>
        </div>

        <div className="drive-meta-cluster">
          <div className="drive-cam-group" role="group" aria-label="Drive camera">
            {(['chase', 'cockpit', 'bonnet'] as DriveCameraMode[]).map((cam) => (
              <button key={cam} type="button" className={`drive-chip-btn ${ui.camera === cam ? 'active' : ''}`} onClick={click(() => game.setCameraMode(cam))}>
                <Camera size={11} />
                <span>{cam === 'chase' ? 'Chase' : cam === 'cockpit' ? 'Cockpit' : 'Bonnet'}</span>
              </button>
            ))}
          </div>
          <div className="drive-mode-group" role="group" aria-label="Drive mode">
            {physics.driveModes.filter((m) => DRIVE_MODES.includes(m)).map((m) => (
              <button
                key={m}
                type="button"
                className={`drive-chip-btn ${ui.mode === m ? 'active' : ''}`}
                onClick={click(() => game.setMode(m))}
                title={MODE_HINTS[m]}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="drive-deck-row drive-session-row">
        <div className="drive-session-cluster">
          <button type="button" className="drive-chip-btn" onClick={click(() => game.restart())} title="Back to the grid (T)">
            <RotateCcw size={12} />
            <span>Restart</span>
          </button>
          <button type="button" className="drive-chip-btn" onClick={click(() => game.respawn())} title="Recover to the track (R)">
            <LifeBuoy size={12} />
            <span>Recover</span>
          </button>
          <button type="button" className={`drive-chip-btn ${ui.paused ? 'active' : ''}`} onClick={click(() => game.setPaused(!ui.paused))} title="Pause (P / Esc)">
            {ui.paused ? <Play size={12} /> : <Pause size={12} />}
            <span>{ui.paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            type="button"
            className={`drive-chip-btn ${ui.ghostEnabled ? 'active' : ''}`}
            onClick={click(() => game.setGhostEnabled(!ui.ghostEnabled))}
            title={ui.hasBest ? 'Race your best-lap ghost (G)' : 'Set a valid lap to unlock your ghost (G)'}
          >
            <Ghost size={12} />
            <span>Ghost</span>
          </button>
          {ui.hasBest && (
            <button type="button" className="drive-chip-btn" onClick={click(() => game.clearBestLap())} title="Forget this car's best lap and ghost">
              <span>Reset best</span>
            </button>
          )}
          <button type="button" className={`drive-chip-btn ${ui.audioOn ? 'active' : ''}`} onClick={click(() => game.setAudio(!ui.audioOn))} title="Engine & effects sound">
            {ui.audioOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </button>
        </div>
        <div className="drive-kbd-hint">
          {ui.gamepad ? (
            <span>
              <Gamepad2 size={11} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              RT throttle · LT brake · stick steer · A handbrake · X {boostLabel(car)} · LB/RB paddles · Y camera · View recover · Menu pause
            </span>
          ) : (
            <span>
              W/↑ throttle · S/↓ brake &amp; reverse · A/D steer · Space handbrake · Shift {boostLabel(car)} · Q/E paddles · C camera · M mode · R
              recover · T restart · G ghost · F fullscreen · P pause
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
