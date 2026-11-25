/*
 * Sundown Circuit — pseudo-3D renderer and heads-up display.
 *
 * Each frame the road is projected segment by segment from the camera outward,
 * then painted back to front so nearer road always covers farther road. Sprites
 * are drawn back to front afterwards and clipped against hill crests.
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

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.w = 1;
      this.h = 1;
      this.dpr = 1;
      this.focal = 1;
      this.hud = 1;
      this.themeId = null;
      this.reducedMotion = false;
      this.shadeCache = new Map();
      this.particles = [];
      this.mapCache = null;
      this.fogTable = new Float32Array(C.drawDistance);
      for (let n = 0; n < C.drawDistance; n++) this.fogTable[n] = U.exponentialFog(n / C.drawDistance, C.fogDensity);
    }

    setTheme(id) {
      if (id === this.themeId) return;
      this.themeId = id;
      this.theme = SC.THEMES[id];
      this.art = SC.art.buildTheme(id);
      this.fogRgb = U.hexToRgb(this.theme.fog);
      this.shadeCache.clear();
      this.skyGrad = null;
      this.particles.length = 0;
    }

    resize(cssW, cssH, dpr) {
      this.dpr = dpr;
      this.cssW = cssW;
      this.cssH = cssH;
      this.w = Math.max(1, Math.round(cssW * dpr));
      this.h = Math.max(1, Math.round(cssH * dpr));
      this.canvas.width = this.w;
      this.canvas.height = this.h;
      // One focal length for both axes keeps sprites and hills in proportion;
      // narrow portrait screens get a wider view instead of a squashed one.
      this.focal = Math.min(this.h / 2, this.w * 0.62);
      this.hud = U.clamp(Math.min(cssW / 1280, cssH / 720), 0.62, 1.35) * dpr;
      this.skyGrad = null;
      this.mapCache = null;
    }

    /** Blend a palette colour toward the fog colour; cached per fog level. */
    shade(hex, fog) {
      let entry = this.shadeCache.get(hex);
      if (!entry) {
        entry = { rgb: U.hexToRgb(hex), levels: new Array(33) };
        this.shadeCache.set(hex, entry);
      }
      const lvl = Math.round(U.clamp(fog, 0, 1) * 32);
      let s = entry.levels[lvl];
      if (!s) {
        const f = lvl / 32;
        const [r, g, b] = entry.rgb;
        const fr = this.fogRgb;
        s = `rgb(${Math.round(r * f + fr[0] * (1 - f))},${Math.round(g * f + fr[1] * (1 - f))},${Math.round(b * f + fr[2] * (1 - f))})`;
        entry.levels[lvl] = s;
      }
      return s;
    }

    project(pt, camX, camY, camZ, f, horizon) {
      const c = pt.camera;
      const s = pt.screen;
      c.x = pt.world.x - camX;
      c.y = pt.world.y - camY;
      c.z = pt.world.z - camZ;
      s.scale = C.cameraDepth / c.z;
      s.x = this.w / 2 + s.scale * c.x * f;
      s.y = Math.round(horizon - s.scale * c.y * f);
      s.w = s.scale * C.roadWidth * f;
    }

    /* ---------------------------------------------------------------- */
    /* Frame                                                            */
    /* ---------------------------------------------------------------- */

    render(race, ui) {
      const ctx = this.ctx;
      const W = this.w;
      const H = this.h;
      const track = race.track;
      const segs = track.segments;
      const N = segs.length;
      const L = track.length;
      const p = race.player;
      const motion = this.reducedMotion ? 0 : 1;
      const f = this.focal * (1 - 0.07 * p.boostFx * motion);
      const horizon = Math.round(H * 0.5);

      ctx.save();
      if (race.shake > 0 && motion) {
        const m = race.shake * 10 * this.dpr;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      const camZ = U.wrap(p.z - C.playerZ, L);
      const base = track.findSegment(camZ);
      const basePercent = U.percentRemaining(camZ, C.segmentLength);
      const pSeg = track.findSegment(p.z);
      const playerY = U.lerp(pSeg.p1.world.y, pSeg.p2.world.y, U.percentRemaining(p.z, C.segmentLength));
      const camX = p.x * C.roadWidth;
      const camY = playerY + C.cameraHeight;

      this.drawBackground(race, horizon, playerY);

      // Pass 1: project front to back and record hill clipping.
      const DD = C.drawDistance;
      let maxy = H;
      let x = 0;
      let dx = -(base.curve * basePercent);
      for (let n = 0; n < DD; n++) {
        const seg = segs[(base.index + n) % N];
        seg.looped = seg.index < base.index;
        seg.fog = this.fogTable[n];
        seg.clip = maxy;
        const cz = camZ - (seg.looped ? L : 0);
        this.project(seg.p1, camX - x, camY, cz, f, horizon);
        this.project(seg.p2, camX - x - dx, camY, cz, f, horizon);
        x += dx;
        dx += seg.curve;
        seg.visible = seg.p1.camera.z > C.cameraDepth;
        seg.drawRoad = seg.visible && seg.p2.screen.y < seg.p1.screen.y && seg.p2.screen.y < maxy;
        if (seg.drawRoad) maxy = seg.p2.screen.y;
      }

      // Pass 2: road, back to front.
      for (let n = DD - 1; n >= 0; n--) {
        const seg = segs[(base.index + n) % N];
        if (seg.drawRoad) this.drawSegment(seg);
      }

      // Pass 3: scenery, cars and the player, back to front.
      const cars = this.art.cars;
      const scenery = this.art.scenery;
      let playerDrawn = false;
      for (let n = DD - 1; n >= 0; n--) {
        const seg = segs[(base.index + n) % N];
        if (!seg.visible) continue;
        const alpha = Math.min(1, seg.fog * 1.3);
        const s1 = seg.p1.screen;
        for (const s of seg.sprites) {
          const set = scenery[s.type];
          if (!set) continue;
          const img = set[s.variant % set.length];
          const sx = s1.x + s1.scale * s.offset * C.roadWidth * f;
          const align = s.offset < 0 ? -1 : s.offset > 0 ? 0 : -0.5;
          this.drawSprite(img, SC.SCENERY[s.type].w, s1.scale, sx, s1.y, align, seg.clip, alpha, f);
        }
        const s2 = seg.p2.screen;
        for (const car of seg.cars) {
          const pct = U.percentRemaining(car.z, C.segmentLength);
          const scale = U.lerp(s1.scale, s2.scale, pct);
          const sx = U.lerp(s1.x, s2.x, pct) + scale * car.x * C.roadWidth * f;
          const sy = U.lerp(s1.y, s2.y, pct);
          const art = cars[car.color % cars.length];
          this.drawSprite(car.braking ? art.brake : art.normal, C.carWidth, scale, sx, sy, -0.5, seg.clip, alpha, f);
        }
        if (seg === pSeg) {
          this.drawPlayer(race, f, horizon, ui.dt || 0);
          playerDrawn = true;
        }
      }
      if (!playerDrawn) this.drawPlayer(race, f, horizon, ui.dt || 0);

      this.drawEffects(race, horizon);
      ctx.restore();

      if (ui.hud) this.drawHud(race, ui);
    }

    drawBackground(race, horizon, playerY) {
      const ctx = this.ctx;
      const W = this.w;
      const H = this.h;
      const t = this.theme;
      const layers = this.art.layers;
      if (!this.skyGrad || this.skyGradH !== horizon) {
        const g = ctx.createLinearGradient(0, 0, 0, horizon);
        for (const [stop, color] of t.sky) g.addColorStop(stop, color);
        this.skyGrad = g;
        const gg = ctx.createLinearGradient(0, horizon, 0, H);
        gg.addColorStop(0, t.fog);
        gg.addColorStop(0.14, t.ground);
        gg.addColorStop(1, t.ground);
        this.groundGrad = gg;
        this.skyGradH = horizon;
      }
      ctx.fillStyle = this.skyGrad;
      ctx.fillRect(-40, -40, W + 80, horizon + 41);
      ctx.fillStyle = this.groundGrad;
      ctx.fillRect(-40, horizon, W + 80, H - horizon + 40);
      const lift = U.clamp(playerY / 30000, -0.3, 0.5);
      const v = race.view;
      this.drawLayer(layers.sky, v.sky, horizon, horizon + 2);
      this.drawLayer(layers.far, v.far, H * 0.3, horizon + 2 + lift * H * 0.03);
      this.drawLayer(layers.near, v.near, H * 0.2, horizon + 2 + lift * H * 0.06);
    }

    drawLayer(img, offset, destH, bottom) {
      const destW = (destH * img.width) / img.height;
      let x = -((offset * destW) % destW);
      if (x > 0) x -= destW;
      for (; x < this.w + 40; x += destW) this.ctx.drawImage(img, x - 20, bottom - destH, destW + 1, destH);
    }

    quad(x1, y1, x2, y2, x3, y3, x4, y4) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();
    }

    drawSegment(seg) {
      const ctx = this.ctx;
      const t = this.theme;
      const pal = seg.lit && t.lit ? t.lit : seg.color ? t.dark : t.light;
      const fog = seg.fog;
      const a = seg.p1.screen;
      const b = seg.p2.screen;
      const x1 = a.x, y1 = a.y, w1 = a.w;
      const x2 = b.x, y2 = b.y, w2 = b.w;

      ctx.fillStyle = this.shade(pal.grass, fog);
      ctx.fillRect(-40, y2, this.w + 80, y1 - y2 + 1);

      const r1 = w1 / 6;
      const r2 = w2 / 6;
      ctx.fillStyle = this.shade(pal.rumble, fog);
      this.quad(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2);
      this.quad(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2);

      ctx.fillStyle = this.shade(seg.checker ? '#f4f1ea' : pal.road, fog);
      this.quad(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);

      if (seg.checker) {
        const cols = 14;
        ctx.fillStyle = this.shade('#16161a', fog);
        for (let i = (seg.index % 2); i < cols; i += 2) {
          const u0 = -1 + (2 * i) / cols;
          const u1 = -1 + (2 * (i + 1)) / cols;
          this.quad(x1 + w1 * u0, y1, x1 + w1 * u1, y1, x2 + w2 * u1, y2, x2 + w2 * u0, y2);
        }
        return;
      }

      // Solid edge lines just inside the kerbs
      const e1 = w1 / 50;
      const e2 = w2 / 50;
      ctx.fillStyle = this.shade(pal.edge, fog);
      this.quad(x1 - w1 + e1, y1, x1 - w1 + e1 * 2.2, y1, x2 - w2 + e2 * 2.2, y2, x2 - w2 + e2, y2);
      this.quad(x1 + w1 - e1, y1, x1 + w1 - e1 * 2.2, y1, x2 + w2 - e2 * 2.2, y2, x2 + w2 - e2, y2);

      if (pal.lane) {
        const l1 = w1 / 42;
        const l2 = w2 / 42;
        ctx.fillStyle = this.shade(pal.lane, fog);
        for (let lane = 1; lane < C.lanes; lane++) {
          const lx1 = x1 - w1 + (2 * w1 * lane) / C.lanes;
          const lx2 = x2 - w2 + (2 * w2 * lane) / C.lanes;
          this.quad(lx1 - l1, y1, lx1 + l1, y1, lx2 + l2, y2, lx2 - l2, y2);
        }
      }
    }

    drawSprite(img, worldW, scale, x, y, alignX, clipY, alpha, f) {
      const destW = worldW * scale * f;
      if (destW < 0.6) return;
      const destH = (destW * img.height) / img.width;
      const dx = x + destW * alignX;
      const dy = y - destH;
      if (dx > this.w || dx + destW < 0 || dy > this.h) return;
      const clipH = clipY ? Math.max(0, dy + destH - clipY) : 0;
      if (clipH >= destH) return;
      const ctx = this.ctx;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, 0, 0, img.width, img.height * (1 - clipH / destH), dx, dy, destW, destH - clipH);
      ctx.globalAlpha = 1;
    }

    drawPlayer(race, f, horizon, dt) {
      const ctx = this.ctx;
      const p = race.player;
      const sp = p.speed / C.maxSpeed;
      const scale = C.cameraDepth / C.playerZ;
      const destW = C.carWidth * scale * f;
      const destH = destW * SC.art.CAR_ASPECT;
      const ground = Math.min(this.h - 2 * this.dpr, horizon + scale * C.cameraHeight * f);
      const bottom = ground - destH * 0.02 + p.bounce * this.dpr * 2;
      const x = this.w / 2 - destW / 2;
      const y = bottom - destH;

      if (this.theme.night) {
        ctx.globalCompositeOperation = 'lighter';
        const cy = y - destH * 0.1;
        const g = ctx.createRadialGradient(this.w / 2, cy, 0, this.w / 2, cy, destW * 1.5);
        g.addColorStop(0, 'rgba(255,236,190,0.20)');
        g.addColorStop(1, 'rgba(255,236,190,0)');
        ctx.fillStyle = g;
        ctx.fillRect(this.w / 2 - destW * 1.5, cy - destW * 1.5, destW * 3, destW * 3);
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.save();
      ctx.translate(x, y);
      SC.art.drawCar(ctx, destW, SC.art.PLAYER_COLOR, {
        lean: p.steer * Math.min(1, sp * 1.5),
        brake: p.braking,
        glow: this.theme.night,
        nitro: p.nitroActive ? 1 : 0,
        flicker: Math.random(),
        stripes: true,
      });
      ctx.restore();

      this.updateParticles(race, x, y, destW, destH, dt);
    }

    updateParticles(race, x, y, w, h, dt) {
      const p = race.player;
      const sp = p.speed / C.maxSpeed;
      const parts = this.particles;
      const dirt = p.offRoad && sp > 0.08;
      const rate = dirt ? 60 * Math.min(1, sp * 2) : p.skid > 0.25 ? 50 * p.skid : 0;
      if (rate > 0 && dt > 0 && !this.reducedMotion) {
        const count = rate * dt + Math.random();
        for (let i = 0; i < Math.floor(count) && parts.length < 140; i++) {
          const left = Math.random() < 0.5;
          parts.push({
            x: x + w * (left ? 0.15 : 0.85) + (Math.random() - 0.5) * w * 0.1,
            y: y + h * 0.95,
            vx: (left ? -1 : 1) * w * (0.2 + Math.random() * 0.5),
            vy: h * (0.3 + Math.random() * 0.4),
            r: w * 0.05,
            grow: w * (0.25 + Math.random() * 0.2),
            life: 0.6,
            max: 0.6,
            color: dirt ? this.theme.dust : '#e9e4ee',
          });
        }
      }
      const ctx = this.ctx;
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.life -= dt;
        if (q.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.r += q.grow * dt;
        ctx.globalAlpha = (q.life / q.max) * 0.45;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawEffects(race, horizon) {
      if (this.reducedMotion) return;
      const ctx = this.ctx;
      const p = race.player;
      const sp = p.speed / C.maxSpeed;
      const k = U.clamp((sp - 0.9) * 3, 0, 0.5) + p.boostFx * 0.8;
      if (k < 0.03) return;
      const W = this.w;
      const H = this.h;
      const R = Math.max(W, H) * 0.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.16 * k})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * TAU;
        const r0 = R * (0.45 + Math.random() * 0.35);
        const r1 = r0 + R * (0.1 + Math.random() * 0.3) * k;
        const ca = Math.cos(a);
        const sa = Math.sin(a) * 0.62;
        ctx.moveTo(W / 2 + ca * r0, horizon + sa * r0);
        ctx.lineTo(W / 2 + ca * r1, horizon + sa * r1);
      }
      ctx.stroke();
      if (p.boostFx > 0.01) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, R * 1.2);
        g.addColorStop(0, 'rgba(70,224,255,0)');
        g.addColorStop(1, `rgba(70,160,255,${0.28 * p.boostFx})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }

    /* ---------------------------------------------------------------- */
    /* HUD                                                              */
    /* ---------------------------------------------------------------- */

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

  SC.Renderer = Renderer;
  SC.HUD_COLORS = HUD;
})();
