import * as THREE from 'three';
import type { AstonCar } from '../data/cars';

let cachedCarbonColor: THREE.CanvasTexture | null = null;
let cachedCarbonBump: THREE.CanvasTexture | null = null;
let cachedRotorColor: THREE.CanvasTexture | null = null;
let cachedRotorBump: THREE.CanvasTexture | null = null;

let cachedCarbonWeave: THREE.DataTexture | null = null;

/**
 * 2×2 twill carbon weave for triplanar projection. RGB = tow albedo with a cylindrical crown
 * highlight and fibre striations; A = tow orientation (warp vs weft), which the carbon shader
 * turns into alternating roughness so neighbouring tows flash independently as the light moves.
 * Written as raw RGBA so the alpha channel isn't destroyed by canvas premultiplication.
 */
export function getCarbonWeaveTexture(): THREE.DataTexture {
  if (cachedCarbonWeave) return cachedCarbonWeave;
  const size = 256;
  const cells = 8;
  const cell = size / cells;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ci = Math.floor(x / cell);
      const cj = Math.floor(y / cell);
      const warp = (ci + cj) % 4 < 2;
      const u = (x % cell) / cell;
      const v = (y % cell) / cell;
      const across = warp ? v : u;
      const along = warp ? u : v;
      const crown = Math.pow(Math.sin(across * Math.PI), 0.55);
      const fibre = 0.9 + 0.1 * Math.sin((warp ? y : x) * 2.37 + Math.sin(along * 9.0) * 0.6);
      const dip = 0.82 + 0.18 * Math.sin(along * Math.PI);
      const l = (warp ? 40 : 30) * (0.42 + 0.58 * crown) * fibre * dip;
      const i = (y * size + x) * 4;
      data[i] = Math.round(l);
      data[i + 1] = Math.round(l * 1.03);
      data[i + 2] = Math.round(l * 1.08);
      data[i + 3] = Math.round((warp ? 200 : 60) * (0.6 + 0.4 * crown));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cachedCarbonWeave = tex;
  return tex;
}

/**
 * Tileable 2x2 twill carbon fiber weave albedo and bump maps.
 */
export function getCarbonFiberTextures(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  if (cachedCarbonColor && cachedCarbonBump) {
    return { map: cachedCarbonColor, bumpMap: cachedCarbonBump };
  }

  const size = 64;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const ctx = cCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const btx = bCanvas.getContext('2d')!;

  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const ix = (x / cell) | 0;
      const iy = (y / cell) | 0;
      const isWarp = ((ix + iy) % 4) < 2;
      const g = isWarp ? 30 : 17;
      const bg = isWarp ? 195 : 85;
      ctx.fillStyle = `rgb(${g}, ${g + 2}, ${g + 1})`;
      ctx.fillRect(x, y, cell, cell);
      btx.fillStyle = `rgb(${bg}, ${bg}, ${bg})`;
      btx.fillRect(x, y, cell, cell);
    }
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(16, 16);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(16, 16);

  cachedCarbonColor = map;
  cachedCarbonBump = bumpMap;
  return { map, bumpMap };
}

/**
 * Cross-drilled carbon-ceramic brake rotor surface maps.
 */
export function getRotorTextures(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  if (cachedRotorColor && cachedRotorBump) {
    return { map: cachedRotorColor, bumpMap: cachedRotorBump };
  }

  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const btx = b.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = '#252928';
  ctx.fillRect(0, 0, size, size);
  btx.fillStyle = '#909090';
  btx.fillRect(0, 0, size, size);

  // Subtle concentric machining grooves
  for (let r = 46; r < 118; r += 3) {
    ctx.strokeStyle = r % 6 === 0 ? 'rgba(65, 70, 68, 0.35)' : 'rgba(18, 20, 20, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Curved Brembo cross-drilled cooling holes
  const spokes = 18;
  for (let s = 0; s < spokes; s++) {
    const baseAngle = (s / spokes) * Math.PI * 2;
    for (let ring = 0; ring < 4; ring++) {
      const r = 56 + ring * 15;
      const a = baseAngle + ring * 0.085;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;

      ctx.fillStyle = '#090b0a';
      ctx.beginPath();
      ctx.arc(px, py, 2.7, 0, Math.PI * 2);
      ctx.fill();

      btx.fillStyle = '#181818';
      btx.beginPath();
      btx.arc(px, py, 2.7, 0, Math.PI * 2);
      btx.fill();
    }
  }

  // Center aluminum bell hat
  ctx.fillStyle = '#151817';
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.fill();

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(b);

  cachedRotorColor = map;
  cachedRotorBump = bumpMap;
  return { map, bumpMap };
}

/**
 * Creates a Bridge of Weir leather hide texture. With `quilt` (seat inserts of the bespoke cabin)
 * a contrasting diamond welt stitch is drawn; GLB interiors pass `quilt: false` because their UVs
 * cover whole dashboards and door cards, where tiled stitching would tint every surface.
 */
export function createLeatherTextures(
  primaryHex: string,
  stitchHex: string,
  quilt = true
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const btx = b.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, size, size);
  btx.fillStyle = '#999999';
  btx.fillRect(0, 0, size, size);

  // Subtle natural pebble leather grain
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  btx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 650; i++) {
    const rx = (Math.sin(i * 19.3) * 0.5 + 0.5) * size;
    const ry = (Math.cos(i * 41.7) * 0.5 + 0.5) * size;
    ctx.fillRect(rx, ry, 2, 2);
    btx.fillRect(rx, ry, 2, 2);
  }

  // Diamond quilt stitch lines
  const step = 32;
  ctx.strokeStyle = stitchHex;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([4, 3]);

  btx.strokeStyle = '#383838';
  btx.lineWidth = 2.0;

  for (let offset = -size; quilt && offset < size * 2; offset += step) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(offset + size, 0);
    ctx.lineTo(offset, size);
    ctx.stroke();

    btx.beginPath();
    btx.moveTo(offset, 0);
    btx.lineTo(offset + size, size);
    btx.stroke();

    btx.beginPath();
    btx.moveTo(offset + size, 0);
    btx.lineTo(offset, size);
    btx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);

  return { map, bumpMap };
}

