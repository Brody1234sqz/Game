/*
 * Sundown Circuit — tuning constants.
 * World units: the road is 2 * roadWidth wide, a segment is segmentLength long.
 * Lateral positions ("x") are in road half-widths: -1 and +1 are the road edges.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  const MAX_SPEED = 12000; // world units per second at full throttle, no boost

  const CONFIG = {
    // Road geometry
    segmentLength: 200,
    rumbleLength: 3,
    roadWidth: 2000,
    lanes: 3,

    // Player physics
    maxSpeed: MAX_SPEED,
    topSpeedKmh: 262, // what MAX_SPEED reads as on the speedometer
    accel: MAX_SPEED / 4.2,
    braking: -MAX_SPEED * 0.95,
    decel: -MAX_SPEED / 5,
    offRoadDecel: -MAX_SPEED / 1.6,
    offRoadLimit: MAX_SPEED / 4,
    centrifugal: 0.2,
    steerRate: 2.4,
    maxOffset: 2.6,

    // Nitro
    nitroBoost: 1.3, // top-speed multiplier while boosting
    nitroAccel: MAX_SPEED / 2,
    nitroDrain: 1 / 3, // a full tank lasts 3 seconds
    nitroRecharge: 1 / 28,
    nitroPerOvertake: 0.12,
    nitroMinStart: 0.08,

    // Cars
    carWidth: 760,
    carLength: 760, // ≈ 4.6 m: the 3D car's length, nose to tail
    rivals: 11,
    gridRowGap: 1400, // ≈ 8.5 m between grid rows
    countdown: 3,

    // Rival AI
    rivalSteer: 0.9,
    rivalAccel: MAX_SPEED / 4.5,
    rivalBrake: MAX_SPEED * 0.7,
    rubberBand: 0.05,
    lanesX: [-0.66, 0, 0.66],
    lookAhead: 4200, // how far ahead rivals watch for traffic (≈ 25 m)

    // Gearbox (top of each gear as a fraction of boosted top speed)
    gearTop: [0.2, 0.36, 0.52, 0.68, 0.84, 1.0],

    difficulties: {
      easy: { id: 'easy', label: 'Easy', min: 0.76, max: 0.9 },
      normal: { id: 'normal', label: 'Normal', min: 0.84, max: 0.97 },
      hard: { id: 'hard', label: 'Hard', min: 0.9, max: 1.0 },
    },

    drivers: [
      'Kestrel', 'Nomad', 'Bluefin', 'Ember', 'Juniper', 'Halcyon',
      'Rook', 'Sable', 'Tempest', 'Quill', 'Marlow',
    ],
  };

  CONFIG.metersPerUnit = CONFIG.topSpeedKmh / 3.6 / CONFIG.maxSpeed;
  CONFIG.carHalfWidth = CONFIG.carWidth / CONFIG.roadWidth; // car width in road half-widths

  /*
   * Scenery catalogue. `w` is world width; `hit` is the solid fraction of that width.
   * Anything with hit 0 can be driven through.
   */
  const SCENERY = {
    palm: { w: 1700, hit: 0.22 },
    pine: { w: 1400, hit: 0.3 },
    bush: { w: 1100, hit: 0.7 },
    rock: { w: 1000, hit: 0.75 },
    billboard: { w: 2800, hit: 0.85 },
    chevron: { w: 700, hit: 0.5 },
    lamp: { w: 1000, hit: 0.12 },
    building: { w: 4200, hit: 1 },
    stand: { w: 4400, hit: 1 },
    house: { w: 2600, hit: 0.9 },
    gantry: { w: 5600, hit: 0 },
  };

  SC.CONFIG = CONFIG;
  SC.SCENERY = SCENERY;
})();
