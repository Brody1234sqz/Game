/*
 * Headless tests for the simulation layer (no browser needed).
 * Run with: npm test   (or: node --test)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

for (const f of ['util', 'config', 'tracks', 'race', 'centerline', 'cars']) require(path.join(__dirname, '..', 'js', f + '.js'));
const SC = globalThis.SC;
const U = SC.util;
const C = SC.CONFIG;

const tracks = SC.TRACK_DEFS.map((d) => new SC.Track(d));

/** Drive a whole race with the autopilot; returns the race and counted events. */
function simulate(track, opts, inputFor) {
  const race = new SC.Race(track, opts);
  const dt = 1 / 120;
  const counts = {};
  let steps = 0;
  while (race.state !== 'finished' && steps < 120 * 600) {
    const input = race.state === 'countdown' ? { throttle: 1 } : inputFor ? inputFor(race, dt) : race.autopilot(race.player, dt);
    race.update(dt, input);
    for (const e of race.events) counts[e.type] = (counts[e.type] || 0) + 1;
    race.events.length = 0;
    steps++;
  }
  return { race, counts };
}

test('formatTime never shows 60 seconds and handles bad input', () => {
  assert.equal(U.formatTime(0), '0:00.000');
  assert.equal(U.formatTime(59.9996), '1:00.000');
  assert.equal(U.formatTime(83.4567), '1:23.457');
  assert.equal(U.formatTime(Infinity), '-:--.---');
  assert.equal(U.formatTime(-1), '-:--.---');
});

test('wrap and loopDelta stay on the loop', () => {
  assert.equal(U.wrap(-1, 10), 9);
  assert.equal(U.wrap(10, 10), 0);
  assert.equal(U.loopDelta(9, 1, 10), 2);
  assert.equal(U.loopDelta(1, 9, 10), -2);
});

test('ordinal suffixes', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(U.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
});

test('rng is deterministic per seed', () => {
  const a = U.rng(42);
  const b = U.rng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

for (const track of tracks) {
  test(`${track.name}: road is a seamless closed loop`, () => {
    const segs = track.segments;
    assert.ok(segs.length > 1500 && segs.length < 3500, `unexpected length ${segs.length}`);
    assert.equal(segs[0].p1.world.y, 0);
    assert.equal(segs[segs.length - 1].p2.world.y, 0);
    for (let i = 1; i < segs.length; i++) {
      assert.equal(segs[i].p1.world.y, segs[i - 1].p2.world.y, `height step at segment ${i}`);
      assert.ok(Number.isFinite(segs[i].curve));
    }
    assert.ok(Math.abs(segs[segs.length - 1].curve) < 0.5, 'curve should ease out before the loop closes');
    assert.ok(segs[track.startIndex].checker, 'start line is marked');
  });

  test(`${track.name}: nothing solid stands on the tarmac`, () => {
    for (const seg of track.segments) {
      for (const s of seg.sprites) {
        assert.ok(SC.SCENERY[s.type], `unknown sprite type ${s.type}`);
        if (!s.solid) continue;
        const innerEdge = Math.abs(s.cx) - s.hitW / 2;
        assert.ok(innerEdge >= 1, `${s.type} at segment ${seg.index} intrudes on the road (${innerEdge.toFixed(2)})`);
      }
    }
  });

  test(`${track.name}: minimap outline is closed and normalised`, () => {
    const pts = track.map.points;
    for (const v of pts) assert.ok(v >= -1e-9 && v <= 1 + 1e-9);
    const n = pts.length / 2;
    const gap = Math.hypot(pts[0] - pts[(n - 1) * 2], pts[1] - pts[(n - 1) * 2 + 1]);
    assert.ok(gap < 0.02, `outline does not close (${gap})`);
  });
}

test('grid: player starts last, everyone behind the line, no overlaps', () => {
  const race = new SC.Race(tracks[0], { seed: 1 });
  assert.equal(race.player.position, C.rivals + 1);
  for (const e of race.entities) assert.ok(e.progress < 0, 'grid sits behind the start line');
  for (const a of race.entities) {
    for (const b of race.entities) {
      if (a === b) continue;
      const sameSpot = Math.abs(a.z - b.z) < C.carLength && Math.abs(a.x - b.x) < C.carHalfWidth;
      assert.ok(!sameSpot, `${a.name} overlaps ${b.name}`);
    }
  }
});

test('countdown holds the cars, then the race starts', () => {
  const race = new SC.Race(tracks[0], { seed: 2 });
  const z0 = race.player.z;
  for (let i = 0; i < 120 * 2; i++) race.update(1 / 120, { throttle: 1 });
  assert.equal(race.state, 'countdown');
  assert.equal(race.player.z, z0);
  for (let i = 0; i < 120 * 2; i++) race.update(1 / 120, { throttle: 1 });
  assert.equal(race.state, 'racing');
  assert.ok(race.player.z > z0);
});

for (const track of tracks) {
  test(`${track.name}: a clean driver finishes 3 laps with sane times`, () => {
    const { race, counts } = simulate(track, { laps: 3, difficulty: 'normal', seed: 7 });
    const p = race.player;
    assert.equal(race.state, 'finished');
    assert.equal(p.lapTimes.length, 3);
    for (const t of p.lapTimes) assert.ok(t > 20 && t < 90, `lap time ${t}`);
    const sum = p.lapTimes.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - p.finishTime) < 1e-6, 'lap times add up to race time');
    assert.ok(p.position >= 1 && p.position <= race.entities.length);
    assert.equal(counts.lap, 2);
    assert.equal(counts.finish, 1);
    const rows = race.results();
    assert.equal(rows.length, race.entities.length);
    rows.forEach((r, i) => {
      assert.equal(r.position, i + 1);
      assert.ok(Number.isFinite(r.time));
      if (i) assert.ok(r.time >= rows[i - 1].time);
    });
  });
}

