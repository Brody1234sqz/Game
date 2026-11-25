/*
 * Sundown Circuit — shared math and formatting helpers.
 * Pure functions only (no DOM), so they run in the browser and under Node tests.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  const util = {
    clamp(v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    /** Wrap v into the half-open range [0, max). */
    wrap(v, max) {
      const r = v % max;
      return r < 0 ? r + max : r;
    },

    /** Signed shortest distance from a to b on a loop of length max, in (-max/2, max/2]. */
    loopDelta(a, b, max) {
      let d = util.wrap(b - a, max);
      if (d > max / 2) d -= max;
      return d;
    },

    /** Fraction of the way through the current slot of size `total`. */
    percentRemaining(n, total) {
      return util.wrap(n, total) / total;
    },

    /** Move v toward target by at most `step`. */
    approach(v, target, step) {
      return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
    },

    easeIn(a, b, p) {
      return a + (b - a) * p * p;
    },

    easeOut(a, b, p) {
      return a + (b - a) * (1 - (1 - p) * (1 - p));
    },

    easeInOut(a, b, p) {
      return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
    },

    exponentialFog(distance, density) {
      return 1 / Math.exp(distance * distance * density);
    },

    /** 1D overlap test between two centred spans. */
    overlap(x1, w1, x2, w2, percent = 1) {
      const half = percent / 2;
      return !(x1 + w1 * half < x2 - w2 * half || x1 - w1 * half > x2 + w2 * half);
    },

    /** Deterministic PRNG (mulberry32). Returns a function producing [0, 1). */
    rng(seed) {
      let a = seed >>> 0;
      return function next() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    /** "1:23.456" — robust against rounding up to 60 seconds. */
    formatTime(seconds) {
      if (seconds == null || !isFinite(seconds) || seconds < 0) return '-:--.---';
      const ms = Math.round(seconds * 1000);
      const m = Math.floor(ms / 60000);
      const s = (ms % 60000) / 1000;
      return m + ':' + s.toFixed(3).padStart(6, '0');
    },

    /** "+1.234" style interval. */
    formatGap(seconds) {
      if (!isFinite(seconds)) return '';
      if (seconds >= 60) return '+' + util.formatTime(seconds);
      return '+' + Math.max(0, seconds).toFixed(3);
    },

    ordinal(n) {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },

    hexToRgb(hex) {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    rgba(hex, alpha) {
      const [r, g, b] = util.hexToRgb(hex);
      return `rgba(${r},${g},${b},${alpha})`;
    },
  };

  SC.util = util;
})();
