/*
 * Sundown Circuit — synthesized sound with the Web Audio API.
 * Engine, wind, tyre squeal, gravel and nitro are continuous voices whose
 * levels follow the car; everything else is a short one-shot.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  const MASTER = 0.75;

  class AudioFX {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.paused = false;
    }

    /** Must be called from a user gesture (browsers block audio until then). */
    unlock() {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        try {
          this.ctx = new AC();
          this.build();
        } catch (err) {
          this.ctx = null;
          return;
        }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    }

    build() {
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(ctx.destination);

      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Engine: two detuned oscillators and a sub, soft-clipped and filtered.
      this.engine = ctx.createGain();
      this.engine.gain.value = 0;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.Q.value = 3;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 2.2);
      }
      shaper.curve = curve;
      shaper.connect(this.engineFilter);
      this.engineFilter.connect(this.engine);
      this.engine.connect(this.master);
      this.oscs = [
        { type: 'sawtooth', mul: 1, gain: 0.5 },
        { type: 'square', mul: 0.5, gain: 0.28, detune: 7 },
        { type: 'sine', mul: 0.25, gain: 0.7 },
      ].map((o) => {
        const osc = ctx.createOscillator();
        osc.type = o.type;
        if (o.detune) osc.detune.value = o.detune;
        const g = ctx.createGain();
        g.gain.value = o.gain;
        osc.connect(g);
        g.connect(shaper);
        osc.start();
        return { osc, mul: o.mul };
      });

      this.wind = this.loop('bandpass', 700, 0.6);
      this.skid = this.loop('bandpass', 1750, 9);
      this.gravel = this.loop('lowpass', 260, 1);
      this.hiss = this.loop('highpass', 2600, 0.7);
    }

    loop(type, freq, q) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
      return gain;
    }

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.03);
    }

    setPaused(paused) {
      this.paused = paused;
      if (!this.ctx) return;
      if (paused) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    }

    /** Continuous voices. `s` = { active, rpm, throttle, speed, skid, offRoad, nitro } */
    update(s) {
      if (!this.ctx || this.paused) return;
      const t = this.ctx.currentTime;
      const set = (param, v, tc = 0.05) => param.setTargetAtTime(v, t, tc);
      const on = s.active ? 1 : 0;
      const f = 34 + s.rpm * 150;
      for (const o of this.oscs) set(o.osc.frequency, f * o.mul * 2, 0.03);
      set(this.engineFilter.frequency, 380 + s.rpm * 2600 + s.throttle * 700);
      set(this.engine.gain, on * (0.09 + 0.12 * s.throttle + 0.05 * s.rpm), 0.06);
      set(this.wind.gain, on * Math.min(0.22, s.speed * s.speed * 0.16), 0.2);
      set(this.skid.gain, on * s.skid * 0.2, 0.05);
      set(this.gravel.gain, on * (s.offRoad ? 0.32 * Math.min(1, s.speed * 2.5) : 0), 0.05);
      set(this.hiss.gain, on * (s.nitro ? 0.1 : 0), 0.08);
    }

    /* One-shots --------------------------------------------------------- */

    tone(freq, dur, opts = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime + (opts.delay || 0);
      const osc = ctx.createOscillator();
      osc.type = opts.type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.vol || 0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    burst(dur, opts = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.type || 'lowpass';
      filter.frequency.setValueAtTime(opts.from || 3000, t);
      filter.frequency.exponentialRampToValueAtTime(opts.to || 200, t + dur);
      filter.Q.value = opts.q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(opts.vol || 0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      src.start(t, Math.random());
      src.stop(t + dur + 0.05);
    }

    play(type, e = {}) {
      if (!this.ctx || this.paused) return;
      switch (type) {
        case 'count':
          this.tone(620, 0.22, { vol: 0.16 });
          break;
        case 'go':
          this.tone(1240, 0.6, { vol: 0.18 });
          break;
        case 'crash':
          this.burst(0.7, { from: 2600, to: 120, vol: 0.55 + (e.impact || 0) * 0.3 });
          this.tone(90, 0.45, { type: 'sine', to: 32, vol: 0.6 });
          break;
        case 'bump':
          this.burst(0.2, { from: 1400, to: 200, vol: 0.35 });
          this.tone(130, 0.18, { type: 'sine', to: 60, vol: 0.4 });
          break;
        case 'scrape':
          this.burst(0.25, { type: 'bandpass', from: 3200, to: 1800, q: 2, vol: 0.18 });
          break;
        case 'shift':
          this.burst(0.06, { from: 1500, to: 400, vol: 0.12 });
          break;
        case 'nitro':
          this.burst(0.55, { type: 'bandpass', from: 400, to: 2600, q: 1.5, vol: 0.35 });
          break;
        case 'overtake':
          this.tone(700, 0.12, { type: 'triangle', to: 1050, vol: 0.12 });
          break;
        case 'lap':
          this.tone(880, 0.16, { type: 'triangle', vol: 0.16 });
          this.tone(1320, 0.28, { type: 'triangle', vol: 0.16, delay: 0.12 });
          break;
        case 'best':
          [784, 988, 1175, 1568].forEach((fq, i) => this.tone(fq, 0.2, { type: 'triangle', vol: 0.13, delay: i * 0.08 }));
          break;
        case 'finish':
          [523, 659, 784, 1047, 1319].forEach((fq, i) => this.tone(fq, 0.32, { type: 'triangle', vol: 0.15, delay: i * 0.11 }));
          break;
        case 'click':
          this.tone(1400, 0.04, { type: 'sine', vol: 0.08 });
          break;
        default:
          break;
      }
    }
  }

  SC.AudioFX = AudioFX;
})();
