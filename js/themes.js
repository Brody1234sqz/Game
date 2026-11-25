/*
 * Sundown Circuit — colour palettes for each circuit's time of day.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  SC.THEMES = {
    coast: {
      label: 'Golden hour',
      sky: [
        [0, '#2b1748'],
        [0.45, '#8a3470'],
        [0.8, '#ff7a5c'],
        [1, '#ffc07a'],
      ],
      fog: '#f6a978',
      ground: '#6d8a3c',
      light: { road: '#5f5866', grass: '#7a9a45', rumble: '#f3ece2', lane: '#f3ece2', edge: '#f3ece2' },
      dark: { road: '#5a5361', grass: '#6d8a3c', rumble: '#d2473d', lane: null, edge: '#f3ece2' },
      lit: null,
      accent: '#ff7a3d',
      dust: '#e3c99a',
      night: false,
    },
    ridge: {
      label: 'Alpine noon',
      sky: [
        [0, '#245ea8'],
        [0.55, '#5c98d6'],
        [0.9, '#a9cdee'],
        [1, '#dcebf7'],
      ],
      fog: '#d3e3ef',
      ground: '#37703a',
      light: { road: '#6b6f75', grass: '#417f3d', rumble: '#f4f4f2', lane: '#f4f4f2', edge: '#f4f4f2' },
      dark: { road: '#666a70', grass: '#37703a', rumble: '#c8352c', lane: null, edge: '#f4f4f2' },
      lit: null,
      accent: '#2f7fd8',
      dust: '#c4b39a',
      night: false,
    },
    neon: {
      label: 'Midnight',
      sky: [
        [0, '#04030b'],
        [0.5, '#110a29'],
        [0.85, '#2a1450'],
        [1, '#48206a'],
      ],
      fog: '#2b1747',
      ground: '#100d19',
      light: { road: '#28242f', grass: '#14111d', rumble: '#ff3d9a', lane: '#46e0ff', edge: '#8a7fa6' },
      dark: { road: '#2b2733', grass: '#110f19', rumble: '#221e2c', lane: null, edge: '#8a7fa6' },
      lit: { road: '#3d3540', grass: '#1d1824', rumble: '#ff5aac', lane: '#7aeaff', edge: '#c7b9d8' },
      accent: '#ff3d9a',
      dust: '#7b7289',
      night: true,
    },
  };
})();
