import React, { useEffect, useRef } from 'react';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import type { QWheelFinish } from '../data/engineeringData';
import { buildAstonCar3D, preloadCarModel, type Car3DInstance } from '../three/buildCar3D';
import { Studio } from '../three/studio';
import * as THREE from 'three';

interface Hero3DStageProps {
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  wheelFinish?: QWheelFinish;
  cabinTrim: QCabinTrim;
}

/**
 * Ambient slow-orbiting live 3D showcase for the Hero stage.
 * Shares the Observatory's studio pipeline (light-studio IBL, polished floor, bloom) and
 * pauses rendering via IntersectionObserver once scrolled out of view.
 */
export const Hero3DStage: React.FC<Hero3DStageProps> = ({ car, paint, caliper, wheelFinish, cabinTrim }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const studioRef = useRef<Studio | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const car3dRef = useRef<Car3DInstance | null>(null);
  const paintRef = useRef(paint);
  const caliperRef = useRef(caliper);
  const wheelFinishRef = useRef(wheelFinish);
  const cabinTrimRef = useRef(cabinTrim);
  paintRef.current = paint;
  caliperRef.current = caliper;
  wheelFinishRef.current = wheelFinish;
  cabinTrimRef.current = cabinTrim;

  useEffect(() => {
    car3dRef.current?.setPaint(paint);
  }, [paint]);

  useEffect(() => {
    car3dRef.current?.setCaliper(caliper);
  }, [caliper]);

  useEffect(() => {
    if (wheelFinish) car3dRef.current?.setWheelFinish(wheelFinish);
  }, [wheelFinish]);

  useEffect(() => {
    car3dRef.current?.setCabinTrim(cabinTrim);
  }, [cabinTrim]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Lamps are lit in the hero, so bloom is kept restrained to avoid haze behind the headline.
    const studio = new Studio(el, { background: '#070908', floorRadius: 16, bloomStrength: 0.16 });
    studioRef.current = studio;

    const camera = new THREE.PerspectiveCamera(34, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 60);
    cameraRef.current = camera;

    let onScreen = true;
    const observer = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), { threshold: 0.05 });
    observer.observe(el);

    const ro = new ResizeObserver(() => {
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      studio.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    let rafId = 0;
    let t = 0;
    let lastNow = performance.now();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      if (!onScreen || document.hidden) return;

      t += dt;
      const baseYaw = -2.35 + Math.sin(t * 0.22) * 0.42;
      const dist = 5.15;
      camera.position.set(Math.cos(baseYaw) * dist, 1.32 + Math.sin(t * 0.31) * 0.08, Math.sin(baseYaw) * dist);
      // Offset target toward camera-left so car sits cleanly on the right half of Hero
      camera.lookAt(-Math.sin(baseYaw) * 0.78, 0.36, Math.cos(baseYaw) * 0.78);

      if (car3dRef.current?.update(dt)) studio.invalidateShadow();
      studio.render(camera, dt);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      ro.disconnect();
      car3dRef.current?.dispose();
      car3dRef.current = null;
      studio.dispose();
      studioRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // Swap coachwork behind a short fade: the next car is built and its shaders compiled while the
  // frame is black, so the hero never freezes or pops between models.
  useEffect(() => {
    const studio = studioRef.current;
    if (!studio) return;
    let cancelled = false;
    let next: Car3DInstance | null = null;

    const hadCar = Boolean(car3dRef.current);
    studio.setFade(1, hadCar ? 3.2 : 100);
    preloadCarModel(car.id);

    new Promise<void>((resolve) => window.setTimeout(resolve, hadCar ? 340 : 0))
      .then(() => {
        if (cancelled) return;
        next = buildAstonCar3D(car, paintRef.current, caliperRef.current, cabinTrimRef.current);
        next.setLightsMode(true);
        return next.ready.catch(() => undefined);
      })
      .then(() => {
        const camera = cameraRef.current;
        if (cancelled || !next || !camera) return;
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
        incoming.setPaint(paintRef.current);
        incoming.setCaliper(caliperRef.current);
        if (wheelFinishRef.current) incoming.setWheelFinish(wheelFinishRef.current);
        incoming.setCabinTrim(cabinTrimRef.current);
        studio.scene.add(incoming.root);
        car3dRef.current = incoming;
        studio.setCar(incoming.blueprint.L, incoming.blueprint.W);
        // Reveal only after the new car has rendered twice off-screen (still black).
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!cancelled) studio.setFade(0, 0.9);
          })
        );
      });

    return () => {
      cancelled = true;
      if (next && car3dRef.current !== next) next.dispose();
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
