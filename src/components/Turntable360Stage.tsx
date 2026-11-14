import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Crosshair, Pause, Play, RotateCcw, Sparkles, Wind, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { AstonCar, EngineeringHotspot, QPaintFinish, StudioFrame } from '../data/cars';

interface Turntable360StageProps {
  car: AstonCar;
  paint: QPaintFinish;
  azimuth: number;
  onAzimuthChange: (deg: number) => void;
  selectedHotspot: EngineeringHotspot | null;
  onSelectHotspot: (spot: EngineeringHotspot | null) => void;
  onSwitchTo3DAero: () => void;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform float u_blend;
uniform vec2 u_resolution;
uniform vec2 u_texSize;
uniform float u_zoom;
uniform vec2 u_pan;
uniform vec3 u_paintColor;
uniform float u_paintSat;
uniform float u_paintGain;
uniform float u_paintContrast;
uniform float u_isNeutral;
uniform vec2 u_lightPos;
uniform float u_lightIntensity;
out vec4 outColor;

vec2 coverUv(vec2 uv) {
  float canvasAspect = u_resolution.x / max(1.0, u_resolution.y);
  float texAspect = u_texSize.x / max(1.0, u_texSize.y);
  vec2 scale = vec2(1.0);
  if (canvasAspect > texAspect) {
    scale.y = texAspect / canvasAspect;
  } else {
    scale.x = canvasAspect / texAspect;
  }
  return (uv - 0.5) * scale / u_zoom + 0.5 + u_pan;
}

void main() {
  vec2 uv = coverUv(v_uv);
  vec3 voidCol = vec3(0.0274, 0.0353, 0.0314);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(voidCol, 1.0);
    return;
  }

  // Steep shutter curve prevents lingering double-exposure ghosting between frames
  float crispBlend = smoothstep(0.26, 0.74, u_blend);
  vec2 uvA = clamp(uv + vec2(-u_blend * 0.008, 0.0), 0.0, 1.0);
  vec2 uvB = clamp(uv + vec2((1.0 - u_blend) * 0.008, 0.0), 0.0, 1.0);

  vec3 colA = texture(u_texA, uvA).rgb;
  vec3 colB = texture(u_texB, uvB).rgb;
  vec3 col = mix(colA, colB, crispBlend);

  vec2 d = (v_uv - vec2(0.5, 0.52)) * vec2(1.08, 1.30);
  float edgeVig = 1.0 - smoothstep(0.50, 0.94, length(d));

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float maxC = max(col.r, max(col.g, col.b));
  float minC = min(col.r, min(col.g, col.b));
  float chroma = maxC - minC;

  // Strictly isolate metallic silver bodywork above dark floor/tires and below colored tail lamps
  float floorExclusion = smoothstep(0.17, 0.34, lum);
  float neutralBody = 1.0 - smoothstep(0.05, 0.145, chroma);
  float mask = floorExclusion * neutralBody;

  if (u_isNeutral < 0.5) {
    float shapedLum = pow(clamp(lum * u_paintGain, 0.0, 1.25), u_paintContrast);
    vec3 tintedBase = u_paintColor * (shapedLum * 1.52);
    float spec = pow(smoothstep(0.52, 0.97, lum), 2.2) * 0.62;
    vec3 painted = mix(tintedBase, vec3(1.0), spec);
    col = mix(col, painted, mask * u_paintSat);
  } else {
    col = mix(col, pow(col, vec3(u_paintContrast)) * u_paintGain, mask * 0.65);
  }

  // Interactive studio strip-box rim reflection sweep across bodywork
  float lightDist = length((v_uv - u_lightPos) * vec2(1.0, 1.6));
  float lightSweep = exp(-lightDist * 4.4) * u_lightIntensity * mask * smoothstep(0.24, 0.78, lum);
  col += vec3(0.95, 0.97, 0.98) * lightSweep * 0.24;

