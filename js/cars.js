/*
 * Sundown Circuit — the cars.
 *
 * Three body styles (mid-engine supercar, front-engine GT, muscle coupe), each
 * lofted from real automotive cross-sections: flat sides with a shoulder
 * crease, fender crests over the wheels, a hood that sits between them and
 * flared wheel arches. Lights, grilles, vents, panel gaps, door handles and
 * window glass are painted per pixel in object space by the paint shader, so
 * every detail follows the bodywork exactly. Wheels are real geometry with
 * spoked rims, brake discs and callipers that steer but do not spin.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  /* ------------------------------------------------------------------ */
  /* Body styles (metres; the car faces -z, x is to its right)           */
  /* ------------------------------------------------------------------ */

  const STYLES = {
    super: {
      name: 'Mid-engine supercar',
      axleF: -1.4,
      axleR: 1.32,
      trackF: 0.83,
      trackR: 0.84,
      wheelR: 0.345,
      tyreF: 0.255,
      tyreR: 0.305,
      // z, half-width, bottom, shoulder crease, fender crest, hood dip, crown
      body: [
        [-2.33, 0.46, 0.25, 0.3, 0.34, 0.0, 0.0],
        [-2.27, 0.66, 0.22, 0.34, 0.4, 0.0, 0.0],
        [-2.15, 0.88, 0.15, 0.4, 0.5, 0.03, 0.01],
        [-1.85, 0.96, 0.12, 0.5, 0.71, 0.12, 0.015],
        [-1.4, 0.99, 0.12, 0.56, 0.8, 0.15, 0.02],
        [-0.95, 0.96, 0.12, 0.55, 0.74, 0.08, 0.02],
        [-0.4, 0.94, 0.12, 0.54, 0.7, 0.0, 0.03],
        [0.3, 0.97, 0.12, 0.58, 0.76, 0.0, 0.03],
        [0.9, 1.01, 0.13, 0.64, 0.84, 0.04, 0.03],
        [1.32, 1.03, 0.14, 0.66, 0.88, 0.06, 0.03],
        [1.8, 1.0, 0.17, 0.66, 0.86, 0.04, 0.02],
        [2.1, 0.95, 0.22, 0.65, 0.83, 0.02, 0.01],
        [2.27, 0.88, 0.28, 0.62, 0.79, 0.0, 0.0],
      ],
      // z, base half-width, roof half-width, base height, roof height
      cabin: [
        [-1.06, 0.8, 0.74, 0.48, 0.5],
        [-0.7, 0.8, 0.7, 0.56, 0.86],
        [-0.25, 0.8, 0.62, 0.62, 1.1],
        [0.2, 0.81, 0.6, 0.64, 1.14],
        [0.65, 0.82, 0.6, 0.66, 1.12],
        [1.1, 0.8, 0.58, 0.7, 0.98],
        [1.55, 0.76, 0.56, 0.66, 0.74],
      ],
      win: { zF: -0.86, zW: -0.22, zB: 0.3, zC: 0.98, zR: 0.7, belt: [0.69, 0.07], roofBlack: 1 },
      hl: { x0: 0.46, x1: 0.88, y0: 0.4, y1: 0.47, slant: 0.1, zMax: -1.88 },
      tl: { barY: [0.7, 0.725], barX: 0.8, zMin: 2.05, cl: [0.52, 0.84, 0.62, 0.7], seg: 0 },
      grille: { x: 0.46, y0: 0.2, y1: 0.31, zMax: -2.05 },
      door: { zF: -0.62, zR: 0.4, yB: 0.19, yT: 0.6 },
      hood: { z: -1.02, x: 0.52, trunkZ: 1.12, trunkX: 0.62 },
      vent: { z0: 0.42, z1: 0.98, y0: 0.3, y1: 0.58 },
      handle: { z: 0.3, y: 0.56 },
      louvres: 1,
      scoop: 0,
      exhausts: [[-0.11, 0.38], [0.11, 0.38]],
      plate: { rear: 0.5, front: 0 },
      mirrorZ: -0.6,
      hoodCam: [0.98, -1.3],
      interior: { dashZ: -0.62, seatZ: 0.12, seatY: 0.38 },
    },
    gt: {
      name: 'Front-engine GT',
      axleF: -1.38,
      axleR: 1.44,
      trackF: 0.82,
      trackR: 0.83,
      wheelR: 0.345,
      tyreF: 0.255,
      tyreR: 0.295,
      body: [
        [-2.36, 0.52, 0.27, 0.36, 0.42, 0.0, 0.0],
        [-2.3, 0.68, 0.24, 0.4, 0.48, 0.0, 0.0],
        [-2.18, 0.88, 0.17, 0.47, 0.58, 0.02, 0.01],
        [-1.85, 0.95, 0.14, 0.55, 0.73, 0.08, 0.015],
        [-1.38, 0.98, 0.14, 0.6, 0.8, 0.1, 0.02],
        [-0.7, 0.95, 0.14, 0.59, 0.76, 0.04, 0.02],
        [0.0, 0.95, 0.14, 0.6, 0.78, 0.0, 0.03],
        [0.8, 0.98, 0.15, 0.63, 0.83, 0.02, 0.03],
        [1.44, 1.01, 0.16, 0.66, 0.87, 0.05, 0.03],
        [1.95, 0.96, 0.2, 0.68, 0.86, 0.02, 0.02],
        [2.3, 0.86, 0.28, 0.68, 0.84, 0.0, 0.0],
      ],
      cabin: [
        [-0.6, 0.8, 0.74, 0.54, 0.58],
        [-0.25, 0.8, 0.7, 0.64, 0.98],
        [0.2, 0.8, 0.63, 0.66, 1.2],
        [0.7, 0.81, 0.61, 0.68, 1.2],
        [1.3, 0.8, 0.6, 0.72, 1.02],
        [1.95, 0.76, 0.58, 0.7, 0.78],
      ],
      win: { zF: -0.45, zW: 0.2, zB: 0.6, zC: 1.28, zR: 0.76, belt: [0.76, 0.05], roofBlack: 0 },
      hl: { x0: 0.44, x1: 0.86, y0: 0.46, y1: 0.53, slant: 0.07, zMax: -1.98 },
      tl: { barY: [0.76, 0.785], barX: 0.78, zMin: 2.1, cl: [0.5, 0.82, 0.7, 0.78], seg: 0 },
      grille: { x: 0.42, y0: 0.22, y1: 0.42, zMax: -2.12 },
      door: { zF: -0.48, zR: 0.88, yB: 0.21, yT: 0.62 },
      hood: { z: -0.66, x: 0.6, trunkZ: 1.68, trunkX: 0.62 },
      vent: { z0: -1.05, z1: -0.8, y0: 0.4, y1: 0.52 },
      handle: { z: 0.72, y: 0.6 },
      louvres: 0,
      scoop: 0,
      exhausts: [[-0.55, 0.3], [-0.4, 0.3], [0.4, 0.3], [0.55, 0.3]],
      plate: { rear: 0.5, front: 0.32 },
      mirrorZ: -0.25,
      hoodCam: [1.04, -0.85],
      interior: { dashZ: -0.22, seatZ: 0.4, seatY: 0.46 },
    },
    muscle: {
      name: 'Muscle coupe',
      axleF: -1.45,
      axleR: 1.4,
      trackF: 0.83,
      trackR: 0.83,
      wheelR: 0.35,
      tyreF: 0.265,
      tyreR: 0.31,
      body: [
        [-2.37, 0.66, 0.3, 0.48, 0.56, 0.0, 0.0],
        [-2.32, 0.8, 0.28, 0.52, 0.6, 0.0, 0.0],
        [-2.22, 0.92, 0.2, 0.56, 0.66, 0.0, 0.02],
        [-1.85, 0.96, 0.16, 0.62, 0.77, 0.04, 0.05],
        [-1.45, 0.97, 0.16, 0.65, 0.82, 0.05, 0.06],
        [-0.7, 0.96, 0.16, 0.64, 0.77, 0.0, 0.03],
        [0.1, 0.96, 0.16, 0.66, 0.79, 0.0, 0.02],
        [0.85, 0.99, 0.17, 0.68, 0.83, 0.0, 0.02],
        [1.4, 1.0, 0.18, 0.7, 0.86, 0.01, 0.02],
        [2.0, 0.97, 0.22, 0.72, 0.87, 0.0, 0.01],
        [2.32, 0.92, 0.28, 0.72, 0.86, 0.0, 0.0],
      ],
      cabin: [
        [-0.66, 0.82, 0.76, 0.58, 0.62],
        [-0.3, 0.82, 0.72, 0.68, 1.08],
        [0.1, 0.82, 0.66, 0.7, 1.29],
        [0.7, 0.83, 0.65, 0.72, 1.29],
        [1.2, 0.82, 0.64, 0.74, 1.05],
        [1.55, 0.8, 0.62, 0.7, 0.78],
      ],
      win: { zF: -0.52, zW: 0.06, zB: 0.45, zC: 0.98, zR: 0.8, belt: [0.8, 0.03], roofBlack: 0 },
      hl: { x0: 0.48, x1: 0.88, y0: 0.52, y1: 0.6, slant: 0.0, zMax: -2.12 },
      tl: { barY: [0.74, 0.8], barX: 0.86, zMin: 2.15, cl: [0, 0, 0, 0], seg: 7 },
      grille: { x: 0.46, y0: 0.3, y1: 0.58, zMax: -2.15 },
      door: { zF: -0.55, zR: 0.62, yB: 0.23, yT: 0.66 },
      hood: { z: -0.7, x: 0.62, trunkZ: 1.62, trunkX: 0.66 },
      vent: { z0: 0, z1: 0, y0: 0, y1: 0 },
      handle: { z: 0.48, y: 0.64 },
      louvres: 0,
      scoop: 1,
      exhausts: [[-0.62, 0.28], [0.62, 0.28]],
      plate: { rear: 0.48, front: 0.36 },
      mirrorZ: -0.32,
      hoodCam: [1.08, -1.0],
      interior: { dashZ: -0.4, seatZ: 0.24, seatY: 0.48 },
    },
  };

  /** Catmull-Rom subdivision of a half cross-section, mirrored across x = 0 at both ends. */
  function subdivide(pts, k) {
    const n = pts.length;
    const P = (i) => (i < 0 ? [-pts[1][0], pts[1][1]] : i >= n ? [-pts[n - 2][0], pts[n - 2][1]] : pts[i]);
    const out = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      for (let s = 0; s < k; s++) {
        const t = s / k;
        const t2 = t * t;
        const t3 = t2 * t;
        const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push([c(0), c(1)]);
      }
    }
    out.push(pts[n - 1].slice());
    return out;
  }

  /** Full ring from a right-half profile: bottom centre → up the right → over → down the left. */
  function ring(half) {
    const left = half.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
    return half.concat(left);
  }

  /** Interpolate keyed rows (first column is z) at z, per column, with Catmull-Rom. */
  function keyedRow(keys, z) {
    let i = 0;
    while (i < keys.length - 2 && z > keys[i + 1][0]) i++;
    const k0 = keys[Math.max(0, i - 1)];
    const k1 = keys[i];
    const k2 = keys[i + 1];
    const k3 = keys[Math.min(keys.length - 1, i + 2)];
    const t = Math.min(1, Math.max(0, (z - k1[0]) / (k2[0] - k1[0])));
    const t2 = t * t;
    const t3 = t2 * t;
    return k1.map((_, j) => 0.5 * (2 * k1[j] + (-k0[j] + k2[j]) * t + (2 * k0[j] - 5 * k1[j] + 4 * k2[j] - k3[j]) * t2 + (-k0[j] + 3 * k1[j] - 3 * k2[j] + k3[j]) * t3));
  }

  /** Right-half body cross-section at z. */
  function bodyHalf(style, z) {
    const [, hw0, y0, ys, yt, dip, crown] = keyedRow(style.body, z);
    let hw = hw0;
    for (const axle of [style.axleF, style.axleR]) hw += 0.025 * Math.exp(-(((z - axle) / 0.42) ** 2)); // arch flares
    return [
      [0, y0],
      [hw * 0.8, y0],
      [hw * 0.96, y0 + 0.04],
      [hw, y0 + (ys - y0) * 0.4],
      [hw * 0.99, ys - 0.025],
      [hw * 0.965, ys + 0.01],
      [hw * 0.9, yt - 0.035],
      [hw * 0.74, yt],
      [hw * 0.4, yt - dip],
      [0, yt - dip + crown],
    ];
  }

  /** Right-half glasshouse cross-section at z. */
  function cabinHalf(style, z) {
    const [, hwb, hwr, yb, yr] = keyedRow(style.cabin, z);
    return [
      [0, yb],
      [hwb * 0.9, yb],
      [hwb, yb + (yr - yb) * 0.25],
      [hwr + 0.03, yr - 0.055],
      [hwr * 0.72, yr - 0.008],
      [0, yr],
    ];
  }

  SC.CAR_STYLES = STYLES;
  SC.carProfiles = { subdivide, ring, keyedRow, bodyHalf, cabinHalf };

  /* ------------------------------------------------------------------ */
  /* three.js side                                                       */
  /* ------------------------------------------------------------------ */

  (SC.threeInit = SC.threeInit || []).push(function (THREE) {
    const MD = SC.models;
    const place = MD.place;
    const merge = MD.merge;
    const shared = MD.shared;

    /**
     * Loft rings along z. ringAt(z) returns [[x, y], ...] (same length each
     * time). End caps get their own vertices so their edges stay crisp.
     */
    function loft(z0, z1, count, ringAt, cosine) {
      const pos = [];
      const uv = [];
      const idx = [];
      let width = 0;
      const rings = [];
      for (let s = 0; s <= count; s++) {
        const t = s / count;
        const z = z0 + (z1 - z0) * (cosine ? 0.5 - 0.5 * Math.cos(t * Math.PI) : t);
        const r = ringAt(z);
        width = r.length;
        rings.push(r);
        for (let i = 0; i < r.length; i++) {
          pos.push(r[i][0], r[i][1], z);
          uv.push(i / (r.length - 1), (z - z0) / (z1 - z0));
        }
      }
      for (let s = 0; s < count; s++) {
        for (let i = 0; i < width - 1; i++) {
          const a = s * width + i;
          const b = a + width;
          idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
      for (const [s, front] of [[0, true], [count, false]]) {
        const r = rings[s];
        const z = pos[s * width * 3 + 2];
        const base = pos.length / 3;
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < width - 1; i++) {
          pos.push(r[i][0], r[i][1], z);
          uv.push(i / (width - 1), front ? 0 : 1);
          cx += r[i][0];
          cy += r[i][1];
        }
        const centre = pos.length / 3;
        pos.push(cx / (width - 1), cy / (width - 1), z);
        uv.push(0.5, front ? 0 : 1);
        for (let i = 0; i < width - 1; i++) {
          const a = base + i;
          const b = base + ((i + 1) % (width - 1));
          if (front) idx.push(centre, b, a);
          else idx.push(centre, a, b);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    /* Geometry per style ------------------------------------------------ */

    const geoCache = new Map();

    function styleGeometry(id, detail) {
      const key = id + ':' + detail;
      if (geoCache.has(key)) return geoCache.get(key);
      const st = STYLES[id];
      const hi = detail === 'high';
      const kBody = hi ? 5 : 3;
      const kCabin = hi ? 6 : 4;
      const z0 = st.body[0][0];
      const z1 = st.body[st.body.length - 1][0];
      const archR = st.wheelR + 0.055;

      const body = loft(z0, z1, hi ? 130 : 70, (z) => {
        const r = ring(subdivide(bodyHalf(st, z), kBody));
        for (const p of r) {
          if (Math.abs(p[0]) < 0.52) continue;
          for (const axle of [st.axleF, st.axleR]) {
            const dz = z - axle;
            if (Math.abs(dz) < archR) {
              const arch = st.wheelR + Math.sqrt(archR * archR - dz * dz);
              if (p[1] < arch) p[1] = arch;
            }
          }
        }
        return r;
      }, true);

      const c0 = st.cabin[0][0];
      const c1 = st.cabin[st.cabin.length - 1][0];
      const cabin = loft(c0, c1, hi ? 64 : 36, (z) => ring(subdivide(cabinHalf(st, z), kCabin)), false);

      // Dark wheel wells: half-cylinders over each axle.
      const wells = [];
      for (const [axle, track] of [[st.axleF, st.trackF], [st.axleR, st.trackR]]) {
        for (const side of [-1, 1]) {
          // only as wide as the view through the arch, so it stays under the bodywork
          const w = new THREE.CylinderGeometry(archR - 0.03, archR - 0.03, 0.26, 20, 1, true, 0, Math.PI);
          w.rotateZ(Math.PI / 2);
          w.translate(side * (track - 0.06), st.wheelR, axle);
          wells.push(w);
        }
      }

      // Interior seen through the glass.
      const it = st.interior;
      const interior = merge([
        place(new THREE.BoxGeometry(1.42, 0.16, 0.36), { y: it.seatY + 0.2, z: it.dashZ }),
        ...[-0.36, 0.36].map((x) => place(new THREE.BoxGeometry(0.46, 0.62, 0.12), { x, y: it.seatY + 0.18, z: it.seatZ, rx: -0.22 })),
        ...[-0.36, 0.36].map((x) => place(new THREE.BoxGeometry(0.24, 0.18, 0.1), { x, y: it.seatY + 0.55, z: it.seatZ + 0.1, rx: -0.22 })),
        place(new THREE.TorusGeometry(0.17, 0.022, 8, 24), { x: -0.36, y: it.seatY + 0.28, z: it.dashZ + 0.32, rx: -0.35 }),
        place(new THREE.BoxGeometry(0.22, 0.12, 0.8), { y: it.seatY - 0.02, z: (it.dashZ + it.seatZ) / 2 }),
      ]);

      // Exhaust tips and their dark bores.
      const tipZ = z1 + 0.02;
      const tips = merge(st.exhausts.map(([x, y]) => place(new THREE.CylinderGeometry(0.048, 0.052, 0.16, 18, 1, true), { x, y, z: tipZ - 0.06, rx: Math.PI / 2 })));
      const bores = merge(st.exhausts.map(([x, y]) => place(new THREE.CircleGeometry(0.044, 18), { x, y, z: tipZ - 0.04 })));

      // Mirrors: shells in body colour on short dark arms.
      const cabinAt = (z) => keyedRow(st.cabin, z);
      const mz = st.mirrorZ;
      const [, mhw] = cabinAt(mz);
      const my = st.win.belt[0] + st.win.belt[1] * (mz - st.win.zF) + 0.1;
      const mirrors = merge([-1, 1].map((s) => place(new THREE.SphereGeometry(1, 18, 10), { x: s * (mhw + 0.13), y: my, z: mz, sx: 0.1, sy: 0.052, sz: 0.085, ry: s * 0.18 })));
      const arms = merge([-1, 1].map((s) => place(new THREE.BoxGeometry(0.1, 0.02, 0.045), { x: s * (mhw + 0.05), y: my - 0.018, z: mz + 0.03 })));

      // Rear wing (GT), lip spoiler (muscle).
      let wing = null;
      if (id === 'gt') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(0.09, 0.045, 0.34, 0.012);
        shape.lineTo(0.34, 0.0);
        shape.quadraticCurveTo(0.12, -0.012, 0, 0);
        const foil = new THREE.ExtrudeGeometry(shape, { depth: 1.74, bevelEnabled: false, curveSegments: 10 });
        foil.rotateY(-Math.PI / 2); // chord runs front to back, span across the car
        foil.translate(0.87, 1.16, z1 - 0.48);
        wing = merge([
          foil.toNonIndexed(),
          place(new THREE.BoxGeometry(0.025, 0.2, 0.42), { x: -0.88, y: 1.13, z: z1 - 0.26 }),
          place(new THREE.BoxGeometry(0.025, 0.2, 0.42), { x: 0.88, y: 1.13, z: z1 - 0.26 }),
          place(new THREE.BoxGeometry(0.04, 0.3, 0.08), { x: -0.5, y: 1.0, z: z1 - 0.3 }),
          place(new THREE.BoxGeometry(0.04, 0.3, 0.08), { x: 0.5, y: 1.0, z: z1 - 0.3 }),
        ]);
      } else if (id === 'muscle') {
        wing = place(new THREE.BoxGeometry(1.5, 0.05, 0.14), { y: 0.9, z: z1 - 0.12, rx: 0.25 });
      }

      // Aero: carbon splitter, side skirts and diffuser fins.
      const [, hwMid, ySill] = keyedRow(st.body, (st.axleF + st.axleR) / 2);
      const ySplit = keyedRow(st.body, z0 + 0.27)[2] - 0.01;
      const yFins = keyedRow(st.body, z1 - 0.16)[2];
      const skirtLen = st.axleR - st.axleF - 2 * (st.wheelR + 0.12);
      const aero = merge([
        place(new THREE.BoxGeometry(1.36, 0.016, 0.22), { y: ySplit, z: z0 + 0.27 }),
        ...[-1, 1].map((sx) => place(new THREE.BoxGeometry(0.045, 0.06, skirtLen), { x: sx * (hwMid * 0.965), y: ySill + 0.02, z: (st.axleF + st.axleR) / 2 })),
        ...[-0.42, -0.21, 0, 0.21, 0.42].map((x) => place(new THREE.BoxGeometry(0.012, 0.07, 0.3), { x, y: yFins + 0.015, z: z1 - 0.17 })),
      ]);

      // A driver in a race suit and helmet, hands on the wheel (left-hand drive).
      const dx = -0.36;
      const sy = it.seatY;
      const shoulder = [sy + 0.4, it.seatZ - 0.1];
      const hands = [sy + 0.28, it.dashZ + 0.32];
      const armDy = hands[0] - shoulder[0];
      const armDz = hands[1] - shoulder[1];
      const armLen = Math.hypot(armDy, armDz);
      const head = { x: dx, y: sy + 0.55, z: it.seatZ - 0.04 };
      const driver = {
        suit: merge([
          place(new THREE.BoxGeometry(0.4, 0.44, 0.22), { x: dx, y: sy + 0.22, z: it.seatZ - 0.08, rx: -0.2 }),
          ...[-1, 1].map((sx) => place(new THREE.CylinderGeometry(0.042, 0.036, armLen, 8), { x: dx + sx * 0.16, y: (shoulder[0] + hands[0]) / 2, z: (shoulder[1] + hands[1]) / 2, rx: Math.atan2(armDz, armDy) })),
        ]),
        helmet: place(new THREE.SphereGeometry(0.125, 20, 14), head),
        visor: place(new THREE.SphereGeometry(0.128, 20, 8, Math.PI * 1.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.22), head),
      };

      // Night: the pool of light the headlights throw on the road ahead.
      const beams = place(new THREE.PlaneGeometry(3.6, 10), { rx: -Math.PI / 2, y: 0.035, z: st.hl.zMax - 5.2 });

      // Soft contact shadows where the tyres meet the road.
      const contact = merge([[st.axleF, st.trackF, st.tyreF], [st.axleR, st.trackR, st.tyreR]].flatMap(([axle, track, tw]) =>
        [-1, 1].map((sx) => place(new THREE.PlaneGeometry(tw + 0.12, 0.6), { rx: -Math.PI / 2, x: sx * track, y: 0.02, z: axle })),
      ));

      const plates = [];
      if (st.plate.rear) plates.push(place(new THREE.PlaneGeometry(0.52, 0.12), { y: st.plate.rear, z: z1 + 0.012 }));
      if (st.plate.front) plates.push(place(new THREE.PlaneGeometry(0.52, 0.12), { y: st.plate.front, z: z0 - 0.012, ry: Math.PI }));

      const out = {
        body,
        cabin,
        wells: merge(wells),
        interior,
        tips,
        bores,
        mirrors,
        arms,
        wing,
        plates: plates.length ? merge(plates) : null,
        aero,
        driver,
        beams,
        contact,
        shadow: place(new THREE.PlaneGeometry(2.5, 5.2), { rx: -Math.PI / 2, y: 0.025 }),
        flame: place(new THREE.ConeGeometry(0.055, 0.5, 12, 1, true), { rx: Math.PI / 2, z: 0.25 }),
      };
      geoCache.set(key, out);
      return out;
    }

    /* Wheels ------------------------------------------------------------ */

    const wheelCache = new Map();

    /** Bend an extruded spoke so the hub sits deeper than the rim (a concave dish). */
    function dish(geo, rimR, depth) {
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getY(i), pos.getZ(i));
        pos.setX(i, pos.getX(i) - depth * (1 - Math.min(1, r / rimR)));
      }
      geo.computeVertexNormals();
      return geo;
    }

    function wheelGeometry(R, W, detail) {
      const key = `${R}:${W}:${detail}`;
      if (wheelCache.has(key)) return wheelCache.get(key);
      const hi = detail === 'high';
      const seg = hi ? 48 : 28;
      const h = W / 2;
      const rimR = R * 0.72;

      // Tyre: lathed section with rounded shoulders. v runs inner bead → tread → outer bead.
      const profile = [
        [rimR, -h + 0.014, 0.0],
        [R * 0.8, -h - 0.004, 0.12],
        [R * 0.92, -h + 0.0, 0.22],
        [R * 0.975, -h + 0.016, 0.3],
        [R, -h + 0.05, 0.36],
        [R, h - 0.05, 0.64],
        [R * 0.975, h - 0.016, 0.7],
        [R * 0.92, h - 0.0, 0.78],
        [R * 0.8, h + 0.004, 0.88],
        [rimR, h - 0.014, 1.0],
      ];
      const tyre = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
      const tuv = tyre.getAttribute('uv');
      for (let i = 0; i < tuv.count; i++) tuv.setY(i, profile[i % profile.length][2]);
      tyre.rotateZ(-Math.PI / 2); // axle along x, outer sidewall towards +x

      // Rim: five twin spokes, machined with bevelled edges and dished towards the hub.
      const face = h - 0.018;
      const arm = new THREE.Shape();
      const r0 = 0.065;
      const r1 = rimR - 0.012;
      arm.moveTo(r0, -0.018);
      arm.lineTo(r1, -0.011);
      arm.lineTo(r1, 0.011);
      arm.lineTo(r0, 0.018);
      arm.closePath();
      const spokes = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.floor(i / 2) / 5) * Math.PI * 2 + (i % 2 ? 0.16 : -0.16);
        const g = new THREE.ExtrudeGeometry(arm, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: hi ? 2 : 1, curveSegments: 1 });
        g.rotateY(-Math.PI / 2); // radial → +z, thickness → -x
        g.rotateX(a - Math.PI / 2); // radial → (0, cos a, sin a)
        g.translate(face, 0, 0);
        spokes.push(dish(g, rimR, 0.04).toNonIndexed());
      }
      const lug = (k) => {
        const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
        return place(new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, 6), { x: face - 0.035, y: Math.cos(a) * 0.046, z: Math.sin(a) * 0.046, rz: Math.PI / 2 });
      };
      const rim = merge([
        ...spokes,
        place(new THREE.TorusGeometry(rimR - 0.006, 0.014, 10, seg), { x: face, ry: Math.PI / 2 }),
        place(new THREE.CylinderGeometry(0.068, 0.078, 0.045, 24), { x: face - 0.05, rz: Math.PI / 2 }),
        ...[0, 1, 2, 3, 4].map(lug),
      ]);
      const cap = place(new THREE.CircleGeometry(0.03, 20), { x: face - 0.021, ry: Math.PI / 2 });
      const barrel = merge([
        place(new THREE.CylinderGeometry(rimR, rimR, W - 0.03, seg, 1, true), { rz: Math.PI / 2 }),
        place(new THREE.CircleGeometry(rimR, seg), { x: -h + 0.05, ry: Math.PI / 2 }),
      ]);
      const disc = place(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.03, seg), { x: face - 0.13, rz: Math.PI / 2 });

      // Calliper: a rounded block hugging the top-rear of the disc.
      const cal = new THREE.Shape();
      const cw = 0.17;
      const ch = 0.075;
      const cr = 0.025;
      cal.moveTo(-cw / 2 + cr, -ch / 2);
      cal.lineTo(cw / 2 - cr, -ch / 2);
      cal.quadraticCurveTo(cw / 2, -ch / 2, cw / 2, -ch / 2 + cr);
      cal.lineTo(cw / 2, ch / 2 - cr);
      cal.quadraticCurveTo(cw / 2, ch / 2, cw / 2 - cr, ch / 2);
      cal.lineTo(-cw / 2 + cr, ch / 2);
      cal.quadraticCurveTo(-cw / 2, ch / 2, -cw / 2, ch / 2 - cr);
      cal.lineTo(-cw / 2, -ch / 2 + cr);
      cal.quadraticCurveTo(-cw / 2, -ch / 2, -cw / 2 + cr, -ch / 2);
      const caliper = new THREE.ExtrudeGeometry(cal, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
      caliper.rotateY(-Math.PI / 2); // block lies in the wheel plane, thickness along x
      const ca = 0.62; // radians back from the top
      caliper.rotateX(ca); // follow the disc's edge
      caliper.translate(face - 0.075, Math.cos(ca) * R * 0.5, Math.sin(ca) * R * 0.5);

      const blur = place(new THREE.CircleGeometry(rimR - 0.004, seg), { x: face + 0.008, ry: Math.PI / 2 });
      const out = { tyre, rim, cap, barrel, disc, caliper: caliper.toNonIndexed(), blur };
      wheelCache.set(key, out);
      return out;
    }

    /* Wheel textures ---------------------------------------------------- */

    /** Height field → tangent-space normal map canvas. */
    function heightToNormal(hgt, W, H, strength) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const img = g.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const l = hgt[y * W + ((x - 1 + W) % W)];
          const r = hgt[y * W + ((x + 1) % W)];
          const u = hgt[Math.max(0, y - 1) * W + x];
          const d = hgt[Math.min(H - 1, y + 1) * W + x];
          const nx = (l - r) * strength;
          const ny = (d - u) * strength;
          const L = Math.hypot(nx, ny, 1);
          const i = (y * W + x) * 4;
          img.data[i] = (nx / L * 0.5 + 0.5) * 255;
          img.data[i + 1] = (ny / L * 0.5 + 0.5) * 255;
          img.data[i + 2] = (1 / L * 0.5 + 0.5) * 255;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    function canvasTexture(c, srgb, repeat) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (repeat) t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    }

    /** Tread grooves and sidewall lettering (u around the tyre, v across it). */
    function tyreTextures() {
      return shared('tyre-tex', () => {
        const W = 1024;
        const H = 256;
        const hc = document.createElement('canvas');
        hc.width = W;
        hc.height = H;
        const g = hc.getContext('2d');
        g.fillStyle = '#808080';
        g.fillRect(0, 0, W, H);
        const vy = (v) => (1 - v) * H; // canvas row for a v coordinate (textures are flipped)
        // circumferential grooves
        g.fillStyle = '#202020';
        for (const v of [0.43, 0.5, 0.57]) g.fillRect(0, vy(v) - 3, W, 6);
        // shoulder sipes
        g.strokeStyle = '#2a2a2a';
        g.lineWidth = 3;
        for (let i = 0; i < 96; i++) {
          const x = (i / 96) * W;
          for (const [a, b] of [[0.37, 0.415], [0.585, 0.63]]) {
            g.beginPath();
            g.moveTo(x, vy(a));
            g.lineTo(x + 7, vy(b));
            g.stroke();
          }
        }
        // Raised lettering on the outer sidewall, twice around, tops towards the
        // tread. Laid out from measured widths so it never overlaps.
        g.fillStyle = '#c8c8c8';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const words = ['SUNDOWN', 'SPORT RS', '255/35 ZR20'];
        let size = 30;
        const fontAt = (px) => `700 ${px}px "Saira Condensed", "Arial Narrow", sans-serif`;
        const widthAt = (px) => {
          g.font = fontAt(px);
          return words.reduce((sum, w) => sum + g.measureText(w).width, 0);
        };
        while (widthAt(size) > W * 0.36 && size > 14) size -= 2;
        g.font = fontAt(size);
        const gap = (W / 2 - widthAt(size)) / words.length;
        for (const half of [0, W / 2]) {
          let x = half + gap / 2;
          for (const w of words) {
            const ww = g.measureText(w).width;
            g.save();
            g.translate(x + ww / 2, vy(0.86));
            g.scale(-1, -1);
            g.fillText(w, 0, 0);
            g.restore();
            x += ww + gap;
          }
        }
        const hd = g.getImageData(0, 0, W, H).data;
        const hgt = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) hgt[i] = hd[i * 4] / 255;
        // colour: rubber, letters a shade lighter, tread a touch darker
        const cc = document.createElement('canvas');
        cc.width = W;
        cc.height = H;
        const cg = cc.getContext('2d');
        const ci = cg.createImageData(W, H);
        const rnd = SC.util.rng(17);
        for (let y = 0; y < H; y++) {
          const v = 1 - y / H;
          const tread = v > 0.36 && v < 0.64;
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const lift = hgt[i] > 0.6 ? 18 : 0;
            const val = (tread ? 22 : 27) + lift + (rnd() - 0.5) * 4 - (hgt[i] < 0.3 ? 10 : 0);
            ci.data[i * 4] = ci.data[i * 4 + 1] = ci.data[i * 4 + 2] = Math.max(0, val);
            ci.data[i * 4 + 3] = 255;
          }
        }
        cg.putImageData(ci, 0, 0);
        return { map: canvasTexture(cc, true, true), normalMap: canvasTexture(heightToNormal(hgt, W, H, 2.5), false, true) };
      });
    }

    /** Cross-drilled brake disc with a dark hat. */
    function discTexture() {
      return shared('disc-tex', () => {
        const S = 256;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        const m = S / 2;
        g.fillStyle = '#3b3c40';
        g.fillRect(0, 0, S, S);
        const ring = g.createRadialGradient(m, m, m * 0.45, m, m, m);
        ring.addColorStop(0, '#8d8f94');
        ring.addColorStop(0.5, '#a3a5aa');
        ring.addColorStop(1, '#7d7f84');
        g.fillStyle = ring;
        g.beginPath();
        g.arc(m, m, m - 1, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(40,40,44,0.25)';
        for (let r = m * 0.5; r < m; r += 3) {
          g.beginPath();
          g.arc(m, m, r, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = '#18191b';
        for (let k = 0; k < 3; k++) {
          const rr = m * (0.6 + k * 0.12);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2 + k * 0.12;
            g.beginPath();
            g.arc(m + Math.cos(a) * rr, m + Math.sin(a) * rr, 3, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.fillStyle = '#2b2c30';
        g.beginPath();
        g.arc(m, m, m * 0.45, 0, Math.PI * 2);
        g.fill();
        return canvasTexture(c, true, false);
      });
    }

    /** What a spinning rim looks like on camera: spokes smeared into rings. */
    function blurTexture() {
      return shared('blur-tex', () => {
        const S = 256;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        const m = S / 2;
        const gr = g.createRadialGradient(m, m, 0, m, m, m);
        gr.addColorStop(0, 'rgba(120,120,120,0.95)');
        gr.addColorStop(0.18, 'rgba(200,200,200,0.95)');
        gr.addColorStop(0.3, 'rgba(150,150,150,0.85)');
        gr.addColorStop(0.55, 'rgba(110,110,110,0.75)');
        gr.addColorStop(0.9, 'rgba(160,160,160,0.8)');
        gr.addColorStop(0.97, 'rgba(235,235,235,0.95)');
        gr.addColorStop(1, 'rgba(235,235,235,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, S, S);
        return canvasTexture(c, true, false);
      });
    }

    /* Paint shader ------------------------------------------------------ */

    const GLSL_COMMON = `
      varying vec3 vObj;
      varying vec3 vObjN;
      varying vec2 vSec;
      float aaBand(float x, float a, float b) {
        float w = fwidth(x) + 1e-5;
        return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
      }
      float aaLine(float d, float hw) {
        float w = fwidth(d) + 1e-5;
        return 1.0 - smoothstep(hw - w, hw + w, abs(d));
      }
    `;

    function inject(mat, uniforms, key, fragDecl, fragSurface, fragEmissive, fragLights) {
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec3 vObj;\nvarying vec3 vObjN;\nvarying vec2 vSec;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vObj = position;\n  vObjN = normal;\n  vSec = uv;');
        shader.fragmentShader = GLSL_COMMON + fragDecl + shader.fragmentShader
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + fragSurface)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + fragEmissive)
          .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + (fragLights || ''));
      };
      mat.customProgramCacheKey = () => key;
    }

    const BODY_DECL = `
      uniform vec4 uHL, uHL2, uTL, uTL2, uGR, uDoor, uHood, uVent, uMisc, uHandle, uEnds;
      uniform vec3 uLights, uStripe;
    `;

    const BODY_SURFACE = `
      vec3 cp = vObj;
      vec3 cn = normalize(vObjN);
      float ax = abs(cp.x);
      float frontF = smoothstep(-0.2, -0.55, cn.z);
      float rearF = smoothstep(0.2, 0.55, cn.z);
      float sideF = smoothstep(0.35, 0.7, abs(cn.x));
      float topF = smoothstep(0.45, 0.8, cn.y);

      // racing stripes
      float stripe = uMisc.y * aaBand(ax, 0.075, 0.17) * step(-0.25, cn.y) * (1.0 - step(cp.y, uMisc.x + 0.1));
      diffuseColor.rgb = mix(diffuseColor.rgb, uStripe, stripe);

      // panel gaps
      float gaps = sideF * aaBand(cp.y, uDoor.z, uDoor.w) * (aaLine(cp.z - uDoor.x, 0.0045) + aaLine(cp.z - uDoor.y, 0.0045));
      gaps += sideF * aaBand(cp.z, uDoor.x, uDoor.y) * aaLine(cp.y - uDoor.z, 0.0045);
      gaps += topF * (aaLine(cp.z - uHood.x, 0.0045) * step(ax, uHood.y) + aaLine(ax - uHood.y, 0.0045) * step(cp.z, uHood.x) * step(uHL2.y + 0.05, cp.z));
      gaps += topF * (aaLine(cp.z - uHood.z, 0.0045) * step(ax, uHood.w) + aaLine(ax - uHood.w, 0.0045) * step(uHood.z, cp.z) * step(cp.z, uTL.w));
      diffuseColor.rgb *= 1.0 - clamp(gaps, 0.0, 1.0) * 0.88;

      // matt black trim: grille, vents, diffuser, louvres, scoop, handles
      float grille = frontF * aaBand(ax, -1.0, uGR.x) * aaBand(cp.y, uGR.y, uGR.z) * step(cp.z, uGR.w);
      float vent = sideF * aaBand(cp.z, uVent.x, uVent.y) * aaBand(cp.y, uVent.z + (cp.z - uVent.x) * 0.22, uVent.w);
      float diffuser = rearF * (1.0 - smoothstep(uMisc.x + 0.15, uMisc.x + 0.19, cp.y));
      float louvres = uMisc.z * topF * aaBand(cp.z, uHood.z + 0.08, uHood.z + 0.62) * aaBand(ax, -1.0, uHood.w - 0.1) * step(0.45, fract(cp.z * 15.0));
      float scoop = uMisc.w * topF * aaBand(cp.z, -1.62, -1.12) * aaBand(ax, -1.0, 0.22);
      float handle = sideF * aaBand(cp.z, uHandle.x - 0.075, uHandle.x + 0.075) * aaBand(cp.y, uHandle.y - 0.013, uHandle.y + 0.013);
      float trim = clamp(grille + vent + diffuser + louvres + scoop, 0.0, 1.0);
      float mesh = step(0.35, fract(cp.x * 28.0 + step(0.5, fract(cp.y * 14.0)) * 0.5)) * step(0.3, fract(cp.y * 28.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018) + vec3(0.03) * mesh * grille, trim);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35), handle);
      roughnessFactor = mix(roughnessFactor, 0.6, trim);
      metalnessFactor = mix(metalnessFactor, 0.05, trim);
      roughnessFactor = mix(roughnessFactor, 0.2, handle);
      metalnessFactor = mix(metalnessFactor, 1.0, handle);

      // headlights: dark chrome housings with an LED strip and projectors
      float hs = uHL2.x * (ax - uHL.x);
      float head = step(cp.z, uHL2.y) * aaBand(ax, uHL.x, uHL.y) * aaBand(cp.y, uHL.z + hs, uHL.w + hs) * step(-0.3, cn.y);
      float drl = head * aaBand(cp.y, uHL.w + hs - 0.02, uHL.w + hs - 0.006);
      vec2 pc = vec2(uHL.x + (uHL.y - uHL.x) * 0.32, (uHL.z + uHL.w) * 0.5 + uHL2.x * (uHL.y - uHL.x) * 0.32 - 0.008);
      vec2 pc2 = pc + vec2((uHL.y - uHL.x) * 0.3, uHL2.x * (uHL.y - uHL.x) * 0.3);
      float proj = head * max(1.0 - smoothstep(0.024, 0.032, length(vec2(ax, cp.y) - pc)), 1.0 - smoothstep(0.024, 0.032, length(vec2(ax, cp.y) - pc2)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055, 0.06, 0.068), head);
      roughnessFactor = mix(roughnessFactor, 0.08, head);
      metalnessFactor = mix(metalnessFactor, 1.0, head);

      // tail lights: full-width bar plus corner clusters (or segmented strip)
      float tailZone = step(uTL.w, cp.z) * (1.0 - step(0.75, cn.y));
      float bar = aaBand(ax, -1.0, uTL.z) * aaBand(cp.y, uTL.x, uTL.y);
      float cluster = aaBand(ax, uTL2.x, uTL2.y) * aaBand(cp.y, uTL2.z, uTL2.w);
      float tail = tailZone * clamp(bar + cluster, 0.0, 1.0);
      if (uHL2.w > 0.5) tail *= step(0.12, fract(ax * uHL2.w));
      float led = 0.55 + 0.45 * step(0.5, fract(cp.y * 90.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.008, 0.008), tail);
      roughnessFactor = mix(roughnessFactor, 0.12, tail);
      metalnessFactor = mix(metalnessFactor, 0.0, tail);

      // chrome badges front and rear, amber side markers at the front corners
      float badgeF = frontF * (1.0 - smoothstep(0.9, 1.1, length(vec2(cp.x / 0.06, (cp.y - uGR.z - 0.045) / 0.026))));
      float badgeR = rearF * step(uTL.w, cp.z) * (1.0 - smoothstep(0.9, 1.1, length(vec2(cp.x / 0.07, (cp.y - uTL.x + 0.06) / 0.024))));
      float badge = clamp(badgeF + badgeR, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75), badge);
      roughnessFactor = mix(roughnessFactor, 0.12, badge);
      metalnessFactor = mix(metalnessFactor, 1.0, badge);
      float marker = sideF * aaBand(cp.z, uEnds.x + 0.16, uEnds.x + 0.27) * aaBand(cp.y, uHL.z - 0.03, uHL.z + 0.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.25, 0.02), marker);
      roughnessFactor = mix(roughnessFactor, 0.1, marker);

      // grime and occlusion low on the body
      diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(uMisc.x, uMisc.x + 0.24, cp.y));
      float coat = 1.0 - max(trim, 0.0);
    `;

    const BODY_EMISSIVE = `
      totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * (drl * uLights.x * 1.4 + proj * uLights.x * uLights.z);
      totalEmissiveRadiance += vec3(1.0, 0.035, 0.025) * tail * uLights.y * led;
      totalEmissiveRadiance += vec3(1.0, 0.45, 0.05) * marker * (0.2 + uLights.z * 0.8);
    `;

    const CLEARCOAT_MASK = `
      #ifdef USE_CLEARCOAT
        material.clearcoat *= coat;
      #endif
    `;

    const CABIN_DECL = `
      uniform vec4 uWin, uWin2, uMisc;
      uniform vec3 uStripe;
      uniform float uBrake;
    `;

    const CABIN_SURFACE = `
      float u = min(vSec.x, 1.0 - vSec.x);
      vec3 cp = vObj;
      float belt = uWin2.y + uWin2.z * (cp.z - uWin2.x);
      float above = aaBand(cp.y, belt, 9.0);
      float notB = 1.0 - aaBand(cp.z, uWin.w - 0.04, uWin.w + 0.04);
      float sideGlass = aaBand(u, 0.13, 0.287) * aaBand(cp.z, uWin2.x, uWin.z) * notB * above;
      float windscreen = aaBand(u, 0.313, 0.6) * aaBand(cp.z, -9.0, uWin.x) * above;
      float rearGlass = aaBand(u, 0.315, 0.6) * aaBand(cp.z, uWin.y, 9.0) * aaBand(cp.y, belt + 0.015, 9.0);
      float glass = clamp(sideGlass + windscreen + rearGlass, 0.0, 1.0);
      float sideOuter = aaBand(u, 0.12, 0.297) * aaBand(cp.z, uWin2.x - 0.03, uWin.z + 0.03) * aaBand(cp.y, belt - 0.02, 9.0);
      float windOuter = aaBand(u, 0.303, 0.6) * aaBand(cp.z, -9.0, uWin.x + 0.03) * aaBand(cp.y, belt - 0.02, 9.0);
      float rearOuter = aaBand(u, 0.305, 0.6) * aaBand(cp.z, uWin.y - 0.03, 9.0);
      float frame = clamp(sideOuter + windOuter + rearOuter - glass, 0.0, 1.0);
      float roof = aaBand(u, 0.3, 0.6) * aaBand(cp.z, uWin.x, uWin.y);
      float black = clamp(frame + roof * uWin2.w, 0.0, 1.0);
      float stripe = uMisc.y * (1.0 - glass) * aaBand(abs(cp.x), 0.075, 0.17) * aaBand(u, 0.3, 0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb, uStripe, stripe * (1.0 - black));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), black);
      roughnessFactor = mix(roughnessFactor, 0.3, black);
      metalnessFactor = mix(metalnessFactor, 0.2, black);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006, 0.008, 0.011), glass);
      roughnessFactor = mix(roughnessFactor, 0.03, glass);
      metalnessFactor = mix(metalnessFactor, 0.0, glass);
      diffuseColor.a = mix(diffuseColor.a, 0.86, glass);
      // parked wiper blades at the foot of the windscreen
      float wiper = windscreen * aaBand(cp.y, belt + 0.012, belt + 0.024) * (aaBand(cp.x, -0.72, -0.06) + aaBand(cp.x, 0.04, 0.66));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), wiper);
      diffuseColor.a = mix(diffuseColor.a, 1.0, wiper);
      roughnessFactor = mix(roughnessFactor, 0.5, wiper);
      // third brake light along the top of the rear window
      float third = rearGlass * aaBand(cp.z, uWin.y + 0.018, uWin.y + 0.04) * aaBand(abs(cp.x), -1.0, 0.24);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.005, 0.005), third);
      diffuseColor.a = mix(diffuseColor.a, 1.0, third);
    `;

    const CABIN_EMISSIVE = `
      totalEmissiveRadiance += vec3(1.0, 0.03, 0.02) * third * (0.6 + uBrake * 5.0);
    `;

    const v4 = (a, b, c, d) => new THREE.Vector4(a, b, c, d);

    function bodyUniforms(st, stripes) {
      return {
        uHL: { value: v4(st.hl.x0, st.hl.x1, st.hl.y0, st.hl.y1) },
        uHL2: { value: v4(st.hl.slant, st.hl.zMax, 0, st.tl.seg) },
        uTL: { value: v4(st.tl.barY[0], st.tl.barY[1], st.tl.barX, st.tl.zMin) },
        uTL2: { value: v4(st.tl.cl[0], st.tl.cl[1], st.tl.cl[2], st.tl.cl[3]) },
        uGR: { value: v4(st.grille.x, st.grille.y0, st.grille.y1, st.grille.zMax) },
        uDoor: { value: v4(st.door.zF, st.door.zR, st.door.yB, st.door.yT) },
        uHood: { value: v4(st.hood.z, st.hood.x, st.hood.trunkZ, st.hood.trunkX) },
        uVent: { value: v4(st.vent.z0, st.vent.z1, st.vent.y0, st.vent.y1) },
        uMisc: { value: v4(st.body[4][2], stripes ? 1 : 0, st.louvres, st.scoop) },
        uHandle: { value: v4(st.handle.z, st.handle.y, 0, 0) },
        uEnds: { value: v4(st.body[0][0], st.body[st.body.length - 1][0], 0, 0) },
        uLights: { value: new THREE.Vector3(1.6, 1.2, 0.25) },
        uStripe: { value: new THREE.Color(0xf4f2ec) },
      };
    }

    function cabinUniforms(st, stripes) {
      const w = st.win;
      return {
        uWin: { value: v4(w.zW, w.zR, w.zC, w.zB) },
        uWin2: { value: v4(w.zF, w.belt[0], w.belt[1], w.roofBlack) },
        uMisc: { value: v4(0, stripes ? 1 : 0, 0, 0) },
        uStripe: { value: new THREE.Color(0xf4f2ec) },
        uBrake: { value: 0 },
      };
    }

    function flakeNormal() {
      return shared('flakes', () => {
        const S = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        const img = g.createImageData(S, S);
        const rnd = SC.util.rng(99);
        for (let i = 0; i < S * S; i++) {
          const nx = (rnd() - 0.5) * 0.6;
          const ny = (rnd() - 0.5) * 0.6;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          img.data[i * 4] = (nx * 0.5 + 0.5) * 255;
          img.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
          img.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
          img.data[i * 4 + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(70, 70);
        t.colorSpace = THREE.NoColorSpace;
        return t;
      });
    }

    /** Render layer for car details that the main camera sees but reflections and shadows skip. */
    const DETAIL_LAYER = 1;

    const RIMS = {
      silver: [0xc9cdd3, 0.22, 1],
      gunmetal: [0x45484e, 0.3, 1],
      black: [0x1a1b1e, 0.38, 0.6],
      bronze: [0x8a6a3c, 0.28, 1],
    };
    const CALIPERS = [0xc81e1e, 0xe0a800, 0x5a5c62, 0x1f5fbf];

    /* The car ----------------------------------------------------------- */

    class CarModel {
      /**
       * opts: { style, detail ('high'|'low'), metallic, stripes, flames, rim, caliper }
       */
      constructor(tex, color, opts = {}) {
        const id = STYLES[opts.style] ? opts.style : 'gt';
        const st = STYLES[id];
        this.style = st;
        const g = styleGeometry(id, opts.detail || 'high');
        this.root = new THREE.Group();
        this.body = new THREE.Group();
        this.root.add(this.body);

        const metallic = opts.metallic != null ? opts.metallic : 0.6;
        this.paint = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(color),
          metalness: metallic,
          roughness: 0.34,
          clearcoat: 1,
          clearcoatRoughness: 0.035,
          normalMap: flakeNormal(),
          normalScale: new THREE.Vector2(0.06, 0.06),
        });
        this.bodyU = bodyUniforms(st, opts.stripes);
        inject(this.paint, this.bodyU, 'car-body', BODY_DECL, BODY_SURFACE, BODY_EMISSIVE, CLEARCOAT_MASK);

        this.cabinMat = new THREE.MeshPhysicalMaterial({ color: this.paint.color, metalness: metallic, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.035, transparent: true });
        this.cabinU = cabinUniforms(st, opts.stripes);
        inject(this.cabinMat, this.cabinU, 'car-cabin', CABIN_DECL, CABIN_SURFACE, CABIN_EMISSIVE, '');

        const mirrorMat = new THREE.MeshPhysicalMaterial({ color: this.paint.color, metalness: metallic, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.04 });
        this.paints = [this.paint, this.cabinMat, mirrorMat];
        // Closed shells: cast shadows from back faces so the paint never shadows itself in stripes.
        for (const m of this.paints) m.shadowSide = THREE.BackSide;
        const trim = shared('car-trim', () => new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.55, metalness: 0.1 }));
        const well = shared('car-well', () => new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.95, side: THREE.DoubleSide }));
        const cabinInside = shared('car-interior', () => new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.8 }));
        const chrome = shared('car-chrome', () => new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.12, metalness: 1 }));
        const soot = shared('car-soot', () => new THREE.MeshBasicMaterial({ color: 0x020202 }));
        const carbon = shared('car-carbon', () => new THREE.MeshPhysicalMaterial({ color: 0x141518, roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }));
        const plateMat = shared('car-plate', () => new THREE.MeshStandardMaterial({ map: tex.plate(), roughness: 0.45 }));

        // Small details (interior, driver, brakes, plates…) neither cast shadows nor
        // appear in the reflection capture, so they live on their own layer.
        const add = (geo, mat, cast = true, parent = this.body) => {
          if (!geo) return null;
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = cast;
          m.receiveShadow = true;
          if (!cast) m.layers.set(DETAIL_LAYER);
          parent.add(m);
          return m;
        };
        add(g.body, this.paint);
        add(g.cabin, this.cabinMat);
        add(g.wells, well, false);
        add(g.interior, cabinInside, false);
        add(g.mirrors, mirrorMat);
        add(g.arms, trim, false);
        add(g.tips, chrome, false);
        add(g.bores, soot, false);
        add(g.plates, plateMat, false);
        if (g.wing && opts.wing !== false) add(g.wing, id === 'gt' ? carbon : mirrorMat);
        add(g.aero, carbon);

        const suit = new THREE.MeshStandardMaterial({ color: opts.suit != null ? opts.suit : 0x24262b, roughness: 0.85 });
        const helmet = new THREE.MeshPhysicalMaterial({ color: opts.helmet != null ? opts.helmet : 0xf1f1ee, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
        const visor = shared('car-visor', () => new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.04, metalness: 0.7, clearcoat: 1 }));
        add(g.driver.suit, suit, false);
        add(g.driver.helmet, helmet, false);
        add(g.driver.visor, visor, false);

        const beamMat = shared('car-beam', () => new THREE.MeshBasicMaterial({ map: tex.glow(), color: new THREE.Color(0.5, 0.53, 0.58), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
        this.beams = add(g.beams, beamMat, false);
        this.beams.renderOrder = 2;
        this.beams.visible = false;

        const contactMat = shared('car-contact', () => new THREE.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3 }));
        const contact = new THREE.Mesh(g.contact, contactMat);
        contact.renderOrder = 2;
        contact.layers.set(DETAIL_LAYER);
        this.root.add(contact);

        // Wheels: steer → (mirror for the left side) → spin.
        const [rimColor, rimRough, rimMetal] = RIMS[opts.rim] || RIMS.silver;
        const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: rimRough, metalness: rimMetal });
        const tyreMats = shared('car-tyres', () => {
          const t = tyreTextures();
          const make = (flip) => {
            const map = t.map.clone();
            const normalMap = t.normalMap.clone();
            for (const tx of [map, normalMap]) {
              tx.repeat.x = flip ? -1 : 1;
              tx.needsUpdate = true;
            }
            return new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.86 });
          };
          // Left-hand wheels are mirror images, so their lettering is flipped back.
          return { right: make(false), left: make(true) };
        });
        const capMat = shared('car-cap', () => new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, roughness: 0.2, metalness: 0.5, clearcoat: 1 }));
        this.blurMat = new THREE.MeshStandardMaterial({ color: rimColor, map: blurTexture(), transparent: true, opacity: 0, depthWrite: false, roughness: rimRough + 0.15, metalness: rimMetal });
        const barrelMat = shared('car-barrel', () => new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide }));
        const discMat = shared('car-disc', () => new THREE.MeshStandardMaterial({ map: discTexture(), roughness: 0.45, metalness: 0.9 }));
        const caliperMat = new THREE.MeshStandardMaterial({ color: opts.caliper != null ? opts.caliper : CALIPERS[0], roughness: 0.35, metalness: 0.2 });
        this.wheels = [];
        for (const [axle, track, W, front] of [[st.axleF, st.trackF, st.tyreF, true], [st.axleR, st.trackR, st.tyreR, false]]) {
          const wg = wheelGeometry(st.wheelR, W, opts.detail || 'high');
          for (const side of [-1, 1]) {
            const steer = new THREE.Group();
            steer.position.set(side * track, st.wheelR, axle);
            const mirror = new THREE.Group();
            if (side < 0) mirror.scale.x = -1; // left wheels are mirror images
            steer.add(mirror);
            const spin = new THREE.Group();
            mirror.add(spin);
            add(wg.tyre, side > 0 ? tyreMats.right : tyreMats.left, true, spin);
            add(wg.rim, rimMat, true, spin);
            add(wg.cap, capMat, false, spin);
            add(wg.barrel, barrelMat, false, spin);
            add(wg.disc, discMat, false, spin);
            add(wg.caliper, caliperMat, false, mirror);
            const blur = add(wg.blur, this.blurMat, false, mirror);
            blur.renderOrder = 1;
            this.root.add(steer);
            this.wheels.push({ steer, spin, front, side });
          }
        }

        const shadowMat = shared('car-shadow', () => new THREE.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
        const sh = new THREE.Mesh(g.shadow, shadowMat);
        sh.renderOrder = 1;
        sh.layers.set(DETAIL_LAYER);
        this.root.add(sh);

        if (opts.flames) {
          const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.42, 1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
          this.flameMat = flameMat;
          const z1 = st.body[st.body.length - 1][0];
          this.flames = st.exhausts.map(([x, y]) => {
            const f = new THREE.Mesh(g.flame, flameMat);
            f.position.set(x, y, z1 + 0.06);
            f.visible = false;
            this.body.add(f);
            return f;
          });
        }

        // Headlight positions, for the player's night-time spotlights.
        const hlY = (st.hl.y0 + st.hl.y1) / 2;
        const hlX = (st.hl.x0 + st.hl.x1) / 2;
        this.headlightSpots = [[-hlX, hlY, st.hl.zMax - 0.25], [hlX, hlY, st.hl.zMax - 0.25]];
        this.hoodCam = st.hoodCam;
        this.spinAngle = 0;
        this.night = false;
        this.time = 0;
        this.phase = Math.random() * 10;
        this.popTime = 0;
        this.envMats = [...this.paints, rimMat, this.blurMat, helmet, visor, chrome, carbon, capMat, discMat, barrelMat];
      }

      /** Use a (dynamic) environment map for reflections on paint, glass and metal. */
      setEnv(texture) {
        for (const m of this.envMats) {
          if (m.envMap === texture) continue;
          m.envMap = texture;
          m.needsUpdate = true;
        }
      }

      /** A short flame from the exhaust, as on an upshift. */
      pop() {
        this.popTime = 0.09;
      }

      setColor(hex) {
        for (const m of this.paints) m.color.set(hex);
      }

      setNight(night) {
        this.night = night;
        this.bodyU.uLights.value.set(night ? 2.6 : 1.6, night ? 2.0 : 1.2, night ? 0.5 : 0.25);
        this.beams.visible = night;
      }

      /** speed m/s, steer radians, brake/nitro flags. */
      animate(dt, speed, steer, brake, nitro) {
        this.spinAngle = (this.spinAngle + (speed / this.style.wheelR) * dt) % (Math.PI * 2);
        for (const w of this.wheels) {
          w.spin.rotation.x = -this.spinAngle;
          w.steer.rotation.y = w.front ? -steer : 0;
        }
        const base = this.night ? 2.0 : 1.2;
        this.bodyU.uLights.value.y = brake ? base * 4 : base;
        this.cabinU.uBrake.value = brake ? 1 : 0;

        // Spokes smear into a disc at speed, as they do on camera.
        const omega = speed / this.style.wheelR;
        const t = Math.min(1, Math.max(0, (omega - 14) / 26));
        this.blurMat.opacity = t * t * (3 - 2 * t) * 0.94;

        // A little suspension movement from the road surface.
        this.time += dt;
        const ride = Math.min(1, speed / 25);
        this.body.position.y = (Math.sin(this.time * 11.3 + this.phase) * 0.6 + Math.sin(this.time * 17.9 + this.phase * 2) * 0.4) * 0.0035 * ride;

        if (this.flames) {
          this.popTime = Math.max(0, this.popTime - dt);
          const pop = this.popTime > 0;
          if (pop) this.flameMat.color.setRGB(2.2, 0.75, 0.15);
          else this.flameMat.color.setRGB(0.18, 0.42, 1.6);
          for (const f of this.flames) {
            f.visible = nitro > 0.05 || pop;
            const k = pop ? 0.55 : nitro;
            f.scale.set(1, 1, k * (0.8 + Math.random() * 0.5));
          }
        }
      }
    }

    SC.cars = { CarModel, STYLES, RIMS, CALIPERS, styleGeometry, DETAIL_LAYER };
  });
})();
