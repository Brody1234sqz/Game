# Sundown Circuit

A 3D arcade road racer that runs in any modern browser. It has three circuits, eleven AI rivals, nitro, lap records and a synthesized engine. The game is written in plain JavaScript on top of [three.js](https://threejs.org) (WebGL) and needs no build step.

Every model, texture and sound is generated in code: the cars, palms, pines, grandstands, city blocks, asphalt, kerbs, clouds and stars. The repository has no image, model or audio files.

## Play

Open `index.html` in a browser. three.js loads from the jsDelivr CDN, so the first load needs an internet connection. The page works straight from the file system or from any static web server:

```sh
npm start          # python3 -m http.server 8080, then open http://localhost:8080
```

### Controls

| Action   | Keyboard          | Gamepad           | Touch        |
| -------- | ----------------- | ----------------- | ------------ |
| Steer    | ← → or A D        | Left stick, d-pad | ◀ ▶ buttons  |
| Throttle | ↑ or W            | RT                | Gas          |
| Brake    | ↓ or S            | LT                | Brake        |
| Nitro    | Space or Shift    | A or RB           | Nitro        |
| Camera   | C                 | Y                 | Camera button |
| Pause    | Esc or P          | Start             | ❚❚ button    |
| Mute     | M                 |                   |              |

On the menu, Enter starts a race. The camera cycles between chase, close and hood views. The menu and results screens use a trackside TV-style camera.

### How a race works

- You start last on a 12-car grid behind the start line. The gantry lights count down 3–2–1, then it's GO.
- **Nitro** gives up to 30% more top speed. The tank refills slowly on its own and gets a boost every time you pass a car.
- **Bends** push you wide. Take the hard bends and hairpins flat out on nitro and you'll run onto the grass, which caps your speed. Trees, signs and buildings stop you dead.
- **Rivals** start in qualifying order (fastest at the front), change lanes to get past traffic, and slow down for hairpins. You can block them. The difficulty setting picks how fast they are.
- Lap and race records are saved per circuit in your browser.

### Circuits

| Circuit    | Length  | Setting |
| ---------- | ------- | ------- |
| Coastline  | 2.73 km | Golden hour by the sea. Palm-lined sweepers, beach huts, sea stacks offshore. |
| Pine Ridge | 2.31 km | Alpine noon. Steep climbs, blind crests, two hairpins, forests below snowy peaks. |
| Neon Night | 2.50 km | Midnight downtown. Lit office towers, neon signs and street lights that pool on the road. |

### Cars

There are three body styles: a mid-engine supercar (your car, in orange with white stripes), a front-engine GT and a muscle coupe. The rivals mix all three, with their own paint, wheel finishes, brake callipers and rear wings.

Each body is lofted from automotive cross-sections: flat sides with a shoulder crease, fender crests over the wheels, a hood that sits between them, and flared, cut-out wheel arches with dark wells. A custom paint shader draws the fine detail per pixel in the car's own coordinates, so it follows the bodywork exactly:
- LED headlight strips and projector lamps
- taillight bars (segmented on the muscle car)
- grilles with mesh, side intakes, engine-cover louvres and the muscle car's hood scoop
- door and hood shut lines, door handles and diffusers
- grime low on the sills

Further detail in the shader:
- chrome badges, amber side markers, parked wiper blades and a third brake light

Paint is clearcoat over a metallic flake layer. In Quality mode a cube camera rides with your car and re-captures its surroundings several times a second, so paint, glass, chrome and rims reflect the actual track: grandstands, palms, office windows, other cars. The windows are separate tinted glass with black seals and painted pillars. Through them you can see a helmeted driver with hands on the wheel, plus seats and a dashboard.

Each car also has a carbon front splitter, side skirts and diffuser fins.

The wheels are real geometry:
- tyres with tread grooves and raised sidewall lettering
- machined twin-spoke rims, dished towards the hub, with lug nuts and a centre cap
- cross-drilled brake discs, and rounded callipers that steer with the wheel but don't spin
- at speed the spokes smear into a blurred disc, the way they do on camera

Brake lights flare when a car slows, the body rolls in corners, pitches under braking and moves a little on its suspension, the exhaust pops on upshifts, and soft contact shadows ground every tyre. At night the headlights throw a pool of light on the road ahead.

Small parts (interior, driver, brakes, plates) live on their own render layer, so they're skipped by the reflection capture and the shadow pass and cost little.

### Graphics

- **Quality** (the default on desktop) renders at up to 2× pixel density with 4× MSAA, 4096 px sun shadows, live car reflections, speed blur and full scenery density.
- **Fast** (the default on phones and tablets) uses 1× density, 1024 px shadows, simpler car geometry, sky-only reflections and about half the background scenery.

Both modes scale the render resolution up and down to hold the frame rate.

The look comes from physically based materials (clearcoat car paint over metallic flake, tinted glass, chrome, asphalt with normal and roughness maps), a sky that scatters light by the sun's position and lights the scene with reflections, soft shadows from the sun, exponential fog, HDR bloom, ACES filmic tone mapping, and a colour grade, vignette and radial speed blur.

## Project layout

```
index.html        Page shell, menus, three.js import map and loader
css/style.css     Interface styles
js/util.js        Math, formatting, seeded RNG (pure)
js/config.js      Tuning constants: physics, AI, difficulty, scenery sizes
js/tracks.js      Track builder, the three circuit layouts, scenery placement, minimap outline
js/race.js        Simulation: player physics, rival AI, collisions, laps, standings, autopilot
js/centerline.js  Turns a track's bends and hills into a closed 3D centreline in metres (pure)
js/themes.js      Palettes per circuit
js/art.js         2D artwork: billboard designs and menu thumbnails
js/textures.js    Procedural PBR textures, plus the noise functions the terrain uses
js/models.js      Procedural 3D scenery models and geometry helpers
js/cars.js        The cars: body styles, lofted bodywork, paint and glass shaders, wheels
js/world.js       WebGL world: road, terrain, sea, sky, lighting, cameras, post-processing
js/hud.js         Heads-up display on a 2D overlay canvas
js/audio.js       Web Audio engine, tyre, wind and effect sounds
js/input.js       Keyboard, touch and gamepad input
js/main.js        App controller: screens, settings, records, loading, frame loop
tests/            Headless Node tests for the simulation and the 3D geometry
```

The simulation files (`util`, `config`, `tracks`, `race`, `centerline`) and the car body profiles in `cars.js` never touch the DOM or WebGL, so the tests can drive whole races and check car geometry in Node.

### How the world is built

The race runs on a loop of short road segments, each with a bend value and a height. `centerline.js` integrates the bends into headings, scaled so the lap turns exactly 360°, and spreads any small closing gap around the lap. The result is a real 3D path in metres. The scales match the physics: the road is 10.5 m wide (three 3.5 m lanes), a car is 2 m wide, and 262 km/h on the speedometer is 72.8 m/s past the scenery.

`world.js` lays the road, kerbs, verges and guardrails along that path. It shapes a terrain heightfield around it: flat beside the road, rising into hills or mountains or dropping to the sea further out. Every object the physics knows about (each tree, sign and grandstand you can crash into) is placed exactly where its hitbox is. Thousands more background objects are scattered beyond, drawn as instanced meshes in spatial chunks so off-screen ones are culled.

Each frame, the cars are posed from the simulation: position, heading, drift angle, body roll and pitch, wheel spin and steering. The sun's shadow box follows the player, snapped to shadow-map texels to avoid shimmer. At night a small pool of spotlights jumps to the street lamps nearest the player.

## Tests

```sh
npm test           # node --test, Node 18 or newer
```

The suite checks track integrity and closure, that no solid scenery stands on the tarmac, and the minimap outline. It drives full 3-lap races with the autopilot to check lap timing, results ordering and the finish. It also checks deterministic replays, difficulty, crashes and nitro. For the 3D centreline, it checks that the loop closes, never crosses itself, keeps grades drivable, and puts lateral offsets in metres. For the cars, it checks that the bodywork clears the wheels and wheel wells, that the tyres fit inside the arches, and that the glasshouse ends are buried in the body (no flickering coplanar surfaces).

## Tuning

Almost everything about how the game plays lives in `js/config.js`:

- `maxSpeed`, `accel`, `braking`, `centrifugal`, `steerRate`: how the car drives
- `nitroBoost`, `nitroDrain`, `nitroRecharge`, `nitroPerOvertake`: the boost economy
- `difficulties`: rival speed ranges for Easy, Normal and Hard
- `rubberBand`: how much rivals ease off when far ahead (or push when far behind)

Lighting, fog, bloom and colour grade per circuit are in the `LOOK` table at the top of `js/world.js`. Quality presets are in `QUALITY` next to it.

New circuits are a `layout(builder)` plus a `scenery(track, rnd)` function in `js/tracks.js`, a palette in `js/themes.js` and a `LOOK` entry in `js/world.js`.