/**
 * Generates an illuminated OLED digital instrument cluster and HMI center screen texture.
 */
export function createClusterTexture(car: AstonCar, nightMode: boolean): THREE.CanvasTexture {
  const w = 1024;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#040706';
  ctx.fillRect(0, 0, w, h);

  // Subtle green-emerald ambient bezel gradient
  const grad = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, 520);
  grad.addColorStop(0, nightMode ? 'rgba(0, 96, 58, 0.42)' : 'rgba(0, 72, 43, 0.28)');
  grad.addColorStop(0.6, 'rgba(6, 12, 10, 0.92)');
  grad.addColorStop(1, 'rgba(3, 5, 4, 0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Outer precision bezel
  ctx.strokeStyle = 'rgba(200, 169, 110, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  // Center Tachometer Ring + Tick Marks
  const cx = w * 0.5;
  const cy = h * 0.54;
  const r = 136;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.76, Math.PI * 2.24);
  ctx.stroke();

  // Active Lime rev arc + redline zone
  ctx.strokeStyle = '#c4d600';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.76, Math.PI * 1.54);
  ctx.stroke();

  ctx.strokeStyle = '#e03e3e';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 1.94, Math.PI * 2.24);
  ctx.stroke();

  // Radial tick marks around tachometer
  for (let i = 0; i <= 24; i++) {
    const a = (0.76 + (i / 24) * 1.48) * Math.PI;
    const isMajor = i % 3 === 0;
    const r0 = r - (isMajor ? 24 : 16);
    const r1 = r - 8;
    ctx.strokeStyle = i >= 20 ? '#e03e3e' : isMajor ? '#f4f2ec' : 'rgba(244,242,236,0.4)';
    ctx.lineWidth = isMajor ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Center gear + speed + RPM readout
  ctx.fillStyle = '#f4f2ec';
  ctx.font = 'bold 76px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('1', cx, cy - 6);

  ctx.fillStyle = '#c4d600';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('READY // LAUNCH', cx, cy + 32);

  ctx.fillStyle = '#c8a96e';
  ctx.font = '20px monospace';
  ctx.fillText(`REDLINE ${car.specs.redlineRpm.toLocaleString()} RPM`, cx, cy + 68);

  // Left Wing: Drive Mode, Power & Tire Telemetry
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c4d600';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('GT // TRACK+', 42, 64);

  ctx.fillStyle = '#f4f2ec';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`${car.chassisCode} // ${car.specs.powerPS} PS`, 42, 102);

  ctx.fillStyle = '#9aa39d';
  ctx.font = '18px monospace';
  ctx.fillText('FL 2.3 BAR  68°C', 42, 175);
  ctx.fillText('FR 2.3 BAR  69°C', 42, 206);
  ctx.fillText('RL 2.4 BAR  74°C', 42, 248);
  ctx.fillText('RR 2.4 BAR  74°C', 42, 279);

  ctx.fillStyle = '#c8a96e';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`0-100 KM/H: ${car.specs.zeroToHundred}`, 42, 336);

  // Right Wing: Vehicle Identity, Thermal & G-Force Meter
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f4f2ec';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(car.name.toUpperCase(), w - 42, 64);

  ctx.fillStyle = '#c8a96e';
  ctx.font = '18px monospace';
  ctx.fillText(`VMAX ${car.specs.topSpeedKmh} KM/H`, w - 42, 102);

  // G-Force target circle on right wing
  const gx = w - 135;
  const gy = 212;
  ctx.strokeStyle = 'rgba(200, 169, 110, 0.42)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(gx, gy, 48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(gx, gy, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#c4d600';
  ctx.beginPath();
  ctx.arc(gx + 8, gy - 6, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#a0a8a3';
  ctx.font = '18px monospace';
  ctx.fillText('OIL 94°C // H2O 88°C', w - 42, 304);
  ctx.fillStyle = '#c4d600';
  ctx.fillText(`AERO ${car.aero.maxDownforceKg} KG`, w - 42, 336);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

