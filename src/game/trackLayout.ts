/**
 * Gaydon Proving Ground circuit: a closed racing line described like a track designer would –
 * straights and constant-radius corners – then smoothed into clothoid-like transitions and sampled
 * every couple of metres. Pure math (no three.js) so physics, lap timing and the minimap share it.
 *
 * Track space: X east, Z south, Y up. Heading ψ = 0 faces north (−Z); forward = (−sin ψ, −cos ψ),
 * right = (cos ψ, −sin ψ). Turning right decreases ψ, so a clockwise lap turns −2π in total.
 */

type Segment =
  | { kind: 'straight'; len: number | 'main' | 'south' }
  | { kind: 'arc'; radius: number; deg: number; name?: string }; // deg > 0 = left, < 0 = right

/** Clockwise lap. The two named straights are solved so the loop closes exactly. */
const LAYOUT: Segment[] = [
  { kind: 'straight', len: 'main' }, // pit straight, north-bound
  { kind: 'arc', radius: 32, deg: -100, name: 'Gaydon Hairpin' },
  { kind: 'straight', len: 85 },
  { kind: 'arc', radius: 75, deg: 50, name: 'Lagonda Esses' },
  { kind: 'arc', radius: 65, deg: -55 },
  { kind: 'straight', len: 120 },
  { kind: 'arc', radius: 150, deg: -75, name: 'Vantage Sweep' },
  { kind: 'straight', len: 170 }, // back straight, south-bound
  { kind: 'arc', radius: 36, deg: 40, name: 'DBR Chicane' },
  { kind: 'arc', radius: 36, deg: -40 },
  { kind: 'straight', len: 150 },
  { kind: 'arc', radius: 110, deg: 32, name: 'Zagato Kink' },
  { kind: 'arc', radius: 38, deg: -122, name: 'Victor Hairpin' },
  { kind: 'straight', len: 'south' }, // west-bound run into the infield
  { kind: 'arc', radius: 46, deg: -75, name: 'Bulldog Bend' },
  { kind: 'straight', len: 110 },
  { kind: 'arc', radius: 30, deg: 165, name: 'Lagonda Loop' },
  { kind: 'straight', len: 95 },
  { kind: 'arc', radius: 36, deg: -180, name: 'Brown Corner' },
];

export interface TrackCorner {
  name: string;
  /** Distance (m, from the start line) of the corner's apex. */
  apexS: number;
  direction: 'left' | 'right';
  radius: number;
}

