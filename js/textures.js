/*
 * Sundown Circuit — procedural textures for the 3D world.
 * Everything is painted into canvases at start-up: physically based albedo,
 * normal and roughness maps for the asphalt, kerbs, ground and concrete, plus
 * signage, building facades, foliage cards, clouds and the night sky.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  /* ------------------------------------------------------------------ */
  /* Noise (pure, also used by the terrain builder)                      */
  /* ------------------------------------------------------------------ */

  const mod = (a, n) => ((a % n) + n) % n;

  function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Smooth value noise in [0, 1]. With periods it tiles seamlessly. */
  function vnoise(x, y, seed, px, py) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    let ax = x0;
    let bx = x0 + 1;
    let ay = y0;
    let by = y0 + 1;
    if (px) {
      ax = mod(ax, px);
      bx = mod(bx, px);
    }
    if (py) {
      ay = mod(ay, py);
      by = mod(by, py);
    }
    const a = hash2(ax, ay, seed);
    const b = hash2(bx, ay, seed);
    const c = hash2(ax, by, seed);
    const d = hash2(bx, by, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  function fbm(x, y, seed, octaves, px, py) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * vnoise(x * f, y * f, seed + o * 31, px ? px * f : 0, py ? py * f : 0);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  SC.noise = { hash2, vnoise, fbm };

  /* ------------------------------------------------------------------ */
  /* Texture factory (needs three.js)                                    */
  /* ------------------------------------------------------------------ */

  (SC.threeInit = SC.threeInit || []).push(function (THREE) {
    const FONT = '"Saira Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';

    function canvas(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }

    /** Fill a canvas per pixel. fn(x, y, out) writes RGBA 0..255 into out. */
    function pixels(w, h, fn) {
      const c = canvas(w, h);
      const g = c.getContext('2d');
      const img = g.createImageData(w, h);
      const d = img.data;
      const out = [0, 0, 0, 255];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          out[3] = 255;
          fn(x, y, out);
          const i = (y * w + x) * 4;
          d[i] = out[0];
          d[i + 1] = out[1];
          d[i + 2] = out[2];
          d[i + 3] = out[3];
        }
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    /** Tangent-space normal map from a tiling height field. */
    function normalMap(hf, w, h, strength) {
      return pixels(w, h, (x, y, o) => {
        const l = hf[y * w + mod(x - 1, w)];
        const r = hf[y * w + mod(x + 1, w)];
        const u = hf[mod(y - 1, h) * w + x];
        const d = hf[mod(y + 1, h) * w + x];
        const nx = (l - r) * strength;
        const ny = (d - u) * strength;
        const L = Math.hypot(nx, ny, 1);
        o[0] = (nx / L * 0.5 + 0.5) * 255;
        o[1] = (ny / L * 0.5 + 0.5) * 255;
        o[2] = (1 / L * 0.5 + 0.5) * 255;
      });
    }

    function grey(w, h, values) {
      return pixels(w, h, (x, y, o) => {
        const v = Math.max(0, Math.min(255, values[y * w + x] * 255));
        o[0] = o[1] = o[2] = v;
      });
    }

    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const to255 = (v) => clamp01(v) * 255;

    function create(renderer) {
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const wrap = (c, { srgb = true, repeat = true } = {}) => {
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        return t;
      };
      const cache = new Map();
      const once = (key, fn) => {
        if (!cache.has(key)) cache.set(key, fn());
        return cache.get(key);
      };

      /* Asphalt with lane markings: 10.5 m across × 12 m along ---------- */
      function asphalt() {
        return once('asphalt', () => {
          const W = 512;
          const H = 1024;
          const alb = new Float32Array(W * H);
          const hgt = new Float32Array(W * H);
          const rough = new Float32Array(W * H);
          const wheel = [];
          for (const c of [1 / 6, 1 / 2, 5 / 6]) wheel.push(c - 0.076, c + 0.076);
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const u = x / W;
              const v = y / H;
              const grain = fbm(u * 170, v * 194, 11, 4, 170, 194);
              const coarse = fbm(u * 9, v * 10, 23, 3, 9, 10);
              const speck = hash2(x, y, 5) > 0.982 ? 1 : 0;
              let base = 0.29 + (grain - 0.5) * 0.13 + (coarse - 0.5) * 0.07 + speck * 0.12;
              let wear = 0;
              for (const c of wheel) {
                const d = (u - c) * 10.5;
                wear += Math.exp(-(d * d) / 0.07);
              }
              base -= wear * 0.035;
              // markings
              let paint = 0;
              if ((u > 0.014 && u < 0.028) || (u > 0.972 && u < 0.986)) paint = 1;
              if ((Math.abs(u - 1 / 3) < 0.0072 || Math.abs(u - 2 / 3) < 0.0072) && v < 0.25) paint = 1;
              if (paint) paint *= clamp01(0.55 + fbm(u * 60, v * 40, 7, 3, 60, 40) * 0.9 - wear * 0.25);
              const value = base * (1 - paint) + 0.8 * paint * (0.85 + grain * 0.15);
              const i = y * W + x;
              alb[i] = value;
              hgt[i] = grain * 0.7 + speck * 0.5 + paint * 0.25;
              rough[i] = 0.9 - wear * 0.12 - paint * 0.3 + (grain - 0.5) * 0.1;
            }
          }
          const map = pixels(W, H, (x, y, o) => {
            const v = alb[y * W + x];
            o[0] = to255(v * 0.98);
            o[1] = to255(v);
            o[2] = to255(v * 1.03);
          });
          return {
            map: wrap(map),
            normalMap: wrap(normalMap(hgt, W, H, 3.2), { srgb: false }),
            roughnessMap: wrap(grey(W, H, rough), { srgb: false }),
          };
        });
      }

      /* Red and white kerb: 0.9 m across × 2 m along -------------------- */
      function kerb() {
        return once('kerb', () => {
          const W = 64;
          const H = 256;
          const hgt = new Float32Array(W * H);
          const map = pixels(W, H, (x, y, o) => {
            const u = x / W;
            const v = y / H;
            const n = fbm(u * 8, v * 30, 3, 3, 8, 30);
            const red = v < 0.5;
            const dirt = 0.85 + n * 0.15;
            if (red) {
              o[0] = to255(0.78 * dirt);
              o[1] = to255(0.13 * dirt);
              o[2] = to255(0.12 * dirt);
            } else {
              o[0] = o[1] = o[2] = to255(0.88 * dirt);
            }
            hgt[y * W + x] = Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) + n * 0.15;
          });
          return { map: wrap(map), normalMap: wrap(normalMap(hgt, W, H, 2), { srgb: false }) };
        });
      }

      /* Neutral ground detail: 6 m tile, coloured by vertex colours ---- */
      function ground() {
        return once('ground', () => {
          const S = 512;
          const hgt = new Float32Array(S * S);
          const map = pixels(S, S, (x, y, o) => {
            const u = x / S;
            const v = y / S;
            const fine = fbm(u * 96, v * 96, 41, 4, 96, 96);
            const clump = fbm(u * 12, v * 12, 43, 3, 12, 12);
            const blade = hash2(x, y, 9);
            const val = 0.7 + (fine - 0.5) * 0.35 + (clump - 0.5) * 0.25 + (blade - 0.5) * 0.12;
            hgt[y * S + x] = fine + blade * 0.3;
            o[0] = to255(val * 0.96);
            o[1] = to255(val);
            o[2] = to255(val * 0.9);
          });
          return { map: wrap(map), normalMap: wrap(normalMap(hgt, S, S, 2.2), { srgb: false }) };
        });
      }

      /* Concrete paving slabs: 3 m tile -------------------------------- */
      function concrete() {
        return once('concrete', () => {
          const S = 512;
          const hgt = new Float32Array(S * S);
          const map = pixels(S, S, (x, y, o) => {
            const u = x / S;
            const v = y / S;
            const n = fbm(u * 40, v * 40, 51, 4, 40, 40);
            const stain = fbm(u * 5, v * 5, 53, 3, 5, 5);
            const jx = Math.min(x % 256, 256 - (x % 256));
            const jy = Math.min(y % 256, 256 - (y % 256));
            const joint = Math.min(jx, jy) < 2 ? 1 : 0;
            const val = (0.52 + (n - 0.5) * 0.16 - (stain - 0.5) * 0.12) * (joint ? 0.55 : 1);
            hgt[y * S + x] = n * 0.4 - joint;
            o[0] = to255(val * 0.97);
            o[1] = to255(val * 0.97);
            o[2] = to255(val);
          });
          return { map: wrap(map), normalMap: wrap(normalMap(hgt, S, S, 2), { srgb: false }) };
        });
      }

      function bark() {
        return once('bark', () => {
          const W = 128;
          const H = 256;
          return wrap(
            pixels(W, H, (x, y, o) => {
              const n = fbm(x / 16, y / 16, 61, 3, 8, 16);
              const ring = Math.pow(Math.abs(Math.sin((y / H) * Math.PI * 14)), 6);
              const v = 0.42 + (n - 0.5) * 0.2 - ring * 0.14;
              o[0] = to255(v * 1.05);
              o[1] = to255(v * 0.86);
              o[2] = to255(v * 0.66);
            }),
          );
        });
      }

      /* Palm frond card with alpha ------------------------------------- */
      function frond() {
        return once('frond', () => {
          const W = 256;
          const H = 512;
          const c = canvas(W, H);
          const g = c.getContext('2d');
          const rnd = SC.util.rng(77);
          g.lineCap = 'round';
          const steps = 46;
          for (let i = 2; i < steps; i++) {
            const t = i / steps;
            const y = H - t * H;
            const len = W * 0.47 * Math.sin(Math.PI * Math.min(1, t * 1.08)) * (1 - t * 0.25);
            for (const side of [-1, 1]) {
              const tone = 0.75 + rnd() * 0.25;
              g.strokeStyle = `rgb(${Math.round(70 * tone)},${Math.round(128 * tone)},${Math.round(52 * tone)})`;
              g.lineWidth = 5 + (1 - t) * 3;
              g.beginPath();
              g.moveTo(W / 2, y);
              g.quadraticCurveTo(W / 2 + side * len * 0.5, y - 8, W / 2 + side * len, y - 30 - len * 0.25);
              g.stroke();
            }
          }
          g.strokeStyle = '#5a6a32';
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(W / 2, H);
          g.lineTo(W / 2, 6);
          g.stroke();
          const t = wrap(c, { repeat: false });
          return t;
        });
      }

      /* City facades: map + emissive windows, 4 bays × 8 floors -------- */
      function facade(variant) {
        return once('facade' + variant, () => {
          const W = 256;
          const H = 512;
          const rnd = SC.util.rng(900 + variant);
          const frames = ['#24212d', '#2b2630', '#1d2230', '#302a28'];
          const glass = ['#131a26', '#182030', '#151722', '#1a1a1e'];
          const lit = ['#ffd38a', '#ffe7c2', '#bfe8ff', '#ffc070', '#fff2d8'];
          const a = canvas(W, H);
          const e = canvas(W, H);
          const ga = a.getContext('2d');
          const ge = e.getContext('2d');
          ga.fillStyle = frames[variant % 4];
          ga.fillRect(0, 0, W, H);
          ge.fillStyle = '#000';
          ge.fillRect(0, 0, W, H);
          const cw = W / 4;
          const ch = H / 8;
          for (let r = 0; r < 8; r++) {
            for (let col = 0; col < 4; col++) {
              const x = col * cw + 6;
              const y = r * ch + 10;
              const w = cw - 12;
              const h = ch - 20;
              const grd = ga.createLinearGradient(x, y, x + w, y + h);
              grd.addColorStop(0, glass[variant % 4]);
              grd.addColorStop(1, '#0a0c12');
              ga.fillStyle = grd;
              ga.fillRect(x, y, w, h);
              if (rnd() < 0.38) {
                const colr = lit[Math.floor(rnd() * lit.length)];
                const k = 0.55 + rnd() * 0.45;
                ga.fillStyle = colr;
                ga.globalAlpha = 0.5;
                ga.fillRect(x, y, w, h);
                ga.globalAlpha = 1;
                ge.fillStyle = colr;
                ge.globalAlpha = k;
                ge.fillRect(x, y, w, h);
                // blinds
                ge.globalAlpha = 0.35;
                ge.fillStyle = '#000';
                for (let b = y; b < y + h; b += 6) ge.fillRect(x, b, w, 2);
                ge.globalAlpha = 1;
              }
            }
            ga.fillStyle = 'rgba(255,255,255,0.05)';
            ga.fillRect(0, r * ch, W, 3);
          }
          return { map: wrap(a), emissiveMap: wrap(e) };
        });
      }

      function neonSign(text, color) {
        return once('sign:' + text, () => {
          const c = canvas(512, 160);
          const g = c.getContext('2d');
          g.fillStyle = '#000';
          g.fillRect(0, 0, 512, 160);
          g.font = `italic 800 112px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.shadowColor = color;
          g.shadowBlur = 24;
          g.fillStyle = color;
          g.fillText(text, 256, 84);
          g.shadowBlur = 0;
          g.fillStyle = '#ffffff';
          g.globalAlpha = 0.55;
          g.fillText(text, 256, 84);
          return wrap(c, { repeat: false });
        });
      }

      function billboard(design, night) {
        return once(`board:${design}:${night}`, () => wrap(SC.art.boardCanvas(design, night, 512, 256), { repeat: false }));
      }

      function chevron(dir, night) {
        return once(`chevron:${dir}:${night}`, () => {
          const c = canvas(256, 192);
          const g = c.getContext('2d');
          g.fillStyle = night ? '#0d0b14' : '#f4f2ec';
          g.fillRect(0, 0, 256, 192);
          g.fillStyle = night ? '#46e0ff' : '#c81e1e';
          if (night) {
            g.shadowColor = '#46e0ff';
            g.shadowBlur = 14;
          }
          for (const off of [-50, 40]) {
            const ax = 128 + (off + 6) * dir;
            const s = 60;
            g.beginPath();
            g.moveTo(ax - s * 0.5 * dir, 96 - s);
            g.lineTo(ax + s * 0.5 * dir, 96);
            g.lineTo(ax - s * 0.5 * dir, 96 + s);
            g.lineTo(ax - s * 0.95 * dir, 96 + s);
            g.lineTo(ax + s * 0.05 * dir, 96);
            g.lineTo(ax - s * 0.95 * dir, 96 - s);
            g.closePath();
            g.fill();
          }
          return wrap(c, { repeat: false });
        });
      }

      function banner(accent, night, text = 'START · FINISH') {
        return once(`banner:${accent}:${night}:${text}`, () => {
          const c = canvas(1024, 128);
          const g = c.getContext('2d');
          g.fillStyle = night ? '#120a24' : accent;
          g.fillRect(0, 0, 1024, 128);
          for (let i = 0; i < 1024 / 16; i++) {
            g.fillStyle = i % 2 ? '#111' : '#f4f1ea';
            g.fillRect(i * 16, 0, 16, 16);
            g.fillStyle = i % 2 ? '#f4f1ea' : '#111';
            g.fillRect(i * 16, 112, 16, 16);
          }
          g.font = `italic 800 74px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          if (night) {
            g.shadowColor = accent;
            g.shadowBlur = 18;
          }
          g.fillStyle = night ? accent : '#ffffff';
          g.fillText(text, 512, 66);
          return wrap(c, { repeat: false });
        });
      }

      function crowd() {
        return once('crowd', () => {
          const c = canvas(512, 256);
          const g = c.getContext('2d');
          const rnd = SC.util.rng(5);
          const shirts = ['#ff7a3d', '#ffd23f', '#2a9df4', '#f4f1ea', '#e63946', '#2ec4b6', '#9b4dca', '#1b1b22', '#7bd14b'];
          const skin = ['#f1c7a3', '#c68c5c', '#8d5a3b', '#e9b48a'];
          for (let r = 0; r < 8; r++) {
            g.fillStyle = r % 2 ? '#3c3c46' : '#34343d';
            g.fillRect(0, r * 32, 512, 32);
            for (let x = 4; x < 512; x += 11) {
              if (rnd() < 0.82) {
                g.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
                g.fillRect(x - 4, r * 32 + 15, 9, 15);
                g.fillStyle = skin[Math.floor(rnd() * skin.length)];
                g.beginPath();
                g.arc(x + (rnd() - 0.5) * 2, r * 32 + 10, 4, 0, Math.PI * 2);
                g.fill();
              }
            }
          }
          return wrap(c);
        });
      }

      function planks(color, logs) {
        return once('planks:' + color + logs, () => {
          const c = canvas(256, 256);
          const g = c.getContext('2d');
          g.fillStyle = color;
          g.fillRect(0, 0, 256, 256);
          const rnd = SC.util.rng(color.length * 13);
          if (logs) {
            for (let y = 0; y < 256; y += 32) {
              const gr = g.createLinearGradient(0, y, 0, y + 32);
              gr.addColorStop(0, 'rgba(255,255,255,0.12)');
              gr.addColorStop(0.5, 'rgba(0,0,0,0)');
              gr.addColorStop(1, 'rgba(0,0,0,0.35)');
              g.fillStyle = gr;
              g.fillRect(0, y, 256, 32);
            }
          } else {
            for (let x = 0; x < 256; x += 21) {
              g.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.1})`;
              g.fillRect(x, 0, 2, 256);
              g.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`;
              g.fillRect(x + 2, 0, 19, 256);
            }
          }
          // window and door
          g.fillStyle = '#2a1d16';
          g.fillRect(104, 120, 48, 136);
          g.fillStyle = '#ffe3a6';
          g.fillRect(22, 110, 54, 50);
          g.fillRect(180, 110, 54, 50);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(47, 110, 4, 50);
          g.fillRect(205, 110, 4, 50);
          return wrap(c, { repeat: false });
        });
      }

      function rim() {
        return once('rim', () => {
          const S = 128;
          const c = canvas(S, S);
          const g = c.getContext('2d');
          const cx = S / 2;
          g.fillStyle = '#d9dde3';
          g.beginPath();
          g.arc(cx, cx, S * 0.48, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#16181c';
          g.beginPath();
          g.arc(cx, cx, S * 0.41, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#cfd3da';
          g.lineCap = 'round';
          g.lineWidth = 11;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * 10, cx + Math.sin(a) * 10);
            g.lineTo(cx + Math.cos(a) * S * 0.42, cx + Math.sin(a) * S * 0.42);
            g.stroke();
          }
          g.fillStyle = '#e8ebef';
          g.beginPath();
          g.arc(cx, cx, 13, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#3a3d44';
          g.beginPath();
          g.arc(cx, cx, 5, 0, Math.PI * 2);
          g.fill();
          return wrap(c, { repeat: false });
        });
      }

      function plate() {
        return once('plate', () => {
          const c = canvas(256, 64);
          const g = c.getContext('2d');
          g.fillStyle = '#f2efe6';
          g.fillRect(0, 0, 256, 64);
          g.strokeStyle = '#222';
          g.lineWidth = 4;
          g.strokeRect(3, 3, 250, 58);
          g.fillStyle = '#1d1f26';
          g.font = `700 44px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('SDN 262', 128, 34);
          return wrap(c, { repeat: false });
        });
      }

      function radial(key, stops, size = 128) {
        return once(key, () => {
          const c = canvas(size, size);
          const g = c.getContext('2d');
          const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
          for (const [t, col] of stops) gr.addColorStop(t, col);
          g.fillStyle = gr;
          g.fillRect(0, 0, size, size);
          return wrap(c, { repeat: false });
        });
      }

      const blob = () => radial('blob', [[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
      const puff = () => radial('puff', [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']], 64);
      const glow = () => radial('glow', [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,240,210,0.6)'], [1, 'rgba(255,220,160,0)']], 64);

      function waterNormal() {
        return once('water', () => {
          const S = 256;
          const hgt = new Float32Array(S * S);
          for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) hgt[y * S + x] = fbm(x / 16, y / 16, 71, 4, 16, 16) + 0.5 * fbm(x / 6, y / 48, 73, 2, 43, 6);
          }
          return wrap(normalMap(hgt, S, S, 3), { srgb: false });
        });
      }

      function clouds(warm) {
        return once('clouds' + warm, () => {
          const S = 1024;
          return wrap(
            pixels(S, S, (x, y, o) => {
              const u = x / S;
              const v = y / S;
              const n = fbm(u * 6, v * 6, 81, 6);
              const r = Math.hypot(u - 0.5, v - 0.5) * 2;
              const a = clamp01((n - 0.5) * 3.2) * clamp01(1 - r * r);
              const shade = 0.82 + (n - 0.5) * 0.5;
              o[0] = to255(warm ? shade : shade * 0.97);
              o[1] = to255(warm ? shade * 0.92 : shade * 0.98);
              o[2] = to255(warm ? shade * 0.9 : shade);
              o[3] = to255(a);
            }),
            { repeat: false },
          );
        });
      }

      function stars() {
        return once('stars', () => {
          const W = 2048;
          const H = 1024;
          const c = canvas(W, H);
          const g = c.getContext('2d');
          g.fillStyle = '#000';
          g.fillRect(0, 0, W, H);
          const rnd = SC.util.rng(404);
          // faint galactic band
          for (let i = 0; i < 2600; i++) {
            const x = rnd() * W;
            const y = H * 0.3 + Math.sin((x / W) * Math.PI * 2) * H * 0.12 + (rnd() - 0.5) * H * 0.12;
            g.fillStyle = `rgba(190,170,255,${0.03 + rnd() * 0.05})`;
            g.fillRect(x, y, 2, 2);
          }
          for (let i = 0; i < 3200; i++) {
            const y = Math.pow(rnd(), 1.4) * H * 0.5;
            const b = Math.pow(rnd(), 3);
            g.fillStyle = `rgba(255,${235 + Math.round(rnd() * 20)},${215 + Math.round(rnd() * 40)},${0.25 + b * 0.75})`;
            const s = b > 0.8 ? 2.2 : 1.2;
            g.fillRect(rnd() * W, y, s, s);
          }
          const t = wrap(c, { repeat: false });
          return t;
        });
      }

      function moon() {
        return once('moon', () => {
          const S = 256;
          const c = canvas(S, S);
          const g = c.getContext('2d');
          const gr = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
          gr.addColorStop(0, 'rgba(230,220,255,0.35)');
          gr.addColorStop(1, 'rgba(230,220,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, S, S);
          g.fillStyle = '#f6f1e4';
          g.beginPath();
          g.arc(S / 2, S / 2, S * 0.18, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(160,150,140,0.35)';
          for (const [x, y, r] of [[0.46, 0.45, 0.04], [0.55, 0.53, 0.05], [0.5, 0.58, 0.025]]) {
            g.beginPath();
            g.arc(S * x, S * y, S * r, 0, Math.PI * 2);
            g.fill();
          }
          return wrap(c, { repeat: false });
        });
      }

      function startLine() {
        return once('startline', () => {
          const c = canvas(512, 64);
          const g = c.getContext('2d');
          for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 2; j++) {
              g.fillStyle = (i + j) % 2 ? '#141416' : '#f0eee8';
              g.fillRect(i * 32, j * 32, 32, 32);
            }
          }
          return wrap(c, { repeat: false });
        });
      }

      function gridBox() {
        return once('gridbox', () => {
          const c = canvas(128, 256);
          const g = c.getContext('2d');
          g.fillStyle = '#f0eee8';
          g.fillRect(8, 0, 112, 10);
          g.fillRect(8, 0, 10, 70);
          g.fillRect(110, 0, 10, 70);
          return wrap(c, { repeat: false });
        });
      }

      return {
        asphalt, kerb, ground, concrete, bark, frond, facade, neonSign, billboard, chevron, banner,
        crowd, planks, rim, plate, blob, puff, glow, waterNormal, clouds, stars, moon, startLine, gridBox,
      };
    }

    SC.textures = { create };
  });
})();
