/*
 * Sundown Circuit — track builder and the three circuits.
 * A track is a closed loop of road segments; each segment carries curve, height,
 * roadside scenery and the cars currently on it. Pure data, no DOM.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});
  const U = SC.util;
  const C = SC.CONFIG;
  const SCENERY = SC.SCENERY;

  const CURVE = { EASY: 2, MEDIUM: 4, HARD: 6, HAIRPIN: 8 };

  function point(y, z) {
    return {
      world: { x: 0, y, z },
      camera: { x: 0, y: 0, z: 0 },
      screen: { x: 0, y: 0, w: 0, scale: 0 },
    };
  }

  class Builder {
    constructor() {
      this.segments = [];
    }

    lastY() {
      const s = this.segments;
      return s.length ? s[s.length - 1].p2.world.y : 0;
    }

    addSegment(curve, y) {
      const n = this.segments.length;
      const L = C.segmentLength;
      this.segments.push({
        index: n,
        p1: point(this.lastY(), n * L),
        p2: point(y, (n + 1) * L),
        curve,
        sprites: [],
        cars: [],
        color: Math.floor(n / C.rumbleLength) % 2, // 0 = light band, 1 = dark band
        lit: false,
        checker: false,
        // filled in by the renderer every frame
        clip: 0,
        fog: 1,
        looped: false,
        visible: false,
        drawRoad: false,
      });
    }

    /**
     * Add a stretch of road that eases into `curve`, holds it, then eases out,
     * while climbing `hill` segment-lengths over the whole stretch.
     */
    road(enter, hold, leave, curve = 0, hill = 0) {
      const startY = this.lastY();
      const endY = startY + hill * C.segmentLength;
      const total = enter + hold + leave;
      let i = 0;
      for (let n = 0; n < enter; n++) this.addSegment(U.easeIn(0, curve, n / enter), U.easeInOut(startY, endY, ++i / total));
      for (let n = 0; n < hold; n++) this.addSegment(curve, U.easeInOut(startY, endY, ++i / total));
      for (let n = 0; n < leave; n++) this.addSegment(U.easeInOut(curve, 0, n / leave), U.easeInOut(startY, endY, ++i / total));
      return this;
    }

    straight(n) {
      return this.road(0, n, 0);
    }

    /** Alternating crests and dips that end at the starting height. */
    bumps(count, size) {
      for (let k = 0; k < count; k++) this.road(10, 8, 10, 0, k % 2 ? -size : size);
      if (count % 2) this.road(10, 8, 10, 0, -size);
      return this;
    }

    /** Ease back down (or up) to height zero so the loop closes smoothly. */
    level(enter, hold, leave, curve = 0) {
      return this.road(enter, hold, leave, curve, -this.lastY() / C.segmentLength);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Track definitions                                                   */
  /* ------------------------------------------------------------------ */

  const TRACK_DEFS = [
    {
      id: 'coast',
      name: 'Coastline',
      theme: 'coast',
      seed: 1337,
      blurb: 'Fast seaside sweepers at golden hour.',
      character: 'Flowing',
      layout(b) {
        b.straight(80);
        b.road(40, 80, 40, CURVE.EASY, 10);
        b.straight(60);
        b.road(30, 50, 30, CURVE.MEDIUM, -10);
        b.road(30, 40, 30, -3, 0);
        b.bumps(6, 4);
        b.road(50, 100, 50, 3, 20);
        b.road(25, 30, 25, CURVE.HARD, 0);
        b.road(40, 40, 40, 0, -25);
        b.road(25, 40, 25, -CURVE.MEDIUM, 0);
        b.road(25, 40, 25, CURVE.MEDIUM, 0);
        b.road(25, 40, 25, -CURVE.MEDIUM, 0);
        b.road(25, 40, 25, 5, 0);
        b.straight(80);
        b.road(60, 120, 60, 2.5, 10);
        b.road(40, 60, 40, 5, -5);
        b.road(30, 30, 30, -CURVE.EASY, 0);
        b.level(60, 80, 60, CURVE.EASY);
        b.straight(60);
      },
      scenery(track, rnd) {
        const n = track.segments.length;
        let nextPalm = 0;
        for (let i = 0; i < n; i++) {
          if (track.nearStart(i, 40)) continue;
          if (i >= nextPalm) {
            const side = rnd() < 0.5 ? -1 : 1;
            track.place(i, 'palm', side * (1.25 + rnd() * 0.6), Math.floor(rnd() * 3));
            if (rnd() < 0.35) track.place(i + 2, 'palm', -side * (1.3 + rnd() * 0.7), Math.floor(rnd() * 3));
            nextPalm = i + 4 + Math.floor(rnd() * 6);
          }
          if (i % 3 === 0 && rnd() < 0.4) track.place(i, 'bush', (rnd() < 0.5 ? -1 : 1) * (2 + rnd() * 2.5), Math.floor(rnd() * 3));
          if (rnd() < 0.03) track.place(i, 'rock', (rnd() < 0.5 ? -1 : 1) * (2.2 + rnd() * 2), Math.floor(rnd() * 2));
          if (i % 170 === 85) track.place(i, 'billboard', (i % 340 < 170 ? -1 : 1) * 1.22, Math.floor(rnd() * 3));
          if (i % 230 === 120 && rnd() < 0.8) track.place(i, 'house', (rnd() < 0.5 ? -1 : 1) * (2.6 + rnd()), Math.floor(rnd() * 3));
        }
      },
    },
    {
      id: 'ridge',
      name: 'Pine Ridge',
      theme: 'ridge',
      seed: 4242,
      blurb: 'Steep climbs, blind crests and two hairpins.',
      character: 'Technical',
      layout(b) {
        b.straight(80);
        b.road(40, 60, 40, 0, 40);
        b.road(25, 40, 25, CURVE.HARD, 10);
        b.road(25, 30, 25, -CURVE.HAIRPIN, 0);
        b.road(20, 30, 20, 0, -30);
        b.road(30, 60, 30, CURVE.MEDIUM, -20);
        b.bumps(6, 5);
        b.road(40, 80, 40, 3, 30);
        b.road(20, 30, 20, CURVE.HAIRPIN, 0);
        b.road(20, 30, 20, -CURVE.HARD, 0);
        b.road(40, 40, 40, 0, -40);
        b.road(30, 40, 30, 5, 20);
        b.road(20, 30, 20, -5, 0);
        b.road(20, 30, 20, 5, 0);
        b.road(20, 30, 20, -5, 0);
        b.road(20, 30, 20, 5, 0);
        b.level(50, 80, 50, CURVE.MEDIUM);
        b.road(30, 60, 30, CURVE.EASY, 0);
        b.straight(60);
      },
      scenery(track, rnd) {
        const n = track.segments.length;
        for (let i = 0; i < n; i++) {
          if (track.nearStart(i, 40)) continue;
          if (rnd() < 0.5) {
            const side = rnd() < 0.5 ? -1 : 1;
            track.place(i, 'pine', side * (1.25 + rnd() * 3.5), Math.floor(rnd() * 3));
          }
          if (rnd() < 0.06) track.place(i, 'rock', (rnd() < 0.5 ? -1 : 1) * (1.2 + rnd() * 1.2), Math.floor(rnd() * 2));
          if (i % 200 === 100) track.place(i, 'billboard', (i % 400 < 200 ? 1 : -1) * 1.22, Math.floor(rnd() * 3));
          if (i % 290 === 150) track.place(i, 'house', (rnd() < 0.5 ? -1 : 1) * (2.8 + rnd() * 0.8), Math.floor(rnd() * 2));
        }
      },
    },
    {
      id: 'neon',
      name: 'Neon Night',
      theme: 'neon',
      seed: 9001,
      blurb: 'Long downtown straights under the street lamps.',
      character: 'High speed',
      layout(b) {
        b.straight(100);
        b.road(50, 100, 50, CURVE.EASY, 0);
        b.straight(150);
        b.road(20, 20, 20, -5, 0);
        b.road(20, 20, 20, 5, 0);
        b.road(0, 120, 0, 0, 15);
        b.road(60, 120, 60, 3, 15);
        b.road(40, 60, 40, -CURVE.EASY, -15);
        b.straight(200);
        b.road(30, 40, 30, CURVE.HARD, 0);
        b.straight(20);
        b.road(30, 40, 30, CURVE.HARD, 0);
        b.bumps(4, 3);
        b.road(40, 80, 40, -3, 0);
        b.level(50, 100, 50, CURVE.MEDIUM);
        b.straight(100);
      },
      scenery(track, rnd) {
        const n = track.segments.length;
        let nextLeft = 0;
        let nextRight = 0;
        for (let i = 0; i < n; i++) {
          if (i % 16 === 0) {
            track.place(i, 'lamp', -1.18, 0);
            track.place(i + 8, 'lamp', 1.18, 0);
            for (let k = -2; k <= 2; k++) {
              track.segment(i + k).lit = true;
              track.segment(i + 8 + k).lit = true;
            }
          }
          if (track.nearStart(i, 40)) continue;
          if (i >= nextLeft) {
            track.place(i, 'building', -(2.2 + rnd() * 0.9), Math.floor(rnd() * 4));
            nextLeft = i + 9 + Math.floor(rnd() * 6);
          }
          if (i >= nextRight) {
            track.place(i, 'building', 2.2 + rnd() * 0.9, Math.floor(rnd() * 4));
            nextRight = i + 9 + Math.floor(rnd() * 6);
          }
          if (i % 130 === 65) track.place(i, 'billboard', (i % 260 < 130 ? -1 : 1) * 1.25, Math.floor(rnd() * 3));
          if (i % 4 === 2 && rnd() < 0.25) track.place(i, 'bush', (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 0.4), 0);
        }
      },
    },
  ];

  /* ------------------------------------------------------------------ */
  /* Track                                                               */
  /* ------------------------------------------------------------------ */

  class Track {
    constructor(def) {
      this.def = def;
      this.id = def.id;
      this.name = def.name;
      this.theme = def.theme;

      const b = new Builder();
      def.layout(b);
      if (Math.abs(b.lastY()) > 1e-6) b.level(40, 40, 40);
      b.segments[b.segments.length - 1].p2.world.y = 0; // exact closure

      this.segments = b.segments;
      this.length = this.segments.length * C.segmentLength;
      this.startIndex = def.startIndex || 60;
      this.startZ = this.startIndex * C.segmentLength;
      this.lengthKm = (this.length * C.metersPerUnit) / 1000;

      this.reserved = new Set();
      this.segment(this.startIndex).checker = true;
      this.segment(this.startIndex + 1).checker = true;

      const rnd = U.rng(def.seed);
      this.placeStart();
      this.placeChevrons();
      def.scenery(this, rnd);
      this.map = buildMap(this.segments);
    }

    segment(index) {
      const n = this.segments.length;
      return this.segments[((index % n) + n) % n];
    }

    findSegment(z) {
      return this.segments[Math.floor(U.wrap(z, this.length) / C.segmentLength) % this.segments.length];
    }

    nearStart(i, range) {
      const n = this.segments.length;
      const d = Math.abs(U.loopDelta(this.startIndex, i, n));
      return d <= range;
    }

    /** Place a scenery sprite unless that side of the segment is already taken. */
    place(index, type, offset, variant = 0) {
      const seg = this.segment(index);
      const side = offset < 0 ? -1 : 1;
      const near = Math.abs(offset) < 1.6;
      const key = seg.index + ':' + side;
      if (near && this.reserved.has(key)) return false;
      this.addSprite(seg, type, offset, variant);
      if (near) this.reserved.add(key);
      return true;
    }

    addSprite(seg, type, offset, variant) {
      const spec = SCENERY[type];
      const w = spec.w / C.roadWidth;
      const sign = offset === 0 ? 0 : offset < 0 ? -1 : 1;
      seg.sprites.push({
        type,
        variant,
        offset,
        w,
        cx: offset + (sign * w) / 2, // sprites grow outward from their anchor
        hitW: w * spec.hit,
        solid: spec.hit > 0,
      });
    }

    placeStart() {
      const s = this.startIndex;
      this.addSprite(this.segment(s), 'gantry', 0, 0);
      for (const k of [-34, -16, 6, 24]) {
        for (const side of [-1, 1]) this.place(s + k, 'stand', side * 1.5, 0);
      }
      this.place(s - 48, 'billboard', -1.22, 2);
      this.place(s + 40, 'billboard', 1.22, 2);
    }

    /** Warning chevrons on the outside of every hard bend. */
    placeChevrons() {
      const segs = this.segments;
      for (let i = 0; i < segs.length; i++) {
        const c = segs[i].curve;
        if (Math.abs(c) >= 3.5 && i % 6 === 0 && !this.nearStart(i, 20)) {
          const side = c > 0 ? -1 : 1;
          this.place(i, 'chevron', side * 1.12, c > 0 ? 0 : 1);
        }
      }
    }
  }

  /**
   * A top-down outline for the minimap. Curves are integrated into headings,
   * scaled so the loop turns exactly 360°, then any closing gap is spread
   * evenly along the lap. Points are normalised to the unit square.
   */
  function buildMap(segments) {
    const n = segments.length;
    let sum = 0;
    for (const s of segments) sum += s.curve;
    const k = Math.abs(sum) > 1 ? (2 * Math.PI) / sum : 0;
    const pts = new Float64Array(n * 2);
    let heading = -Math.PI / 2;
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      pts[i * 2] = x;
      pts[i * 2 + 1] = y;
      heading += segments[i].curve * k;
      x += Math.cos(heading);
      y += Math.sin(heading);
    }
    const gx = x - pts[0];
    const gy = y - pts[1];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts[i * 2] -= gx * t;
      pts[i * 2 + 1] -= gy * t;
      minX = Math.min(minX, pts[i * 2]);
      maxX = Math.max(maxX, pts[i * 2]);
      minY = Math.min(minY, pts[i * 2 + 1]);
      maxY = Math.max(maxY, pts[i * 2 + 1]);
    }
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    for (let i = 0; i < n; i++) {
      pts[i * 2] = (pts[i * 2] - minX) / span;
      pts[i * 2 + 1] = (pts[i * 2 + 1] - minY) / span;
    }
    return { points: pts, width: (maxX - minX) / span, height: (maxY - minY) / span };
  }

  SC.CURVE = CURVE;
  SC.TRACK_DEFS = TRACK_DEFS;
  SC.Track = Track;
  SC.buildTrackMap = buildMap;
})();
