/*
 * Sundown Circuit — turns a track's per-segment curve and height values into a
 * real 3D centreline in metres, used by the WebGL world. Pure math, no DOM.
 *
 * Scales are chosen so the world is physically consistent with the simulation:
 * the road is 10.5 m wide (three 3.5 m lanes), a car is 2 m wide, and the
 * speedometer reading matches how fast the scenery actually goes by.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});
  const C = SC.CONFIG;

  const SCALE = {
    long: C.metersPerUnit, // along the track
    lat: 5.25, // metres per road half-width (x = ±1 is the road edge)
    vert: 0.003, // height units to metres (keeps the steepest climb near 30%)
  };

  /**
   * @returns {{ n, px, py, pz, fx, fz, rx, rz, heading, segLen, length }}
   * Arrays are indexed by segment; index n repeats index 0 to close the loop.
   */
  function buildCenterline(track) {
    const segs = track.segments;
    const n = segs.length;
    const segLen = C.segmentLength * SCALE.long;

    let sum = 0;
    for (const s of segs) sum += s.curve;
    const k = Math.abs(sum) > 1 ? (2 * Math.PI) / sum : 0;

    const px = new Float64Array(n + 1);
    const pz = new Float64Array(n + 1);
    const py = new Float64Array(n + 1);
    let h = 0;
    let x = 0;
    let z = 0;
    for (let i = 0; i < n; i++) {
      px[i] = x;
      pz[i] = z;
      py[i] = segs[i].p1.world.y * SCALE.vert;
      // advance using the heading at the middle of the segment for accuracy
      const mid = h + segs[i].curve * k * 0.5;
      x += Math.sin(mid) * segLen;
      z -= Math.cos(mid) * segLen;
      h += segs[i].curve * k;
    }
    // Spread any closing gap evenly around the lap.
    const gx = x - px[0];
    const gz = z - pz[0];
    for (let i = 0; i < n; i++) {
      px[i] -= (gx * i) / n;
      pz[i] -= (gz * i) / n;
    }
    // Centre the circuit on the origin.
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      cx += px[i];
      cz += pz[i];
    }
    cx /= n;
    cz /= n;
    for (let i = 0; i < n; i++) {
      px[i] -= cx;
      pz[i] -= cz;
    }
    px[n] = px[0];
    pz[n] = pz[0];
    py[n] = py[0];

    // Tangents from neighbouring points, then the right-hand vector.
    const fx = new Float64Array(n + 1);
    const fz = new Float64Array(n + 1);
    const rx = new Float64Array(n + 1);
    const rz = new Float64Array(n + 1);
    const heading = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      let dx = px[b] - px[a];
      let dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      fx[i] = dx;
      fz[i] = dz;
      rx[i] = -dz; // forward (sin h, -cos h) → right (cos h, sin h)
      rz[i] = dx;
      heading[i] = Math.atan2(dx, -dz);
    }
    return { n, px, py, pz, fx, fz, rx, rz, heading, segLen, length: n * segLen };
  }

  /**
   * Sample the centreline at simulation distance z (world units) and lateral
   * offset x (road half-widths). Writes into `out` to avoid allocations.
   */
  function sample(line, z, x, out) {
    const n = line.n;
    const u = (((z / C.segmentLength) % n) + n) % n;
    const i = Math.floor(u);
    const t = u - i;
    const j = i + 1;
    const fx = line.fx[i] + (line.fx[j] - line.fx[i]) * t;
    const fz = line.fz[i] + (line.fz[j] - line.fz[i]) * t;
    const l = Math.hypot(fx, fz) || 1;
    out.fx = fx / l;
    out.fz = fz / l;
    out.rx = -out.fz;
    out.rz = out.fx;
    const lat = x * SCALE.lat;
    out.x = line.px[i] + (line.px[j] - line.px[i]) * t + out.rx * lat;
    out.z = line.pz[i] + (line.pz[j] - line.pz[i]) * t + out.rz * lat;
    out.y = line.py[i] + (line.py[j] - line.py[i]) * t;
    out.slope = (line.py[j] - line.py[i]) / line.segLen;
    out.heading = Math.atan2(out.fx, -out.fz);
    return out;
  }

  /**
   * Closest approach between two stretches of road that are far apart along
   * the lap. A small value means the circuit crosses or nearly touches itself.
   */
  function closestApproach(line, minSeparation) {
    const n = line.n;
    const skip = Math.ceil(minSeparation / line.segLen);
    let best = Infinity;
    let at = [-1, -1];
    for (let i = 0; i < n; i += 2) {
      for (let j = i + skip; j < n; j += 2) {
        if (n - (j - i) < skip) continue;
        const d = Math.hypot(line.px[i] - line.px[j], line.pz[i] - line.pz[j]);
        if (d < best) {
          best = d;
          at = [i, j];
        }
      }
    }
    return { distance: best, at };
  }

  SC.WORLD_SCALE = SCALE;
  SC.centerline = { build: buildCenterline, sample, closestApproach };
})();