test('the same seed and inputs replay identically', () => {
  const a = simulate(tracks[1], { laps: 1, seed: 99 }).race;
  const b = simulate(tracks[1], { laps: 1, seed: 99 }).race;
  assert.equal(a.player.finishTime, b.player.finishTime);
  assert.deepEqual(a.results().map((r) => r.name), b.results().map((r) => r.name));
});

test('difficulty matters: a slow driver places worse on hard than on easy', () => {
  // Never use nitro and cap speed at 85% to mimic a cautious driver.
  const slow = (race, dt) => {
    const i = race.autopilot(race.player, dt);
    if (race.player.speed > C.maxSpeed * 0.85) i.throttle = 0;
    i.nitro = false;
    return i;
  };
  const easy = simulate(tracks[1], { laps: 2, difficulty: 'easy', seed: 5 }, slow).race.player.position;
  const hard = simulate(tracks[1], { laps: 2, difficulty: 'hard', seed: 5 }, slow).race.player.position;
  assert.ok(hard > easy, `easy P${easy}, hard P${hard}`);
});

test('driving flat out into the scenery causes crashes and slows the car', () => {
  const race = new SC.Race(tracks[0], { seed: 3 });
  let crashes = 0;
  for (let i = 0; i < 120 * 20; i++) {
    race.update(1 / 120, { throttle: 1, steer: -1 });
    for (const e of race.events) if (e.type === 'crash') crashes++;
    race.events.length = 0;
    assert.ok(Number.isFinite(race.player.speed) && Number.isFinite(race.player.x));
  }
  assert.ok(crashes > 0, 'expected at least one crash');
  assert.ok(race.player.x >= -C.maxOffset && race.player.x <= C.maxOffset);
});

test('nitro raises top speed and drains, then recharges', () => {
  const race = new SC.Race(tracks[2], { seed: 4 });
  const drive = (nitro) => Object.assign(race.autopilot(race.player, 1 / 120), { throttle: 1, brake: 0, nitro });
  for (let i = 0; i < 120 * 12; i++) race.update(1 / 120, drive(false));
  race.player.nitro = 1;
  let peak = 0;
  for (let i = 0; i < 120 * 2; i++) {
    race.update(1 / 120, drive(true));
    peak = Math.max(peak, race.player.speed);
  }
  assert.ok(peak > C.maxSpeed, `boosted speed ${peak}`);
  assert.ok(race.player.nitro < 0.5);
  const before = race.player.nitro;
  for (let i = 0; i < 120; i++) race.update(1 / 120, drive(false));
  assert.ok(race.player.nitro > before);
});

/* ------------------------------------------------------------------ */
/* 3D centreline used by the WebGL world                               */
/* ------------------------------------------------------------------ */

for (const track of tracks) {
  test(`${track.name}: 3D centreline closes, never crosses itself and stays drivable`, () => {
    const line = SC.centerline.build(track);
    const kmFromSim = track.lengthKm;
    assert.ok(Math.abs(line.length / 1000 - kmFromSim) < 1e-6, 'world length matches the simulation');
    // closed loop: the last step lands back on the first point
    const step = Math.hypot(line.px[line.n] - line.px[line.n - 1], line.pz[line.n] - line.pz[line.n - 1]);
    assert.ok(step < line.segLen * 1.5, `closing step ${step}`);
    for (let i = 0; i <= line.n; i++) {
      for (const a of [line.px, line.py, line.pz, line.fx, line.fz]) assert.ok(Number.isFinite(a[i]));
      assert.ok(Math.abs(Math.hypot(line.fx[i], line.fz[i]) - 1) < 1e-9, 'unit tangent');
    }
    const far = SC.centerline.closestApproach(line, 150);
    assert.ok(far.distance > 60, `separate stretches of road come within ${far.distance.toFixed(1)} m`);
    let grade = 0;
    for (let i = 0; i < line.n; i++) grade = Math.max(grade, Math.abs(line.py[i + 1] - line.py[i]) / line.segLen);
    assert.ok(grade < 0.35, `steepest grade ${(grade * 100).toFixed(1)}%`);
  });
}

