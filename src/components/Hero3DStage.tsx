import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import { buildAstonCar3D, type Car3DInstance } from '../three/buildCar3D';
import { createStudioEnvironment } from '../three/textures';

interface Hero3DStageProps {
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  cabinTrim: QCabinTrim;
}

/**
 * Ambient slow-orbiting live 3D showcase for the Hero stage.
 * Automatically pauses rendering via IntersectionObserver once scrolled out of view.
 */
export const Hero3DStage: React.FC<Hero3DStageProps> = ({
  car,
  paint,
  caliper,
  cabinTrim,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const car3dRef = useRef<Car3DInstance | null>(null);
  const visibleRef = useRef(true);

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
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070908');
    scene.fog = new THREE.FogExp2('#070908', 0.052);

    const camera = new THREE.PerspectiveCamera(
      34,
      el.clientWidth / Math.max(1, el.clientHeight),
      0.1,
      60
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const envTex = createStudioEnvironment(renderer);
    scene.environment = envTex;

    scene.add(new THREE.AmbientLight('#dce4e0', 0.52));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.75);
    keyLight.position.set(-4, 6.4, -3.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#c8a96e', 1.2);
    rimLight.position.set(5, 2.5, 4);
    scene.add(rimLight);

    // Subtle dark reflective stage plinth
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#080b0a',
      roughness: 0.44,
      metalness: 0.25,
      envMapIntensity: 0.4,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const car3d = buildAstonCar3D(car, paint, caliper, cabinTrim);
    car3d.setLightsMode(true);
    car3dRef.current = car3d;
    scene.add(car3d.root);

    // Pause animation cleanly when Hero leaves viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    observer.observe(el);

    let rafId = 0;
    let t = 0;
    let lastNow = performance.now();

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;

      if (visibleRef.current) {
        t += dt;
        const baseYaw = -2.35 + Math.sin(t * 0.22) * 0.42;
        const dist = 5.15;
        const cx = Math.cos(baseYaw) * dist;
        const cz = Math.sin(baseYaw) * dist;
        camera.position.set(cx, 1.32 + Math.sin(t * 0.31) * 0.08, cz);
        // Offset target toward camera-left so car sits cleanly on the right half of Hero
        const targetX = -Math.sin(baseYaw) * 0.78;
        const targetZ = Math.cos(baseYaw) * 0.78;
        camera.lookAt(targetX, 0.36, targetZ);
        car3d.update(dt);
        renderer.render(scene, camera);
      }

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
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      car3d.dispose();
      envTex.dispose();
      floor.geometry.dispose();
      floorMat.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
      }}
      aria-hidden="true"
    />
  );
};
