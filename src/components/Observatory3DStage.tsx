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
import { buildAstonCar3D, preloadCarModel, type Car3DInstance } from '../three/buildCar3D';
import { getCameraPovsForCar, type CameraPovId, type CameraPovSpec } from '../three/cameraPovs';
import { evaluateLowerCoachwork, type Car3DBlueprint } from '../three/carProfiles';
import { Studio } from '../three/studio';

interface Observatory3DStageProps {
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  cabinTrim: QCabinTrim;
  mode: 'studio' | 'aero';
  povRequest: { id: CameraPovId; seq: number } | null;
}

interface StreakMeta {
  laneX: number;
  zProg: number;
  baseY: number;
}

const STREAK_COUNT = 180;

function buildStreakMeta(bp: Car3DBlueprint): StreakMeta[] {
  return Array.from({ length: STREAK_COUNT }, (_, idx) => ({
    laneX: ((idx % 10) / 9 - 0.5) * bp.W * 1.14,
    zProg: Math.random(),
    baseY: 0.1 + (Math.floor(idx / 10) / 18) * 0.98,
  }));
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
  const [loadingCar, setLoadingCar] = useState(true);

  const studioRef = useRef<Studio | null>(null);
  const car3dRef = useRef<Car3DInstance | null>(null);
  const povsRef = useRef<CameraPovSpec[]>([]);
  const activePovRef = useRef<CameraPovSpec | null>(null);
  const activePovIdRef = useRef<CameraPovId>('hero-34');
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const streakMetaRef = useRef<StreakMeta[]>([]);

  const flyStateRef = useRef<{
    active: boolean;
    t: number;
    speed: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    fromFov: number;
    toSpec: CameraPovSpec | null;
  }>({
    active: false,
    t: 1,
    speed: 1.45,
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    fromFov: 35,
    toSpec: null,
  });

  // Latest UI state, readable from the render loop and async car swaps without stale closures.
  const modeRef = useRef(mode);
  const autoOrbitRef = useRef(autoOrbit);
  const speedRef = useRef(speedKmh);
  const brakeStressRef = useRef(brakeStress);
  const paintRef = useRef(paint);
  const caliperRef = useRef(caliper);
  const cabinTrimRef = useRef(cabinTrim);
  const doorsOpenRef = useRef(doorsOpen);
  const nightLightsRef = useRef(nightLights);
  const xrayRef = useRef(xrayMode);
  paintRef.current = paint;
  caliperRef.current = caliper;
  cabinTrimRef.current = cabinTrim;
  doorsOpenRef.current = doorsOpen;
  nightLightsRef.current = nightLights;
  xrayRef.current = xrayMode;
  activePovIdRef.current = activePovId;

  const brakeThermalFor = (aero: boolean, stress: boolean, kmh: number) =>
    aero && stress ? 0.5 + (kmh / 360) * 1.6 : 0;

  useEffect(() => {
    modeRef.current = mode;
    if (car3dRef.current) {
      car3dRef.current.setActiveAero(mode === 'aero' ? speedRef.current : 0);
      car3dRef.current.setBrakeThermal(brakeThermalFor(mode === 'aero', brakeStressRef.current, speedRef.current));
    }
  }, [mode]);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    speedRef.current = speedKmh;
    if (car3dRef.current && modeRef.current === 'aero') {
      car3dRef.current.setActiveAero(speedKmh);
      car3dRef.current.setBrakeThermal(brakeThermalFor(true, brakeStressRef.current, speedKmh));
    }
  }, [speedKmh]);

  useEffect(() => {
    brakeStressRef.current = brakeStress;
    if (car3dRef.current && modeRef.current === 'aero') {
      car3dRef.current.setBrakeThermal(brakeThermalFor(true, brakeStress, speedRef.current));
    }
  }, [brakeStress]);

  /**
   * Exterior POVs are composed for a 16:9 stage. On narrower viewports (phones, split screens)
   * the horizontal field of view shrinks, so the camera dollies back along its own sight line
   * until the car fits again. Cockpit POVs are never moved – they are anchored to the seat.
   */
  const framedSpec = (spec: CameraPovSpec, aspect: number): CameraPovSpec => {
    if (spec.zone === 'interior') return spec;
    const fit = Math.min(2.4, Math.max(1, 1.62 / Math.max(0.3, aspect)));
    if (fit === 1) return spec;
    const position = spec.target.clone().add(spec.position.clone().sub(spec.target).multiplyScalar(fit));
    return { ...spec, position, maxDistance: spec.maxDistance * fit };
  };

  /** Starts an eased camera flight toward a POV; `speed` is in flight-fractions per second. */
  const flyTo = (rawSpec: CameraPovSpec, speed = 1.45) => {
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!cam || !ctrls) return;
    const spec = framedSpec(rawSpec, cam.aspect);
    // Relax OrbitControls constraints during inter-zone camera flight
    ctrls.minDistance = 0.04;
    ctrls.maxDistance = 12.0;
    ctrls.minPolarAngle = 0.05;
    ctrls.maxPolarAngle = Math.PI * 0.92;
    flyStateRef.current = {
      active: true,
      t: 0,
      speed,
      fromPos: cam.position.clone(),
      fromTarget: ctrls.target.clone(),
      fromFov: cam.fov,
      toSpec: spec,
    };
  };

  // Helper to initiate silky POV flythrough
  const triggerPovFlight = (povId: CameraPovId) => {
    const spec = povsRef.current.find((p) => p.id === povId) || povsRef.current[0];
    if (!spec) return;

    setActivePovId(spec.id);
    activePovRef.current = spec;

    if (spec.zone === 'interior') {
      setAutoOrbit(false);
    } else {
      car3dRef.current?.setInteriorMode(false);
    }
    setDoorsOpen(Boolean(spec.autoOpenDoors));
    flyTo(spec);
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
    studioRef.current?.setNight(nightLights);
  }, [nightLights]);

  useEffect(() => {
    car3dRef.current?.setXRay(xrayMode);
  }, [xrayMode]);

  // Studio lifecycle: one renderer, environment, floor and post pipeline for the component's life.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const studio = new Studio(el, { background: '#070908', floorRadius: 14 });
    studioRef.current = studio;
    studio.setNight(nightLightsRef.current);
    const { scene } = studio;

    // Brass measuring ring & inner tick (Gaydon turntable markings)
    const brassRingGeo = new THREE.RingGeometry(2.88, 2.9, 128);
    brassRingGeo.rotateX(-Math.PI / 2);
    const brassRingMat = new THREE.MeshBasicMaterial({
      color: '#c8a96e',
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const brassRing = new THREE.Mesh(brassRingGeo, brassRingMat);
    brassRing.position.y = 0.003;
    scene.add(brassRing);

    const innerTickGeo = new THREE.RingGeometry(2.74, 2.75, 128);
    innerTickGeo.rotateX(-Math.PI / 2);
    const innerTickMat = new THREE.MeshBasicMaterial({
      color: '#34403a',
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const innerTick = new THREE.Mesh(innerTickGeo, innerTickMat);
    innerTick.position.y = 0.002;
    scene.add(innerTick);

    const startPov = povsRef.current[0];
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / Math.max(1, el.clientHeight), 0.04, 80);
    camera.position.set(-4.6, 1.5, -4.7);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, studio.renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    if (startPov) {
      controls.minDistance = startPov.minDistance;
      controls.maxDistance = startPov.maxDistance;
    }
    controls.update();
    controlsRef.current = controls;

    const onControlStart = () => {
      flyStateRef.current.active = false;
      setAutoOrbit(false);
    };
    controls.addEventListener('start', onControlStart);

    // Continuous 180 CFD Streamline Ribbons (shown only in Aero Wind Tunnel mode)
    const streakPos = new Float32Array(STREAK_COUNT * 2 * 3);
    const streakCol = new Float32Array(STREAK_COUNT * 2 * 3);
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
    streakLines.visible = false;
    streakLines.frustumCulled = false;
    scene.add(streakLines);
    studio.props.push(brassRing, innerTick, streakLines);

    // Stop rendering entirely while the observatory is scrolled away or the tab is hidden.
    let onScreen = true;
    const io = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), { threshold: 0.01 });
    io.observe(el);

    const resize = () => {
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      studio.setSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let rafId = 0;
    let lastT = performance.now();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!onScreen || document.hidden) return;

      const car3d = car3dRef.current;

      // 1. Update smooth POV flythrough if active
      const fly = flyStateRef.current;
      if (fly.active && fly.toSpec) {
        fly.t = Math.min(1, fly.t + dt * fly.speed);
        if (fly.t >= 0.45) {
          car3d?.setInteriorMode(fly.toSpec.zone === 'interior');
        }
        // easeInOutCubic
        const e = fly.t < 0.5 ? 4 * fly.t * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 3) / 2;

        camera.position.lerpVectors(fly.fromPos, fly.toSpec.position, e);
        controls.target.lerpVectors(fly.fromTarget, fly.toSpec.target, e);
        camera.fov = THREE.MathUtils.lerp(fly.fromFov, fly.toSpec.fov, e);
        camera.updateProjectionMatrix();

        if (fly.t >= 1) {
          fly.active = false;
          car3d?.setInteriorMode(fly.toSpec.zone === 'interior');
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

      // 2. Animate vehicle doors, brake glow & wheel spin; doors re-bake the contact shadow.
      if (car3d && car3d.update(dt)) studio.invalidateShadow();

      // 3. Animate CFD streamlines when in aero mode
      const isAero = modeRef.current === 'aero' && Boolean(car3d);
      streakLines.visible = isAero;
      if (isAero && car3d) {
        const bp = car3d.blueprint;
        const metas = streakMetaRef.current;
        const speedNorm = speedRef.current / 360;
        const posArr = streakGeo.attributes.position.array as Float32Array;
        const colArr = streakGeo.attributes.color.array as Float32Array;
        const flowVel = 2.0 + speedNorm * 5.4;
        const tailLen = 0.45 + speedNorm * 0.55;

        for (let i = 0; i < metas.length; i++) {
          const m = metas[i];
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
      studio.render(camera, dt);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      car3dRef.current?.dispose();
      car3dRef.current = null;
      brassRingGeo.dispose();
      brassRingMat.dispose();
      innerTickGeo.dispose();
      innerTickMat.dispose();
      streakGeo.dispose();
      streakMat.dispose();
      studio.dispose();
      studioRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // Vehicle swap: fade to the void, build and shader-compile the next car while the frame is black,
  // swap, then dolly into the POV once the new coachwork has actually been drawn.
  useEffect(() => {
    const studio = studioRef.current;
    if (!studio) return;
    let cancelled = false;
    let next: Car3DInstance | null = null;

    const hadCar = Boolean(car3dRef.current);
    setLoadingCar(true);
    studio.setFade(1, hadCar ? 3.2 : 100);
    preloadCarModel(car.id);

    new Promise<void>((resolve) => window.setTimeout(resolve, hadCar ? 340 : 0))
      .then(() => {
        if (cancelled) return;
        // Built only once the frame is black, so its synchronous setup can't stutter the fade.
        next = buildAstonCar3D(car, paintRef.current, caliperRef.current, cabinTrimRef.current);
        return next.ready.catch(() => undefined);
      })
      .then(() => {
        const camera = cameraRef.current;
        if (cancelled || !next || !camera) return;
        // X-ray switches the paint to its transparent shader variant: compile the one that will show.
        next.setXRay(xrayRef.current);
        return studio.precompile(next.root, camera, car3dRef.current?.root ?? null);
      })
      .then(() => {
        if (cancelled || !next) return;
        const incoming: Car3DInstance = next;

        const prev = car3dRef.current;
        if (prev) {
          studio.scene.remove(prev.root);
          prev.dispose();
        }

        // Re-apply whatever the user changed while the coachwork streamed in.
        incoming.setPaint(paintRef.current);
        incoming.setCaliper(caliperRef.current);
        incoming.setCabinTrim(cabinTrimRef.current);
        incoming.setLightsMode(nightLightsRef.current);
        incoming.setXRay(xrayRef.current);
        incoming.setActiveAero(modeRef.current === 'aero' ? speedRef.current : 0);
        incoming.setBrakeThermal(
          brakeThermalFor(modeRef.current === 'aero', brakeStressRef.current, speedRef.current)
        );
        incoming.setDoorsOpen(doorsOpenRef.current);
        studio.scene.add(incoming.root);
        car3dRef.current = incoming;

        const bp = incoming.blueprint;
        studio.setCar(bp.L, bp.W);
        streakMetaRef.current = buildStreakMeta(bp);

        const povs = getCameraPovsForCar(bp);
        povsRef.current = povs;
        const pov = povs.find((p) => p.id === activePovIdRef.current) || povs[0];
        activePovRef.current = pov;
        incoming.setInteriorMode(pov.zone === 'interior');

        // Reveal: start a little wider and lower, then glide into the POV as the frame fades up.
        flyStateRef.current.active = false;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) {
          if (pov.zone === 'interior') {
            camera.position.copy(pov.position);
            controls.target.copy(pov.target);
          } else {
            const framed = framedSpec(pov, camera.aspect);
            const offset = new THREE.Vector3().subVectors(framed.position, framed.target).multiplyScalar(1.16);
            camera.position.copy(pov.target).add(offset);
            camera.position.y = Math.max(0.35, camera.position.y - 0.18);
            controls.target.copy(pov.target);
          }
          camera.fov = pov.fov + 3;
          camera.updateProjectionMatrix();
        }

        // Let two frames of the new car render while still black: leftover GPU uploads land
        // off-screen, and the dolly, doors and fade all start from their first frame.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (cancelled) return;
            flyTo(pov, 0.62);
            setLoadingCar(false);
            studio.setFade(0, 1.25);
          })
        );
      });

    return () => {
      cancelled = true;
      if (next && car3dRef.current !== next) next.dispose();
    };
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

        {loadingCar && (
          <div className="stage-loading" role="status" aria-live="polite">
            <span className="stage-loading-label">Preparing {car.name} coachwork</span>
            <span className="stage-loading-bar" />
          </div>
        )}

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
