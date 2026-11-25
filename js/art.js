/*
 * Sundown Circuit — 2D artwork.
 * Sponsor billboard designs (used as textures on the 3D boards), the painted
 * sky-and-hills thumbnails on the circuit picker, and the car colour list
 * shared by the 3D cars and the HUD.
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

  // Real-world paint colours; the second value is a darker shade for 2D use.
  const CAR_COLORS = [
    ['#a50f17', '#5c070c'], // rosso
    ['#1b4d96', '#0c2a57'], // deep blue
    ['#e5ad00', '#8a6a00'], // giallo
    ['#0f553a', '#063020'], // racing green
    ['#b9bdc3', '#7b8086'], // silver
    ['#222327', '#0f1012'], // black
    ['#e6e6e1', '#9a9a92'], // white
    ['#d4500f', '#7a2606'], // orange
    ['#4c2b7a', '#2e1645'], // violet
  ];
  // How metallic each paint is (solid colours low, metallics high).
  const CAR_METALLIC = [0.25, 0.75, 0.2, 0.55, 0.9, 0.8, 0.1, 0.3, 0.75];
  const PLAYER_COLOR = ['#ff5a2e', '#9e2a12'];

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

  /** A billboard face (no frame) painted with one of the sponsor designs. */
  function boardCanvas(design, night, w = 512, h = 256) {
    return make(w, h, (g) => BOARDS[design](g, 0, 0, w, h, night));
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

  const layerCache = new Map();
  function layersFor(themeId) {
    if (!layerCache.has(themeId)) {
      const rnd = U.rng(themeId.length * 7919 + themeId.charCodeAt(0));
      layerCache.set(themeId, LAYERS[themeId](rnd));
    }
    return layerCache.get(themeId);
  }

  function thumbnail(themeId, w, h) {
    const theme = SC.THEMES[themeId];
    const layers = layersFor(themeId);
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

  SC.art = { CAR_COLORS, CAR_METALLIC, PLAYER_COLOR, boardCanvas, thumbnail };
})();