export interface TrackData {
  name: string;
  length: number;
  spacing: number;
  count: number;
  px: Float32Array;
  pz: Float32Array;
  /** Unit tangent (direction of travel). Right = (−tz, tx). */
  tx: Float32Array;
  tz: Float32Array;
  /** Distance from the start line at each sample (s[0] = 0). */
  s: Float32Array;
  /** Signed curvature (1/m), positive in right-hand bends. */
  curvature: Float32Array;
  /** 0..1 how much kerb to show at each sample (corners only). */
  kerb: Float32Array;
  halfWidth: number;
  kerbWidth: number;
  /** Lateral distance from the centre line to the barrier face, per side. */
  barrierLeft: Float32Array;
  barrierRight: Float32Array;
  sectorS: [number, number];
  /** Distance before the line where the car is gridded. */
  gridBack: number;
  corners: TrackCorner[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface TrackLocation {
  index: number;
  /** Distance along the lap from the start line, 0..length. */
  s: number;
  /** Signed offset from the centre line, + = right of the direction of travel. */
  lateral: number;
  tx: number;
  tz: number;
  curvature: number;
}

const STEP = 0.25; // integration step (m)

interface RawPath {
  x: number[];
  z: number[];
  psi: number[];
  kappa: number[];
  cornerMarks: { name: string; atIndex: number; radius: number; dir: 'left' | 'right'; len: number }[];
}

function walk(layout: Segment[], mainLen: number, southLen: number): RawPath {
  const out: RawPath = { x: [0], z: [0], psi: [0], kappa: [0], cornerMarks: [] };
  let x = 0;
  let z = 0;
  let psi = 0;
  for (const seg of layout) {
    let len: number;
    let k = 0;
    if (seg.kind === 'straight') {
      len = seg.len === 'main' ? mainLen : seg.len === 'south' ? southLen : seg.len;
    } else {
      const ang = (seg.deg * Math.PI) / 180;
      len = seg.radius * Math.abs(ang);
      k = ang / len; // dψ/ds
      if (seg.name) {
        out.cornerMarks.push({
          name: seg.name,
          atIndex: out.x.length - 1 + Math.round(len / STEP / 2),
          radius: seg.radius,
          dir: seg.deg > 0 ? 'left' : 'right',
          len,
        });
      }
    }
    const n = Math.max(1, Math.round(len / STEP));
    const ds = len / n;
    for (let i = 0; i < n; i++) {
      const mid = psi + k * ds * 0.5;
      x += -Math.sin(mid) * ds;
      z += -Math.cos(mid) * ds;
      psi += k * ds;
      out.x.push(x);
      out.z.push(z);
      out.psi.push(psi);
      out.kappa.push(k);
    }
  }
  return out;
}

/** Circular box blur (in samples) – used to turn curvature steps into smooth transitions. */
function blurCircular(src: Float64Array, radius: number): Float64Array {
  const n = src.length;
  const out = new Float64Array(n);
  let acc = 0;
  for (let i = -radius; i <= radius; i++) acc += src[(i + n) % n];
  const w = 2 * radius + 1;
  for (let i = 0; i < n; i++) {
    out[i] = acc / w;
    acc += src[(i + radius + 1) % n] - src[(i - radius + n) % n];
  }
  return out;
}

export function buildTrack(): TrackData {
  // 1) Solve the two free straights: with them at zero length, the rest of the lap leaves a
  //    displacement D; the main straight (north) and south run (west) must cancel it.
  const probe = walk(LAYOUT, 0, 0);
  const dx = probe.x[probe.x.length - 1];
  const dz = probe.z[probe.z.length - 1];
  // main straight heads north: contributes (0, −L); south run heads west: (−L, 0)
  const mainLen = dz;
  const southLen = dx;
  if (mainLen < 200 || southLen < 60) {
    throw new Error(`Track layout does not close sensibly (main ${mainLen.toFixed(1)} m, south ${southLen.toFixed(1)} m)`);
  }
  const raw = walk(LAYOUT, mainLen, southLen);

  // 2) Smooth the curvature profile (~22 m window) and re-integrate: constant-radius arcs become
  //    clothoid-like entries/exits so steering builds progressively instead of snapping.
  const nRaw = raw.x.length - 1; // last point duplicates the first (closed loop)
  const kappa = new Float64Array(nRaw);
  for (let i = 0; i < nRaw; i++) kappa[i] = raw.kappa[i + 1];
  const smooth = blurCircular(blurCircular(kappa, 44), 44);
  const xs = new Float64Array(nRaw + 1);
  const zs = new Float64Array(nRaw + 1);
  let psi = 0;
  for (let i = 0; i < nRaw; i++) {
    const mid = psi + smooth[i] * STEP * 0.5;
    xs[i + 1] = xs[i] - Math.sin(mid) * STEP;
    zs[i + 1] = zs[i] - Math.cos(mid) * STEP;
    psi += smooth[i] * STEP;
  }
  // Blurring keeps the total turn (−2π) but nudges the end point; spread that gap along the lap.
  const ex = xs[nRaw];
  const ez = zs[nRaw];
  for (let i = 0; i <= nRaw; i++) {
    const t = i / nRaw;
    xs[i] -= ex * t;
    zs[i] -= ez * t;
  }

  // 3) Resample at a fixed spacing.
  const rawLen = nRaw * STEP;
  const spacing = 2;
  const count = Math.round(rawLen / spacing);
  const length = count * spacing;
  const px = new Float32Array(count);
  const pz = new Float32Array(count);
  const curvature = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const f = (i * spacing * nRaw) / length;
    const i0 = Math.floor(f) % nRaw;
    const t = f - Math.floor(f);
    px[i] = xs[i0] + (xs[i0 + 1] - xs[i0]) * t;
    pz[i] = zs[i0] + (zs[i0 + 1] - zs[i0]) * t;
    curvature[i] = -smooth[i0]; // dψ/ds < 0 in right-handers → positive "right" curvature
  }

  // 4) Rotate so sample 0 sits on the start line: 175 m into the main straight.
  const shift = Math.round(175 / spacing);
  const rot = <T extends Float32Array>(a: T): T => {
    const b = new (a.constructor as { new (n: number): T })(a.length);
    for (let i = 0; i < a.length; i++) b[i] = a[(i + shift) % a.length];
    return b;
  };
  const PX = rot(px);
  const PZ = rot(pz);
  const K = rot(curvature);
  // Curvature smoothing bleeds the last bend's exit into the straight and leaves the whole lap
  // rotated by a few degrees; square it up so the start line sits at the origin facing north.
  {
    const x0 = PX[0];
    const z0 = PZ[0];
    const hx = PX[1] - PX[count - 1];
    const hz = PZ[1] - PZ[count - 1];
    const psi0 = Math.atan2(-hx, -hz);
    const c = Math.cos(-psi0);
    const sn = Math.sin(-psi0);
    for (let i = 0; i < count; i++) {
      const x = PX[i] - x0;
      const z = PZ[i] - z0;
      PX[i] = x * c + z * sn;
      PZ[i] = -x * sn + z * c;
    }
  }

  const tx = new Float32Array(count);
  const tz = new Float32Array(count);
  const s = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i - 1 + count) % count;
    const b = (i + 1) % count;
    let vx = PX[b] - PX[a];
    let vz = PZ[b] - PZ[a];
    const l = Math.hypot(vx, vz) || 1;
    vx /= l;
    vz /= l;
    tx[i] = vx;
    tz[i] = vz;
    s[i] = i * spacing;
  }

  // 5) Kerbs where the bend tightens below ~230 m radius, feathered so they start and end cleanly.
  const kerbRaw = new Float64Array(count);
  for (let i = 0; i < count; i++) kerbRaw[i] = Math.abs(K[i]) > 1 / 230 ? 1 : 0;
  const kerbWide = blurCircular(kerbRaw, 8);
  const kerb = new Float32Array(count);
  for (let i = 0; i < count; i++) kerb[i] = kerbWide[i] > 0.05 ? 1 : 0;

  // 6) Barriers: 17 m run-off by default; never closer to a bend's centre than 70 % of its radius.
  const halfWidth = 6.5;
  const kerbWidth = 1.3;
  const runoff = 17;
  const left = new Float64Array(count);
  const right = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const k = K[i];
    const r = Math.abs(k) > 1e-6 ? 1 / Math.abs(k) : 1e9;
    const inside = Math.min(runoff, Math.max(halfWidth + kerbWidth + 3, r * 0.7));
    // right-hand bend: the inside is on the right
    right[i] = k > 0 ? inside : runoff;
    left[i] = k < 0 ? inside : runoff;
  }
  const barrierLeft = Float32Array.from(blurCircular(blurCircular(left, 6), 6));
  const barrierRight = Float32Array.from(blurCircular(blurCircular(right, 6), 6));

  const corners: TrackCorner[] = raw.cornerMarks.map((c) => {
    const rawS = (c.atIndex % nRaw) * STEP;
    const sOnLap = (((rawS / rawLen) * length - shift * spacing) % length + length) % length;
    return { name: c.name, apexS: sOnLap, direction: c.dir, radius: c.radius };
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, PX[i]);
    maxX = Math.max(maxX, PX[i]);
    minZ = Math.min(minZ, PZ[i]);
    maxZ = Math.max(maxZ, PZ[i]);
  }

  return {
    name: 'Gaydon Proving Ground',
    length,
    spacing,
    count,
    px: PX,
    pz: PZ,
    tx,
    tz,
    s,
    curvature: K,
    kerb,
    halfWidth,
    kerbWidth,
    barrierLeft,
    barrierRight,
    sectorS: [Math.round(length * 0.34), Math.round(length * 0.68)],
    gridBack: 28,
    corners,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

/**
 * Projects (x, z) onto the centre line. `hint` is the last known sample index – the search only
 * scans ±60 m around it, so pass −1 after a teleport to scan the whole lap.
 */
export function locateOnTrack(track: TrackData, x: number, z: number, hint: number, out: TrackLocation): TrackLocation {
  const { count, px, pz } = track;
  let best = 0;
  let bestD = Infinity;
  if (hint < 0) {
    for (let i = 0; i < count; i++) {
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  } else {
    for (let o = -30; o <= 30; o++) {
      const i = (hint + o + count) % count;
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  // Choose the segment (best−1→best or best→best+1) the point actually projects onto.
  const prev = (best - 1 + count) % count;
  const next = (best + 1) % count;
  const fwd = (x - px[best]) * track.tx[best] + (z - pz[best]) * track.tz[best];
  const a = fwd >= 0 ? best : prev;
  const b = fwd >= 0 ? next : best;
  const sx = px[b] - px[a];
  const sz = pz[b] - pz[a];
  const segLen2 = sx * sx + sz * sz || 1;
  const t = Math.max(0, Math.min(1, ((x - px[a]) * sx + (z - pz[a]) * sz) / segLen2));
  const cx = px[a] + sx * t;
  const cz = pz[a] + sz * t;
  const tX = track.tx[a] + (track.tx[b] - track.tx[a]) * t;
  const tZ = track.tz[a] + (track.tz[b] - track.tz[a]) * t;
  const tl = Math.hypot(tX, tZ) || 1;
  out.index = best;
  out.s = (track.s[a] + t * track.spacing) % track.length;
  out.tx = tX / tl;
  out.tz = tZ / tl;
  // right = (−tz, tx)
  out.lateral = (x - cx) * -out.tz + (z - cz) * out.tx;
  out.curvature = track.curvature[a] + (track.curvature[b] - track.curvature[a]) * t;
  return out;
}

/** Centre-line pose at distance s (wraps). */
export function poseAt(track: TrackData, s: number): { x: number; z: number; heading: number; index: number } {
  const L = track.length;
  const sw = ((s % L) + L) % L;
  const f = sw / track.spacing;
  const i0 = Math.floor(f) % track.count;
  const i1 = (i0 + 1) % track.count;
  const t = f - Math.floor(f);
  const x = track.px[i0] + (track.px[i1] - track.px[i0]) * t;
  const z = track.pz[i0] + (track.pz[i1] - track.pz[i0]) * t;
  const tX = track.tx[i0] + (track.tx[i1] - track.tx[i0]) * t;
  const tZ = track.tz[i0] + (track.tz[i1] - track.tz[i0]) * t;
  // forward = (−sin ψ, −cos ψ)  →  ψ = atan2(−tx, −tz)
  return { x, z, heading: Math.atan2(-tX, -tZ), index: i0 };
}

/** Signed distance travelled from a to b along the lap, in (−L/2, L/2]. */
export function lapDelta(track: TrackData, a: number, b: number): number {
  const L = track.length;
  let d = (b - a) % L;
  if (d > L / 2) d -= L;
  if (d <= -L / 2) d += L;
  return d;
}
