/*
 * Sundown Circuit — heads-up display.
 * Drawn on a transparent 2D canvas layered over the 3D view: position and lap,
 * race timer, leaderboard, minimap, speedometer with rev counter and nitro,
 * start lights and messages.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});
  const U = SC.util;
  const C = SC.CONFIG;
  const FONT = '"Saira Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
  const TAU = Math.PI * 2;

  const HUD = {
    panel: 'rgba(14, 9, 28, 0.62)',
    panelLine: 'rgba(255, 236, 214, 0.10)',
    text: '#fbeee0',
    muted: 'rgba(251, 238, 224, 0.62)',
    accent: '#ff7a3d',
    flare: '#ffc65a',
    rose: '#ff3d7f',
    cyan: '#46e0ff',
    red: '#ff4d4d',
    green: '#3ee08f',
  };

  class Hud {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 1;
      this.h = 1;
      this.dpr = 1;
      this.hud = 1;
      this.mapCache = null;
    }

    resize(cssW, cssH, dpr) {
      this.dpr = dpr;
      this.cssW = cssW;
      this.cssH = cssH;
      this.w = Math.max(1, Math.round(cssW * dpr));
      this.h = Math.max(1, Math.round(cssH * dpr));
      this.canvas.width = this.w;
      this.canvas.height = this.h;
      this.hud = U.clamp(Math.min(cssW / 1280, cssH / 720), 0.62, 1.35) * dpr;
      this.mapCache = null;
    }

    render(race, ui) {
      this.ctx.clearRect(0, 0, this.w, this.h);
      if (ui.hud) this.drawHud(race, ui);
    }

    font(size, weight = 700, italic = false) {
      return `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px ${FONT}`;
    }

    text(str, x, y, size, opts = {}) {
      const ctx = this.ctx;
      ctx.font = this.font(size, opts.weight || 700, opts.italic);
      ctx.fillStyle = opts.color || HUD.text;
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = opts.baseline || 'alphabetic';
      ctx.fillText(str, x, y);
      return ctx.measureText(str).width;
    }

    /** Fixed-advance digits so ticking timers do not jitter. */
    digits(str, x, y, size, opts = {}) {
      const ctx = this.ctx;
      ctx.font = this.font(size, opts.weight || 700, opts.italic);
      ctx.fillStyle = opts.color || HUD.text;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      const adv = (ch) => (ch === ':' || ch === '.' ? size * 0.26 : ch === '+' || ch === '-' ? size * 0.42 : size * 0.52);
      let total = 0;
      for (const ch of str) total += adv(ch);
      let cx = opts.align === 'center' ? x - total / 2 : opts.align === 'right' ? x - total : x;
      for (const ch of str) {
        const a = adv(ch);
        ctx.fillText(ch, cx + a / 2, y);
        cx += a;
      }
      return total;
    }

    panel(x, y, w, h, r) {
      const ctx = this.ctx;
      ctx.fillStyle = HUD.panel;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.strokeStyle = HUD.panelLine;
      ctx.lineWidth = Math.max(1, this.dpr);
      ctx.stroke();
    }

    label(str, x, y, s, color = HUD.muted, align = 'left') {
      const ctx = this.ctx;
      ctx.font = this.font(12 * s, 600);
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(1.5 * s)}px`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(str, x, y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    drawHud(race, ui) {
      const s = this.hud;
      const W = this.w;
      const H = this.h;
      const m = 18 * s;
      const p = race.player;
      const compact = this.cssW < 760 || ui.touch;
      const total = race.entities.length;

      // Position and lap
      const pw = 236 * s;
      const ph = 74 * s;
      this.panel(m, m, pw, ph, 10 * s);
      this.label('POS', m + 16 * s, m + 22 * s, s);
      let w = this.text(String(p.position), m + 16 * s, m + 63 * s, 46 * s, { weight: 800, italic: true, color: p.position === 1 ? HUD.flare : HUD.text });
      this.text('/' + total, m + 20 * s + w, m + 63 * s, 20 * s, { color: HUD.muted });
      const lx = m + 124 * s;
      this.ctx.fillStyle = HUD.panelLine;
      this.ctx.fillRect(lx - 12 * s, m + 14 * s, Math.max(1, this.dpr), ph - 28 * s);
      this.label('LAP', lx, m + 22 * s, s);
      const lap = U.clamp(p.lapsDone + 1, 1, race.laps);
      w = this.text(String(lap), lx, m + 63 * s, 46 * s, { weight: 800, italic: true, color: lap === race.laps && race.laps > 1 ? HUD.accent : HUD.text });
      this.text('/' + race.laps, lx + 4 * s + w, m + 63 * s, 20 * s, { color: HUD.muted });

      // Timer: centred on wide screens, stacked under the position panel on narrow ones
      const narrow = this.cssW < 600;
      const tw = 270 * s;
      const tx = narrow ? m : W / 2 - tw / 2;
      const ty = narrow ? m + ph + 8 * s : m;
      this.panel(tx, ty, tw, ph, 10 * s);
      const t = race.state === 'countdown' ? 0 : p.finished ? p.finishTime : race.time;
      this.digits(U.formatTime(t), tx + tw / 2, ty + 44 * s, 34 * s, { align: 'center', weight: 700 });
      const last = p.lastLap != null ? U.formatTime(p.lastLap) : '-:--.---';
      const best = isFinite(p.bestLap) ? U.formatTime(p.bestLap) : '-:--.---';
      this.label('LAST', tx + 18 * s, ty + 64 * s, s);
      this.digits(last, tx + 58 * s, ty + 64 * s, 14 * s, { weight: 600, color: HUD.text });
      this.label('BEST', tx + 146 * s, ty + 64 * s, s);
      this.digits(best, tx + 186 * s, ty + 64 * s, 14 * s, { weight: 600, color: isFinite(p.bestLap) ? HUD.flare : HUD.text });

      if (!compact) {
        this.drawTower(race, W - m - 214 * s, m, s);
        this.drawMinimap(race, m, H - m - 150 * s, 170 * s, 150 * s, s);
        this.drawSpeedo(race, ui, W - m - 96 * s, H - m - 82 * s, 84 * s, s);
      } else {
        this.drawSpeedo(race, ui, W - m - 70 * s, m + ph + 84 * s, 64 * s, s);
      }

      this.drawCountdown(race, s);
      this.drawToasts(ui.toasts || [], s, narrow ? ty + ph : m + ph);
    }

    drawTower(race, x, y, s) {
      const order = race.order;
      const p = race.player;
      const idx = order.indexOf(p);
      let rows;
      if (idx <= 4) rows = order.slice(0, 5);
      else rows = [order[0], null, order[idx - 2], order[idx - 1], p, order[idx + 1]].filter((r) => r !== undefined);
      const rh = 24 * s;
      const w = 214 * s;
      this.panel(x, y, w, rh * rows.length + 12 * s, 10 * s);
      const ctx = this.ctx;
      rows.forEach((e, i) => {
        const ry = y + 6 * s + i * rh;
        if (!e) {
          this.text('···', x + w / 2, ry + rh * 0.72, 14 * s, { align: 'center', color: HUD.muted });
          return;
        }
        if (e === p) {
          ctx.fillStyle = 'rgba(255,122,61,0.22)';
          ctx.fillRect(x + 4 * s, ry + 1 * s, w - 8 * s, rh - 2 * s);
        }
        ctx.fillStyle = e === p ? HUD.accent : 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + 10 * s, ry + 4 * s, 24 * s, rh - 8 * s);
        this.text(String(e.position), x + 22 * s, ry + rh * 0.7, 14 * s, { align: 'center', weight: 800, color: e === p ? '#1a0f22' : HUD.text });
        ctx.fillStyle = e.isPlayer ? SC.art.PLAYER_COLOR[0] : SC.art.CAR_COLORS[e.color % SC.art.CAR_COLORS.length][0];
        ctx.fillRect(x + 40 * s, ry + 6 * s, 3 * s, rh - 12 * s);
        this.text(e.isPlayer ? 'YOU' : e.name.toUpperCase(), x + 50 * s, ry + rh * 0.7, 14 * s, { weight: e === p ? 800 : 600 });
        let gap;
        if (e.position === 1) gap = e.finished ? 'FINISH' : 'LEADER';
        else gap = U.formatGap(race.gapToLeader(e));
        this.digits(gap, x + w - 12 * s, ry + rh * 0.7, 13 * s, { align: 'right', weight: 600, color: HUD.muted });
      });
    }

    drawMinimap(race, x, y, w, h, s) {
      const ctx = this.ctx;
      const track = race.track;
      const map = track.map;
      const pad = 16 * s;
      const scale = Math.min((w - pad * 2) / map.width, (h - pad * 2) / map.height);
      const ox = x + (w - map.width * scale) / 2;
      const oy = y + (h - map.height * scale) / 2;
      const key = track.id + ':' + w + ':' + h;
      if (!this.mapCache || this.mapCache.key !== key) {
        const path = new Path2D();
        const pts = map.points;
        const n = pts.length / 2;
        for (let i = 0; i <= n; i++) {
          const k = (i % n) * 2;
          const px = ox + pts[k] * scale;
          const py = oy + pts[k + 1] * scale;
          if (i === 0) path.moveTo(px, py);
          else path.lineTo(px, py);
        }
        this.mapCache = { key, path };
      }
      this.panel(x, y, w, h, 10 * s);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 7 * s;
      ctx.stroke(this.mapCache.path);
      ctx.strokeStyle = 'rgba(255,240,225,0.85)';
      ctx.lineWidth = 3 * s;
      ctx.stroke(this.mapCache.path);

      const at = (z) => {
        const n = map.points.length / 2;
        const i = Math.floor(U.wrap(z, track.length) / C.segmentLength) % n;
        return [ox + map.points[i * 2] * scale, oy + map.points[i * 2 + 1] * scale];
      };
      const [sx, sy] = at(track.startZ);
      ctx.fillStyle = HUD.flare;
      ctx.fillRect(sx - 4 * s, sy - 4 * s, 8 * s, 8 * s);
      for (const car of race.cars) {
        const [cx, cy] = at(car.z);
        ctx.fillStyle = SC.art.CAR_COLORS[car.color % SC.art.CAR_COLORS.length][0];
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2 * s, 0, TAU);
        ctx.fill();
      }
      const [px, py] = at(race.player.z);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = HUD.accent;
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.arc(px, py, 5 * s, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    drawSpeedo(race, ui, cx, cy, R, s) {
      const ctx = this.ctx;
      const p = race.player;
      const mph = ui.units === 'mph';
      const kmh = (p.speed / C.maxSpeed) * C.topSpeedKmh;
      const shown = mph ? kmh * 0.621371 : kmh;
      const maxDial = mph ? 220 : 360;
      const a0 = Math.PI * 0.75;
      const a1 = Math.PI * 2.25;
      const ang = (v) => a0 + (U.clamp(v, 0, maxDial) / maxDial) * (a1 - a0);

      ctx.fillStyle = HUD.panel;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = HUD.panelLine;
      ctx.lineWidth = Math.max(1, this.dpr);
      ctx.stroke();

      // RPM ring
      const rr = R * 0.9;
      ctx.lineCap = 'butt';
      ctx.lineWidth = 6 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,77,77,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, a0 + (a1 - a0) * 0.88, a1);
      ctx.stroke();
      const rpm = U.clamp(p.rpm, 0, 1);
      ctx.strokeStyle = rpm > 0.88 ? HUD.red : HUD.flare;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, a0, a0 + (a1 - a0) * rpm);
      ctx.stroke();

      // Ticks and numerals
      const major = mph ? 40 : 60;
      const minor = mph ? 20 : 20;
      ctx.strokeStyle = 'rgba(255,240,225,0.7)';
      for (let v = 0; v <= maxDial; v += minor) {
        const a = ang(v);
        const big = v % major === 0;
        const r0 = R * (big ? 0.66 : 0.71);
        const r1 = R * 0.78;
        ctx.lineWidth = (big ? 2.2 : 1.2) * s;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
        if (big && R > 70 * s) {
          this.text(String(v), cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52 + 4 * s, 11 * s, { align: 'center', weight: 600, color: HUD.muted });
        }
      }

      // Needle
      const na = ang(shown);
      ctx.strokeStyle = HUD.accent;
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(na) * R * 0.12, cy - Math.sin(na) * R * 0.12);
      ctx.lineTo(cx + Math.cos(na) * R * 0.8, cy + Math.sin(na) * R * 0.8);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#1a1024';
      ctx.beginPath();
      ctx.arc(cx, cy, 13 * s, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = HUD.accent;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      this.text(race.state === 'countdown' ? 'N' : String(p.gear), cx, cy + 5 * s, 15 * s, { align: 'center', weight: 800 });

      this.digits(String(Math.round(shown)), cx, cy + R * 0.62, 28 * s, { align: 'center', weight: 800, italic: true });
      this.label(mph ? 'MPH' : 'KM/H', cx, cy + R * 0.84, s, HUD.muted, 'center');

      // Nitro gauge
      const bx = cx - R - 22 * s;
      const by = cy - R * 0.85;
      const bh = R * 1.7;
      const bw = 10 * s;
      ctx.fillStyle = HUD.panel;
      ctx.fillRect(bx - 3 * s, by - 3 * s, bw + 6 * s, bh + 6 * s);
      const fill = bh * p.nitro;
      const g = ctx.createLinearGradient(0, by + bh, 0, by);
      g.addColorStop(0, HUD.cyan);
      g.addColorStop(1, HUD.rose);
      ctx.fillStyle = g;
      if (p.nitroActive) {
        ctx.shadowColor = HUD.cyan;
        ctx.shadowBlur = 14 * s;
      }
      ctx.fillRect(bx, by + bh - fill, bw, fill);
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.translate(bx - 6 * s, by + bh / 2);
      ctx.rotate(-Math.PI / 2);
      this.label('NITRO', 0, 0, s * 0.9, p.nitro >= C.nitroMinStart ? HUD.cyan : HUD.muted, 'center');
      ctx.restore();
    }

    drawCountdown(race, s) {
      const W = this.w;
      const H = this.h;
      const ctx = this.ctx;
      const go = race.state === 'racing' && race.time < 1.2 && !race.demo;
      if (race.state !== 'countdown' && !go) return;
      const lit = race.state === 'countdown' ? U.clamp(4 - Math.ceil(race.countdown), 1, 3) : 3;
      const alpha = go ? U.clamp(1.2 - race.time, 0, 1) / 1 : 1;
      ctx.globalAlpha = alpha;
      const r = 20 * s;
      const gap = 56 * s;
      const cy = H * 0.3;
      this.panel(W / 2 - gap * 1.5 - 4 * s, cy - r - 12 * s, gap * 3 + 8 * s, r * 2 + 24 * s, 12 * s);
      for (let i = 0; i < 3; i++) {
        const cx = W / 2 + (i - 1) * gap;
        const on = go || i < lit;
        ctx.fillStyle = on ? (go ? HUD.green : HUD.red) : '#2a2030';
        if (on) {
          ctx.shadowColor = go ? HUD.green : HUD.red;
          ctx.shadowBlur = 24 * s;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      const label = go ? 'GO!' : String(Math.max(1, Math.ceil(race.countdown)));
      const pop = go ? 1 + (1.2 - race.time) * 0.15 : 1 + (race.countdown % 1) * 0.25;
      ctx.save();
      ctx.translate(W / 2, cy + r + 96 * s);
      ctx.scale(pop, pop);
      ctx.font = this.font(110 * s, 800, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 10 * s;
      ctx.strokeStyle = 'rgba(20,12,38,0.85)';
      ctx.strokeText(label, 0, 0);
      this.text(label, 0, 0, 110 * s, { align: 'center', weight: 800, italic: true, color: go ? HUD.green : HUD.text });
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    drawToasts(toasts, s, topY) {
      const ctx = this.ctx;
      const W = this.w;
      const H = this.h;
      for (const t of toasts) {
        const k = t.age / t.dur;
        if (k >= 1) continue;
        const fade = Math.min(1, t.age / 0.15, (t.dur - t.age) / 0.35);
        ctx.globalAlpha = U.clamp(fade, 0, 1);
        if (t.kind === 'small') {
          const y = topY + 30 * s;
          this.text(t.text, 18 * s + 16 * s, y, 20 * s, { weight: 800, italic: true, color: t.color || HUD.green });
        } else {
          const pop = 1 + Math.max(0, 0.15 - t.age) * 1.2;
          ctx.save();
          ctx.translate(W / 2, H * 0.27);
          ctx.scale(pop, pop);
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 16 * s;
          this.text(t.text, 0, 0, 64 * s, { align: 'center', weight: 800, italic: true, color: t.color || HUD.text });
          if (t.sub) this.text(t.sub, 0, 34 * s, 22 * s, { align: 'center', weight: 600, color: HUD.text });
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  SC.Hud = Hud;
  SC.HUD_COLORS = HUD;
})();
