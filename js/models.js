/*
 * Sundown Circuit — procedural 3D models.
 * The car body is lofted from cross-sections (with cut-out wheel arches);
 * scenery is assembled from primitives, displaced with noise and merged so
 * each model draws in a handful of calls. All sizes are in metres.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  (SC.threeInit = SC.threeInit || []).push(function (THREE) {
    const NZ = SC.noise;

    /* ---------------------------------------------------------------- */
    /* Geometry helpers                                                 */
    /* ---------------------------------------------------------------- */

    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _v = new THREE.Vector3();
    const _s = new THREE.Vector3();

    /** Bake a transform into a geometry: { x, y, z, rx, ry, rz, sx, sy, sz }. */
    function place(geo, t = {}) {
      _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
      _q.setFromEuler(_e);
      _v.set(t.x || 0, t.y || 0, t.z || 0);
      _s.set(t.sx || t.s || 1, t.sy || t.s || 1, t.sz || t.s || 1);
      geo.applyMatrix4(_m.compose(_v, _q, _s));
      return geo;
    }

    /** Give every vertex the same colour (for merging into vertex-coloured meshes). */
    function paint(geo, hex) {
      const c = new THREE.Color(hex);
      const n = geo.getAttribute('position').count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return geo;
    }

    /** Concatenate geometries (attributes common to all of them are kept). */
    function merge(geos) {
      const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      const names = ['position', 'normal', 'uv', 'color'].filter((a) => parts.every((p) => p.getAttribute(a)));
      const out = new THREE.BufferGeometry();
      for (const name of names) {
        const size = parts[0].getAttribute(name).itemSize;
        let total = 0;
        for (const p of parts) total += p.getAttribute(name).count * size;
        const arr = new Float32Array(total);
        let off = 0;
        for (const p of parts) {
          const a = p.getAttribute(name);
          arr.set(a.array.subarray(0, a.count * size), off);
          off += a.count * size;
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      out.computeBoundingSphere();
      return out;
    }

    /** Push vertices along their normals by smooth noise (rocks, bushes, foliage). */
    function displace(geo, amount, freq, seed) {
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const n = NZ.fbm(x * freq + 13.1, y * freq + z * freq * 0.7 + 7.7, seed, 3) - 0.5;
        const l = Math.hypot(x, y, z) || 1;
        const k = 1 + (n * 2 * amount) / l;
        pos.setXYZ(i, x * k, y * k, z * k);
      }
      geo.computeVertexNormals();
      return geo;
    }

    /** Catmull-Rom through keyed values. */
    function keyed(keys, z, prop) {
      let i = 0;
      while (i < keys.length - 2 && z > keys[i + 1].z) i++;
      const k1 = keys[i];
      const k2 = keys[i + 1];
      const k0 = keys[Math.max(0, i - 1)];
      const k3 = keys[Math.min(keys.length - 1, i + 2)];
      const t = Math.min(1, Math.max(0, (z - k1.z) / (k2.z - k1.z)));
      const p0 = k0[prop];
      const p1 = k1[prop];
      const p2 = k2[prop];
      const p3 = k3[prop];
      const t2 = t * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t2 * t);
    }

    /**
     * Loft a closed tube through super-elliptic cross-sections laid along z.
     * shape(z) → { hw, y0, y1, n, tumble, flat }; modify(p, z) may move points.
     */
    function loft(z0, z1, rings, radial, shape, modify) {
      const pos = [];
      const uv = [];
      const idx = [];
      const p = { x: 0, y: 0 };
      for (let s = 0; s <= rings; s++) {
        const t = s / rings;
        const z = z0 + (z1 - z0) * (0.5 - 0.5 * Math.cos(t * Math.PI)); // denser at the ends
        const S = shape(z);
        const ex = 2 / S.n;
        for (let r = 0; r <= radial; r++) {
          const th = -Math.PI / 2 + (r / radial) * Math.PI * 2; // seam underneath
          const c = Math.cos(th);
          const sn = Math.sin(th);
          const X = Math.sign(c) * Math.pow(Math.abs(c), ex);
          let Y = Math.sign(sn) * Math.pow(Math.abs(sn), ex);
          if (S.flat && Y < 0) Y = 0;
          p.x = X * S.hw * (Y > 0 ? 1 - S.tumble * Y : 1);
          p.y = S.flat ? S.y0 + Y * (S.y1 - S.y0) : S.y0 + (Y * 0.5 + 0.5) * (S.y1 - S.y0);
          if (modify) modify(p, z);
          pos.push(p.x, p.y, z);
          uv.push(r / radial, t);
        }
      }
      const row = radial + 1;
      for (let s = 0; s < rings; s++) {
        for (let r = 0; r < radial; r++) {
          const a = s * row + r;
          const b = a + row;
          idx.push(a, a + 1, b, b, a + 1, b + 1); // counter-clockwise from outside
        }
      }
      // end caps
      for (const [ring, flip] of [[0, true], [rings, false]]) {
        let cx = 0;
        let cy = 0;
        const base = ring * row;
        for (let r = 0; r < radial; r++) {
          cx += pos[(base + r) * 3];
          cy += pos[(base + r) * 3 + 1];
        }
        const centre = pos.length / 3;
        pos.push(cx / radial, cy / radial, pos[base * 3 + 2]);
        uv.push(0.5, ring ? 1 : 0);
        for (let r = 0; r < radial; r++) {
          if (flip) idx.push(centre, base + r + 1, base + r);
          else idx.push(centre, base + r, base + r + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    /* ---------------------------------------------------------------- */
    /* Car                                                              */
    /* ---------------------------------------------------------------- */

    const CAR = { wheelR: 0.34, wheelW: 0.27, axleF: -1.38, axleR: 1.34, track: 0.8, length: 4.54 };

    const BODY_KEYS = [
      { z: -2.27, hw: 0.56, y0: 0.31, y1: 0.5, n: 3.0, tumble: 0.05 },
      { z: -2.12, hw: 0.85, y0: 0.24, y1: 0.6, n: 3.4, tumble: 0.07 },
      { z: -1.8, hw: 0.94, y0: 0.21, y1: 0.7, n: 3.6, tumble: 0.08 },
      { z: -1.2, hw: 0.96, y0: 0.2, y1: 0.77, n: 3.8, tumble: 0.08 },
      { z: -0.55, hw: 0.95, y0: 0.2, y1: 0.82, n: 3.8, tumble: 0.09 },
      { z: 0.2, hw: 0.95, y0: 0.2, y1: 0.86, n: 3.8, tumble: 0.09 },
      { z: 0.95, hw: 0.97, y0: 0.21, y1: 0.89, n: 3.8, tumble: 0.09 },
      { z: 1.55, hw: 0.99, y0: 0.23, y1: 0.9, n: 3.8, tumble: 0.08 },
      { z: 2.05, hw: 0.93, y0: 0.27, y1: 0.89, n: 3.6, tumble: 0.07 },
      { z: 2.27, hw: 0.82, y0: 0.33, y1: 0.85, n: 3.2, tumble: 0.05 },
    ];

    const CABIN_KEYS = [
      { z: -0.64, hw: 0.8, y0: 0.7, y1: 0.78 },
      { z: -0.2, hw: 0.76, y0: 0.72, y1: 1.06 },
      { z: 0.25, hw: 0.7, y0: 0.74, y1: 1.21 },
      { z: 0.8, hw: 0.68, y0: 0.76, y1: 1.2 },
      { z: 1.35, hw: 0.71, y0: 0.78, y1: 1.0 },
      { z: 1.74, hw: 0.75, y0: 0.8, y1: 0.86 },
    ];

    const carGeo = {};

    function carGeometries() {
      if (carGeo.body) return carGeo;
      const shape = (keys, extra) => (z) => {
        const o = { hw: keyed(keys, z, 'hw'), y0: keyed(keys, z, 'y0'), y1: keyed(keys, z, 'y1') };
        return Object.assign(o, extra(z));
      };
      // Body, with wheel arches cut by lifting the lower outer edge around each axle.
      carGeo.body = loft(
        -2.27,
        2.27,
        84,
        40,
        shape(BODY_KEYS, (z) => ({ n: keyed(BODY_KEYS, z, 'n'), tumble: keyed(BODY_KEYS, z, 'tumble') })),
        (p, z) => {
          if (Math.abs(p.x) < 0.52) return;
          for (const axle of [CAR.axleF, CAR.axleR]) {
            const dz = z - axle;
            const R = 0.45;
            if (Math.abs(dz) < R) {
              const arch = CAR.wheelR + Math.sqrt(R * R - dz * dz);
              if (p.y < arch) p.y = arch;
            }
          }
        },
      );

      // Glasshouse, split into glass and a painted roof panel.
      const cabin = loft(-0.64, 1.74, 40, 32, shape(CABIN_KEYS, () => ({ n: 3.2, tumble: 0.2, flat: true })));
      const index = cabin.index.array;
      const pos = cabin.getAttribute('position');
      const glass = [];
      const roof = [];
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let i = 0; i < index.length; i += 3) {
        a.fromBufferAttribute(pos, index[i]);
        b.fromBufferAttribute(pos, index[i + 1]);
        c.fromBufferAttribute(pos, index[i + 2]);
        const n = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
        const zc = (a.z + b.z + c.z) / 3;
        const tri = [index[i], index[i + 1], index[i + 2]];
        if (n.y > 0.82 && zc > 0.12 && zc < 1.02) roof.push(...tri);
        else glass.push(...tri);
      }
      cabin.setIndex(glass.concat(roof));
      cabin.clearGroups();
      cabin.addGroup(0, glass.length, 0);
      cabin.addGroup(glass.length, roof.length, 1);
      carGeo.cabin = cabin;

      // Dark trim: intake, splitter, diffuser, skirts, wing stands, mirror arms.
      carGeo.trim = merge([
        place(new THREE.BoxGeometry(1.08, 0.15, 0.12), { y: 0.36, z: -2.21 }),
        place(new THREE.BoxGeometry(1.72, 0.035, 0.32), { y: 0.215, z: -2.08 }),
        place(new THREE.BoxGeometry(1.42, 0.15, 0.18), { y: 0.31, z: 2.2 }),
        place(new THREE.BoxGeometry(0.06, 0.08, 2.0), { x: -0.94, y: 0.24, z: -0.02 }),
        place(new THREE.BoxGeometry(0.06, 0.08, 2.0), { x: 0.94, y: 0.24, z: -0.02 }),
        place(new THREE.BoxGeometry(0.05, 0.24, 0.1), { x: -0.55, y: 1.0, z: 1.97 }),
        place(new THREE.BoxGeometry(0.05, 0.24, 0.1), { x: 0.55, y: 1.0, z: 1.97 }),
        place(new THREE.BoxGeometry(0.12, 0.03, 0.05), { x: -0.8, y: 0.88, z: -0.4 }),
        place(new THREE.BoxGeometry(0.12, 0.03, 0.05), { x: 0.8, y: 0.88, z: -0.4 }),
      ]);
      // Painted extras: rear wing and mirror shells.
      carGeo.extras = merge([
        place(new THREE.BoxGeometry(1.82, 0.04, 0.34), { y: 1.13, z: 2.0, rx: -0.06 }),
        place(new THREE.BoxGeometry(0.03, 0.2, 0.38), { x: -0.91, y: 1.09, z: 2.0 }),
        place(new THREE.BoxGeometry(0.03, 0.2, 0.38), { x: 0.91, y: 1.09, z: 2.0 }),
        place(new THREE.BoxGeometry(0.16, 0.1, 0.12), { x: -0.9, y: 0.92, z: -0.4 }),
        place(new THREE.BoxGeometry(0.16, 0.1, 0.12), { x: 0.9, y: 0.92, z: -0.4 }),
      ]);
      carGeo.headlights = merge([
        place(new THREE.SphereGeometry(1, 16, 8), { x: -0.6, y: 0.53, z: -2.07, sx: 0.25, sy: 0.07, sz: 0.17, ry: -0.25 }),
        place(new THREE.SphereGeometry(1, 16, 8), { x: 0.6, y: 0.53, z: -2.07, sx: 0.25, sy: 0.07, sz: 0.17, ry: 0.25 }),
      ]);
      carGeo.taillights = merge([
        place(new THREE.BoxGeometry(1.2, 0.045, 0.05), { y: 0.74, z: 2.25 }),
        place(new THREE.BoxGeometry(0.36, 0.1, 0.06), { x: -0.62, y: 0.73, z: 2.235 }),
        place(new THREE.BoxGeometry(0.36, 0.1, 0.06), { x: 0.62, y: 0.73, z: 2.235 }),
      ]);
      carGeo.exhaust = merge([
        place(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 14), { x: -0.42, y: 0.3, z: 2.25, rx: Math.PI / 2 }),
        place(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 14), { x: 0.42, y: 0.3, z: 2.25, rx: Math.PI / 2 }),
      ]);
      carGeo.plate = place(new THREE.PlaneGeometry(0.52, 0.13), { y: 0.5, z: 2.29 });
      carGeo.tyre = place(new THREE.CylinderGeometry(CAR.wheelR, CAR.wheelR, CAR.wheelW, 28, 1), { rz: Math.PI / 2 });
      carGeo.rim = place(new THREE.CircleGeometry(CAR.wheelR * 0.74, 28), { ry: Math.PI / 2 });
      carGeo.shadow = place(new THREE.PlaneGeometry(2.5, 5.3), { rx: -Math.PI / 2, y: 0.03 });
      carGeo.flame = place(new THREE.ConeGeometry(0.06, 0.55, 12, 1, true), { rx: Math.PI / 2, z: 0.27 });
      return carGeo;
    }

    /**
     * One drivable car. Body colour and brake/nitro state are per car;
     * geometry is shared between all of them.
     */
    class CarModel {
      constructor(tex, color, opts = {}) {
        const g = carGeometries();
        this.root = new THREE.Group();
        this.body = new THREE.Group();
        this.root.add(this.body);

        this.paint = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(color),
          metalness: 0.55,
          roughness: 0.3,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        });
        const glass = shared('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0b1018, metalness: 0.1, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.4 }));
        const trim = shared('trim', () => new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.55, metalness: 0.2 }));
        const chrome = shared('chrome', () => new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.15, metalness: 1 }));
        this.head = shared('headlight', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf2ff, emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.3 }));
        this.tail = new THREE.MeshStandardMaterial({ color: 0x5a0508, emissive: 0xff1a1a, emissiveIntensity: 0.8, roughness: 0.3 });
        const plateMat = shared('plate', () => new THREE.MeshStandardMaterial({ map: tex.plate(), roughness: 0.5 }));

        const add = (geo, mat, cast = true) => {
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = cast;
          m.receiveShadow = true;
          this.body.add(m);
          return m;
        };
        add(g.body, this.paint);
        add(g.cabin, [glass, this.paint]);
        add(g.trim, trim);
        if (opts.spoiler !== false) add(g.extras, this.paint);
        add(g.headlights, this.head, false);
        add(g.taillights, this.tail, false);
        add(g.exhaust, chrome, false);
        add(g.plate, plateMat, false);

        // Wheels
        const tyreMat = shared('tyre', () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }));
        const rimMat = shared('rim', () => new THREE.MeshStandardMaterial({ map: tex.rim(), metalness: 0.9, roughness: 0.28, alphaTest: 0.5, transparent: false }));
        this.wheels = [];
        for (const [x, z, front] of [[-CAR.track, CAR.axleF, true], [CAR.track, CAR.axleF, true], [-CAR.track, CAR.axleR, false], [CAR.track, CAR.axleR, false]]) {
          const steer = new THREE.Group();
          steer.position.set(x, CAR.wheelR, z);
          const spin = new THREE.Group();
          steer.add(spin);
          const tyre = new THREE.Mesh(g.tyre, tyreMat);
          tyre.castShadow = true;
          spin.add(tyre);
          const rim = new THREE.Mesh(g.rim, rimMat);
          rim.position.x = Math.sign(x) * (CAR.wheelW / 2 + 0.004);
          if (x < 0) rim.rotation.y = Math.PI;
          spin.add(rim);
          this.root.add(steer);
          this.wheels.push({ steer, spin, front });
        }

        const shadowMat = shared('carshadow', () => new THREE.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
        const sh = new THREE.Mesh(g.shadow, shadowMat);
        sh.renderOrder = 1;
        this.root.add(sh);

        if (opts.flames) {
          const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.42, 1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
          this.flames = [-0.42, 0.42].map((x) => {
            const f = new THREE.Mesh(g.flame, flameMat);
            f.position.set(x, 0.3, 2.32);
            f.visible = false;
            this.body.add(f);
            return f;
          });
        }
        this.spinAngle = 0;
      }

      setColor(hex) {
        this.paint.color.set(hex);
      }

      /** speed m/s, steer radians, brake/nitro flags. */
      animate(dt, speed, steer, brake, nitro) {
        this.spinAngle = (this.spinAngle + (speed / CAR.wheelR) * dt) % (Math.PI * 2);
        for (const w of this.wheels) {
          w.spin.rotation.x = -this.spinAngle;
          w.steer.rotation.y = w.front ? -steer : 0;
        }
        this.tail.emissiveIntensity = brake ? 6 : 0.9;
        if (this.flames) {
          for (const f of this.flames) {
            f.visible = nitro > 0.05;
            const k = nitro * (0.8 + Math.random() * 0.5);
            f.scale.set(1, 1, k);
          }
        }
      }
    }

    /* ---------------------------------------------------------------- */
    /* Shared materials                                                 */
    /* ---------------------------------------------------------------- */

    const materials = new Map();
    function shared(key, make) {
      if (!materials.has(key)) materials.set(key, make());
      return materials.get(key);
    }

    /* ---------------------------------------------------------------- */
    /* Scenery: each returns [{ geometry, material, cast }] at base y=0  */
    /* ---------------------------------------------------------------- */

    function createScenery(tex) {
      const cache = new Map();
      const memo = (key, fn) => {
        if (!cache.has(key)) cache.set(key, fn());
        return cache.get(key);
      };
      const vc = (rough = 0.95) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough });

      function palm(variant) {
        return memo('palm' + variant, () => {
          const rnd = SC.util.rng(301 + variant);
          const H = 8.5 + variant * 1.3;
          const bend = 0.9 + rnd() * 1.1;
          const rings = 16;
          const radial = 10;
          const pos = [];
          const uv = [];
          const idx = [];
          const at = (t) => [bend * t * t, H * t];
          for (let i = 0; i <= rings; i++) {
            const t = i / rings;
            const [cx, cy] = at(t);
            const r = 0.25 - t * 0.1 + (i % 2 ? 0.012 : 0);
            for (let j = 0; j <= radial; j++) {
              const a = (j / radial) * Math.PI * 2;
              pos.push(cx + Math.cos(a) * r, cy, Math.sin(a) * r);
              uv.push(j / radial, (t * H) / 1.6);
            }
          }
          for (let i = 0; i < rings; i++) {
            for (let j = 0; j < radial; j++) {
              const a = i * (radial + 1) + j;
              const b = a + radial + 1;
              idx.push(a, b, a + 1, b, b + 1, a + 1); // outward-facing
            }
          }
          const trunk = new THREE.BufferGeometry();
          trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          trunk.setIndex(idx);
          trunk.computeVertexNormals();

          const [tx, ty] = at(1);
          const fronds = [];
          const count = 10;
          for (let f = 0; f < count; f++) {
            const az = (f / count) * Math.PI * 2 + rnd() * 0.4;
            const L = 3.4 + rnd() * 0.9;
            const W = 1.25;
            const lift = 0.15 + rnd() * 0.25;
            const steps = 9;
            const fp = [];
            const fu = [];
            const fi = [];
            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const along = t * L;
              const y = L * (lift * t - 0.62 * t * t);
              for (const side of [-1, 1]) {
                fp.push(along, y + side * 0.04, side * W * 0.5);
                fu.push(side < 0 ? 0 : 1, t);
              }
            }
            for (let s = 0; s < steps; s++) {
              const a = s * 2;
              fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            }
            const fg = new THREE.BufferGeometry();
            fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
            fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
            fg.setIndex(fi);
            fg.computeVertexNormals();
            fronds.push(place(fg, { x: tx, y: ty, ry: az, rx: (rnd() - 0.5) * 0.4 }));
          }
          const nuts = merge([0, 1, 2].map((k) => place(new THREE.SphereGeometry(0.15, 8, 6), { x: tx + Math.cos(k * 2.1) * 0.2, y: ty - 0.2, z: Math.sin(k * 2.1) * 0.2 })));
          return [
            { geometry: trunk, material: shared('bark', () => new THREE.MeshStandardMaterial({ map: tex.bark(), roughness: 0.95 })), cast: true },
            { geometry: merge(fronds), material: shared('frond', () => new THREE.MeshStandardMaterial({ map: tex.frond(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 })), cast: true },
            { geometry: nuts, material: shared('nut', () => new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.7 })), cast: false },
          ];
        });
      }

      function pine(variant, snow) {
        return memo(`pine${variant}${snow}`, () => {
          const tiers = [];
          const rnd = SC.util.rng(411 + variant);
          const dark = new THREE.Color(0x1a3520);
          const light = new THREE.Color(0x2f5a30);
          const white = new THREE.Color(0xeef3f6);
          const count = 5 + (variant % 2);
          for (let i = 0; i < count; i++) {
            const t = i / count;
            const r = 2.3 * (1 - t * 0.78);
            const h = 3.1 - t * 0.8;
            const cone = new THREE.ConeGeometry(r, h, 11, 3);
            displace(cone, 0.22, 1.4, 500 + i + variant * 10);
            place(cone, { y: 1.9 + i * 1.35 + h / 2, ry: rnd() * Math.PI });
            const pos = cone.getAttribute('position');
            const nor = cone.getAttribute('normal');
            const col = new Float32Array(pos.count * 3);
            const c = new THREE.Color();
            for (let k = 0; k < pos.count; k++) {
              const yy = (pos.getY(k) - (1.9 + i * 1.35)) / h;
              c.copy(dark).lerp(light, Math.min(1, Math.max(0, yy * 0.9 + rnd() * 0.15)));
              if (snow && nor.getY(k) > 0.55 && rnd() < 0.5) c.lerp(white, 0.55 + rnd() * 0.25);
              col[k * 3] = c.r;
              col[k * 3 + 1] = c.g;
              col[k * 3 + 2] = c.b;
            }
            cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
            cone.deleteAttribute('uv');
            tiers.push(cone);
          }
          const trunk = paint(place(new THREE.CylinderGeometry(0.13, 0.24, 2.6, 8), { y: 1.3 }), 0x4a3324);
          trunk.deleteAttribute('uv');
          return [{ geometry: merge([trunk, ...tiers]), material: shared('foliage', () => vc(0.92)), cast: true }];
        });
      }

      function blobby(key, seed, detail, amount, scale, colors) {
        return memo(key, () => {
          const geo = new THREE.IcosahedronGeometry(1, detail);
          displace(geo, amount, 1.3, seed);
          place(geo, { sx: scale[0], sy: scale[1], sz: scale[2], y: scale[3] });
          const pos = geo.getAttribute('position');
          const col = new Float32Array(pos.count * 3);
          const a = new THREE.Color(colors[0]);
          const b = new THREE.Color(colors[1]);
          const c = new THREE.Color();
          for (let k = 0; k < pos.count; k++) {
            const n = NZ.fbm(pos.getX(k) * 2, pos.getZ(k) * 2 + pos.getY(k), seed + 3, 3);
            const h = (pos.getY(k) - scale[3] + scale[1]) / (2 * scale[1]);
            c.copy(a).lerp(b, Math.min(1, Math.max(0, h * 0.7 + (n - 0.5) * 0.8)));
            col[k * 3] = c.r;
            col[k * 3 + 1] = c.g;
            col[k * 3 + 2] = c.b;
          }
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          geo.deleteAttribute('uv');
          return [{ geometry: geo, material: shared('rockbush', () => vc(0.95)), cast: true }];
        });
      }

      const bush = (variant, colors) => blobby('bush' + variant + colors[0], 610 + variant, 2, 0.28, [1.5, 0.95, 1.5, 0.75], colors);
      const rock = (variant, colors) => blobby('rock' + variant + colors[0], 710 + variant, 2, 0.42, [1.35, 0.85, 1.1, 0.35], colors);

      function billboard(design, night) {
        return memo(`board${design}${night}`, () => {
          const frame = merge([
            place(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 10), { x: -2.3, y: 1.7 }),
            place(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 10), { x: 2.3, y: 1.7 }),
            place(new THREE.BoxGeometry(7.4, 3.6, 0.22), { y: 4.95 }),
            place(new THREE.BoxGeometry(5.2, 0.12, 0.12), { y: 3.0, z: -0.1 }),
          ]);
          const map = tex.billboard(design, night);
          const face = new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissiveMap: map, emissive: night ? 0xffffff : 0x000000, emissiveIntensity: night ? 1.4 : 0 });
          return [
            { geometry: frame, material: shared('steel', () => new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.6, metalness: 0.6 })), cast: true },
            { geometry: place(new THREE.PlaneGeometry(7.1, 3.3), { y: 4.95, z: 0.115 }), material: face, cast: false },
          ];
        });
      }

      function chevron(dir, night) {
        return memo(`chev${dir}${night}`, () => {
          const map = tex.chevron(dir, night);
          return [
            {
              geometry: merge([place(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), { y: 0.6 }), place(new THREE.BoxGeometry(1.7, 1.25, 0.06), { y: 1.75 })]),
              material: shared('steel', () => new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.6, metalness: 0.6 })),
              cast: true,
            },
            {
              geometry: place(new THREE.PlaneGeometry(1.64, 1.2), { y: 1.75, z: 0.032 }),
              material: new THREE.MeshStandardMaterial({ map, roughness: 0.4, emissiveMap: map, emissive: night ? 0xffffff : 0x000000, emissiveIntensity: night ? 1.2 : 0 }),
              cast: false,
            },
          ];
        });
      }

      function lamp() {
        return memo('lamp', () => [
          {
            geometry: merge([
              place(new THREE.CylinderGeometry(0.1, 0.17, 9, 10), { y: 4.5 }),
              place(new THREE.BoxGeometry(3.4, 0.12, 0.14), { y: 8.95 }),
              place(new THREE.BoxGeometry(0.7, 0.16, 0.34), { x: -1.65, y: 8.88 }),
              place(new THREE.BoxGeometry(0.7, 0.16, 0.34), { x: 1.65, y: 8.88 }),
            ]),
            material: shared('pole', () => new THREE.MeshStandardMaterial({ color: 0x2c2d33, roughness: 0.5, metalness: 0.7 })),
            cast: true,
          },
          {
            geometry: merge([place(new THREE.PlaneGeometry(0.6, 0.26), { x: -1.65, y: 8.79, rx: Math.PI / 2 }), place(new THREE.PlaneGeometry(0.6, 0.26), { x: 1.65, y: 8.79, rx: Math.PI / 2 })]),
            material: shared('bulb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.6, 3), toneMapped: false })),
            cast: false,
          },
        ]);
      }

      function stand(accent, night) {
        return memo('stand' + accent + night, () => {
          const L = 22;
          const D = 11;
          const steps = [];
          for (let i = 0; i < 7; i++) {
            const h = 0.9 + i * 0.8;
            steps.push(place(new THREE.BoxGeometry(L, h, D / 7 + 0.02), { y: h / 2, z: D / 2 - (i + 0.5) * (D / 7) }));
          }
          const structure = merge([
            ...steps,
            place(new THREE.BoxGeometry(L, 7.4, 0.3), { y: 3.7, z: -D / 2 }),
            place(new THREE.BoxGeometry(L + 1.2, 0.25, D + 1.5), { y: 8.6, z: 0.2 }),
            ...[-L / 2, 0, L / 2].map((x) => place(new THREE.CylinderGeometry(0.15, 0.15, 8.6, 8), { x, y: 4.3, z: D / 2 + 0.4 })),
          ]);
          const crowdTex = tex.crowd();
          const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
          crowdTex.repeat.set(3, 1);
          const slope = Math.atan2(5.6, D);
          const len = Math.hypot(5.6, D);
          return [
            { geometry: structure, material: shared('concreteMat', () => new THREE.MeshStandardMaterial({ map: tex.concrete().map, normalMap: tex.concrete().normalMap, roughness: 0.92, color: 0x9c9aa0 })), cast: true },
            { geometry: place(new THREE.PlaneGeometry(L - 0.2, len), { y: 3.42, z: 0, rx: -Math.PI / 2 + slope }), material: crowdMat, cast: false },
            {
              geometry: place(new THREE.PlaneGeometry(L, 0.9), { y: 0.5, z: D / 2 + 0.02 }),
              material: new THREE.MeshStandardMaterial({ map: tex.banner(accent, night, 'SUNDOWN CIRCUIT'), roughness: 0.6, emissiveMap: tex.banner(accent, night, 'SUNDOWN CIRCUIT'), emissive: night ? 0xffffff : 0, emissiveIntensity: night ? 1 : 0 }),
              cast: false,
            },
          ];
        });
      }

      function prism(w, d, h) {
        const x = w / 2;
        const z = d / 2;
        const p = [
          // two roof slopes
          -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0,
          x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0,
          // gables
          -x, 0, -z, -x, 0, z, -x, h, 0,
          x, 0, z, x, 0, -z, x, h, 0,
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((p.length / 3) * 2).fill(0), 2));
        g.computeVertexNormals();
        return g;
      }

      function house(variant, alpine) {
        return memo(`house${variant}${alpine}`, () => {
          const colors = alpine ? ['#7a5236', '#6a4630'] : ['#5fb3b3', '#f2a65a', '#e76f51'];
          const color = colors[variant % colors.length];
          const walls = place(new THREE.BoxGeometry(6, 3.2, 5), { y: 1.6 });
          return [
            { geometry: walls, material: new THREE.MeshStandardMaterial({ map: tex.planks(color, alpine), roughness: 0.85 }), cast: true },
            { geometry: place(prism(6.8, 5.8, 2.1), { y: 3.2 }), material: shared('roof' + alpine, () => new THREE.MeshStandardMaterial({ color: alpine ? 0xdfe6ec : 0x3d2c3e, roughness: 0.8 })), cast: true },
          ];
        });
      }

      function gantry(accent, night) {
        return memo('gantry' + accent + night, () => {
          const map = tex.banner(accent, night);
          const bannerMat = new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissiveMap: map, emissive: night ? 0xffffff : 0, emissiveIntensity: night ? 1.2 : 0 });
          const lights = [];
          for (let i = 0; i < 5; i++) lights.push(place(new THREE.SphereGeometry(0.22, 12, 8), { x: (i - 2) * 0.7, y: 5.95, z: 0.45 }));
          return [
            {
              geometry: merge([
                place(new THREE.BoxGeometry(0.8, 7.8, 0.8), { x: -7.5, y: 3.9 }),
                place(new THREE.BoxGeometry(0.8, 7.8, 0.8), { x: 7.5, y: 3.9 }),
                place(new THREE.BoxGeometry(15.8, 1.6, 0.8), { y: 7.0 }),
                place(new THREE.BoxGeometry(3.8, 0.6, 0.3), { y: 5.95, z: 0.3 }),
              ]),
              material: shared('steelDark', () => new THREE.MeshStandardMaterial({ color: 0x24252b, roughness: 0.5, metalness: 0.6 })),
              cast: true,
            },
            { geometry: merge([place(new THREE.PlaneGeometry(15.6, 1.45), { y: 7.0, z: 0.41 }), place(new THREE.PlaneGeometry(15.6, 1.45), { y: 7.0, z: -0.41, ry: Math.PI })]), material: bannerMat, cast: false },
            { geometry: merge(lights), material: 'startLights', cast: false },
          ];
        });
      }

      return { palm, pine, bush, rock, billboard, chevron, lamp, stand, house, gantry };
    }

    SC.models = { CAR, CarModel, createScenery, merge, place, paint, displace, shared };
  });
})();
