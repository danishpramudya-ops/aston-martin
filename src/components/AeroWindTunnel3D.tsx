import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Flame, Layers, RotateCcw, Wind } from 'lucide-react';
import type { AstonCar, QCaliperFinish, QPaintFinish } from '../data/cars';

interface AeroWindTunnel3DProps {
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  initialSubmode?: 'aero' | 'chassis' | 'thermal';
}

type TunnelMode = 'aero' | 'chassis' | 'thermal';

function sampleCarEnvelope(u: number, bodyClass: AstonCar['aero']['bodyClass'], L: number, W: number, H: number) {
  const z = (u - 0.5) * L;
  let roofY = 0;
  let sillY = 0.08;
  let halfW = W * 0.48;

  if (bodyClass === 'hypercar') {
    const archF = Math.exp(-Math.pow((u - 0.2) / 0.11, 2));
    const archR = Math.exp(-Math.pow((u - 0.8) / 0.12, 2));
    const canopy = Math.exp(-Math.pow((u - 0.44) / 0.24, 2));
    roofY = 0.22 + canopy * (H - 0.24) + Math.max(archF, archR) * 0.28;
    halfW = W * (0.34 + 0.16 * Math.max(archF, archR) + 0.06 * Math.sin(u * Math.PI));
    sillY = u > 0.72 ? 0.12 + (u - 0.72) * 0.65 : 0.07;
  } else if (bodyClass === 'mid-engine') {
    const canopy = Math.exp(-Math.pow((u - 0.42) / 0.22, 2));
    const nose = Math.pow(Math.sin(Math.min(1, u * 2.4) * (Math.PI / 2)), 0.75);
    const tail = 1 - Math.max(0, u - 0.76) * 0.55;
    roofY = 0.2 + nose * 0.28 + canopy * (H - 0.44);
    if (u > 0.65) roofY = Math.max(0.46, roofY * tail);
    halfW = W * (0.43 + 0.07 * Math.sin(u * Math.PI));
    sillY = u > 0.78 ? 0.11 + (u - 0.78) * 0.52 : 0.085;
  } else {
    const bonnet = Math.sin(Math.min(1, u / 0.46) * (Math.PI / 2)) * 0.42;
    const cabin = Math.exp(-Math.pow((u - 0.58) / 0.21, 2)) * (H - 0.56);
    const haunch = Math.exp(-Math.pow((u - 0.82) / 0.13, 2)) * 0.12;
    roofY = 0.24 + bonnet + cabin + haunch;
    if (u > 0.86) roofY *= 1 - (u - 0.86) * 1.1;
    halfW = W * (0.44 + 0.06 * Math.exp(-Math.pow((u - 0.8) / 0.14, 2)));
    sillY = u > 0.8 ? 0.11 + (u - 0.8) * 0.35 : 0.105;
  }

  return { z, roofY, sillY, halfW };
}

function evalStreamY(
  x: number,
  baseY: number,
  z: number,
  bodyClass: AstonCar['aero']['bodyClass'],
  L: number,
  W: number,
  H: number,
  speedNorm: number
): { y: number; xOut: number; energy: number } {
  const u = (z + L * 0.5) / L;
  let y = baseY;
  let xOut = x;
  let energy = 0;

  if (u >= -0.08 && u <= 1.12) {
    const clampedU = Math.max(0, Math.min(1, u));
    const env = sampleCarEnvelope(clampedU, bodyClass, L, W, H);
    if (Math.abs(xOut) < env.halfW * 1.06) {
      if (baseY < 0.27) {
        y = Math.max(0.035, env.sillY * 0.64);
        energy = 0.88 * speedNorm;
      } else if (y < env.roofY + 0.14) {
        const lift = (env.roofY + 0.14 - y) * 0.9;
        y += lift;
        xOut *= 1 + lift * 0.11;
        energy = Math.min(1, lift * 1.45 * speedNorm);
      }
    }
    if (u > 0.92 && baseY < 0.35) {
      y += (u - 0.92) * 1.12;
      energy = 1.0 * speedNorm;
    }
  }
  return { y, xOut, energy };
}

