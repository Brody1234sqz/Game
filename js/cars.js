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
      interior: { dashZ: -0.62, seatZ: 0.32, seatY: 0.42 },
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
      interior: { dashZ: -0.2, seatZ: 0.72, seatY: 0.46 },
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
      interior: { dashZ: -0.28, seatZ: 0.55, seatY: 0.48 },
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
        shadow: place(new THREE.PlaneGeometry(2.5, 5.2), { rx: -Math.PI / 2, y: 0.025 }),
        flame: place(new THREE.ConeGeometry(0.055, 0.5, 12, 1, true), { rx: Math.PI / 2, z: 0.25 }),
      };
      geoCache.set(key, out);
      return out;
    }

    /* Wheels ------------------------------------------------------------ */

    const wheelCache = new Map();

    function wheelGeometry(R, W, detail) {
      const key = `${R}:${W}:${detail}`;
      if (wheelCache.has(key)) return wheelCache.get(key);
      const seg = detail === 'high' ? 40 : 24;
      const h = W / 2;
      const rimR = R * 0.71;
      const profile = [
        [rimR, -h + 0.012],
        [R * 0.82, -h - 0.004],
        [R * 0.94, -h + 0.002],
        [R * 0.99, -h + 0.025],
        [R, -h + 0.055],
        [R, h - 0.055],
        [R * 0.99, h - 0.025],
        [R * 0.94, h - 0.002],
        [R * 0.82, h + 0.004],
        [rimR, h - 0.012],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const tyre = new THREE.LatheGeometry(profile, seg);
      tyre.rotateZ(-Math.PI / 2); // axle along x, outer face towards +x

      const face = h - 0.02;
      const spokes = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.floor(i / 2) / 5) * Math.PI * 2 + (i % 2 ? 0.13 : -0.13);
        const len = rimR - 0.07;
        const mid = 0.07 + len / 2;
        spokes.push(place(new THREE.BoxGeometry(0.022, len, 0.03), { x: face - 0.035, y: Math.cos(a) * mid, z: Math.sin(a) * mid, rx: a, rz: -0.12 }));
      }
      const rim = merge([
        ...spokes,
        place(new THREE.TorusGeometry(rimR - 0.008, 0.013, 8, seg), { x: face, ry: Math.PI / 2 }),
        place(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 16), { x: face - 0.04, rz: Math.PI / 2 }),
        ...[0, 1, 2, 3, 4].map((k) => {
          const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
          return place(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 8), { x: face - 0.01, y: Math.cos(a) * 0.045, z: Math.sin(a) * 0.045, rz: Math.PI / 2 });
        }),
      ]);
      const barrel = merge([
        place(new THREE.CylinderGeometry(rimR, rimR, W - 0.03, seg, 1, true), { rz: Math.PI / 2 }),
        place(new THREE.CircleGeometry(rimR, seg), { x: -h + 0.05, ry: Math.PI / 2 }),
      ]);
      const disc = place(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.028, seg), { x: face - 0.12, rz: Math.PI / 2 });
      const caliper = place(new THREE.BoxGeometry(0.06, 0.13, 0.16), { x: face - 0.09, y: R * 0.43, z: R * 0.2, rx: 0.5 });
      const out = { tyre, rim, barrel, disc, caliper };
      wheelCache.set(key, out);
      return out;
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
      uniform vec4 uHL, uHL2, uTL, uTL2, uGR, uDoor, uHood, uVent, uMisc, uHandle;
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

      // grime and occlusion low on the body
      diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(uMisc.x, uMisc.x + 0.24, cp.y));
      float coat = 1.0 - max(trim, 0.0);
    `;

    const BODY_EMISSIVE = `
      totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * (drl * uLights.x * 1.4 + proj * uLights.x * uLights.z);
      totalEmissiveRadiance += vec3(1.0, 0.035, 0.025) * tail * uLights.y * led;
    `;

    const CLEARCOAT_MASK = `
      #ifdef USE_CLEARCOAT
        material.clearcoat *= coat;
      #endif
    `;

    const CABIN_DECL = `
      uniform vec4 uWin, uWin2, uMisc;
      uniform vec3 uStripe;
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
        inject(this.cabinMat, cabinUniforms(st, opts.stripes), 'car-cabin', CABIN_DECL, CABIN_SURFACE, '', '');

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

        const add = (geo, mat, cast = true, parent = this.body) => {
          if (!geo) return null;
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = cast;
          m.receiveShadow = true;
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

        // Wheels: steer → (mirror for the left side) → spin.
        const [rimColor, rimRough, rimMetal] = RIMS[opts.rim] || RIMS.silver;
        const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: rimRough, metalness: rimMetal });
        const tyreMat = shared('car-tyre', () => new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.88 }));
        const barrelMat = shared('car-barrel', () => new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide }));
        const discMat = shared('car-disc', () => new THREE.MeshStandardMaterial({ color: 0x6e7074, roughness: 0.42, metalness: 1 }));
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
            add(wg.tyre, tyreMat, true, spin);
            add(wg.rim, rimMat, true, spin);
            add(wg.barrel, barrelMat, false, spin);
            add(wg.disc, discMat, false, spin);
            add(wg.caliper, caliperMat, false, mirror);
            this.root.add(steer);
            this.wheels.push({ steer, spin, front, side });
          }
        }

        const shadowMat = shared('car-shadow', () => new THREE.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
        const sh = new THREE.Mesh(g.shadow, shadowMat);
        sh.renderOrder = 1;
        this.root.add(sh);

        if (opts.flames) {
          const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.42, 1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
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
      }

      setColor(hex) {
        for (const m of this.paints) m.color.set(hex);
      }

      setNight(night) {
        this.night = night;
        this.bodyU.uLights.value.set(night ? 2.6 : 1.6, night ? 2.0 : 1.2, night ? 0.5 : 0.25);
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
        if (this.flames) {
          for (const f of this.flames) {
            f.visible = nitro > 0.05;
            f.scale.set(1, 1, nitro * (0.8 + Math.random() * 0.5));
          }
        }
      }
    }

    SC.cars = { CarModel, STYLES, RIMS, CALIPERS, styleGeometry };
  });
})();