test('centreline sampling puts lateral offsets in metres across the road', () => {
  const line = SC.centerline.build(tracks[0]);
  const a = SC.centerline.sample(line, 12345, 0, {});
  const b = SC.centerline.sample(line, 12345, 1, {});
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - SC.WORLD_SCALE.lat) < 1e-6, 'x = 1 is one road half-width away');
  // the right-hand vector is perpendicular to the direction of travel
  assert.ok(Math.abs(a.fx * a.rx + a.fz * a.rz) < 1e-9);
  // wrapping: z and z + one lap give the same point
  const c = SC.centerline.sample(line, 12345 + tracks[0].length, 0, {});
  assert.ok(Math.hypot(c.x - a.x, c.z - a.z) < 1e-6);
});

/* ------------------------------------------------------------------ */
/* Car bodies                                                          */
/* ------------------------------------------------------------------ */

/** Highest point of a right-half-and-left ring above lateral position x (right side). */
function bodyTopAt(ringPts, x) {
  let best = -Infinity;
  for (let i = 0; i < ringPts.length - 1; i++) {
    const [x0, y0] = ringPts[i];
    const [x1, y1] = ringPts[i + 1];
    if (x0 >= 0 && x1 >= 0 && x0 !== x1 && (x - x0) * (x - x1) <= 0) best = Math.max(best, y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
  }
  return best;
}

for (const [id, st] of Object.entries(SC.CAR_STYLES)) {
  test(`car style ${id}: bodywork clears the wheels and wheel wells`, () => {
    const P = SC.carProfiles;
    const wellR = st.wheelR + 0.055 - 0.03;
    for (const [axle, track, tyre] of [[st.axleF, st.trackF, st.tyreF], [st.axleR, st.trackR, st.tyreR]]) {
      // the tyre fits inside the body's width with its arch flare
      const ring = P.ring(P.subdivide(P.bodyHalf(st, axle), 5));
      const maxX = Math.max(...ring.map(([x]) => x));
      assert.ok(track + tyre / 2 <= maxX + 0.02, `${id} tyre sticks out at z=${axle}`);
      for (const dz of [-0.2, -0.1, 0, 0.1, 0.2]) {
        const r = P.ring(P.subdivide(P.bodyHalf(st, axle + dz), 5));
        const wellTop = st.wheelR + Math.sqrt(Math.max(0, wellR * wellR - dz * dz));
        for (let x = track - 0.19; x <= track + 0.07; x += 0.01) {
          assert.ok(bodyTopAt(r, x) > wellTop, `${id}: well pokes through the bodywork at z=${(axle + dz).toFixed(2)}, x=${x.toFixed(2)}`);
        }
      }
    }
  });

  test(`car style ${id}: glasshouse sits on the body and lights fit the bodywork`, () => {
    const P = SC.carProfiles;
    const z0 = st.body[0][0];
    const z1 = st.body[st.body.length - 1][0];
    const c0 = st.cabin[0][0];
    const c1 = st.cabin[st.cabin.length - 1][0];
    assert.ok(c0 > z0 && c1 < z1, 'cabin within the body length');
    // both ends of the glasshouse start below the bodywork (no coplanar surfaces)
    for (const z of [c0, c1]) {
      const cab = P.cabinHalf(st, z);
      const roof = cab[cab.length - 1][1];
      const top = bodyTopAt(P.ring(P.subdivide(P.bodyHalf(st, z), 5)), 0.01);
      assert.ok(roof < top - 0.01, `${id}: cabin end at z=${z} is not buried (roof ${roof.toFixed(3)} vs body ${top.toFixed(3)})`);
    }
    assert.ok(st.hl.x1 <= 1 && st.hl.y1 > st.hl.y0 && st.hl.zMax < st.axleF, 'headlights at the front');
    assert.ok(st.tl.zMin > st.axleR && st.tl.barY[1] > st.tl.barY[0], 'tail lights at the back');
    assert.ok(st.win.zF < st.win.zB && st.win.zB < st.win.zC && st.win.zW < st.win.zR, 'window layout in order');
  });
}