export const AeroWindTunnel3D: React.FC<AeroWindTunnel3DProps> = ({
  car,
  paint,
  caliper,
  initialSubmode = 'aero',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [speedKmh, setSpeedKmh] = useState(260);
  const [submode, setSubmode] = useState<TunnelMode>(initialSubmode);
  const [brakeStress, setBrakeStress] = useState(false);

  const speedRef = useRef(speedKmh);
  const submodeRef = useRef(submode);
  const brakeStressRef = useRef(brakeStress);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    speedRef.current = speedKmh;
  }, [speedKmh]);

  useEffect(() => {
    submodeRef.current = submode;
  }, [submode]);

  useEffect(() => {
    brakeStressRef.current = brakeStress;
  }, [brakeStress]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070908');
    scene.fog = new THREE.FogExp2('#070908', 0.068);

    // Front-right 3/4 view facing nose (-Z)
    const camera = new THREE.PerspectiveCamera(38, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 80);
    camera.position.set(3.95, 1.52, -3.95);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.8;
    controls.maxDistance = 10.5;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 0.5, 0);
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xdbe3de, 0.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(3, 7, -4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc8a96e, 1.25);
    rimLight.position.set(-5, 2.5, 4);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(16, 32, 0x2a352f, 0x131916);
    scene.add(grid);

    const ringGeo = new THREE.RingGeometry(2.65, 2.68, 96);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8a96e, transparent: true, opacity: 0.34 });
    scene.add(new THREE.Mesh(ringGeo, ringMat));

    const carGroup = new THREE.Group();
    scene.add(carGroup);

    const { lengthM: L, widthM: W, heightM: H, wheelbaseM: WB, bodyClass } = car.aero;

    // 1. Lofted Aerodynamic Surface & CAD Rib Wireframe
    const slices = 24;
    const cols = 10;
    const shellPositions: number[] = [];
    const shellIndices: number[] = [];
    const ribVertices: number[] = [];

    for (let i = 0; i <= slices; i++) {
      const u = i / slices;
      const { z, roofY, sillY, halfW } = sampleCarEnvelope(u, bodyClass, L, W, H);
      for (let j = 0; j <= cols; j++) {
        const theta = (j / cols) * Math.PI;
        const x = Math.cos(theta) * halfW;
        const arch = Math.sin(theta);
        const y = sillY + (roofY - sillY) * Math.pow(arch, 0.78);
        shellPositions.push(x, y, z);
      }
    }

    const rowLen = cols + 1;
    for (let i = 0; i < slices; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * rowLen + j;
        const b = a + 1;
        const c = (i + 1) * rowLen + j;
        const d = c + 1;
        shellIndices.push(a, c, b, b, c, d);
        ribVertices.push(
          shellPositions[a * 3],
          shellPositions[a * 3 + 1],
          shellPositions[a * 3 + 2],
          shellPositions[c * 3],
          shellPositions[c * 3 + 1],
          shellPositions[c * 3 + 2]
        );
        if (i % 2 === 0) {
          ribVertices.push(
            shellPositions[a * 3],
            shellPositions[a * 3 + 1],
            shellPositions[a * 3 + 2],
            shellPositions[b * 3],
            shellPositions[b * 3 + 1],
            shellPositions[b * 3 + 2]
          );
        }
      }
    }

    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(shellPositions, 3));
    bodyGeo.setIndex(shellIndices);
    bodyGeo.computeVertexNormals();

    const paintColor = new THREE.Color(paint.isNeutral ? '#9aa39d' : paint.hex);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: paintColor,
      transparent: true,
      opacity: 0.25,
      roughness: 0.22,
      metalness: 0.72,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    carGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

    const ribGeo = new THREE.BufferGeometry();
    ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribVertices, 3));
    const ribMat = new THREE.LineBasicMaterial({ color: 0xc8a96e, transparent: true, opacity: 0.44 });
    carGroup.add(new THREE.LineSegments(ribGeo, ribMat));

    // 2. Tapered Carbon Underfloor & Tubular Chassis Spine (Non-boxy CAD rails)
    const floorGeo = new THREE.BoxGeometry(W * 0.76, 0.03, L * 0.88);
    const floorMesh = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({ color: 0x141a17, metalness: 0.55, roughness: 0.48 })
    );
    floorMesh.position.y = 0.085;
    carGroup.add(floorMesh);

    const frontAxleZ = -WB / 2;
    const rearAxleZ = WB / 2;
    const wheelTrackHalf = W * 0.445;

    // Tapered Spine & Wishbone Suspension Geometry
    const spineVerts: number[] = [];
    const spineHalf = W * 0.22;
    const noseTipZ = -L * 0.44;
    const tailTipZ = L * 0.44;
    // Left & Right structural chassis rails
    [-1, 1].forEach((side) => {
      spineVerts.push(side * spineHalf * 0.5, 0.22, noseTipZ, side * spineHalf, 0.34, frontAxleZ);
      spineVerts.push(side * spineHalf, 0.34, frontAxleZ, side * spineHalf, 0.34, rearAxleZ);
      spineVerts.push(side * spineHalf, 0.34, rearAxleZ, side * spineHalf * 0.7, 0.28, tailTipZ);
      // Double-wishbone A-arms to wheel hubs
      [frontAxleZ, rearAxleZ].forEach((az) => {
        spineVerts.push(side * spineHalf, 0.36, az - 0.16, side * wheelTrackHalf, 0.34, az);
        spineVerts.push(side * spineHalf, 0.24, az + 0.16, side * wheelTrackHalf, 0.34, az);
      });
    });
    const spineGeo = new THREE.BufferGeometry();
    spineGeo.setAttribute('position', new THREE.Float32BufferAttribute(spineVerts, 3));
    const spineMat = new THREE.LineBasicMaterial({ color: 0xc4d600, transparent: true, opacity: 0.65 });
    const chassisLines = new THREE.LineSegments(spineGeo, spineMat);
    carGroup.add(chassisLines);

    // 3. Wheels + Forged Rims + Carbon-Ceramic Discs + Calipers
    const rotorMats: THREE.MeshStandardMaterial[] = [];
    const wheelPositions: Array<[number, number, number]> = [
      [-wheelTrackHalf, 0.34, frontAxleZ],
      [wheelTrackHalf, 0.34, frontAxleZ],
      [-wheelTrackHalf, 0.35, rearAxleZ],
      [wheelTrackHalf, 0.35, rearAxleZ],
    ];

    const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 36, 1, true);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x101312,
      roughness: 0.78,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });

    const rotorGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.032, 36);
    rotorGeo.rotateZ(Math.PI / 2);
    const caliperGeo = new THREE.BoxGeometry(0.044, 0.11, 0.068);
    const caliperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(caliper.hex),
      metalness: 0.45,
      roughness: 0.32,
    });

    // 10 radial forged Y-spoke pairs per wheel barrel
    const spokePositions: number[] = [];
    for (let s = 0; s < 10; s++) {
      const a0 = (s / 10) * Math.PI * 2;
      const a1 = a0 + 0.11;
      const a2 = a0 - 0.11;
      spokePositions.push(0, Math.cos(a0) * 0.06, Math.sin(a0) * 0.06, 0, Math.cos(a1) * 0.255, Math.sin(a1) * 0.255);
      spokePositions.push(0, Math.cos(a0) * 0.06, Math.sin(a0) * 0.06, 0, Math.cos(a2) * 0.255, Math.sin(a2) * 0.255);
    }
    const spokeGeo = new THREE.BufferGeometry();
    spokeGeo.setAttribute('position', new THREE.Float32BufferAttribute(spokePositions, 3));
    const spokeMat = new THREE.LineBasicMaterial({ color: 0xb6bec0, transparent: true, opacity: 0.36 });

    wheelPositions.forEach(([wx, wy, wz], idx) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rimRing = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.265, 0.265, 0.25, 28)),
        new THREE.LineBasicMaterial({ color: 0x8f9893, transparent: true, opacity: 0.48 })
      );
      rimRing.rotation.z = Math.PI / 2;

      const spokes = new THREE.LineSegments(spokeGeo, spokeMat);
      spokes.position.x = wx < 0 ? -0.115 : 0.115;

      const rMat = new THREE.MeshStandardMaterial({
        color: 0x222624,
        emissive: new THREE.Color('#ff4800'),
        emissiveIntensity: 0.0,
        metalness: 0.72,
        roughness: 0.38,
      });
      rotorMats.push(rMat);
      const rotor = new THREE.Mesh(rotorGeo, rMat);
      rotor.position.x = wx < 0 ? -0.025 : 0.025;

      const cal = new THREE.Mesh(caliperGeo, caliperMat);
      const calZ = idx < 2 ? 0.165 : -0.165;
      cal.position.set(wx < 0 ? -0.025 : 0.025, 0.045, calZ);
      cal.rotation.x = idx < 2 ? -0.28 : 0.28;

      wg.add(tire, rimRing, spokes, rotor, cal);
      carGroup.add(wg);
    });

    // 4. Active Rear Wing (ONLY on hypercar/mid-engine active aero cars)
    const wingGeo = new THREE.BoxGeometry(W * 0.82, 0.022, 0.22);
    const wingGroup = new THREE.Group();
    wingGroup.add(
      new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0x1e2521, metalness: 0.6, roughness: 0.3 })),
      new THREE.LineSegments(
        new THREE.EdgesGeometry(wingGeo),
        new THREE.LineBasicMaterial({ color: 0xc4d600, transparent: true, opacity: 0.85 })
      )
    );
    wingGroup.position.set(0, bodyClass === 'hypercar' ? 0.88 : 0.84, L * 0.44);
    wingGroup.visible = car.aero.hasActiveWing;
    carGroup.add(wingGroup);

    // 5. Continuous CFD Airflow Streamline Streaks (LineSegments)
    const streakCount = 180;
    const streakPos = new Float32Array(streakCount * 2 * 3);
    const streakCol = new Float32Array(streakCount * 2 * 3);
    const streakMeta = Array.from({ length: streakCount }, (_, idx) => ({
      laneX: ((idx % 10) / 9 - 0.5) * W * 1.12,
      zProg: Math.random(),
      baseY: 0.12 + (Math.floor(idx / 10) / 18) * 0.92,
    }));

    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    streakGeo.setAttribute('color', new THREE.BufferAttribute(streakCol, 3));
    const streakMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const streakLines = new THREE.LineSegments(streakGeo, streakMat);
    scene.add(streakLines);

    let rafId = 0;
    let lastT = performance.now();

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      const curSpeed = speedRef.current;
      const mode = submodeRef.current;
      const speedNorm = curSpeed / 360;

      bodyMat.opacity = mode === 'chassis' ? 0.08 : 0.25;
      ribMat.opacity = mode === 'chassis' ? 0.22 : mode === 'thermal' ? 0.32 : 0.48;
      spineMat.opacity = mode === 'chassis' ? 0.95 : 0.45;
      streakLines.visible = mode === 'aero';

      if (car.aero.hasActiveWing) {
        const deploy = Math.max(0, (curSpeed - 100) / 220);
        wingGroup.position.y = (bodyClass === 'hypercar' ? 0.88 : 0.84) + deploy * 0.14;
        wingGroup.rotation.x = THREE.MathUtils.degToRad(car.aero.rearWingAngleDeg * (0.4 + deploy * 0.8));
      }

      const heatTarget = brakeStressRef.current || mode === 'thermal' ? 0.4 + speedNorm * 1.8 : 0.0;
      rotorMats.forEach((m) => {
        m.emissiveIntensity += (heatTarget - m.emissiveIntensity) * 0.08;
      });

      if (streakLines.visible) {
        const posArr = streakGeo.attributes.position.array as Float32Array;
        const colArr = streakGeo.attributes.color.array as Float32Array;
        const flowVel = 1.9 + speedNorm * 5.2;
        const tailLen = 0.42 + speedNorm * 0.55;

        for (let i = 0; i < streakCount; i++) {
          const m = streakMeta[i];
          m.zProg += dt * (flowVel / 8.8);
          if (m.zProg > 1) m.zProg -= 1;
          const zHead = -4.4 + m.zProg * 8.8;
          const zTail = zHead - tailLen;

          const head = evalStreamY(m.laneX, m.baseY, zHead, bodyClass, L, W, H, speedNorm);
          const tail = evalStreamY(m.laneX, m.baseY, zTail, bodyClass, L, W, H, speedNorm);

          const base = i * 6;
          posArr[base] = tail.xOut;
          posArr[base + 1] = tail.y;
          posArr[base + 2] = zTail;

          posArr[base + 3] = head.xOut;
          posArr[base + 4] = head.y;
          posArr[base + 5] = zHead;

          const e = head.energy;
          // Fade tail -> bright head
          colArr[base] = 0.18;
          colArr[base + 1] = 0.28;
          colArr[base + 2] = 0.28;

          colArr[base + 3] = 0.5 + e * 0.38;
          colArr[base + 4] = 0.68 + e * 0.24;
          colArr[base + 5] = 0.66 * (1 - e * 0.92);
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
      controls.dispose();
      bodyGeo.dispose();
      bodyMat.dispose();
      ribGeo.dispose();
      ribMat.dispose();
      spineGeo.dispose();
      spineMat.dispose();
      spokeGeo.dispose();
      spokeMat.dispose();
      streakGeo.dispose();
      streakMat.dispose();
      renderer.dispose();
    };
  }, [car, paint.hex, paint.isNeutral, caliper.hex]);

  const speedFactor = Math.min(1, Math.pow(speedKmh / car.aero.downforceRefKmh, 2));
  const currentDownforceKg = Math.round(car.aero.maxDownforceKg * speedFactor);
  const dragNewtons = Math.round(0.5 * 1.225 * Math.pow(speedKmh / 3.6, 2) * car.aero.dragCd * 2.05);
  const brakeTempC = brakeStress || submode === 'thermal' ? Math.round(240 + (speedKmh / 360) * 580) : 145;

  const resetOrbit = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(3.95, 1.52, -3.95);
      controlsRef.current.target.set(0, 0.5, 0);
      controlsRef.current.update();
    }
  };

  return (
    <>
      <div className="studio-viewport">
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

        <div className="hud-top-bar">
          <div className="hud-top-left">
            <div className="hud-badge">
              <span className="hud-dot" />
              <span>360° 3D WIND TUNNEL // {car.chassisCode}</span>
            </div>
          </div>

          <div className="hud-top-right">
            <button
              type="button"
              className={`hud-tool-btn ${submode === 'aero' ? 'active' : ''}`}
              onClick={() => setSubmode('aero')}
            >
              <Wind size={12} />
              <span>CFD Airflow</span>
            </button>
            <button
              type="button"
              className={`hud-tool-btn ${submode === 'chassis' ? 'active' : ''}`}
              onClick={() => setSubmode('chassis')}
            >
              <Layers size={12} />
              <span>Chassis X-Ray</span>
            </button>
            <button
              type="button"
              className={`hud-tool-btn ${submode === 'thermal' || brakeStress ? 'active' : ''}`}
              onClick={() => {
                setSubmode('thermal');
                setBrakeStress((s) => !s);
              }}
            >
              <Flame size={12} />
              <span>Brake {brakeTempC}°C</span>
            </button>
            <button type="button" className="hud-tool-btn" onClick={resetOrbit} aria-label="Reset 3D camera">
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        <div
          className="hotspot-card-overlay"
          style={{ maxWidth: 360, padding: '14px 18px', borderColor: 'rgba(196, 214, 0, 0.35)' }}
        >
          <div className="hotspot-card-head">
            <span className="hotspot-card-code">REAL-TIME CFD TELEMETRY // 360° ORBIT</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
            <div>
              <div className="lineup-metric-k">Downforce</div>
              <div className="lineup-metric-v" style={{ fontSize: 16, color: '#c4d600' }}>
                {currentDownforceKg} kg
              </div>
            </div>
            <div>
              <div className="lineup-metric-k">Drag Force</div>
              <div className="lineup-metric-v" style={{ fontSize: 16 }}>
                {dragNewtons} N
              </div>
            </div>
            <div>
              <div className="lineup-metric-k">Aero Split</div>
              <div className="lineup-metric-v" style={{ fontSize: 16 }}>
                {car.aero.frontBiasPct}/{100 - car.aero.frontBiasPct}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="compass-bar">
        <div className="azimuth-readout">
          <span className="azimuth-deg">{speedKmh}</span>
          <span className="azimuth-label">km/h Airspeed</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
          <span className="azimuth-label">60 km/h</span>
          <input
            id="wind-tunnel-speed"
            name="windTunnelSpeed"
            type="range"
            min={60}
            max={car.specs.topSpeedKmh}
            value={speedKmh}
            onChange={(e) => setSpeedKmh(Number(e.target.value))}
            className="range-atelier"
            aria-label="Wind tunnel airspeed km/h"
          />
          <span className="azimuth-label">{car.specs.topSpeedKmh} km/h Vmax</span>
        </div>

        <div className="compass-controls">
          <span className="azimuth-label">
            Cd {car.aero.dragCd.toFixed(2)} · {car.aero.brakeFrontMm} mm Rotor
          </span>
        </div>
      </div>
    </>
  );
};
