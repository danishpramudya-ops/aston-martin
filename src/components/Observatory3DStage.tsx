import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  DoorOpen,
  Flame,
  Layers,
  Pause,
  Play,
  RotateCcw,
  SunMoon,
  Wind,
} from 'lucide-react';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import { buildAstonCar3D, type Car3DInstance } from '../three/buildCar3D';
import { getCameraPovsForCar, type CameraPovId, type CameraPovSpec } from '../three/cameraPovs';
import { evaluateLowerCoachwork, type Car3DBlueprint } from '../three/carProfiles';
import { createStudioEnvironment } from '../three/textures';

interface Observatory3DStageProps {
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  cabinTrim: QCabinTrim;
  mode: 'studio' | 'aero';
  povRequest: { id: CameraPovId; seq: number } | null;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 256, 36, 128, 256, 126);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.94)');
  g.addColorStop(0.65, 'rgba(0, 0, 0, 0.58)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function evalStreamY(
  x: number,
  baseY: number,
  z: number,
  bp: Car3DBlueprint,
  speedNorm: number
): { y: number; xOut: number; energy: number } {
  const u = (z + bp.L * 0.5) / bp.L;
  let y = baseY;
  let xOut = x;
  let energy = 0;

  if (u >= -0.06 && u <= 1.12) {
    const cu = Math.max(0, Math.min(1, u));
    const env = evaluateLowerCoachwork(bp, cu);
    const canopyBoost =
      u > 0.25 && u < 0.72
        ? Math.sin(((u - 0.25) / 0.47) * Math.PI) * (bp.H - env.deckY)
        : 0;
    const ceilingY = env.deckY + Math.max(0, canopyBoost);

    if (Math.abs(xOut) < env.halfW * 1.06) {
      if (baseY < 0.24) {
        y = Math.max(0.032, env.sillY * 0.58);
        energy = 0.85 * speedNorm;
      } else if (y < ceilingY + 0.14) {
        const lift = (ceilingY + 0.14 - y) * 0.9;
        y += lift;
        xOut *= 1 + lift * 0.1;
        energy = Math.min(1, lift * 1.45 * speedNorm);
      }
    }
    if (u > 0.9 && baseY < 0.34) {
      y += (u - 0.9) * 1.15;
      energy = 1.0 * speedNorm;
    }
  }
  return { y, xOut, energy };
}

