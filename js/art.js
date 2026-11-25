/*
 * Sundown Circuit — procedural art.
 * Every car, tree, sign and skyline is drawn here onto offscreen canvases,
 * so the game ships without a single image file.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});
  const U = SC.util;
  const TAU = Math.PI * 2;
  const FONT = '"Saira Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';

  /* ------------------------------------------------------------------ */
  /* Canvas helpers                                                      */
  /* ------------------------------------------------------------------ */

  function make(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  }

  function circle(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  function shadow(g, x, y, rx, ry, a = 0.28) {
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fill();
  }

  function qpt(x0, y0, cx, cy, x1, y1, t) {
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
  }

  /** Smooth periodic noise in [-1, 1] over t in [0, 1): tiles seamlessly. */
  function periodic(rnd, terms, base = 1) {
    const parts = [];
    for (let i = 0; i < terms; i++) {
      parts.push({ k: base * (i + 1) + Math.floor(rnd() * 2), a: (0.6 + rnd() * 0.4) / Math.pow(i + 1, 0.9), p: rnd() * TAU });
    }
    const norm = parts.reduce((s, o) => s + o.a, 0);
    return (t) => {
      let s = 0;
      for (const o of parts) s += Math.sin(t * TAU * o.k + o.p) * o.a;
      return s / norm;
    };
  }

  /** Draw something at x and again shifted by ±w so wide layers tile without seams. */
  function wrapped(w, x, span, fn) {
    fn(x);
    if (x + span > w) fn(x - w);
    if (x < 0) fn(x + w);
  }

  function pick(rnd, arr) {
    return arr[Math.floor(rnd() * arr.length) % arr.length];
  }

  /* ------------------------------------------------------------------ */
  /* Cars                                                                */
  /* ------------------------------------------------------------------ */

  const CAR_ASPECT = 0.56;
  const CAR_COLORS = [
    ['#e63946', '#8c1c26'],
    ['#2a9df4', '#12508a'],
    ['#f4c430', '#9a7610'],
    ['#2ec4b6', '#127a70'],
    ['#f2f2ec', '#9a9a92'],
    ['#9b4dca', '#552372'],
    ['#ff8c42', '#a24f1a'],
    ['#4a4f73', '#1f2238'],
    ['#7bd14b', '#3e7a1e'],
  ];
  const PLAYER_COLOR = ['#ff5a2e', '#9e2a12'];

  /**
   * Rear view of a sports coupe in a 100 x 56 unit box scaled to width W.
   * opts: lean (-1..1), brake, glow, nitro (0..1), stripes, spoiler, flicker (0..1)
   */
  function drawCar(g, W, colors, o = {}) {
    const [body, dark] = colors;
    const s = W / 100;
    g.save();
    g.scale(s, s);

    shadow(g, 50, 52.5, 49, 4, 0.45);

    // Tyres
    g.fillStyle = '#111114';
    roundRect(g, 7, 35, 15, 19, 3);
    g.fill();
    roundRect(g, 78, 35, 15, 19, 3);
    g.fill();
    g.fillStyle = '#28282e';
    for (let y = 38; y < 52; y += 4) {
      g.fillRect(8, y, 13, 1.2);
      g.fillRect(79, y, 13, 1.2);
    }

    // Lower body
    let gr = g.createLinearGradient(0, 22, 0, 47);
    gr.addColorStop(0, body);
    gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(3, 44);
    g.lineTo(2, 30);
    g.quadraticCurveTo(3, 24, 9, 22);
    g.lineTo(91, 22);
    g.quadraticCurveTo(97, 24, 98, 30);
    g.lineTo(97, 44);
    g.quadraticCurveTo(96, 47, 92, 47);
    g.lineTo(8, 47);
    g.quadraticCurveTo(4, 47, 3, 44);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(9, 22, 82, 1.2);

    if (o.stripes) {
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.fillRect(42, 22, 5, 25);
      g.fillRect(53, 22, 5, 25);
    }

    // Diffuser and exhausts
    g.fillStyle = '#17171c';
    poly(g, [15, 41, 85, 41, 82, 48.5, 18, 48.5]);
    g.strokeStyle = '#2d2d34';
    g.lineWidth = 0.8;
    g.beginPath();
    for (const x of [32, 41, 50, 59, 68]) {
      g.moveTo(x, 42);
      g.lineTo(x, 48);
    }
    g.stroke();
    for (const ex of [25, 75]) {
      g.fillStyle = '#55555c';
      circle(g, ex, 45, 2.8);
      g.fillStyle = '#09090b';
      circle(g, ex, 45, 1.7);
    }

    // Tail lights
    const on = !!o.brake;
    g.fillStyle = on ? '#ff3030' : '#a3111b';
    poly(g, [6, 27, 34, 27, 32, 33, 8, 33]);
    poly(g, [94, 27, 66, 27, 68, 33, 92, 33]);
    g.fillStyle = on ? '#ffe2e2' : '#ff5a5f';
    g.fillRect(10, 28.6, 20, 1.6);
    g.fillRect(70, 28.6, 20, 1.6);
    g.fillStyle = on ? '#ff5050' : '#6b0c13';
    g.fillRect(34, 29.2, 32, 1.4);

    // Plate
    g.fillStyle = '#efeadf';
    roundRect(g, 42, 35, 16, 6, 1);
    g.fill();
    g.fillStyle = '#2a2a30';
    for (let i = 0; i < 4; i++) g.fillRect(44.2 + i * 3, 36.6, 2, 2.8);

    // Cabin, glass and wing roll with steering
    g.save();
    const k = (o.lean || 0) * 0.12;
    g.transform(1, 0, k, 1, -k * 23, 0);
    gr = g.createLinearGradient(0, 5, 0, 23);
    gr.addColorStop(0, dark);
    gr.addColorStop(1, body);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(17, 23);
    g.lineTo(26, 7.5);
    g.quadraticCurveTo(28, 5, 31, 5);
    g.lineTo(69, 5);
    g.quadraticCurveTo(72, 5, 74, 7.5);
    g.lineTo(83, 23);
    g.closePath();
    g.fill();
    if (o.stripes) {
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.fillRect(42, 5, 5, 4.5);
      g.fillRect(53, 5, 5, 4.5);
    }
    gr = g.createLinearGradient(0, 9, 0, 21);
    gr.addColorStop(0, '#2c3850');
    gr.addColorStop(1, '#07090f');
    g.fillStyle = gr;
    poly(g, [25, 21, 32, 9.5, 68, 9.5, 75, 21]);
    g.fillStyle = 'rgba(255,255,255,0.11)';
    poly(g, [36, 21, 44, 9.5, 51, 9.5, 43, 21]);

    if (o.spoiler !== false) {
      g.fillStyle = '#111115';
      g.fillRect(27, 19, 3, 4);
      g.fillRect(70, 19, 3, 4);
      g.fillStyle = dark;
      roundRect(g, 5, 15.5, 90, 4, 1.5);
      g.fill();
      g.fillStyle = body;
      g.fillRect(7, 15.8, 86, 1);
      g.fillStyle = '#121216';
      roundRect(g, 4, 12.5, 3.2, 9, 1);
      g.fill();
      roundRect(g, 92.8, 12.5, 3.2, 9, 1);
      g.fill();
    }
    g.restore();

    // Light glow
    if (on || o.glow) {
      g.globalCompositeOperation = 'lighter';
      for (const lx of [20, 80]) {
        const r = on ? 20 : 12;
        const rg = g.createRadialGradient(lx, 30, 0, lx, 30, r);
        rg.addColorStop(0, on ? 'rgba(255,60,50,0.55)' : 'rgba(255,40,40,0.32)');
        rg.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(lx - r, 30 - r, r * 2, r * 2);
      }
      g.globalCompositeOperation = 'source-over';
    }

    // Nitro flames
    if (o.nitro > 0) {
      g.globalCompositeOperation = 'lighter';
      for (const ex of [25, 75]) {
        const r = (5 + o.nitro * 7) * (0.8 + (o.flicker || 0.5) * 0.4);
        const rg = g.createRadialGradient(ex, 45.5, 0, ex, 46, r);
        rg.addColorStop(0, 'rgba(255,255,255,0.95)');
        rg.addColorStop(0.3, 'rgba(130,215,255,0.8)');
        rg.addColorStop(1, 'rgba(60,90,255,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.ellipse(ex, 46, r, r * 0.8, 0, 0, TAU);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  function carSprites(night) {
    const W = 320;
    const H = Math.round(W * CAR_ASPECT);
    return CAR_COLORS.map((colors, i) => {
      const opts = { glow: night, spoiler: i % 3 !== 1 };
      return {
        normal: make(W, H, (g) => drawCar(g, W, colors, opts)),
        brake: make(W, H, (g) => drawCar(g, W, colors, Object.assign({ brake: true }, opts))),
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Scenery                                                             */
  /* ------------------------------------------------------------------ */

  function frond(g, x, y, a, len, pal) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const droop = len * (0.3 + 0.4 * Math.abs(dx));
    const ex = x + dx * len;
    const ey = y + dy * len * 0.75 + droop;
    const cx = x + dx * len * 0.55;
    const cy = y + dy * len * 0.55 - len * 0.2;
    const N = 16;
    const spine = [];
    const left = [];
    const right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const [px, py] = qpt(x, y, cx, cy, ex, ey, t);
      const [qx, qy] = qpt(x, y, cx, cy, ex, ey, Math.min(1, t + 0.02));
      let nx = -(qy - py);
      let ny = qx - px;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 16 * (1 - t * 0.35);
      spine.push([px, py]);
      left.push([px + nx * w, py + ny * w]);
      right.push([px - nx * w * 0.85, py - ny * w * 0.85]);
    }
    g.fillStyle = pal.leafDark;
    g.beginPath();
    g.moveTo(left[0][0], left[0][1]);
    for (const p of left) g.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
    g.closePath();
    g.fill();
    g.fillStyle = pal.leaf;
    g.beginPath();
    g.moveTo(spine[0][0], spine[0][1]);
    for (const p of left) g.lineTo(p[0], p[1]);
    for (let i = spine.length - 1; i >= 0; i--) g.lineTo(spine[i][0], spine[i][1]);
    g.closePath();
    g.fill();
    // leaflet cuts
    g.strokeStyle = pal.leafDark;
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 2; i < N; i += 1) {
      g.moveTo(spine[i][0], spine[i][1]);
      g.lineTo(left[i + 1][0], left[i + 1][1]);
    }
    g.stroke();
    g.strokeStyle = pal.rib;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(cx, cy, ex, ey);
    g.stroke();
  }

  function palm(rnd) {
    const pal = { trunk: '#9a7450', trunkDark: '#7a5838', leaf: '#5aa24d', leafDark: '#2f6e36', rib: '#28572b', nut: '#5a3b22' };
    return make(320, 580, (g, w, h) => {
      const bx = w * 0.5;
      const by = h - 8;
      const bend = (rnd() - 0.5) * 90;
      const tx = bx + bend;
      const ty = h * 0.3;
      const cx = bx + bend * 0.12;
      const cy = h * 0.62;
      shadow(g, bx, by, 46, 7);
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const [x0, y0] = qpt(bx, by, cx, cy, tx, ty, t0);
        const [x1, y1] = qpt(bx, by, cx, cy, tx, ty, t1);
        const r0 = U.lerp(15, 8, t0);
        const r1 = U.lerp(15, 8, t1);
        g.fillStyle = i % 2 ? pal.trunkDark : pal.trunk;
        poly(g, [x0 - r0, y0, x0 + r0, y0, x1 + r1, y1 - 1, x1 - r1, y1 - 1]);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        poly(g, [x0 + r0 * 0.3, y0, x0 + r0, y0, x1 + r1, y1 - 1, x1 + r1 * 0.3, y1 - 1]);
      }
      const n = 8 + Math.floor(rnd() * 3);
      const lo = Math.PI - 0.35;
      const hi = TAU + 0.35;
      const fronds = [];
      for (let i = 0; i < n; i++) fronds.push({ a: lo + (i / (n - 1)) * (hi - lo) + (rnd() - 0.5) * 0.25, len: 105 + rnd() * 40 });
      // upward fronds sit behind, drooping ones in front
      fronds.sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
      for (const f of fronds) frond(g, tx, ty, f.a, f.len, pal);
      g.fillStyle = pal.nut;
      for (let k = 0; k < 3; k++) circle(g, tx + (k - 1) * 9, ty + 9 + rnd() * 4, 7);
    });
  }

  function pine(rnd, snow) {
    return make(260, 560, (g, w, h) => {
      const cx = w / 2;
      shadow(g, cx, h - 8, 70, 9);
      g.fillStyle = '#4e3426';
      g.fillRect(cx - 9, h - 72, 18, 66);
      const tiers = 5 + Math.floor(rnd() * 2);
      const bottom = h - 56;
      const top = 14;
      const step = (bottom - top - 90) / tiers;
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const yb = bottom - i * step;
        const yt = Math.max(top, yb - step * 2.1);
        const half = w * 0.47 * (1 - t * 0.72) * (0.9 + rnd() * 0.12);
        const teeth = 6;
        const pts = [cx, yt, cx + half, yb];
        for (let k = 1; k < teeth; k++) {
          const x = cx + half - (2 * half * k) / teeth;
          pts.push(x, yb - (k % 2 ? 10 : 0));
        }
        pts.push(cx - half, yb);
        g.fillStyle = '#1f4b2c';
        poly(g, pts);
        g.fillStyle = '#163a22';
        poly(g, [cx, yt, cx + half, yb, cx + half * 0.1, yb - 4]);
        g.fillStyle = 'rgba(140,200,120,0.18)';
        poly(g, [cx, yt, cx - half * 0.95, yb, cx - half * 0.5, yb - 4]);
        if (snow) {
          const sy = yt + (yb - yt) * 0.38;
          const sx = half * 0.38;
          g.fillStyle = '#eef4f8';
          poly(g, [cx, yt, cx + sx, sy, cx + sx * 0.45, sy - 7, cx, sy + 2, cx - sx * 0.5, sy - 6, cx - sx, sy]);
        }
      }
    });
  }

  function bush(rnd, pal) {
    return make(260, 170, (g, w, h) => {
      shadow(g, w / 2, h - 8, w * 0.42, 9);
      const blobs = 9;
      for (let i = 0; i < blobs; i++) {
        const t = i / (blobs - 1);
        const arch = Math.sin(t * Math.PI);
        const x = w * (0.18 + 0.64 * t) + (rnd() - 0.5) * 18;
        const y = h * (0.64 - arch * 0.2) + (rnd() - 0.5) * 8;
        const r = h * (0.18 + rnd() * 0.1) * (0.75 + arch * 0.4);
        const rg = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
        rg.addColorStop(0, pal.light);
        rg.addColorStop(1, pal.dark);
        g.fillStyle = rg;
        circle(g, x, y, r);
      }
      if (pal.flower) {
        g.fillStyle = pal.flower;
        for (let i = 0; i < 14; i++) circle(g, w * (0.2 + rnd() * 0.6), h * (0.35 + rnd() * 0.4), 3);
      }
    });
  }

  function rock(rnd, pal) {
    return make(240, 160, (g, w, h) => {
      shadow(g, w / 2, h - 9, w * 0.46, 8, 0.3);
      const n = 9;
      const pts = [w * 0.04, h - 10];
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i / (n - 1)) * Math.PI;
        const r = 0.72 + rnd() * 0.28;
        pts.push(w / 2 + Math.cos(a) * w * 0.46 * r, h - 10 + Math.sin(a) * (h - 22) * r);
      }
      pts.push(w * 0.96, h - 10);
      const gr = g.createLinearGradient(0, 10, 0, h);
      gr.addColorStop(0, pal.light);
      gr.addColorStop(1, pal.dark);
      g.fillStyle = gr;
      poly(g, pts);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      poly(g, [pts[4], pts[5], pts[6], pts[7], pts[8], pts[9], w * 0.42, h * 0.6, w * 0.22, h * 0.68]);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      poly(g, [pts[14], pts[15], pts[16], pts[17], w * 0.96, h - 10, w * 0.6, h - 10]);
    });
  }

  /* Billboards ------------------------------------------------------ */

  function textFit(g, text, weight, size, maxW, italic = true) {
    let s = size;
    g.font = `${italic ? 'italic ' : ''}${weight} ${s}px ${FONT}`;
    while (g.measureText(text).width > maxW && s > 8) {
      s -= 2;
      g.font = `${italic ? 'italic ' : ''}${weight} ${s}px ${FONT}`;
    }
    return s;
  }

  const BOARDS = {
    volta(g, x, y, w, h, night) {
      g.fillStyle = night ? '#0b0816' : '#d7263d';
      g.fillRect(x, y, w, h);
      g.fillStyle = night ? 'rgba(255,61,154,0.15)' : '#f4f1ea';
      g.beginPath();
      g.moveTo(x, y + h * 0.72);
      g.bezierCurveTo(x + w * 0.3, y + h * 0.5, x + w * 0.6, y + h * 0.95, x + w, y + h * 0.66);
      g.lineTo(x + w, y + h * 0.8);
      g.bezierCurveTo(x + w * 0.6, y + h * 1.05, x + w * 0.3, y + h * 0.62, x, y + h * 0.86);
      g.closePath();
      g.fill();
      glowText(g, 'VOLTA', x + w / 2, y + h * 0.44, 800, h * 0.52, w * 0.8, night ? '#ff5ab0' : '#ffffff', night);
      glowText(g, 'ICE COLD COLA', x + w / 2, y + h * 0.9, 600, h * 0.11, w * 0.6, night ? '#ffd1ea' : '#7a1020', false);
    },
    orbit(g, x, y, w, h, night) {
      g.fillStyle = night ? '#070b14' : '#121217';
      g.fillRect(x, y, w, h);
      const r = h * 0.34;
      const tx = x + h * 0.55;
      const ty = y + h / 2;
      g.fillStyle = '#26262c';
      circle(g, tx, ty, r);
      g.strokeStyle = night ? '#46e0ff' : '#ffd23f';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(tx, ty, r * 0.62, 0, TAU);
      g.stroke();
      g.fillStyle = '#3a3a42';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        g.save();
        g.translate(tx + Math.cos(a) * r * 0.9, ty + Math.sin(a) * r * 0.9);
        g.rotate(a);
        g.fillRect(-4, -5, 8, 10);
        g.restore();
      }
      const cx = x + h * 0.95 + (w - h * 0.95) / 2;
      glowText(g, 'ORBIT', cx, y + h * 0.45, 800, h * 0.42, w - h * 1.1, night ? '#46e0ff' : '#ffd23f', night);
      glowText(g, 'PERFORMANCE TYRES', cx, y + h * 0.78, 600, h * 0.12, w - h * 1.2, '#f4f1ea', false);
    },
    fuel(g, x, y, w, h, night) {
      g.fillStyle = night ? '#08120f' : '#0f5e5b';
      g.fillRect(x, y, w, h);
      g.fillStyle = night ? 'rgba(120,255,190,0.12)' : '#f2c14e';
      g.fillRect(x, y + h * 0.66, w, h * 0.08);
      glowText(g, 'KESTREL', x + w / 2, y + h * 0.36, 800, h * 0.4, w * 0.8, night ? '#7dffc4' : '#ffffff', night);
      glowText(g, 'HIGH OCTANE FUEL', x + w / 2, y + h * 0.86, 600, h * 0.12, w * 0.7, night ? '#c9ffe6' : '#f2c14e', false);
    },
    event(g, x, y, w, h, night) {
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      if (night) {
        gr.addColorStop(0, '#16092e');
        gr.addColorStop(1, '#2a0d3a');
      } else {
        gr.addColorStop(0, '#ffb347');
        gr.addColorStop(0.5, '#ff5e5b');
        gr.addColorStop(1, '#6a2c8e');
      }
      g.fillStyle = gr;
      g.fillRect(x, y, w, h);
      const sq = h * 0.1;
      for (let i = 0; i * sq < w; i++) {
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#111' : '#f4f1ea';
          g.fillRect(x + i * sq, y + h - sq * (2 - j), sq, sq);
        }
      }
      glowText(g, 'SUNDOWN', x + w / 2, y + h * 0.36, 800, h * 0.4, w * 0.86, night ? '#ffb347' : '#ffffff', night);
      glowText(g, 'CIRCUIT', x + w / 2, y + h * 0.64, 700, h * 0.2, w * 0.6, night ? '#ff5ab0' : '#2b1748', night);
    },
  };

  function glowText(g, text, x, y, weight, size, maxW, color, glow) {
    textFit(g, text, weight, Math.round(size), maxW);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (glow) {
      g.shadowColor = color;
      g.shadowBlur = size * 0.35;
      g.fillStyle = color;
      g.fillText(text, x, y);
      g.shadowBlur = size * 0.12;
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.6;
      g.fillText(text, x, y);
      g.globalAlpha = 1;
      g.shadowBlur = 0;
    } else {
      g.fillStyle = color;
      g.fillText(text, x, y);
    }
  }

  function billboard(design, night) {
    return make(560, 340, (g, w, h) => {
      const bh = Math.round(h * 0.64);
      shadow(g, w / 2, h - 6, w * 0.38, 7, 0.22);
      g.fillStyle = '#2f2f37';
      g.fillRect(w * 0.24 - 8, bh - 6, 16, h - bh);
      g.fillRect(w * 0.76 - 8, bh - 6, 16, h - bh);
      g.fillStyle = '#25252c';
      g.fillRect(w * 0.24, bh + 20, w * 0.52, 8);
      g.fillStyle = '#1b1b22';
      roundRect(g, 6, 6, w - 12, bh, 8);
      g.fill();
      g.save();
      roundRect(g, 16, 16, w - 32, bh - 20, 4);
      g.clip();
      BOARDS[design](g, 16, 16, w - 32, bh - 20, night);
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(16, 16, w - 32, 4);
    });
  }

  function chevron(dir, night) {
    return make(160, 240, (g, w, h) => {
      shadow(g, w / 2, h - 5, 26, 5);
      g.fillStyle = '#3a3a42';
      g.fillRect(w / 2 - 5, h * 0.5, 10, h * 0.5 - 4);
      g.fillStyle = night ? '#0d0b14' : '#f7f5ef';
      roundRect(g, 10, 12, w - 20, h * 0.46, 6);
      g.fill();
      g.strokeStyle = night ? '#46e0ff' : '#1b1b22';
      g.lineWidth = 4;
      g.stroke();
      const color = night ? '#46e0ff' : '#d62828';
      if (night) {
        g.shadowColor = color;
        g.shadowBlur = 16;
      }
      g.fillStyle = color;
      const ay = 12 + h * 0.23;
      const s = 30;
      for (const off of [-22, 18]) {
        const ax = w / 2 + off * dir + 8 * dir;
        poly(g, [
          ax - s * 0.5 * dir, ay - s,
          ax + s * 0.5 * dir, ay,
          ax - s * 0.5 * dir, ay + s,
          ax - s * 0.95 * dir, ay + s,
          ax + s * 0.05 * dir, ay,
          ax - s * 0.95 * dir, ay - s,
        ]);
      }
      g.shadowBlur = 0;
    });
  }

  function lamp(night) {
    return make(400, 700, (g, w, h) => {
      const cx = w / 2;
      const top = 70;
      shadow(g, cx, h - 6, 30, 6);
      g.fillStyle = '#2b2b33';
      g.fillRect(cx - 13, h - 34, 26, 30);
      const gr = g.createLinearGradient(cx - 7, 0, cx + 7, 0);
      gr.addColorStop(0, '#6a6a76');
      gr.addColorStop(1, '#2d2d36');
      g.fillStyle = gr;
      g.fillRect(cx - 7, top, 14, h - top - 30);
      g.fillStyle = '#3a3a44';
      g.fillRect(w * 0.2, top, w * 0.6, 9);
      for (const hx of [w * 0.2, w * 0.8]) {
        g.fillStyle = '#2f2f38';
        roundRect(g, hx - 30, top - 6, 60, 16, 5);
        g.fill();
        g.fillStyle = night ? '#fff3cf' : '#d9d6cc';
        g.fillRect(hx - 24, top + 8, 48, 4);
        if (night) {
          const rg = g.createRadialGradient(hx, top + 12, 0, hx, top + 12, 105);
          rg.addColorStop(0, 'rgba(255,224,160,0.6)');
          rg.addColorStop(0.35, 'rgba(255,190,120,0.18)');
          rg.addColorStop(1, 'rgba(255,170,100,0)');
          g.fillStyle = rg;
          g.fillRect(hx - 105, top - 93, 210, 210);
        }
      }
    });
  }

  function building(rnd, variant) {
    const heights = [760, 980, 640, 1120];
    const bases = ['#1b1531', '#17122b', '#1e1836', '#15112a'];
    const neon = ['#ff3d9a', '#46e0ff', '#b26bff', '#ffb347'];
    const h0 = heights[variant % 4];
    return make(400, h0, (g, w, h) => {
      const top = 70;
      g.fillStyle = bases[variant % 4];
      g.fillRect(10, top, w - 20, h - top);
      const cols = 6;
      const cw = (w - 60) / cols;
      const rows = Math.floor((h - top - 70) / 46);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = rnd() < 0.42;
          g.globalAlpha = lit ? 0.75 + rnd() * 0.25 : 1;
          g.fillStyle = lit ? pick(rnd, ['#ffd27a', '#a8ecff', '#ffe9c7', '#ff9de0', '#ffd27a']) : '#0c0918';
          g.fillRect(30 + c * cw, top + 30 + r * 46, cw - 14, 26);
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.fillRect(w * 0.7, top, w * 0.3 - 10, h - top);
      const nc = neon[variant % 4];
      g.shadowColor = nc;
      g.shadowBlur = 22;
      g.fillStyle = nc;
      g.fillRect(10, top - 4, w - 20, 6);
      if (variant % 2 === 1) {
        // vertical sign
        g.fillRect(w * 0.08, top + 60, 8, h * 0.4);
        textFit(g, variant === 1 ? 'NOVA' : 'ARC', 800, 64, 200, false);
        g.save();
        g.translate(w * 0.17, top + 70);
        g.textAlign = 'center';
        g.textBaseline = 'top';
        const word = variant === 1 ? 'NOVA' : 'ARC';
        for (let i = 0; i < word.length; i++) g.fillText(word[i], 0, i * 70);
        g.restore();
      }
      g.shadowBlur = 0;
      // roof gear
      g.fillStyle = '#100c1e';
      g.fillRect(w * 0.6, top - 40, 60, 36);
      g.fillRect(w * 0.3, 10, 5, top - 10);
      g.fillStyle = '#ff2b2b';
      g.shadowColor = '#ff2b2b';
      g.shadowBlur = 12;
      circle(g, w * 0.3 + 2.5, 12, 5);
      g.shadowBlur = 0;
    });
  }

  function stand(rnd, accent) {
    return make(640, 320, (g, w, h) => {
      g.fillStyle = '#2b2b34';
      g.fillRect(0, 8, w, 18);
      g.fillStyle = '#22222a';
      for (const x of [16, w / 2 - 5, w - 26]) g.fillRect(x, 26, 10, h - 60);
      const crowd = ['#ff7a3d', '#ffd23f', '#2a9df4', '#f4f1ea', '#e63946', '#2ec4b6', '#9b4dca', '#141418'];
      for (let r = 0; r < 6; r++) {
        const y = 34 + r * 36;
        g.fillStyle = r % 2 ? '#3c3c47' : '#35353f';
        g.fillRect(6, y, w - 12, 36);
        for (let x = 14; x < w - 12; x += 12) {
          if (rnd() < 0.86) {
            g.fillStyle = pick(rnd, crowd);
            g.fillRect(x - 4, y + 16, 9, 14);
            g.fillStyle = pick(rnd, ['#f1c7a3', '#c68c5c', '#8d5a3b', '#e9b48a']);
            circle(g, x + (rnd() - 0.5) * 2, y + 11, 4.2);
          }
        }
      }
      g.fillStyle = accent;
      g.fillRect(0, h - 66, w, 42);
      g.fillStyle = '#ffffff';
      textFit(g, 'SUNDOWN CIRCUIT', 800, 30, w * 0.9);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SUNDOWN CIRCUIT', w / 2, h - 45);
      g.fillStyle = '#1d1d24';
      g.fillRect(0, h - 24, w, 24);
    });
  }

  function house(rnd, variant, alpine) {
    return make(420, 320, (g, w, h) => {
      shadow(g, w / 2, h - 8, w * 0.46, 9);
      const wall = alpine ? ['#7a5236', '#6a4630'][variant % 2] : ['#5fb3b3', '#f2a65a', '#e76f51'][variant % 3];
      g.fillStyle = wall;
      g.fillRect(44, 140, w - 88, h - 152);
      g.strokeStyle = 'rgba(0,0,0,0.16)';
      g.lineWidth = 3;
      g.beginPath();
      if (alpine) {
        for (let y = 152; y < h - 12; y += 18) {
          g.moveTo(44, y);
          g.lineTo(w - 44, y);
        }
      } else {
        for (let x = 60; x < w - 44; x += 20) {
          g.moveTo(x, 140);
          g.lineTo(x, h - 12);
        }
      }
      g.stroke();
      g.fillStyle = alpine ? '#3b2f2f' : '#3d2c3e';
      poly(g, [20, 152, w / 2, 40, w - 20, 152]);
      if (alpine) {
        g.fillStyle = '#eef4f8';
        poly(g, [36, 140, w / 2, 48, w - 36, 140, w - 70, 132, w / 2, 66, 70, 132]);
      }
      g.fillStyle = '#2a1d16';
      g.fillRect(w / 2 - 28, h - 112, 56, 100);
      g.fillStyle = '#ffe3a6';
      g.fillRect(78, 180, 60, 46);
      g.fillRect(w - 138, 180, 60, 46);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(106, 180, 4, 46);
      g.fillRect(w - 110, 180, 4, 46);
    });
  }

  function gantry(accent, night) {
    return make(1120, 470, (g, w, h) => {
      const postW = 46;
      g.fillStyle = '#30303a';
      g.fillRect(8, 40, postW, h - 44);
      g.fillRect(w - 8 - postW, 40, postW, h - 44);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(8 + postW * 0.6, 40, postW * 0.4, h - 44);
      g.fillRect(w - 8 - postW * 0.4, 40, postW * 0.4, h - 44);
      g.fillStyle = '#22222a';
      g.fillRect(0, 24, w, 114);
      const sq = 14;
      for (let i = 0; i * sq < w; i++) {
        g.fillStyle = i % 2 ? '#111' : '#f4f1ea';
        g.fillRect(i * sq, 24, sq, sq);
        g.fillStyle = i % 2 ? '#f4f1ea' : '#111';
        g.fillRect(i * sq, 124, sq, sq);
      }
      g.fillStyle = night ? '#120a24' : accent;
      g.fillRect(0, 38, w, 86);
      glowText(g, 'START · FINISH', w / 2, 82, 800, 64, w * 0.7, night ? accent : '#ffffff', night);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = '#0c0c10';
        circle(g, w / 2 + (i - 2) * 46, 160, 15);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Parallax background layers                                         */
  /* ------------------------------------------------------------------ */

  function cloud(g, x, y, w, h, color, rnd) {
    g.fillStyle = color;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const cx = x + w * t;
      const rr = h * (0.45 + Math.sin(t * Math.PI) * 0.55) * (0.8 + rnd() * 0.3);
      g.beginPath();
      g.ellipse(cx, y - rr * 0.3, rr * 1.4, rr, 0, 0, TAU);
      g.fill();
    }
  }

  const LAYERS = {
    coast(rnd) {
      const W = 2048;
      const sky = make(W, 512, (g, w, h) => {
        const sx = w * 0.62;
        const sy = h * 0.82;
        let rg = g.createRadialGradient(sx, sy, 0, sx, sy, 300);
        rg.addColorStop(0, 'rgba(255,214,150,0.55)');
        rg.addColorStop(1, 'rgba(255,170,110,0)');
        g.fillStyle = rg;
        g.fillRect(sx - 300, sy - 300, 600, 600);
        rg = g.createRadialGradient(sx, sy, 0, sx, sy, 70);
        rg.addColorStop(0, '#fff7da');
        rg.addColorStop(0.65, '#ffd98a');
        rg.addColorStop(1, '#ffa45a');
        g.fillStyle = rg;
        circle(g, sx, sy, 70);
        for (let i = 0; i < 14; i++) {
          const high = i < 5;
          const cw = 160 + rnd() * 260;
          const ch = high ? 8 + rnd() * 10 : 5 + rnd() * 8;
          const x = rnd() * w;
          const y = high ? h * (0.15 + rnd() * 0.3) : h * (0.55 + rnd() * 0.3);
          const col = pick(rnd, ['rgba(255,170,150,0.55)', 'rgba(240,130,160,0.45)', 'rgba(200,100,150,0.4)', 'rgba(255,200,160,0.5)']);
          wrapped(w, x, cw + 60, (xx) => cloud(g, xx, y, cw, ch, col, rnd));
        }
      });
      const far = make(W, 300, (g, w, h) => {
        const sea = 46;
        const n = periodic(rnd, 6, 2);
        g.fillStyle = '#b45f7e';
        g.beginPath();
        g.moveTo(0, h - sea);
        for (let x = 0; x <= w; x += 4) {
          const v = Math.max(0, n(x / w) + 0.05);
          g.lineTo(x, h - sea - v * 210);
        }
        g.lineTo(w, h - sea);
        g.closePath();
        g.fill();
        const gr = g.createLinearGradient(0, h - sea, 0, h);
        gr.addColorStop(0, '#f0a07c');
        gr.addColorStop(1, '#d9766f');
        g.fillStyle = gr;
        g.fillRect(0, h - sea, w, sea);
        g.fillStyle = 'rgba(255,230,180,0.7)';
        for (let i = 0; i < 90; i++) {
          const x = w * 0.62 + (rnd() - 0.5) * 380 * (1 + rnd());
          const y = h - sea + 3 + rnd() * (sea - 6);
          g.fillRect(x, y, 10 + rnd() * 40, 2);
        }
      });
      const near = make(W, 220, (g, w, h) => {
        const n = periodic(rnd, 5, 3);
        const tops = [];
        g.fillStyle = '#6a3a5c';
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const v = Math.max(0, n(x / w) + 0.1);
          const y = h - 6 - v * 150;
          tops.push([x, y, v]);
          g.lineTo(x, y);
        }
        g.lineTo(w, h);
        g.closePath();
        g.fill();
        // palm silhouettes along the ridges
        g.fillStyle = '#4e2a48';
        g.strokeStyle = '#4e2a48';
        for (let i = 0; i < tops.length; i += 9) {
          const [x, y, v] = tops[i];
          if (v < 0.12 || rnd() < 0.45) continue;
          const th = 30 + rnd() * 30;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(x, y + 2);
          g.quadraticCurveTo(x + 6, y - th * 0.5, x + 3, y - th);
          g.stroke();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI + (k / 5) * Math.PI;
            g.beginPath();
            g.ellipse(x + 3 + Math.cos(a) * 10, y - th + Math.sin(a) * 4 + 3, 12, 3, a, 0, TAU);
            g.fill();
          }
        }
      });
      return { sky, far, near };
    },

    ridge(rnd) {
      const W = 2048;
      const sky = make(W, 512, (g, w, h) => {
        const sx = w * 0.3;
        const sy = h * 0.22;
        let rg = g.createRadialGradient(sx, sy, 0, sx, sy, 220);
        rg.addColorStop(0, 'rgba(255,255,235,0.7)');
        rg.addColorStop(1, 'rgba(255,255,235,0)');
        g.fillStyle = rg;
        g.fillRect(sx - 220, sy - 220, 440, 440);
        g.fillStyle = '#fffdf2';
        circle(g, sx, sy, 34);
        for (let i = 0; i < 9; i++) {
          const x = rnd() * w;
          const y = h * (0.25 + rnd() * 0.5);
          const cw = 140 + rnd() * 200;
          const ch = 18 + rnd() * 16;
          wrapped(w, x, cw + 80, (xx) => {
            cloud(g, xx, y + ch * 0.35, cw, ch, 'rgba(176,198,222,0.8)', rnd);
            cloud(g, xx, y, cw, ch, 'rgba(255,255,255,0.92)', rnd);
          });
        }
      });
      const far = make(W, 420, (g, w, h) => {
        const range = (color, snowLine, amp, base, seedTerms) => {
          const n = periodic(rnd, seedTerms, 3);
          const m = periodic(rnd, 3, 9);
          const gr = g.createLinearGradient(0, h - base - amp, 0, h);
          gr.addColorStop(0, '#f6f9fc');
          gr.addColorStop(snowLine, '#e3ecf4');
          gr.addColorStop(Math.min(1, snowLine + 0.08), color);
          gr.addColorStop(1, color);
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(0, h);
          for (let x = 0; x <= w; x += 3) {
            const t = x / w;
            const ridge = 1 - Math.abs(n(t));
            const y = h - base - (ridge * 0.8 + m(t) * 0.15) * amp;
            g.lineTo(x, y);
          }
          g.lineTo(w, h);
          g.closePath();
          g.fill();
        };
        range('#8da5c3', 0.3, 300, 40, 6);
        range('#6f8bb0', 0.18, 190, 10, 5);
      });
      const near = make(W, 220, (g, w, h) => {
        const n = periodic(rnd, 5, 2);
        const pts = [];
        g.fillStyle = '#2f5f3a';
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const y = h - 40 - (0.5 + 0.5 * n(x / w)) * 110;
          pts.push([x, y]);
          g.lineTo(x, y);
        }
        g.lineTo(w, h);
        g.closePath();
        g.fill();
        g.fillStyle = '#25502f';
        for (let i = 0; i < pts.length; i += 3) {
          const [x, y] = pts[i];
          const th = 16 + rnd() * 26;
          const tw = th * 0.32;
          poly(g, [x - tw, y + 6, x, y - th, x + tw, y + 6]);
        }
      });
      return { sky, far, near };
    },

    neon(rnd) {
      const W = 2048;
      const sky = make(W, 512, (g, w, h) => {
        for (let i = 0; i < 320; i++) {
          g.globalAlpha = 0.25 + rnd() * 0.75;
          g.fillStyle = rnd() < 0.15 ? '#ffd6f0' : '#ffffff';
          const r = rnd() < 0.08 ? 1.8 : 0.6 + rnd() * 0.8;
          circle(g, rnd() * w, rnd() * h * 0.85, r);
        }
        g.globalAlpha = 1;
        const mx = w * 0.24;
        const my = h * 0.3;
        const rg = g.createRadialGradient(mx, my, 0, mx, my, 160);
        rg.addColorStop(0, 'rgba(220,200,255,0.35)');
        rg.addColorStop(1, 'rgba(220,200,255,0)');
        g.fillStyle = rg;
        g.fillRect(mx - 160, my - 160, 320, 320);
        g.fillStyle = '#f4efe2';
        circle(g, mx, my, 38);
        g.globalCompositeOperation = 'destination-out';
        circle(g, mx + 16, my - 10, 34);
        g.globalCompositeOperation = 'source-over';
      });
      const skyline = (h, color, minH, maxH, windowColor, density, neon) => (g, w) => {
        let x = 0;
        while (x < w) {
          const bw = 30 + rnd() * 70;
          const bh = minH + rnd() * (maxH - minH);
          wrapped(w, x, bw, (xx) => {
            g.fillStyle = color;
            g.fillRect(xx, h - bh, bw + 1, bh);
          });
          for (let wy = h - bh + 8; wy < h - 6; wy += 9) {
            for (let wx = 5; wx < bw - 5; wx += 8) {
              if (rnd() < density) {
                g.globalAlpha = 0.35 + rnd() * 0.5;
                g.fillStyle = pick(rnd, windowColor);
                wrapped(w, x + wx, 3, (xx) => g.fillRect(xx, wy, 3, 4));
              }
            }
          }
          g.globalAlpha = 1;
          if (rnd() < 0.25) {
            const ax = x + bw / 2;
            g.fillStyle = color;
            g.fillRect(ax - 1, h - bh - 24, 2, 24);
            g.fillStyle = '#ff3b3b';
            circle(g, ax, h - bh - 24, 2.2);
          }
          if (neon && rnd() < 0.3) {
            const nc = pick(rnd, ['#ff3d9a', '#46e0ff', '#b26bff']);
            g.shadowColor = nc;
            g.shadowBlur = 10;
            g.fillStyle = nc;
            wrapped(w, x, bw, (xx) => g.fillRect(xx + 4, h - bh + 4, bw - 8, 3));
            g.shadowBlur = 0;
          }
          x += bw + rnd() * 6;
        }
      };
      const far = make(W, 360, (g, w, h) => skyline(h, '#251845', 60, 300, ['#ffcf7a', '#b49cff', '#ff9ad5'], 0.18, false)(g, w));
      const near = make(W, 260, (g, w, h) => skyline(h, '#140d27', 50, 220, ['#ffd27a', '#8ee9ff', '#ff8fd0'], 0.24, true)(g, w));
      return { sky, far, near };
    },
  };

  /* ------------------------------------------------------------------ */
  /* Theme assembly                                                      */
  /* ------------------------------------------------------------------ */

  const cache = new Map();

  function buildTheme(themeId) {
    if (cache.has(themeId)) return cache.get(themeId);
    const theme = SC.THEMES[themeId];
    const night = !!theme.night;
    const rnd = U.rng(themeId.length * 7919 + themeId.charCodeAt(0));
    const designs = {
      coast: ['volta', 'orbit', 'event'],
      ridge: ['orbit', 'fuel', 'event'],
      neon: ['volta', 'orbit', 'event'],
    }[themeId];

    const scenery = {
      billboard: designs.map((d) => billboard(d, night)),
      chevron: [chevron(1, night), chevron(-1, night)],
      stand: [stand(rnd, theme.accent)],
      gantry: [gantry(theme.accent, night)],
      rock: [0, 1].map(() => rock(rnd, themeId === 'ridge' ? { light: '#a3a9b3', dark: '#5f6670' } : { light: '#b39a86', dark: '#6e5a4e' })),
      bush: [0, 1, 2].map(() =>
        bush(rnd, night ? { light: '#2f5a43', dark: '#13261c' } : themeId === 'coast' ? { light: '#6fae4d', dark: '#2e5b25', flower: '#ff8fb1' } : { light: '#5c9a4b', dark: '#244a24' }),
      ),
    };
    if (themeId === 'coast') {
      scenery.palm = [0, 1, 2].map(() => palm(rnd));
      scenery.house = [0, 1, 2].map((v) => house(rnd, v, false));
    }
    if (themeId === 'ridge') {
      scenery.pine = [0, 1, 2].map((v) => pine(rnd, v !== 1));
      scenery.house = [0, 1].map((v) => house(rnd, v, true));
    }
    if (themeId === 'neon') {
      scenery.lamp = [lamp(true)];
      scenery.building = [0, 1, 2, 3].map((v) => building(rnd, v));
    }

    const built = { layers: LAYERS[themeId](rnd), scenery, cars: carSprites(night) };
    cache.set(themeId, built);
    return built;
  }

  /** Small sky-and-horizon card used on the track picker. */
  function thumbnail(themeId, w, h) {
    const theme = SC.THEMES[themeId];
    const { layers } = buildTheme(themeId);
    return make(w, h, (g) => {
      const horizon = h * 0.72;
      const gr = g.createLinearGradient(0, 0, 0, horizon);
      for (const [t, c] of theme.sky) gr.addColorStop(t, c);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, horizon);
      g.fillStyle = theme.ground;
      g.fillRect(0, horizon, w, h - horizon);
      const draw = (img, dh, x0) => {
        const dw = (img.width / img.height) * dh;
        g.drawImage(img, -x0 * dw, horizon - dh, dw, dh);
      };
      draw(layers.sky, horizon, 0.45);
      draw(layers.far, h * 0.42, 0.45);
      draw(layers.near, h * 0.26, 0.45);
      // a road vanishing into the scene
      g.fillStyle = theme.light.road;
      poly(g, [w * 0.47, horizon, w * 0.53, horizon, w * 0.95, h, w * 0.05, h]);
      g.fillStyle = theme.light.rumble;
      poly(g, [w * 0.47, horizon, w * 0.465, horizon, w * 0.0, h, w * 0.05, h]);
      poly(g, [w * 0.53, horizon, w * 0.535, horizon, w * 1.0, h, w * 0.95, h]);
    });
  }

  SC.art = { CAR_ASPECT, CAR_COLORS, PLAYER_COLOR, drawCar, buildTheme, thumbnail };
})();
