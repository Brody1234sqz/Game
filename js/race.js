/*
 * Sundown Circuit — race simulation.
 * Player physics, rival AI, collisions, laps, standings and an autopilot.
 * No DOM access: the renderer and audio read this state, and Node tests drive it.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});
  const U = SC.util;
  const C = SC.CONFIG;

  const PLAYER_HIT_W = C.carHalfWidth * 0.8; // a little forgiving
  const CAR_HIT_W = C.carHalfWidth * 0.85;
  const NEUTRAL = Object.freeze({ steer: 0, throttle: 0, brake: 0, nitro: false });

  class Race {
    /**
     * @param {SC.Track} track
     * @param {{laps?: number, difficulty?: string, seed?: number, demo?: boolean}} opts
     */
    constructor(track, opts = {}) {
      this.track = track;
      this.demo = !!opts.demo;
      this.laps = this.demo ? Infinity : opts.laps || 3;
      this.difficulty = C.difficulties[opts.difficulty] || C.difficulties.normal;
      this.rnd = U.rng(opts.seed != null ? opts.seed : (Math.random() * 4294967296) >>> 0);

      this.state = this.demo ? 'racing' : 'countdown';
      this.countdown = this.demo ? 0 : C.countdown;
      this.time = 0;
      this.events = [];
      this.view = { sky: 0, far: 0, near: 0 };
      this.shake = 0;
      this.finishOrder = [];
      this.segCount = track.segments.length;

      for (const s of track.segments) s.cars.length = 0;

      this.player = this.createPlayer();
      this.cars = this.createRivals();
      this.entities = [this.player, ...this.cars];
      this.order = this.entities.slice();
      this.updateStandings(true);
      this.lastCount = Math.ceil(this.countdown);
      if (!this.demo) this.events.push({ type: 'count', n: this.lastCount });
    }

    /* ---------------------------------------------------------------- */
    /* Setup                                                            */
    /* ---------------------------------------------------------------- */

    gridSlot(slot) {
      const row = Math.floor(slot / 2);
      const col = slot % 2;
      return {
        z: this.track.startZ - 200 - row * C.gridRowGap - col * C.gridRowGap * 0.5,
        x: col ? 0.5 : -0.5,
      };
    }

    baseEntity(slot) {
      const g = this.gridSlot(slot);
      const e = {
        z: 0,
        wraps: 0,
        progress: 0,
        x: g.x,
        targetX: g.x,
        speed: 0,
        lapsDone: 0,
        lapStart: 0,
        finished: false,
        finishTime: null,
        position: slot + 1,
      };
      this.moveEntity(e, g.z);
      return e;
    }

    createPlayer() {
      const p = this.baseEntity(C.rivals);
      Object.assign(p, {
        isPlayer: true,
        name: 'You',
        color: -1,
        steer: 0,
        nitro: 0.5,
        nitroActive: false,
        boostFx: 0,
        gear: 1,
        rpm: 0.18,
        throttle: 0,
        braking: false,
        offRoad: false,
        skid: 0,
        bounce: 0,
        crashCooldown: 0,
        bumpCooldown: 0,
        shiftTimer: 0,
        aiTimer: 0,
        lapTimes: [],
        lastLap: null,
        bestLap: Infinity,
      });
      return p;
    }

    createRivals() {
      const d = this.difficulty;
      const cars = [];
      for (let i = 0; i < C.rivals; i++) {
        const car = this.baseEntity(i);
        // Qualifying order: the quickest cars start at the front.
        const t = C.rivals > 1 ? i / (C.rivals - 1) : 0;
        Object.assign(car, {
          isPlayer: false,
          name: C.drivers[i % C.drivers.length],
          color: i % 9,
          skill: U.clamp(U.lerp(d.max, d.min, t) + (this.rnd() - 0.5) * 0.02, 0.5, 1.05),
          delay: 0.08 + this.rnd() * 0.35,
          braking: false,
          laneTimer: 0,
          segIndex: -1,
        });
        this.updateCarSegment(car);
        cars.push(car);
      }
      return cars;
    }

    /* ---------------------------------------------------------------- */
    /* Bookkeeping                                                      */
    /* ---------------------------------------------------------------- */

    /** Move an entity along the loop, tracking how many times it wrapped. */
    moveEntity(e, dz) {
      const L = this.track.length;
      let z = e.z + dz;
      if (z >= L || z < 0) {
        const w = Math.floor(z / L);
        e.wraps += w;
        z -= w * L;
      }
      e.z = z;
      e.progress = e.wraps * L + e.z - this.track.startZ;
    }

    updateCarSegment(car) {
      const idx = Math.floor(car.z / C.segmentLength) % this.segCount;
      if (idx === car.segIndex) return;
      if (car.segIndex >= 0) {
        const list = this.track.segments[car.segIndex].cars;
        const k = list.indexOf(car);
        if (k >= 0) list.splice(k, 1);
      }
      this.track.segments[idx].cars.push(car);
      car.segIndex = idx;
    }

    moveCar(car, dz) {
      this.moveEntity(car, dz);
      this.updateCarSegment(car);
    }

    checkLaps(e) {
      if (e.progress < 0 || e.finished) return;
      const L = this.track.length;
      const laps = Math.floor(e.progress / L);
      if (laps <= e.lapsDone) return;
      e.lapsDone = laps;
      const over = e.progress - laps * L;
      const tCross = Math.max(e.lapStart, this.time - (e.speed > 1 ? over / e.speed : 0));
      const lapTime = tCross - e.lapStart;
      e.lapStart = tCross;

      if (e.isPlayer) {
        const best = lapTime < e.bestLap;
        e.lapTimes.push(lapTime);
        e.lastLap = lapTime;
        if (best) e.bestLap = lapTime;
        if (laps < this.laps) {
          this.events.push({ type: 'lap', lap: laps + 1, time: lapTime, best: best && laps > 1, final: laps + 1 === this.laps });
        }
      }

      if (laps >= this.laps) {
        e.finished = true;
        e.finishTime = tCross;
        this.finishOrder.push(e);
        if (e.isPlayer) {
          this.state = 'finished';
          this.updateStandings(true);
          this.events.push({ type: 'finish', position: e.position, time: tCross });
        }
      }
    }

    sortOrder() {
      return this.entities.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      });
    }

    updateStandings(silent) {
      this.order = this.sortOrder();
      for (let i = 0; i < this.order.length; i++) this.order[i].position = i + 1;
      const rank = this.player.position;
      if (!silent && this.state === 'racing' && !this.demo && rank < this.rank) {
        const gained = this.rank - rank;
        this.player.nitro = Math.min(1, this.player.nitro + C.nitroPerOvertake * gained);
        this.events.push({ type: 'overtake', position: rank });
      }
      this.rank = rank;
    }

    /** Seconds behind the leader, estimated from track distance. */
    gapToLeader(e) {
      const leader = this.order[0];
      if (e === leader) return 0;
      if (e.finished && leader.finished) return e.finishTime - leader.finishTime;
      // One shared reference speed keeps the gaps in the same order as the positions.
      return Math.max(0, (leader.progress - e.progress) / (C.maxSpeed * 0.85));
    }

    /** Estimated finishing times for every entity, used by the results screen. */
    results() {
      const L = this.track.length;
      const rows = this.sortOrder().map((e) => {
        let time = e.finishTime;
        let estimated = false;
        if (!e.finished) {
          const remaining = this.laps * L - e.progress;
          time = this.time + remaining / Math.max(C.maxSpeed * 0.75, e.speed);
          estimated = true;
        }
        return { name: e.name, isPlayer: !!e.isPlayer, color: e.color, time, estimated };
      });
      // Keep finishers first, then order estimates by time.
      const done = rows.filter((r) => !r.estimated);
      const est = rows.filter((r) => r.estimated).sort((a, b) => a.time - b.time);
      const all = done.concat(est);
      const winner = all[0].time;
      all.forEach((r, i) => {
        r.position = i + 1;
        r.gap = r.time - winner;
      });
      return all;
    }

    /* ---------------------------------------------------------------- */
    /* Main update                                                      */
    /* ---------------------------------------------------------------- */

    update(dt, input = NEUTRAL) {
      const p = this.player;
      if (this.state === 'countdown') {
        this.countdown -= dt;
        const c = Math.ceil(this.countdown);
        if (c < this.lastCount && c > 0) this.events.push({ type: 'count', n: c });
        this.lastCount = c;
        p.throttle = U.clamp(input.throttle || 0, 0, 1);
        p.rpm = U.approach(p.rpm, 0.18 + 0.72 * p.throttle, dt * 3);
        if (this.countdown <= 0) {
          this.state = 'racing';
          this.time = -this.countdown;
          this.countdown = 0;
          this.events.push({ type: 'go' });
        }
        return;
      }

      this.time += dt;
      const auto = this.demo || this.state === 'finished';
      this.updatePlayer(dt, auto ? this.autopilot(p, dt) : input);
      for (const car of this.cars) this.updateRival(car, dt);
      this.updateStandings(false);
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    /* ---------------------------------------------------------------- */
    /* Player                                                           */
    /* ---------------------------------------------------------------- */

    updatePlayer(dt, input) {
      const p = this.player;
      const track = this.track;
      const seg0 = track.findSegment(p.z);
      const sp = p.speed / C.maxSpeed;

      p.crashCooldown = Math.max(0, p.crashCooldown - dt);
      p.bumpCooldown = Math.max(0, p.bumpCooldown - dt);

      const steerIn = U.clamp(input.steer || 0, -1, 1);
      const throttle = U.clamp(input.throttle || 0, 0, 1);
      const brake = U.clamp(input.brake || 0, 0, 1);

      // Steering: quick to centre, a touch slower to build lock.
      const building = Math.abs(steerIn) > Math.abs(p.steer) && steerIn * p.steer >= 0;
      p.steer = U.approach(p.steer, steerIn, (building ? 4.5 : 9) * dt);
      p.x += p.steer * dt * C.steerRate * Math.min(sp, 1.15);
      p.x -= dt * 2 * sp * sp * seg0.curve * C.centrifugal; // centrifugal drift

      // Nitro
      const wants = !!input.nitro && throttle > 0.1 && brake < 0.1 && !p.offRoad;
      const wasActive = p.nitroActive;
      p.nitroActive = wants && p.nitro > 0 && (wasActive || p.nitro >= C.nitroMinStart);
      if (p.nitroActive) {
        p.nitro = Math.max(0, p.nitro - C.nitroDrain * dt);
        if (p.nitro === 0) p.nitroActive = false;
      } else {
        p.nitro = Math.min(1, p.nitro + C.nitroRecharge * dt);
      }
      if (p.nitroActive && !wasActive) this.events.push({ type: 'nitro' });
      p.boostFx = U.approach(p.boostFx, p.nitroActive ? 1 : 0, dt * 3);

      // Longitudinal
      const top = C.maxSpeed * (p.nitroActive ? C.nitroBoost : 1);
      if (brake > 0) p.speed += C.braking * brake * dt;
      if (throttle > 0) {
        if (p.speed < top) {
          const a = C.accel * throttle * (1 - 0.6 * Math.min(1, sp) ** 2) + (p.nitroActive ? C.nitroAccel : 0);
          p.speed = Math.min(top, p.speed + a * dt);
        } else {
          p.speed = Math.max(top, p.speed + C.decel * dt); // shed boost speed
        }
      } else {
        p.speed += C.decel * dt;
      }

      p.offRoad = Math.abs(p.x) > 1;
      if (p.offRoad && p.speed > C.offRoadLimit) {
        p.speed = Math.max(C.offRoadLimit, p.speed + C.offRoadDecel * dt);
      }
      p.speed = U.clamp(p.speed, 0, C.maxSpeed * C.nitroBoost);
      p.x = U.clamp(p.x, -C.maxOffset, C.maxOffset);
      p.throttle = throttle;
      p.braking = brake > 0.1;

      // Advance
      const dz = p.speed * dt;
      this.moveEntity(p, dz);
      const v = this.view;
      const turn = (seg0.curve * dz) / C.segmentLength;
      v.sky = U.wrap(v.sky + C.skySpeed * turn, 1);
      v.far = U.wrap(v.far + C.farSpeed * turn, 1);
      v.near = U.wrap(v.near + C.nearSpeed * turn, 1);

      // Collisions
      const seg = track.findSegment(p.z);
      if (p.offRoad && p.crashCooldown === 0) {
        for (const s of seg.sprites) {
          if (s.solid && U.overlap(p.x, PLAYER_HIT_W, s.cx, s.hitW)) {
            this.crash(p);
            break;
          }
        }
      }
      this.collideCars(p);
      this.checkLaps(p);

      // Feel: gearbox, tyre load, bounce
      this.updateGearbox(p, dt);
      const spNow = p.speed / C.maxSpeed;
      const load = (Math.abs(seg.curve) * spNow * spNow) / 6 + Math.abs(p.steer) * spNow * 0.25;
      let skid = U.clamp((load - 0.55) * 2, 0, 1);
      if (brake > 0.5 && spNow > 0.35) skid = Math.max(skid, 0.7);
      p.skid = p.offRoad ? 0 : U.approach(p.skid, skid, dt * 6);
      p.bounce = p.offRoad ? (this.rnd() - 0.5) * 2 * Math.min(1, spNow * 2) : (this.rnd() - 0.5) * 0.3 * spNow;
    }

    updateGearbox(p, dt) {
      const g = C.gearTop;
      const v = p.speed / (C.maxSpeed * C.nitroBoost);
      p.shiftTimer = Math.max(0, p.shiftTimer - dt);
      if (p.shiftTimer === 0) {
        if (p.gear < g.length && v > g[p.gear - 1] * 0.97) {
          p.gear++;
          p.shiftTimer = 0.3;
          this.events.push({ type: 'shift', up: true });
        } else if (p.gear > 1 && v < g[p.gear - 2] * 0.8) {
          p.gear--;
          p.shiftTimer = 0.3;
        }
      }
      const target = U.clamp(0.18 + (0.82 * v) / g[p.gear - 1], 0, 1.02);
      p.rpm = U.approach(p.rpm, target, dt * 5);
    }

    crash(p) {
      const impact = p.speed / C.maxSpeed;
      p.speed *= 0.15;
      // Back out of the obstacle so the player is not stuck inside it.
      this.moveEntity(p, -(U.wrap(p.z, C.segmentLength) + 1));
      p.x += (p.x > 0 ? -1 : 1) * 0.08;
      p.crashCooldown = 0.6;
      p.nitroActive = false;
      this.shake = Math.min(1, 0.35 + impact);
      this.events.push({ type: 'crash', impact });
    }

    collideCars(p) {
      const L = this.track.length;
      for (const car of this.cars) {
        const d = U.loopDelta(p.z, car.z, L); // > 0: car is ahead
        if (Math.abs(d) > C.carLength) continue;
        const lat = car.x - p.x;
        if (Math.abs(lat) > CAR_HIT_W) continue;

        if (d > C.carLength * 0.35) {
          if (p.speed <= car.speed) continue; // car ahead is pulling away
          // Player rear-ends the car ahead.
          const impact = (p.speed - car.speed) / C.maxSpeed;
          p.speed = car.speed * 0.9;
          this.moveEntity(p, d - C.carLength);
          car.speed = Math.min(C.maxSpeed * 1.05, car.speed + impact * C.maxSpeed * 0.25);
          this.bump(impact, 'bump');
        } else if (d < -C.carLength * 0.35) {
          if (car.speed <= p.speed) continue; // player is pulling away
          // A rival runs into the back of the player.
          const impact = (car.speed - p.speed) / C.maxSpeed;
          car.speed = p.speed * 0.92;
          this.moveCar(car, -C.carLength - d);
          p.speed = Math.min(C.maxSpeed, p.speed + impact * C.maxSpeed * 0.2);
          this.bump(impact, 'bump');
        } else {
          // Side by side: shove apart.
          const dir = lat >= 0 ? -1 : 1;
          const push = (CAR_HIT_W - Math.abs(lat)) / 2 + 0.01;
          p.x += dir * push;
          car.x -= dir * push;
          car.targetX = nearestLane(car.x);
          p.speed *= 0.985;
          car.speed *= 0.99;
          this.bump(0.15, 'scrape');
        }
      }
    }

    bump(impact, type) {
      const p = this.player;
      if (p.bumpCooldown > 0) return;
      p.bumpCooldown = 0.25;
      this.shake = Math.max(this.shake, Math.min(0.6, 0.15 + impact));
      this.events.push({ type, impact });
    }

    /* ---------------------------------------------------------------- */
    /* Rival AI                                                         */
    /* ---------------------------------------------------------------- */

    maxCurveAhead(z, count, step) {
      const segs = this.track.segments;
      const start = this.track.findSegment(z).index;
      let m = 0;
      for (let k = 0; k < count; k += step) m = Math.max(m, Math.abs(segs[(start + k) % this.segCount].curve));
      return m;
    }

    /** Nearest entity ahead of `e` that sits in lane `laneX` or in its current path. */
    findBlocker(e, laneX) {
      const L = this.track.length;
      let best = null;
      for (const o of this.entities) {
        if (o === e) continue;
        const d = U.loopDelta(e.z, o.z, L);
        if (d <= 0 || d > C.lookAhead) continue;
        if (Math.abs(o.x - laneX) < 0.42 || Math.abs(o.x - e.x) < 0.42) {
          if (!best || d < best.d) best = { e: o, d };
        }
      }
      return best;
    }

    laneFree(e, lane) {
      const L = this.track.length;
      for (const o of this.entities) {
        if (o === e) continue;
        const d = U.loopDelta(e.z, o.z, L);
        if (d < -700 || d > C.lookAhead + 200) continue;
        if (Math.abs(o.x - lane) < 0.45) return false;
        if (!o.isPlayer && Math.abs(o.targetX - lane) < 0.45) return false;
      }
      return true;
    }

    pickLane(e) {
      const lanes = C.lanesX.slice().sort((a, b) => Math.abs(a - e.x) - Math.abs(b - e.x));
      for (const lane of lanes) {
        if (Math.abs(lane - e.targetX) < 0.1) continue;
        if (this.laneFree(e, lane)) return lane;
      }
      return null;
    }

    updateRival(car, dt) {
      if (car.delay > 0) {
        car.delay -= dt;
        return;
      }
      const L = this.track.length;
      const maxCurve = this.maxCurveAhead(car.z, 40, 4);
      let target = car.skill * C.maxSpeed * (1 - Math.max(0, maxCurve - 5) * 0.05);
      if (!this.demo) {
        const gap = car.progress - this.player.progress;
        target *= 1 - U.clamp(gap / (L * 0.2), -1, 1) * C.rubberBand;
      }
      if (car.finished) target *= 0.85;

      car.laneTimer -= dt;
      const block = this.findBlocker(car, car.targetX);
      if (block && block.e.speed < target) {
        let moved = false;
        if (car.laneTimer <= 0) {
          const lane = this.pickLane(car);
          if (lane !== null) {
            car.targetX = lane;
            car.laneTimer = 1.2;
            moved = true;
          }
        }
        if (!moved && block.d < 1400) target = Math.min(target, block.e.speed * (block.d < 500 ? 0.9 : 0.99));
      } else if (car.laneTimer < -6 && this.rnd() < dt * 0.2) {
        const lane = this.pickLane(car);
        if (lane !== null) {
          car.targetX = lane;
          car.laneTimer = 1.2;
        }
      }

      const sp = car.speed / C.maxSpeed;
      if (car.speed < target) {
        car.speed = Math.min(target, car.speed + C.rivalAccel * (1 - 0.5 * Math.min(sp, 1) ** 2) * dt);
        car.braking = false;
      } else {
        car.braking = car.speed - target > 300;
        car.speed = Math.max(target, car.speed - C.rivalBrake * dt);
      }
      car.x = U.approach(car.x, car.targetX, C.rivalSteer * dt);
      this.moveCar(car, car.speed * dt);
      this.checkLaps(car);
    }

    /* ---------------------------------------------------------------- */
    /* Autopilot (attract mode, post-finish, tests)                     */
    /* ---------------------------------------------------------------- */

    autopilot(p, dt) {
      const seg = this.track.findSegment(p.z);
      const sp = p.speed / C.maxSpeed;
      p.aiTimer -= dt;
      if (Math.abs(p.targetX) > 0.7) p.targetX = nearestLane(p.x);

      const block = this.findBlocker(p, p.targetX);
      if (block && block.e.speed < p.speed && p.aiTimer <= 0) {
        const lane = this.pickLane(p);
        if (lane !== null) {
          p.targetX = lane;
          p.aiTimer = 1;
        }
      }

      // Steer to hold the target line and cancel the centrifugal drift.
      const authority = C.steerRate * Math.max(0.05, Math.min(sp, 1.15));
      const drift = 2 * sp * sp * seg.curve * C.centrifugal;
      const steer = U.clamp((1.8 * (p.targetX - p.x) + drift) / authority, -1, 1);

      const maxCurve = this.maxCurveAhead(p.z, 50, 3);
      const safe = maxCurve > 0 ? (0.85 * C.steerRate) / (2 * maxCurve * C.centrifugal) : 2;
      const cruise = this.state === 'finished' ? 0.72 : 2;
      const limit = Math.min(safe, cruise);
      const close = block && block.d < 900 && block.e.speed < p.speed;
      const throttle = sp < limit && !close ? 1 : 0;
      const brake = sp > limit + 0.08 || (block && block.d < 450 && block.e.speed < p.speed * 0.9) ? 1 : 0;
      const nitro = this.state === 'racing' && !this.demo && this.maxCurveAhead(p.z, 70, 5) < 3.5 && sp > 0.75 && !block;
      return { steer, throttle, brake, nitro };
    }
  }

  function nearestLane(x) {
    let best = C.lanesX[0];
    for (const l of C.lanesX) if (Math.abs(l - x) < Math.abs(best - x)) best = l;
    return best;
  }

  SC.Race = Race;
  SC.NEUTRAL_INPUT = NEUTRAL;
})();