export const Observatory3DStage: React.FC<Observatory3DStageProps> = ({
  car,
  paint,
  caliper,
  cabinTrim,
  mode,
  povRequest,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [activePovId, setActivePovId] = useState<CameraPovId>('hero-34');
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [nightLights, setNightLights] = useState(false);
  const [xrayMode, setXrayMode] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(260);
  const [brakeStress, setBrakeStress] = useState(false);

  const car3dRef = useRef<Car3DInstance | null>(null);
  const povsRef = useRef<CameraPovSpec[]>([]);
  const activePovRef = useRef<CameraPovSpec | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const flyStateRef = useRef<{
    active: boolean;
    t: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    fromFov: number;
    toSpec: CameraPovSpec | null;
  }>({
    active: false,
    t: 1,
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    fromFov: 35,
    toSpec: null,
  });

  const modeRef = useRef(mode);
  const autoOrbitRef = useRef(autoOrbit);
  const speedRef = useRef(speedKmh);
  const brakeStressRef = useRef(brakeStress);

  useEffect(() => {
    modeRef.current = mode;
    if (car3dRef.current) {
      car3dRef.current.setActiveAero(mode === 'aero' ? speedRef.current : 0);
      car3dRef.current.setBrakeThermal(mode === 'aero' && brakeStressRef.current ? 0.5 + (speedRef.current / 360) * 1.6 : 0);
    }
  }, [mode]);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    speedRef.current = speedKmh;
    if (car3dRef.current && modeRef.current === 'aero') {
      car3dRef.current.setActiveAero(speedKmh);
      car3dRef.current.setBrakeThermal(brakeStressRef.current ? 0.5 + (speedKmh / 360) * 1.6 : 0);
    }
  }, [speedKmh]);

  useEffect(() => {
    brakeStressRef.current = brakeStress;
    if (car3dRef.current && modeRef.current === 'aero') {
      car3dRef.current.setBrakeThermal(brakeStress ? 0.5 + (speedRef.current / 360) * 1.6 : 0);
    }
  }, [brakeStress]);

  // Helper to initiate silky POV flythrough
  const triggerPovFlight = (povId: CameraPovId) => {
    const spec = povsRef.current.find((p) => p.id === povId) || povsRef.current[0];
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!spec || !cam || !ctrls) return;

    setActivePovId(spec.id);
    activePovRef.current = spec;

    if (spec.zone === 'interior') {
      setAutoOrbit(false);
    } else {
      car3dRef.current?.setInteriorMode(false);
    }
    if (spec.autoOpenDoors) {
      setDoorsOpen(true);
    } else {
      setDoorsOpen(false);
    }

    // Relax OrbitControls constraints during inter-zone camera flight
    ctrls.minDistance = 0.04;
    ctrls.maxDistance = 12.0;
    ctrls.minPolarAngle = 0.05;
    ctrls.maxPolarAngle = Math.PI * 0.92;

    flyStateRef.current = {
      active: true,
      t: 0,
      fromPos: cam.position.clone(),
      fromTarget: ctrls.target.clone(),
      fromFov: cam.fov,
      toSpec: spec,
    };
  };

  // Respond cleanly when external components request a specific POV
  useEffect(() => {
    if (povRequest) {
      triggerPovFlight(povRequest.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [povRequest]);

  // Sync Aero switch back outside if inside cockpit
  useEffect(() => {
    if (mode === 'aero') {
      const cur = activePovRef.current;
      if (!cur || cur.zone === 'interior') {
        triggerPovFlight('hero-34');
      }
      setDoorsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Live sync Q materials, doors, lights, X-Ray without rebuilding car geometry
  useEffect(() => {
    car3dRef.current?.setPaint(paint);
  }, [paint]);

  useEffect(() => {
    car3dRef.current?.setCaliper(caliper);
  }, [caliper]);

  useEffect(() => {
    car3dRef.current?.setCabinTrim(cabinTrim);
  }, [cabinTrim]);

  useEffect(() => {
    car3dRef.current?.setDoorsOpen(doorsOpen);
  }, [doorsOpen]);

  useEffect(() => {
    car3dRef.current?.setLightsMode(nightLights);
  }, [nightLights]);

  useEffect(() => {
    car3dRef.current?.setXRay(xrayMode);
  }, [xrayMode]);

  // Main Three.js Scene Initialization & Vehicle Swap Lifecycle
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070908');
    scene.fog = new THREE.FogExp2('#070908', 0.044);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const envTex = createStudioEnvironment(renderer);
    scene.environment = envTex;

    // Studio Direct Lighting complementing PMREM Environment
    scene.add(new THREE.AmbientLight('#dce4e0', 0.55));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.65);
    keyLight.position.set(-4.5, 6.2, -3.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#c8a96e', 1.1);
    rimLight.position.set(5.2, 2.8, 4.5);
    scene.add(rimLight);

    // Subtle Dark Obsidian Cyclorama Floor & Brass Measuring Ring
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#080b0a',
      roughness: 0.42,
      metalness: 0.28,
      envMapIntensity: 0.45,
    });
    const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(14, 72), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    scene.add(floorMesh);

    const brassRingGeo = new THREE.RingGeometry(2.88, 2.9, 96);
    brassRingGeo.rotateX(-Math.PI / 2);
    const brassRingMat = new THREE.MeshBasicMaterial({
      color: '#c8a96e',
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    const brassRing = new THREE.Mesh(brassRingGeo, brassRingMat);
    brassRing.position.y = 0.003;
    scene.add(brassRing);

    const innerTickGeo = new THREE.RingGeometry(2.74, 2.75, 96);
    innerTickGeo.rotateX(-Math.PI / 2);
    const innerTickMat = new THREE.MeshBasicMaterial({
      color: '#34403a',
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const innerTick = new THREE.Mesh(innerTickGeo, innerTickMat);
    innerTick.position.y = 0.002;
    scene.add(innerTick);

    // Build Complete Sculpted 3D Aston Martin Vehicle
    const car3d = buildAstonCar3D(car, paint, caliper, cabinTrim);
    car3dRef.current = car3d;
    car3d.setDoorsOpen(doorsOpen);
    car3d.setLightsMode(nightLights);
    car3d.setXRay(xrayMode);
    car3d.setActiveAero(modeRef.current === 'aero' ? speedRef.current : 0);
    car3d.setBrakeThermal(
      modeRef.current === 'aero' && brakeStressRef.current ? 0.5 + (speedRef.current / 360) * 1.6 : 0
    );
    scene.add(car3d.root);

    // Grounded Studio Contact Shadow Plane beneath the tires
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(car3d.blueprint.W * 1.38, car3d.blueprint.L * 1.18),
      shadowMat
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.005;
    scene.add(shadowPlane);

    // Build POV List & Initialize Camera
    const povs = getCameraPovsForCar(car3d.blueprint);
    povsRef.current = povs;
    const startPov = povs.find((p) => p.id === activePovId) || povs[0];
    activePovRef.current = startPov;
    car3d.setInteriorMode(startPov.zone === 'interior');

    const camera = new THREE.PerspectiveCamera(
      startPov.fov,
      el.clientWidth / Math.max(1, el.clientHeight),
      0.04,
      80
    );
    camera.position.copy(startPov.position);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(startPov.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = startPov.minDistance;
    controls.maxDistance = startPov.maxDistance;
    controls.minPolarAngle = startPov.minPolarAngle;
    controls.maxPolarAngle = startPov.maxPolarAngle;
    controls.rotateSpeed = startPov.rotateSpeed;
    controls.enablePan = false;
    controls.update();
    controlsRef.current = controls;

    const onControlStart = () => {
      flyStateRef.current.active = false;
      setAutoOrbit(false);
    };
    controls.addEventListener('start', onControlStart);

    // Continuous 180 CFD Streamline Ribbons (shown only in Aero Wind Tunnel mode)
    const bp = car3d.blueprint;
    const streakCount = 180;
    const streakPos = new Float32Array(streakCount * 2 * 3);
    const streakCol = new Float32Array(streakCount * 2 * 3);
    const streakMeta = Array.from({ length: streakCount }, (_, idx) => ({
      laneX: ((idx % 10) / 9 - 0.5) * bp.W * 1.14,
      zProg: Math.random(),
      baseY: 0.1 + (Math.floor(idx / 10) / 18) * 0.98,
    }));

    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    streakGeo.setAttribute('color', new THREE.BufferAttribute(streakCol, 3));
    const streakMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const streakLines = new THREE.LineSegments(streakGeo, streakMat);
    streakLines.visible = modeRef.current === 'aero';
    scene.add(streakLines);

    let rafId = 0;
    let lastT = performance.now();

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // 1. Update smooth POV flythrough if active
      const fly = flyStateRef.current;
      if (fly.active && fly.toSpec) {
        fly.t = Math.min(1, fly.t + dt * 1.45);
        if (fly.t >= 0.45) {
          car3d.setInteriorMode(fly.toSpec.zone === 'interior');
        }
        // easeInOutCubic
        const e =
          fly.t < 0.5 ? 4 * fly.t * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 3) / 2;

        camera.position.lerpVectors(fly.fromPos, fly.toSpec.position, e);
        controls.target.lerpVectors(fly.fromTarget, fly.toSpec.target, e);
        camera.fov = THREE.MathUtils.lerp(fly.fromFov, fly.toSpec.fov, e);
        camera.updateProjectionMatrix();

        if (fly.t >= 1) {
          fly.active = false;
          car3d.setInteriorMode(fly.toSpec.zone === 'interior');
          controls.minDistance = fly.toSpec.minDistance;
          controls.maxDistance = fly.toSpec.maxDistance;
          controls.minPolarAngle = fly.toSpec.minPolarAngle;
          controls.maxPolarAngle = fly.toSpec.maxPolarAngle;
          controls.rotateSpeed = fly.toSpec.rotateSpeed;
        }
      } else if (autoOrbitRef.current && activePovRef.current?.zone !== 'interior') {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.25;
      } else {
        controls.autoRotate = false;
      }

      // 2. Animate vehicle doors, active wing, brake glow & wheel spin
      car3d.update(dt);

      // 3. Animate CFD streamlines when in aero mode
      const isAero = modeRef.current === 'aero';
      streakLines.visible = isAero;
      if (isAero) {
        const curSpeed = speedRef.current;
        const speedNorm = curSpeed / 360;
        const posArr = streakGeo.attributes.position.array as Float32Array;
        const colArr = streakGeo.attributes.color.array as Float32Array;
        const flowVel = 2.0 + speedNorm * 5.4;
        const tailLen = 0.45 + speedNorm * 0.55;

        for (let i = 0; i < streakCount; i++) {
          const m = streakMeta[i];
          m.zProg += dt * (flowVel / 8.8);
          if (m.zProg > 1) m.zProg -= 1;
          const zHead = -4.4 + m.zProg * 8.8;
          const zTail = zHead - tailLen;

          const head = evalStreamY(m.laneX, m.baseY, zHead, bp, speedNorm);
          const tail = evalStreamY(m.laneX, m.baseY, zTail, bp, speedNorm);

          const base = i * 6;
          posArr[base] = tail.xOut;
          posArr[base + 1] = tail.y;
          posArr[base + 2] = zTail;

          posArr[base + 3] = head.xOut;
          posArr[base + 4] = head.y;
          posArr[base + 5] = zHead;

          const en = head.energy;
          colArr[base] = 0.18;
          colArr[base + 1] = 0.28;
          colArr[base + 2] = 0.28;

          colArr[base + 3] = 0.52 + en * 0.36;
          colArr[base + 4] = 0.68 + en * 0.24;
          colArr[base + 5] = 0.66 * (1 - en * 0.9);
        }
        streakGeo.attributes.position.needsUpdate = true;
        streakGeo.attributes.color.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    const onResize = () => {
      if (!el) return;
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      car3d.dispose();
      envTex.dispose();
      floorMesh.geometry.dispose();
      floorMat.dispose();
      brassRingGeo.dispose();
      brassRingMat.dispose();
      innerTickGeo.dispose();
      innerTickMat.dispose();
      shadowPlane.geometry.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      streakGeo.dispose();
      streakMat.dispose();
      renderer.dispose();
    };
    // Rebuild full 3D car only when selected model changes; material/paint/door updates are instant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car]);

  const currentPovs = getCameraPovsForCar(car3dRef.current?.blueprint || {
    id: car.id,
    L: car.aero.lengthM,
    W: car.aero.widthM,
    H: car.aero.heightM,
    WB: car.aero.wheelbaseM,
    zFrontAxle: -1.35,
    zRearAxle: 1.4,
    trackFrontHalf: 0.86,
    trackRearHalf: 0.88,
    wheelRadiusF: 0.35,
    wheelRadiusR: 0.36,
    tireWidthF: 0.25,
    tireWidthR: 0.3,
    driverX: -0.32,
    eyeY: 0.85,
    eyeZ: 0.2,
    dashZ: -0.35,
    wheelZ: -0.15,
    wheelY: 0.72,
    seatBackZ: 0.55,
    cabinFloorY: 0.15,
    windscreenBottomZ: -0.7,
    windscreenBottomY: 0.65,
    windscreenTopZ: 0.0,
    windscreenTopY: 1.15,
    roofRearZ: 0.8,
    roofRearY: 1.08,
    cabinHalfW: 0.62,
    doorFrontZ: -0.68,
    doorRearZ: 0.54,
    doorBottomY: 0.18,
    doorBeltY: 0.74,
    grilleStyle: 'vaned-gt',
    tailStyle: 'c-clamp',
    exhaustStyle: 'lower-dual',
    wheelStyle: 'forged-multi',
    doorStyle: 'swan-wing',
    roofStyle: 'coupe-metal',
    hasActiveWing: car.aero.hasActiveWing,
    rearWingY: 0.88,
    rearWingZ: 2.0,
  });

  const activePovObj = currentPovs.find((p) => p.id === activePovId) || currentPovs[0];
  const isInteriorView = activePovObj.zone === 'interior';

  const speedFactor = Math.min(1, Math.pow(speedKmh / car.aero.downforceRefKmh, 2));
  const currentDownforceKg = Math.round(car.aero.maxDownforceKg * speedFactor);
  const dragNewtons = Math.round(0.5 * 1.225 * Math.pow(speedKmh / 3.6, 2) * car.aero.dragCd * 2.05);
  const brakeTempC = brakeStress && mode === 'aero' ? Math.round(240 + (speedKmh / 360) * 580) : 145;

  return (
    <>
      <div className="studio-viewport">
        <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

        {/* Non-overlapping Top Bar HUD */}
        <div className="hud-top-bar">
          <div className="hud-top-left">
            <div className="hud-badge">
              <span className="hud-dot" />
              <span>
                {mode === 'aero'
                  ? `360° 3D WIND TUNNEL // ${car.chassisCode}`
                  : `${isInteriorView ? 'COCKPIT INTERIOR 3D' : 'EXTERIOR 360° 3D'} // ${car.chassisCode}`}
              </span>
            </div>
          </div>

          <div className="hud-top-right">
            {mode === 'studio' && (
              <button
                type="button"
                className={`hud-tool-btn ${autoOrbit ? 'active' : ''}`}
                onClick={() => setAutoOrbit((v) => !v)}
                disabled={isInteriorView}
                title={isInteriorView ? 'Switch to exterior POV to auto-orbit' : 'Toggle 360° turntable orbit'}
              >
                {autoOrbit ? <Pause size={12} /> : <Play size={12} />}
                <span>Orbit</span>
              </button>
            )}

            <button
              type="button"
              className={`hud-tool-btn ${doorsOpen ? 'active' : ''}`}
              onClick={() => setDoorsOpen((v) => !v)}
            >
              <DoorOpen size={12} />
              <span>{doorsOpen ? 'Close Doors' : 'Open Doors'}</span>
            </button>

            <button
              type="button"
              className={`hud-tool-btn ${nightLights ? 'active' : ''}`}
              onClick={() => setNightLights((v) => !v)}
            >
              <SunMoon size={12} />
              <span>{nightLights ? 'Lights: On' : 'Lights'}</span>
            </button>

            <button
              type="button"
              className={`hud-tool-btn ${xrayMode ? 'active' : ''}`}
              onClick={() => setXrayMode((v) => !v)}
            >
              <Layers size={12} />
              <span>X-Ray</span>
            </button>

            {mode === 'aero' && (
              <button
                type="button"
                className={`hud-tool-btn ${brakeStress ? 'active' : ''}`}
                onClick={() => setBrakeStress((v) => !v)}
              >
                <Flame size={12} />
                <span>Brake {brakeTempC}°C</span>
              </button>
            )}

            <button
              type="button"
              className="hud-tool-btn"
              onClick={() => triggerPovFlight(activePovId)}
              aria-label="Reset camera to active POV"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        {/* CFD Live Telemetry HUD Card when in Wind Tunnel mode */}
        {mode === 'aero' && (
          <div className="aero-telemetry-hud">
            <div className="aero-telemetry-head">
              <Wind size={11} style={{ display: 'inline', marginRight: 6 }} />
              REAL-TIME CFD TELEMETRY // 360° 3D
            </div>
            <div className="aero-stat-grid">
              <div>
                <div className="aero-stat-label">Downforce</div>
                <div className="aero-stat-val">
                  {currentDownforceKg} <span>kg</span>
                </div>
              </div>
              <div>
                <div className="aero-stat-label">Drag Force</div>
                <div className="aero-stat-val">
                  {dragNewtons} <span>N</span>
                </div>
              </div>
              <div>
                <div className="aero-stat-label">Aero Split</div>
                <div className="aero-stat-val">
                  {car.aero.frontBiasPct}/{100 - car.aero.frontBiasPct}
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar: External -> Sill -> Interior POV Switcher OR CFD Speed Control */}
      {mode === 'studio' ? (
        <div className="pov-dock-bar">
          <div className="pov-status-readout">
            <span className="azimuth-deg">{activePovObj.code}</span>
            <span className="azimuth-label">
              {activePovObj.zone === 'interior' ? 'Inside Cabin' : activePovObj.zone === 'threshold' ? 'Door Open' : '360° 3D'}
            </span>
          </div>

          <div className="pov-pills-track" role="tablist" aria-label="Exterior to Interior 3D POVs">
            {currentPovs.map((pov) => {
              const isSelected = pov.id === activePovId;
              const isInterior = pov.zone === 'interior';
              return (
                <button
                  key={pov.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`pov-chip ${isSelected ? 'active' : ''} ${isInterior ? 'interior-chip' : ''}`}
                  onClick={() => triggerPovFlight(pov.id)}
                >
                  <span className="pov-chip-code">{pov.code}</span>
                  <span>{pov.label}</span>
                </button>
              );
            })}
          </div>

          <div className="compass-drag-hint">
            <span>{isInteriorView ? 'Drag to Look 360°' : 'Drag to Orbit 3D'}</span>
          </div>
        </div>
      ) : (
        <div className="speed-control-bar">
          <div className="speed-readout">
            <span className="speed-num">{speedKmh}</span>
            <span className="speed-unit">km/h Airspeed</span>
          </div>
          <div className="speed-slider-wrap">
            <span className="speed-min">60 km/h</span>
            <input
              id="wind-tunnel-speed"
              name="windTunnelSpeed"
              type="range"
              min={60}
              max={car.specs.topSpeedKmh}
              step={5}
              value={speedKmh}
              onChange={(e) => setSpeedKmh(Number(e.target.value))}
              className="speed-slider"
              aria-label="Wind tunnel airspeed km/h"
            />
            <span className="speed-max">{car.specs.topSpeedKmh} km/h Vmax</span>
          </div>
          <div className="compass-drag-hint">
            <span>Cd {car.aero.dragCd} · {car.aero.brakeFrontMm} mm Rotor</span>
          </div>
        </div>
      )}
    </>
  );
};
