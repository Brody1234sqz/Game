/*
 * Sundown Circuit — keyboard, touch and gamepad input merged into one
 * { steer, throttle, brake, nitro } reading, plus discrete menu actions.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});
  const U = SC.util;

  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyN', 'ShiftLeft', 'ShiftRight',
  ]);

  class Input {
    constructor() {
      this.keys = new Set();
      this.touch = { left: 0, right: 0, gas: 0, brake: 0, nitro: 0 };
      this.actions = [];
      this.capture = false; // swallow game keys only while racing
      this.padButtons = [];
      this.lastDevice = 'keyboard';

      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      window.addEventListener('blur', () => this.reset());
    }

    reset() {
      this.keys.clear();
      for (const k in this.touch) this.touch[k] = 0;
    }

    onKey(e, down) {
      const code = e.code;
      if (this.capture && GAME_KEYS.has(code)) e.preventDefault();
      if (down) {
        this.lastDevice = 'keyboard';
        if (!e.repeat) {
          if (code === 'Escape' || code === 'KeyP') this.actions.push('pause');
          else if (code === 'KeyM') this.actions.push('mute');
          else if (code === 'KeyC') this.actions.push('camera');
        }
        this.keys.add(code);
      } else {
        this.keys.delete(code);
      }
    }

    /** Wire up on-screen buttons marked with data-touch="left|right|gas|brake|nitro". */
    bindTouch(root) {
      const buttons = root.querySelectorAll('[data-touch]');
      buttons.forEach((el) => {
        const name = el.dataset.touch;
        const active = new Set();
        const sync = () => {
          this.touch[name] = active.size > 0 ? 1 : 0;
          el.classList.toggle('is-down', active.size > 0);
        };
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.lastDevice = 'touch';
          active.add(e.pointerId);
          if (el.setPointerCapture) {
            try {
              el.setPointerCapture(e.pointerId);
            } catch (err) {
              /* capture is optional */
            }
          }
          sync();
        });
        const up = (e) => {
          active.delete(e.pointerId);
          sync();
        };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('lostpointercapture', up);
        el.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    }

    pollGamepad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad || !pad.connected) continue;
        const b = (i) => (pad.buttons[i] ? pad.buttons[i].value || (pad.buttons[i].pressed ? 1 : 0) : 0);
        const pressed = pad.buttons.map((btn) => btn.pressed);
        if (pressed[9] && !this.padButtons[9]) this.actions.push('pause');
        if (pressed[3] && !this.padButtons[3]) this.actions.push('camera');
        this.padButtons = pressed;
        let ax = pad.axes[0] || 0;
        if (Math.abs(ax) < 0.15) ax = 0;
        const steer = U.clamp(ax + b(15) - b(14), -1, 1);
        const throttle = Math.max(b(7), b(12)); // right trigger or d-pad up
        const reading = {
          steer,
          throttle,
          brake: Math.max(b(6), b(13)),
          nitro: b(0) > 0.5 || b(5) > 0.5,
        };
        if (steer || throttle || reading.brake || reading.nitro) this.lastDevice = 'gamepad';
        return reading;
      }
      return null;
    }

    read() {
      const k = this.keys;
      const t = this.touch;
      let steer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
      let throttle = k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
      let brake = k.has('ArrowDown') || k.has('KeyS') ? 1 : 0;
      let nitro = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyN');

      steer += t.right - t.left;
      throttle = Math.max(throttle, t.gas);
      brake = Math.max(brake, t.brake);
      nitro = nitro || t.nitro > 0;

      const pad = this.pollGamepad();
      if (pad) {
        steer += pad.steer;
        throttle = Math.max(throttle, pad.throttle);
        brake = Math.max(brake, pad.brake);
        nitro = nitro || pad.nitro;
      }
      return { steer: U.clamp(steer, -1, 1), throttle, brake, nitro };
    }

    consumeActions() {
      const a = this.actions;
      this.actions = [];
      return a;
    }
  }

  SC.Input = Input;
})();
