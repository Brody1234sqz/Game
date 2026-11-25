# Sundown Circuit

An arcade road racer that runs in any modern browser. Three circuits, eleven AI rivals, nitro, lap records, and a synthesized engine. It uses plain HTML5 Canvas and JavaScript with no dependencies and no build step. Every car, tree, billboard and skyline is drawn in code, so there are no image or audio files.

## Play

Open `index.html` in a browser. It works straight from the file system.

To serve it locally instead:

```sh
npm start          # python3 -m http.server 8080, then open http://localhost:8080
```

### Controls

| Action   | Keyboard              | Gamepad          | Touch        |
| -------- | --------------------- | ---------------- | ------------ |
| Steer    | ← → or A D            | Left stick, d-pad | ◀ ▶ buttons |
| Throttle | ↑ or W                | RT               | Gas          |
| Brake    | ↓ or S                | LT               | Brake        |
| Nitro    | Space or Shift        | A or RB          | Nitro        |
| Pause    | Esc or P              | Start            | ❚❚ button    |
| Mute     | M                     |                  |              |

On the menu, Enter starts a race.

### How a race works

- You start last on a 12-car grid behind the start line. The lights count down 3–2–1, then it's GO.
- **Nitro** gives up to 30% more top speed. The tank refills slowly on its own and gets a boost every time you pass a car.
- **Bends** push you wide. Take the hard bends and hairpins flat out with nitro and you will run onto the grass, which caps your speed. Trees, signs and buildings stop you dead.
- **Rivals** start in qualifying order (fastest at the front), change lanes to get past traffic, and slow down for hairpins. You can block them. The difficulty setting picks how fast they are.
- Lap and race records are saved per circuit in your browser.

### Circuits

| Circuit    | Length  | Character                                       |
| ---------- | ------- | ----------------------------------------------- |
| Coastline  | 2.73 km | Golden hour. Fast seaside sweepers and a chicane run. |
| Pine Ridge | 2.31 km | Alpine noon. Steep climbs, blind crests, two hairpins. |
| Neon Night | 2.50 km | Midnight downtown. Long straights under street lamps. |

## Project layout

```
index.html        Page shell, menus and overlays
css/style.css     Interface styles
js/util.js        Math, formatting, seeded RNG (pure)
js/config.js      All tuning constants: physics, AI, difficulty, scenery sizes
js/tracks.js      Track builder, the three circuit layouts, scenery placement, minimap outline
js/race.js        Simulation: player physics, rival AI, collisions, laps, standings, autopilot
js/themes.js      Colour palettes per circuit
js/art.js         Procedural art: cars, scenery, parallax backgrounds, menu thumbnails
js/renderer.js    Pseudo-3D road renderer and the HUD
js/audio.js       Web Audio engine, tyre, wind and effect sounds
js/input.js       Keyboard, touch and gamepad input
js/main.js        App controller: screens, settings, records, frame loop
tests/            Headless Node tests for the simulation
```

The simulation files (`util`, `config`, `tracks`, `race`) never touch the DOM, so the tests can drive whole races in Node.

### Rendering in brief

The road is a loop of short segments. Each one stores a curve value and a height. Every frame the renderer projects about 300 segments ahead of the camera, accumulating curve into a sideways offset so the road bends. It paints them back to front so nearer road covers farther road, then draws scenery and cars back to front, clipped behind hill crests. Fog blends distant colours into the horizon. The simulation runs in fixed 1/120 s steps regardless of the display's refresh rate.

## Tests

```sh
npm test           # node --test, Node 18 or newer
```

The suite checks that every circuit closes seamlessly (height and curve), that no solid scenery stands on the tarmac, and that the minimap outline closes. It drives full 3-lap races with the autopilot to check lap timing, results ordering and the finish. It also checks deterministic replays, that harder rivals beat a cautious driver more often, crash handling, and nitro behaviour.

## Tuning

Almost everything lives in `js/config.js`:

- `maxSpeed`, `accel`, `braking`, `centrifugal`, `steerRate`: how the car drives
- `nitroBoost`, `nitroDrain`, `nitroRecharge`, `nitroPerOvertake`: the boost economy
- `difficulties`: rival speed ranges for Easy, Normal and Hard
- `rubberBand`: how much rivals ease off when far ahead (or push when far behind)

New circuits are a `layout(builder)` plus a `scenery(track, rnd)` function in `js/tracks.js`, and a palette in `js/themes.js`.