  col = mix(voidCol, col, clamp(edgeVig + 0.18, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}
`;

function hexToRgbNorm(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toSignedDeg(deg: number): number {
  const norm = ((deg % 360) + 360) % 360;
  return norm > 180 ? norm - 360 : norm;
}

function clampAzimuthForCar(deg: number, isClosed360: boolean): number {
  if (isClosed360) {
    return ((deg % 360) + 360) % 360;
  }
  const signed = Math.max(-90, Math.min(90, toSignedDeg(deg)));
  return ((signed % 360) + 360) % 360;
}

function shortestAngleDiff(from: number, to: number, isClosed360: boolean): number {
  if (!isClosed360) {
    return toSignedDeg(to) - toSignedDeg(from);
  }
  return ((to - from + 540) % 360) - 180;
}

function isAzimuthInWindow(az: number, win: [number, number]): boolean {
  const a = ((az % 360) + 360) % 360;
  const [start, end] = win;
  if (start <= end) return a >= start && a <= end;
  return a >= start || a <= end;
}

function findNearestStudioDeg(az: number, frames: StudioFrame[], isClosed360: boolean): number {
  let best = frames[0].deg;
  let bestDist = Infinity;
  for (const f of frames) {
    const d = Math.abs(shortestAngleDiff(az, f.deg, isClosed360));
    if (d < bestDist) {
      bestDist = d;
      best = f.deg;
    }
  }
  return best;
}

function findSurroundingFrames(
  az: number,
  frames: StudioFrame[],
  isClosed360: boolean
): { frameA: StudioFrame; frameB: StudioFrame; blend: number } {
  if (frames.length === 1) {
    return { frameA: frames[0], frameB: frames[0], blend: 0 };
  }

  if (isClosed360) {
    const a = ((az % 360) + 360) % 360;
    const sorted = [...frames].sort((x, y) => x.deg - y.deg);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (a >= sorted[i].deg && a < sorted[i + 1].deg) {
        const span = Math.max(1, sorted[i + 1].deg - sorted[i].deg);
        return { frameA: sorted[i], frameB: sorted[i + 1], blend: (a - sorted[i].deg) / span };
      }
    }
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const span = 360 - last.deg + first.deg;
    const dist = a >= last.deg ? a - last.deg : 360 - last.deg + a;
    return { frameA: last, frameB: first, blend: Math.max(0, Math.min(1, dist / Math.max(1, span))) };
  }

  const s = Math.max(-90, Math.min(90, toSignedDeg(az)));
  const sortedSigned = [...frames].sort((x, y) => toSignedDeg(x.deg) - toSignedDeg(y.deg));
  for (let i = 0; i < sortedSigned.length - 1; i++) {
    const aDeg = toSignedDeg(sortedSigned[i].deg);
    const bDeg = toSignedDeg(sortedSigned[i + 1].deg);
    if (s >= aDeg && s <= bDeg) {
      const span = Math.max(1, bDeg - aDeg);
      return { frameA: sortedSigned[i], frameB: sortedSigned[i + 1], blend: (s - aDeg) / span };
    }
  }
  const edge = s < 0 ? sortedSigned[0] : sortedSigned[sortedSigned.length - 1];
  return { frameA: edge, frameB: edge, blend: 0 };
}

export const Turntable360Stage: React.FC<Turntable360StageProps> = ({
  car,
  paint,
  azimuth,
  onAzimuthChange,
  selectedHotspot,
  onSelectHotspot,
  onSwitchTo3DAero,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const texturesRef = useRef<Map<string, WebGLTexture>>(new Map());
  const readyCountRef = useRef(0);

  const [loadedPct, setLoadedPct] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [showHotspots, setShowHotspots] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [lightPos, setLightPos] = useState<[number, number]>([0.52, 0.28]);

  const azRef = useRef(azimuth);
  const targetAzRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const autoDirRef = useRef(1);
  const draggingRef = useRef(false);
  const lastClientXRef = useRef(0);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const paintRef = useRef(paint);
  const lightRef = useRef(lightPos);
  const carRef = useRef(car);

  useEffect(() => {
    azRef.current = azimuth;
  }, [azimuth]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    paintRef.current = paint;
  }, [paint]);
  useEffect(() => {
    lightRef.current = lightPos;
  }, [lightPos]);
  useEffect(() => {
    carRef.current = car;
    setZoom(1);
    setPan([0, 0]);
    targetAzRef.current = null;
    velocityRef.current = 0;
  }, [car]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
    if (!gl) return;
    glRef.current = gl;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    progRef.current = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    return () => {
      texturesRef.current.forEach((tex) => gl.deleteTexture(tex));
      texturesRef.current.clear();
      gl.deleteProgram(prog);
    };
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    let cancelled = false;
    readyCountRef.current = 0;
    setLoadedPct(0);

    car.studioFrames.forEach((frame) => {
      if (texturesRef.current.has(frame.src)) {
        readyCountRef.current += 1;
        setLoadedPct(Math.round((readyCountRef.current / car.studioFrames.length) * 100));
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled || !glRef.current) return;
        const tex = glRef.current.createTexture();
        if (!tex) return;
        glRef.current.bindTexture(glRef.current.TEXTURE_2D, tex);
        glRef.current.texParameteri(glRef.current.TEXTURE_2D, glRef.current.TEXTURE_WRAP_S, glRef.current.CLAMP_TO_EDGE);
        glRef.current.texParameteri(glRef.current.TEXTURE_2D, glRef.current.TEXTURE_WRAP_T, glRef.current.CLAMP_TO_EDGE);
        glRef.current.texParameteri(glRef.current.TEXTURE_2D, glRef.current.TEXTURE_MIN_FILTER, glRef.current.LINEAR);
        glRef.current.texParameteri(glRef.current.TEXTURE_2D, glRef.current.TEXTURE_MAG_FILTER, glRef.current.LINEAR);
        glRef.current.texImage2D(glRef.current.TEXTURE_2D, 0, glRef.current.RGBA, glRef.current.RGBA, glRef.current.UNSIGNED_BYTE, img);
        texturesRef.current.set(frame.src, tex);
        readyCountRef.current += 1;
        setLoadedPct(Math.round((readyCountRef.current / car.studioFrames.length) * 100));
      };
      img.src = frame.src;
    });

    return () => {
      cancelled = true;
    };
  }, [car]);

  useEffect(() => {
    let rafId = 0;
    let lastReportTime = 0;

    const tick = (now: number) => {
      const c = carRef.current;
      if (!draggingRef.current) {
        if (targetAzRef.current !== null) {
          const diff = shortestAngleDiff(azRef.current, targetAzRef.current, c.isClosed360);
          if (Math.abs(diff) < 0.25) {
            azRef.current = clampAzimuthForCar(targetAzRef.current, c.isClosed360);
            targetAzRef.current = null;
          } else {
            azRef.current = clampAzimuthForCar(azRef.current + diff * 0.16, c.isClosed360);
          }
          onAzimuthChange(azRef.current);
        } else if (Math.abs(velocityRef.current) > 0.28) {
          azRef.current = clampAzimuthForCar(azRef.current + velocityRef.current, c.isClosed360);
          velocityRef.current *= 0.89;
          if (now - lastReportTime > 24) {
            lastReportTime = now;
            onAzimuthChange(azRef.current);
          }
        } else if (Math.abs(velocityRef.current) > 0) {
          // Magnetic snap to closest razor-sharp studio frame once inertia decays
          velocityRef.current = 0;
          targetAzRef.current = findNearestStudioDeg(azRef.current, c.studioFrames, c.isClosed360);
        } else if (autoOrbit) {
          if (c.isClosed360) {
            azRef.current = (azRef.current + 0.42) % 360;
          } else {
            let signed = toSignedDeg(azRef.current) + 0.42 * autoDirRef.current;
            if (signed >= 90) {
              signed = 90;
              autoDirRef.current = -1;
            } else if (signed <= -90) {
              signed = -90;
              autoDirRef.current = 1;
            }
            azRef.current = ((signed % 360) + 360) % 360;
          }
          if (now - lastReportTime > 32) {
            lastReportTime = now;
            onAzimuthChange(azRef.current);
          }
        }
      }

      const canvas = canvasRef.current;
      const gl = glRef.current;
      const prog = progRef.current;
      if (canvas && gl && prog) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.floor(canvas.clientWidth * dpr);
        const h = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        gl.clearColor(0.027, 0.035, 0.031, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const { frameA, frameB, blend } = findSurroundingFrames(azRef.current, c.studioFrames, c.isClosed360);
        const texA = texturesRef.current.get(frameA.src) || texturesRef.current.get(c.heroImage);
        const texB = texturesRef.current.get(frameB.src) || texA;

        if (texA && texB) {
          gl.useProgram(prog);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texA);
          gl.uniform1i(gl.getUniformLocation(prog, 'u_texA'), 0);

          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, texB);
          gl.uniform1i(gl.getUniformLocation(prog, 'u_texB'), 1);

          gl.uniform1f(gl.getUniformLocation(prog, 'u_blend'), texA === texB ? 0 : blend);
          gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), w, h);
          gl.uniform2f(gl.getUniformLocation(prog, 'u_texSize'), 1376, 768);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_zoom'), zoomRef.current);
          gl.uniform2f(gl.getUniformLocation(prog, 'u_pan'), panRef.current[0], panRef.current[1]);

          const p = paintRef.current;
          const [r, g, b] = hexToRgbNorm(p.hex);
          gl.uniform3f(gl.getUniformLocation(prog, 'u_paintColor'), r, g, b);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_paintSat'), p.sat);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_paintGain'), p.valueGain);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_paintContrast'), p.contrast);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_isNeutral'), p.isNeutral ? 1.0 : 0.0);
          gl.uniform2f(gl.getUniformLocation(prog, 'u_lightPos'), lightRef.current[0], lightRef.current[1]);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_lightIntensity'), 0.72);

          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [autoOrbit, onAzimuthChange]);

  const snapToAzimuth = useCallback((deg: number) => {
    setAutoOrbit(false);
    velocityRef.current = 0;
    targetAzRef.current = deg;
  }, []);

  const stepFrame = useCallback((dir: 1 | -1) => {
    const c = carRef.current;
    const ordered = c.isClosed360
      ? [...c.studioFrames].sort((a, b) => a.deg - b.deg)
      : [...c.studioFrames].sort((a, b) => toSignedDeg(a.deg) - toSignedDeg(b.deg));
    const nearest = findNearestStudioDeg(azRef.current, ordered, c.isClosed360);
    const curIdx = ordered.findIndex((f) => f.deg === nearest);
    if (curIdx === -1) return;
    const nextIdx = c.isClosed360
      ? (curIdx + dir + ordered.length) % ordered.length
      : Math.max(0, Math.min(ordered.length - 1, curIdx + dir));
    snapToAzimuth(ordered[nextIdx].deg);
  }, [snapToAzimuth]);

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    targetAzRef.current = null;
    velocityRef.current = 0;
    lastClientXRef.current = e.clientX;
    setAutoOrbit(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setLightPos([(e.clientX - rect.left) / Math.max(1, rect.width), (e.clientY - rect.top) / Math.max(1, rect.height)]);

    if (!draggingRef.current) return;
    const dx = e.clientX - lastClientXRef.current;
    lastClientXRef.current = e.clientX;
    const deltaDeg = -dx * 0.36;
    velocityRef.current = deltaDeg;
    azRef.current = clampAzimuthForCar(azRef.current + deltaDeg, carRef.current.isClosed360);
    onAzimuthChange(azRef.current);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    if (Math.abs(velocityRef.current) <= 0.28) {
      velocityRef.current = 0;
      targetAzRef.current = findNearestStudioDeg(azRef.current, carRef.current.studioFrames, carRef.current.isClosed360);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepFrame(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepFrame(-1);
    }
  };

  const handleHotspotClick = (spot: EngineeringHotspot) => {
    onSelectHotspot(spot);
    snapToAzimuth(spot.azimuth);
    setZoom(1.18);
    setPan([(spot.xPct - 50) * 0.0018, (spot.yPct - 50) * 0.0014]);
  };

  const resetCamera = () => {
    onSelectHotspot(null);
    setZoom(1);
    setPan([0, 0]);
    snapToAzimuth(car.defaultAzimuth);
  };

  const visibleHotspots = showHotspots
    ? car.hotspots.filter((h) => isAzimuthInWindow(azimuth, h.azimuthWindow))
    : [];

  return (
    <>
      <div
        className="studio-viewport"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerMove={handlePointerMove}
        aria-label={`Interactive studio turntable for Aston Martin ${car.name}`}
      >
        <canvas
          ref={canvasRef}
          className="studio-canvas"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        <div className="hud-top-bar">
          <div className="hud-top-left">
            <div className="hud-badge">
              <span className="hud-dot" />
              <span>
                {car.isClosed360 ? '360° STUDIO ORBIT' : '180° FRONT STUDIO ARC'} // {car.chassisCode}{' '}
                {loadedPct < 100 ? `(${loadedPct}%)` : ''}
              </span>
            </div>
          </div>

          <div className="hud-top-right">
            <button
              type="button"
              className={`hud-tool-btn ${autoOrbit ? 'active' : ''}`}
              onClick={() => setAutoOrbit((v) => !v)}
            >
              {autoOrbit ? <Pause size={12} /> : <Play size={12} />}
              <span>{autoOrbit ? 'Orbiting' : 'Auto Orbit'}</span>
            </button>
            <button
              type="button"
              className={`hud-tool-btn ${showHotspots ? 'active' : ''}`}
              onClick={() => setShowHotspots((v) => !v)}
            >
              <Crosshair size={12} />
              <span>Hotspots</span>
            </button>
            <button
              type="button"
              className="hud-tool-btn"
              onClick={() => setZoom((z) => Math.min(1.45, +(z + 0.14).toFixed(2)))}
              aria-label="Zoom in"
            >
              <ZoomIn size={12} />
            </button>
            <button
              type="button"
              className="hud-tool-btn"
              onClick={() => {
                setZoom((z) => {
                  const next = Math.max(1, +(z - 0.14).toFixed(2));
                  if (next <= 1.05) setPan([0, 0]);
                  return next;
                });
              }}
              aria-label="Zoom out"
            >
              <ZoomOut size={12} />
            </button>
            <button type="button" className="hud-tool-btn" onClick={resetCamera} aria-label="Reset camera">
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        {!selectedHotspot &&
          visibleHotspots.map((spot) => {
            const offsetAz = shortestAngleDiff(spot.azimuth, azimuth, car.isClosed360);
            const dynamicX = Math.max(14, Math.min(86, spot.xPct - offsetAz * 0.32));
            return (
              <button
                key={spot.id}
                type="button"
                className="hotspot-pin"
                style={{ left: `${dynamicX}%`, top: `${spot.yPct}%` }}
                onClick={() => handleHotspotClick(spot)}
              >
                <span className="hotspot-pulse" />
                <span className="hotspot-pin-label">{spot.code}</span>
              </button>
            );
          })}

        {selectedHotspot && (
          <div className="hotspot-card-overlay">
            <div className="hotspot-card-head">
              <span className="hotspot-card-code">
                {selectedHotspot.code} — {selectedHotspot.subsystem}
              </span>
              <button
                type="button"
                className="hotspot-close"
                onClick={() => {
                  onSelectHotspot(null);
                  setZoom(1);
                  setPan([0, 0]);
                }}
                aria-label="Close hotspot detail"
              >
                <X size={15} />
              </button>
            </div>
            <h4 className="hotspot-card-title">{selectedHotspot.title}</h4>
            <div className="hotspot-card-metric">{selectedHotspot.metric}</div>
            <p className="hotspot-card-desc">{selectedHotspot.description}</p>
          </div>
        )}
      </div>

      <div className="compass-bar">
        <div className="azimuth-readout">
          <span className="azimuth-deg">{String(Math.round(azimuth) % 360).padStart(3, '0')}°</span>
          <span className="azimuth-label">{car.isClosed360 ? '360° Azimuth' : 'Studio Arc'}</span>
        </div>

        <div className="compass-track" role="tablist" aria-label="Studio angle presets">
          {car.studioFrames.map((frame) => {
            const dist = Math.abs(shortestAngleDiff(azimuth, frame.deg, car.isClosed360));
            const isNear = dist < 22;
            return (
              <button
                key={frame.deg}
                type="button"
                className={`compass-stop-btn ${isNear ? 'active' : ''}`}
                onClick={() => snapToAzimuth(frame.deg)}
              >
                <span className="compass-stop-deg">{String(frame.deg).padStart(3, '0')}°</span>
                <span className="compass-stop-name">{frame.label}</span>
              </button>
            );
          })}
          {!car.isClosed360 && (
            <button
              type="button"
              className="compass-stop-btn"
              onClick={onSwitchTo3DAero}
              style={{ borderColor: 'rgba(196, 214, 0, 0.32)', color: '#c4d600' }}
            >
              <span className="compass-stop-deg">360° 3D</span>
              <span className="compass-stop-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Wind size={9} /> Full Rear
              </span>
            </button>
          )}
        </div>

        <div className="compass-controls">
          <span className="azimuth-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={11} color="#c8a96e" /> Drag or ← →
          </span>
        </div>
      </div>
    </>
  );
};
