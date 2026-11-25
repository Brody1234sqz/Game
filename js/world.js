/*
 * Sundown Circuit — the WebGL world.
 *
 * Builds a real 3D version of each circuit from the simulation's track data:
 * a road mesh laid along the centreline, kerbs and verges, a terrain heightfield
 * shaped around the road, sea, sky and clouds, instanced scenery and dense
 * background dressing. Each frame it poses the cars from the race state, flies
 * the camera, moves the sun's shadow box with the player and renders through
 * HDR bloom, a speed-blur/vignette pass and ACES tone mapping.
 */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});

  (SC.threeInit = SC.threeInit || []).push(function (THREE) {
    const { Sky, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass } = THREE.addons;
    const C = SC.CONFIG;
    const U = SC.util;
    const CL = SC.centerline;
    const SCALE = SC.WORLD_SCALE;
    const NZ = SC.noise;
    const M = SC.models;

    const smooth = (a, b, x) => {
      const t = U.clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
    const dampAngle = (a, b, k, dt) => {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * (1 - Math.exp(-k * dt));
    };

    /* ---------------------------------------------------------------- */
    /* Presets                                                          */
    /* ---------------------------------------------------------------- */

    const QUALITY = {
      quality: { maxRatio: 2, minRatio: 0.65, msaa: 4, shadow: 4096, shadowRange: 60, blur: true, dressing: 1, reflections: true },
      performance: { maxRatio: 1, minRatio: 0.55, msaa: 0, shadow: 1024, shadowRange: 45, blur: false, dressing: 0.45, reflections: false },
    };

    /** Lighting, atmosphere and ground for each circuit. */
    const LOOK = {
      coast: {
        sun: [12, 212],
        sky: { turbidity: 8, rayleigh: 3, mieCoefficient: 0.006, mieDirectionalG: 0.9 },
        exposure: 0.6,
        sunColor: 0xffc08e,
        sunIntensity: 4.4,
        hemi: [0xffc8a8, 0x4a3a2a, 0.55],
        fog: 0xe9a985,
        fogDensity: 0.0012,
        bloom: [0.32, 0.55, 2.6],
        grade: { tint: [1.07, 1.0, 0.9], saturation: 1.12 },
        clouds: { warm: true, color: 0xffb08c, opacity: 0.9 },
        verge: 'grass',
        water: true,
        rails: true,
        colors: { grass: 0x5d7c33, dry: 0x8e8c4c, sand: 0xd8bf8c, rock: 0x7f6d5e },
        road: { tint: 0xffffff, roughness: 1 },
        margin: 950,
      },
      ridge: {
        sun: [46, 150],
        sky: { turbidity: 2.4, rayleigh: 1.2, mieCoefficient: 0.004, mieDirectionalG: 0.82 },
        exposure: 0.6,
        sunColor: 0xfff2e2,
        sunIntensity: 4.2,
        hemi: [0xbcd6ff, 0x3a4a2a, 0.75],
        fog: 0xb9cfe3,
        fogDensity: 0.00085,
        bloom: [0.16, 0.45, 3.2],
        grade: { tint: [1.0, 1.0, 1.02], saturation: 1.1 },
        clouds: { warm: false, color: 0xffffff, opacity: 0.95 },
        verge: 'grass',
        water: false,
        rails: true,
        colors: { grass: 0x41692d, dry: 0x6e7b3b, rock: 0x857f78, snow: 0xeef3f7 },
        road: { tint: 0xffffff, roughness: 1 },
        margin: 1050,
      },
      neon: {
        night: true,
        sun: [34, 140],
        exposure: 0.85,
        sunColor: 0x8ea6ff,
        sunIntensity: 0.3,
        hemi: [0x3e3070, 0x0c0a12, 0.45],
        fog: 0x120c22,
        fogDensity: 0.0015,
        bloom: [0.55, 0.5, 1.4],
        grade: { tint: [1.0, 0.96, 1.06], saturation: 1.15 },
        clouds: null,
        verge: 'sidewalk',
        water: false,
        rails: false,
        colors: { ground: 0x2a2830 },
        road: { tint: 0xb4aebd, roughness: 0.62 },
        margin: 700,
      },
    };

    /** Cross-section beside the road: [lateral metres, height offset]. */
    const PROFILE = {
      grass: [[6.15, 0], [10, -0.25], [15, -0.75], [24, -1.9]],
      sidewalk: [[6.15, 0], [6.2, 0.16], [16, 0.16], [16.05, -0.25]],
    };
    const NEAR_DROP = { grass: 1.4, sidewalk: 0.25 };

    function profileDy(profile, a) {
      if (a <= profile[0][0]) return 0;
      for (let k = 1; k < profile.length; k++) {
        const [x1, y1] = profile[k];
        const [x0, y0] = profile[k - 1];
        if (a <= x1) return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0);
      }
      return profile[profile.length - 1][1];
    }

    const FX_SHADER = {
      uniforms: {
        tDiffuse: { value: null },
        uBlur: { value: 0 },
        uVignette: { value: 0.32 },
        uTime: { value: 0 },
        uGrain: { value: 0.035 },
        uCenter: { value: new THREE.Vector2(0.5, 0.54) },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uSaturation: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uBlur, uVignette, uTime, uGrain;
        uniform vec2 uCenter;
        uniform vec3 uTint;
        uniform float uSaturation;
        varying vec2 vUv;
        float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 dir = vUv - uCenter;
          vec4 col = texture2D(tDiffuse, vUv);
          if (uBlur > 0.0005) {
            float k = uBlur * smoothstep(0.1, 0.65, length(dir));
            vec4 acc = col;
            for (int i = 1; i < 8; i++) acc += texture2D(tDiffuse, vUv - dir * k * float(i) / 7.0);
            col = acc / 8.0;
          }
          col.rgb *= uTint;
          float luma = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
          col.rgb = max(vec3(0.0), mix(vec3(luma), col.rgb, uSaturation));
          float v = smoothstep(1.05, 0.28, length(dir * vec2(1.15, 1.0)));
          col.rgb *= mix(1.0 - uVignette, 1.0, v);
          col.rgb *= 1.0 + (rand(vUv * 731.0 + uTime) - 0.5) * uGrain;
          gl_FragColor = col;
        }`,
    };

    /* ---------------------------------------------------------------- */
    /* Instanced batches                                                */
    /* ---------------------------------------------------------------- */

    class Batcher {
      constructor() {
        this.map = new Map();
      }

      add(key, parts, matrix, chunk) {
        const k = key + '|' + chunk;
        let b = this.map.get(k);
        if (!b) {
          b = { parts, mats: [] };
          this.map.set(k, b);
        }
        b.mats.push(matrix.clone());
      }

      build(group, resolve, shadows) {
        for (const b of this.map.values()) {
          for (const part of b.parts) {
            const im = new THREE.InstancedMesh(part.geometry, resolve(part.material), b.mats.length);
            b.mats.forEach((m, i) => im.setMatrixAt(i, m));
            im.instanceMatrix.needsUpdate = true;
            im.castShadow = !!part.cast && shadows;
            im.receiveShadow = true;
            im.computeBoundingSphere();
            group.add(im);
          }
        }
      }
    }

    /* ---------------------------------------------------------------- */
    /* World                                                            */
    /* ---------------------------------------------------------------- */

    class World {
      constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.qualityName = QUALITY[opts.quality] ? opts.quality : 'quality';
        this.q = QUALITY[this.qualityName];
        const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer = r;
        this.tex = SC.textures.create(r);
        this.scenery = M.createScenery(this.tex);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, 1, 0.25, 6000);
        this.camera.layers.enable(SC.cars.DETAIL_LAYER); // the player sees every car detail
        this.pmrem = new THREE.PMREMGenerator(r);
        this.envs = new Map();
        this.tracks = new Map();
        this.current = null;
        this.time = 0;
        this.w = 1;
        this.h = 1;
        this.ratio = 1;
        this.ft = 1 / 60;
        this.adaptTimer = 0;
        this.tmp = {};
        this.tmp2 = {};
        this.cam = { mode: 'chase', init: false, yaw: 0, y: 0, fov: 60, tv: null };
        this.v1 = new THREE.Vector3();
        this.v2 = new THREE.Vector3();
        this.m4 = new THREE.Matrix4();
        this.setupLights();
        this.setupSky();
        this.setupPost();
        this.setupCars();
        this.setupParticles();
      }

      /* Setup --------------------------------------------------------- */

      setupLights() {
        const q = this.q;
        this.sun = new THREE.DirectionalLight(0xffffff, 3);
        this.sun.castShadow = true;
        const s = this.sun.shadow;
        s.mapSize.set(q.shadow, q.shadow);
        s.camera.near = 1;
        s.camera.far = 900;
        s.camera.left = -q.shadowRange;
        s.camera.right = q.shadowRange;
        s.camera.top = q.shadowRange;
        s.camera.bottom = -q.shadowRange;
        s.bias = -0.0003;
        s.normalBias = 0.06;
        this.sunDir = new THREE.Vector3(0, 1, 0);
        this.scene.add(this.sun, this.sun.target);
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        this.scene.add(this.hemi);

        // A pool of street-light spots that follow the player at night.
        this.lampLights = [];
        for (let i = 0; i < 8; i++) {
          const l = new THREE.SpotLight(0xffd29a, 0, 34, 1.05, 0.6, 1.7);
          l.visible = false;
          this.scene.add(l, l.target);
          this.lampLights.push(l);
        }
      }

      setupSky() {
        this.sky = new Sky();
        this.sky.scale.setScalar(4500);
        this.scene.add(this.sky);

        const stars = this.tex.stars();
        this.nightDome = new THREE.Mesh(
          new THREE.SphereGeometry(4400, 48, 24),
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: { tStars: { value: stars }, uTop: { value: new THREE.Color(0x02010a) }, uHorizon: { value: new THREE.Color(0x2a1446) } },
            vertexShader: 'varying vec3 vDir; varying vec2 vUv; void main() { vDir = normalize(position); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `
              uniform sampler2D tStars; uniform vec3 uTop, uHorizon;
              varying vec3 vDir; varying vec2 vUv;
              void main() {
                float h = clamp(vDir.y, 0.0, 1.0);
                vec3 col = mix(uHorizon, uTop, pow(h, 0.45));
                col += texture2D(tStars, vUv).rgb * smoothstep(0.02, 0.3, h) * 1.6;
                gl_FragColor = vec4(col, 1.0);
              }`,
          }),
        );
        this.nightDome.renderOrder = -2;
        this.scene.add(this.nightDome);

        this.moon = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ map: this.tex.moon(), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false }),
        );
        this.moon.scale.setScalar(560);
        this.moon.renderOrder = -1;
        this.scene.add(this.moon);

        this.clouds = new THREE.Mesh(
          new THREE.PlaneGeometry(9000, 9000),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false }),
        );
        this.clouds.rotation.x = -Math.PI / 2;
        this.clouds.position.y = 950;
        this.clouds.renderOrder = -1;
        this.scene.add(this.clouds);
      }

      setupPost() {
        const r = this.renderer;
        const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: this.q.msaa });
        this.composer = new EffectComposer(r, rt);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1);
        this.composer.addPass(this.bloom);
        this.fx = new ShaderPass(FX_SHADER);
        this.composer.addPass(this.fx);
        this.composer.addPass(new OutputPass());
      }

      setupCars() {
        const detail = this.qualityName === 'quality' ? 'high' : 'low';
        this.playerCar = new SC.cars.CarModel(this.tex, SC.art.PLAYER_COLOR[0], {
          style: 'super',
          detail,
          metallic: 0.3,
          stripes: true,
          flames: true,
          rim: 'gunmetal',
          caliper: 0xe0a800,
        });
        this.scene.add(this.playerCar.root);

        this.headlights = this.playerCar.headlightSpots.map(([x, y, z]) => {
          const l = new THREE.SpotLight(0xeef3ff, 0, 90, 0.42, 0.45, 1.4);
          l.position.set(x, y, z);
          l.target.position.set(x * 2.5, 0, -40);
          l.visible = false;
          this.playerCar.root.add(l, l.target);
          return l;
        });

        // A varied field: three body styles, wheel finishes, brake colours and helmets.
        const styles = ['gt', 'muscle', 'super'];
        const rims = ['silver', 'black', 'gunmetal', 'bronze'];
        const helmets = [0xf1f1ee, 0xe0a800, 0x1b4d96, 0xa50f17, 0x222327, 0x0f553a];
        const suits = [0x24262b, 0x5a0d12, 0x14284d, 0x2b2b30, 0x3d3f45];
        this.rivalCars = [];
        for (let i = 0; i < C.rivals; i++) {
          const ci = i % SC.art.CAR_COLORS.length;
          const car = new SC.cars.CarModel(this.tex, SC.art.CAR_COLORS[ci][0], {
            style: styles[i % styles.length],
            detail,
            metallic: SC.art.CAR_METALLIC[ci],
            rim: rims[i % rims.length],
            caliper: SC.cars.CALIPERS[(i * 7) % SC.cars.CALIPERS.length],
            wing: i % 2 === 0,
            helmet: helmets[i % helmets.length],
            suit: suits[(i * 3) % suits.length],
          });
          this.scene.add(car.root);
          this.rivalCars.push(car);
        }

        // Live reflections: a cube camera at the player's car captures the
        // surroundings a few times a second; every car reflects it.
        if (this.q.reflections) {
          this.cubeTarget = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
          this.cubeCam = new THREE.CubeCamera(0.4, 5200, this.cubeTarget);
          for (const car of [this.playerCar, ...this.rivalCars]) car.setEnv(this.cubeTarget.texture);
        }
        this.reflectFrame = 0;
        this.lastGear = 1;
      }

      /** Re-capture the reflection cube around the player's car. */
      updateReflections() {
        if (!this.cubeCam) return;
        if (this.reflectFrame++ % 4 !== 0) return;
        const car = this.playerCar.root;
        this.cubeCam.position.set(car.position.x, car.position.y + 1.0, car.position.z);
        this.cubeCam.updateMatrixWorld();
        car.visible = false;
        const shadows = this.renderer.shadowMap.autoUpdate;
        this.renderer.shadowMap.autoUpdate = false;
        this.cubeCam.update(this.renderer, this.scene);
        this.renderer.shadowMap.autoUpdate = shadows;
        car.visible = true;
        this.cubeTarget.texture.needsPMREMUpdate = true;
      }

      setupParticles() {
        this.particles = [];
        const tex = this.tex.puff();
        for (let i = 0; i < 70; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
          s.visible = false;
          s.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 1, alpha: 0.5 };
          this.scene.add(s);
          this.particles.push(s);
        }
        this.nextParticle = 0;
        this.dustColor = new THREE.Color();
        this.smokeColor = new THREE.Color(0xdedbe4);
      }

      /* Sizing -------------------------------------------------------- */

      resize(w, h) {
        this.w = Math.max(1, w);
        this.h = Math.max(1, h);
        this.maxRatio = Math.min(window.devicePixelRatio || 1, this.q.maxRatio);
        this.applyRatio(Math.min(this.ratio || this.maxRatio, this.maxRatio) || this.maxRatio);
        this.camera.aspect = this.w / this.h;
        this.camera.updateProjectionMatrix();
      }

      applyRatio(r) {
        const budget = 2560 * 1440;
        const cap = Math.sqrt(budget / (this.w * this.h));
        this.ratio = Math.max(0.4, Math.min(r, cap));
        this.renderer.setPixelRatio(this.ratio);
        this.renderer.setSize(this.w, this.h, false);
        this.composer.setPixelRatio(this.ratio);
        this.composer.setSize(this.w, this.h);
      }

      /** Lower or raise the render resolution to hold the frame rate. */
      adapt(frameDt) {
        if (!(frameDt > 0) || frameDt > 0.25) return;
        this.ft = this.ft * 0.94 + frameDt * 0.06;
        this.adaptTimer += frameDt;
        if (this.adaptTimer < 2) return;
        this.adaptTimer = 0;
        if (this.ft > 1 / 42 && this.ratio > this.q.minRatio) this.applyRatio(Math.max(this.q.minRatio, this.ratio * 0.85));
        else if (this.ft < 1 / 57 && this.ratio < this.maxRatio) this.applyRatio(Math.min(this.maxRatio, this.ratio * 1.1));
      }

      /* Track loading ------------------------------------------------- */

      setTrack(track) {
        let tw = this.tracks.get(track.id);
        if (!tw) {
          tw = this.buildTrack(track);
          this.tracks.set(track.id, tw);
        }
        if (this.current === tw) return;
        if (this.current) this.scene.remove(this.current.group);
        this.scene.add(tw.group);
        this.current = tw;
        this.applyLook(track.theme);
        this.cam.init = false;
        this.cam.tv = null;
      }

      hasTrack(id) {
        return this.tracks.has(id);
      }

      applyLook(themeId) {
        const look = LOOK[themeId];
        const r = this.renderer;
        r.toneMappingExposure = look.exposure;
        this.scene.fog = new THREE.FogExp2(look.fog, look.fogDensity);
        this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - look.sun[0]), THREE.MathUtils.degToRad(look.sun[1]));
        this.sun.color.set(look.sunColor);
        this.sun.intensity = look.sunIntensity;
        this.hemi.color.set(look.hemi[0]);
        this.hemi.groundColor.set(look.hemi[1]);
        this.hemi.intensity = look.hemi[2];

        const night = !!look.night;
        this.sky.visible = !night;
        if (!night) {
          const u = this.sky.material.uniforms;
          for (const k in look.sky) u[k].value = look.sky[k];
          u.sunPosition.value.copy(this.sunDir);
        }
        this.nightDome.visible = night;
        this.moon.visible = night;
        this.clouds.visible = !!look.clouds;
        if (look.clouds) {
          this.clouds.material.map = this.tex.clouds(look.clouds.warm);
          this.clouds.material.color.set(look.clouds.color);
          this.clouds.material.opacity = look.clouds.opacity;
          this.clouds.material.needsUpdate = true;
        }
        this.scene.environment = this.envFor(themeId, look);
        this.scene.background = null;
        this.fx.uniforms.uTint.value.fromArray(look.grade.tint);
        this.fx.uniforms.uSaturation.value = look.grade.saturation;
        this.bloom.strength = look.bloom[0];
        this.bloom.radius = look.bloom[1];
        this.bloom.threshold = look.bloom[2];
        for (const l of this.lampLights) l.visible = night;
        for (const l of this.headlights) {
          l.visible = night;
          l.intensity = night ? 45 : 0;
        }
        for (const car of [this.playerCar, ...this.rivalCars]) car.setNight(night);
      }

      envFor(themeId, look) {
        if (this.envs.has(themeId)) return this.envs.get(themeId);
        const scene = new THREE.Scene();
        if (look.night) {
          scene.add(
            new THREE.Mesh(
              new THREE.SphereGeometry(500, 32, 16),
              new THREE.ShaderMaterial({
                side: THREE.BackSide,
                vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                fragmentShader: 'varying vec3 vDir; void main() { float h = vDir.y; vec3 c = h > 0.0 ? mix(vec3(0.09,0.05,0.16), vec3(0.01,0.008,0.03), pow(h, 0.5)) : vec3(0.03,0.025,0.04); gl_FragColor = vec4(c, 1.0); }',
              }),
            ),
          );
          const rnd = U.rng(21);
          const palette = [0xff3d9a, 0x46e0ff, 0xffc070, 0xb26bff, 0xffffff];
          for (let i = 0; i < 40; i++) {
            const a = rnd() * Math.PI * 2;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(20 + rnd() * 40, 6 + rnd() * 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(palette[i % palette.length]).multiplyScalar(2 + rnd() * 3), side: THREE.DoubleSide }));
            m.position.set(Math.cos(a) * 300, 10 + rnd() * 90, Math.sin(a) * 300);
            m.lookAt(0, 30, 0);
            scene.add(m);
          }
        } else {
          const sky = new Sky();
          sky.scale.setScalar(1000);
          const u = sky.material.uniforms;
          for (const k in look.sky) u[k].value = look.sky[k];
          u.sunPosition.value.copy(this.sunDir);
          scene.add(sky);
          const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.colors.grass).multiplyScalar(0.35) }));
          ground.rotation.x = -Math.PI / 2;
          ground.position.y = -20;
          scene.add(ground);
        }
        const env = this.pmrem.fromScene(scene, 0, 0.1, 3000).texture;
        this.envs.set(themeId, env);
        return env;
      }

      /* ---------------------------------------------------------------- */
      /* Building a circuit                                               */
      /* ---------------------------------------------------------------- */

      buildTrack(track) {
        const look = LOOK[track.theme];
        const line = CL.build(track);
        const group = new THREE.Group();
        const ctx = { track, line, look, group, lamps: [], rnd: U.rng(track.def.seed * 7 + 3), lots: [] };
        ctx.profile = PROFILE[look.verge];
        this.indexRoad(ctx);
        this.buildRoad(ctx);
        this.buildTerrain(ctx);
        if (look.water) this.buildWater(ctx);
        if (look.rails) this.buildRails(ctx);
        this.buildStartMarks(ctx);
        this.placeScenery(ctx);
        this.dress(ctx);
        if (ctx.lots.length) this.buildCity(ctx);
        return { group, line, look, lamps: ctx.lamps, track, waterNormal: ctx.waterNormal, heightAt: ctx.heightAt };
      }

      /** Spatial index of centreline points for distance-to-road queries. */
      indexRoad(ctx) {
        const { line } = ctx;
        const B = 30;
        const bins = new Map();
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < line.n; i++) {
          const x = line.px[i];
          const z = line.pz[i];
          const key = Math.floor(x / B) * 100003 + Math.floor(z / B);
          let list = bins.get(key);
          if (!list) bins.set(key, (list = []));
          list.push(i);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
          minY = Math.min(minY, line.py[i]);
          maxY = Math.max(maxY, line.py[i]);
        }
        ctx.bounds = { minX, maxX, minZ, maxZ, minY, maxY };
        const res = { d: 0, y: 0, i: 0 };
        // Nearest centreline point within ~120 m (d = Infinity if none).
        ctx.nearest = (x, z) => {
          const bx = Math.floor(x / B);
          const bz = Math.floor(z / B);
          let best = Infinity;
          let bi = -1;
          for (let ring = 0; ring <= 4; ring++) {
            if (best < (ring - 1) * B) break;
            for (let dx = -ring; dx <= ring; dx++) {
              for (let dz = -ring; dz <= ring; dz++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                const list = bins.get((bx + dx) * 100003 + (bz + dz));
                if (!list) continue;
                for (const i of list) {
                  const d = (line.px[i] - x) ** 2 + (line.pz[i] - z) ** 2;
                  if (d < best) {
                    best = d;
                    bi = i;
                  }
                }
              }
            }
          }
          res.d = Math.sqrt(best);
          res.i = bi;
          res.y = bi >= 0 ? line.py[bi] : 0;
          return res;
        };
        // Smooth far-field road height (inverse-distance weighted).
        const G = 48;
        const span = { x0: minX - 2000, z0: minZ - 2000, sx: maxX - minX + 4000, sz: maxZ - minZ + 4000 };
        const grid = new Float32Array((G + 1) * (G + 1));
        for (let gz = 0; gz <= G; gz++) {
          for (let gx = 0; gx <= G; gx++) {
            const x = span.x0 + (gx / G) * span.sx;
            const z = span.z0 + (gz / G) * span.sz;
            let sw = 0;
            let sy = 0;
            for (let i = 0; i < line.n; i += 8) {
              const w = 1 / ((line.px[i] - x) ** 2 + (line.pz[i] - z) ** 2 + 900);
              sw += w;
              sy += w * line.py[i];
            }
            grid[gz * (G + 1) + gx] = sy / sw;
          }
        }
        ctx.baseY = (x, z) => {
          const fx = U.clamp(((x - span.x0) / span.sx) * G, 0, G - 1e-6);
          const fz = U.clamp(((z - span.z0) / span.sz) * G, 0, G - 1e-6);
          const ix = Math.floor(fx);
          const iz = Math.floor(fz);
          const tx = fx - ix;
          const tz = fz - iz;
          const a = grid[iz * (G + 1) + ix];
          const b = grid[iz * (G + 1) + ix + 1];
          const c = grid[(iz + 1) * (G + 1) + ix];
          const d = grid[(iz + 1) * (G + 1) + ix + 1];
          return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
        };
      }

      /**
       * A strip laid along the centreline. cols: [{ lat, dy, u }]; rows are
       * segment indices (may wrap). Built in chunks so off-screen parts cull.
       */
      ribbon(ctx, cols, opts) {
        const { line } = ctx;
        const rows = opts.rows || Array.from({ length: line.n + 1 }, (_, i) => i);
        const meshes = [];
        const CH = 96;
        for (let r0 = 0; r0 < rows.length - 1; r0 += CH) {
          const part = rows.slice(r0, Math.min(rows.length, r0 + CH + 1));
          const pos = [];
          const uv = [];
          const col = opts.color ? [] : null;
          const idx = [];
          for (let k = 0; k < part.length; k++) {
            const raw = part[k];
            const i = raw % line.n;
            const iv = raw;
            for (const c of cols) {
              const x = line.px[i] + line.rx[i] * c.lat;
              const z = line.pz[i] + line.rz[i] * c.lat;
              const y = line.py[i] + c.dy;
              pos.push(x, y, z);
              if (opts.worldUV) uv.push(x / opts.worldUV, z / opts.worldUV);
              else uv.push(c.u, (iv * line.segLen) / opts.vLen);
              if (col) {
                const cc = opts.color(i, c, x, z);
                col.push(cc.r, cc.g, cc.b);
              }
            }
          }
          const nc = cols.length;
          for (let k = 0; k < part.length - 1; k++) {
            for (let j = 0; j < nc - 1; j++) {
              const a = k * nc + j;
              const b = a + 1;
              const c = a + nc;
              const d = c + 1;
              if (opts.flip) idx.push(a, c, b, b, c, d);
              else idx.push(a, b, c, b, d, c);
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
          g.setIndex(idx);
          g.computeVertexNormals();
          const mesh = new THREE.Mesh(g, opts.material);
          mesh.receiveShadow = true;
          mesh.castShadow = !!opts.cast;
          ctx.group.add(mesh);
          meshes.push(mesh);
        }
        return meshes;
      }

      buildRoad(ctx) {
        const { look, profile } = ctx;
        const asphalt = this.tex.asphalt();
        const roadMat = new THREE.MeshStandardMaterial({
          map: asphalt.map,
          normalMap: asphalt.normalMap,
          roughnessMap: asphalt.roughnessMap,
          roughness: look.road.roughness,
          color: look.road.tint,
          vertexColors: true,
          normalScale: new THREE.Vector2(0.8, 0.8),
        });
        const patch = new THREE.Color();
        this.ribbon(ctx, [{ lat: -5.25, dy: 0, u: 0 }, { lat: 5.25, dy: 0, u: 1 }], {
          material: roadMat,
          vLen: 12,
          color: (i, c, x, z) => {
            const n = NZ.fbm(x / 40, z / 40, 17, 3);
            return patch.setScalar(0.86 + n * 0.28);
          },
        });

        const kerb = this.tex.kerb();
        const kerbMat = new THREE.MeshStandardMaterial({ map: kerb.map, normalMap: kerb.normalMap, roughness: 0.62 });
        if (look.verge === 'grass') {
          this.ribbon(ctx, [{ lat: -6.15, dy: 0.005, u: 0 }, { lat: -5.6, dy: 0.05, u: 0.6 }, { lat: -5.25, dy: 0.012, u: 1 }], { material: kerbMat, vLen: 2 });
          this.ribbon(ctx, [{ lat: 5.25, dy: 0.012, u: 1 }, { lat: 5.6, dy: 0.05, u: 0.6 }, { lat: 6.15, dy: 0.005, u: 0 }], { material: kerbMat, vLen: 2 });
        } else {
          // gutter strip
          this.ribbon(ctx, [{ lat: -6.15, dy: 0.0, u: 0 }, { lat: -5.25, dy: 0.0, u: 1 }], { material: roadMat, vLen: 12 });
          this.ribbon(ctx, [{ lat: 5.25, dy: 0.0, u: 0 }, { lat: 6.15, dy: 0.0, u: 1 }], { material: roadMat, vLen: 12 });
        }

        // Verges: mown grass bands, or raised pavements in the city.
        const left = profile.map(([lat, dy]) => ({ lat: -lat, dy })).reverse();
        const right = profile.map(([lat, dy]) => ({ lat, dy }));
        if (look.verge === 'grass') {
          const groundMat = this.groundMaterial(look);
          const c = new THREE.Color();
          const base = new THREE.Color(look.colors.grass);
          const verge = (i, col, x, z) => {
            const band = Math.floor((i * ctx.line.segLen) / 12) % 2 ? 1.07 : 0.95;
            const n = NZ.fbm(x / 30, z / 30, 5, 3);
            c.copy(base).multiplyScalar(band * (0.88 + n * 0.25));
            return c;
          };
          this.ribbon(ctx, left, { material: groundMat, worldUV: 6, color: verge });
          this.ribbon(ctx, right, { material: groundMat, worldUV: 6, color: verge });
        } else {
          const conc = this.tex.concrete();
          const paveMat = new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughness: 0.85, color: 0x8a8590 });
          this.ribbon(ctx, left, { material: paveMat, worldUV: 3 });
          this.ribbon(ctx, right, { material: paveMat, worldUV: 3 });
        }
      }

      groundMaterial(look) {
        const key = 'ground' + look.verge;
        if (!this[key]) {
          const t = look.verge === 'grass' ? this.tex.ground() : this.tex.concrete();
          this[key] = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true, roughness: 1 });
        }
        return this[key];
      }

      buildTerrain(ctx) {
        const { look, bounds, line } = ctx;
        const theme = ctx.track.theme;
        const margin = look.margin;
        const x0 = bounds.minX - margin;
        const z0 = bounds.minZ - margin;
        const sx = bounds.maxX - bounds.minX + margin * 2;
        const sz = bounds.maxZ - bounds.minZ + margin * 2;
        const cell = 9.5;
        const nx = Math.min(300, Math.ceil(sx / cell));
        const nz = Math.min(300, Math.ceil(sz / cell));
        const drop = NEAR_DROP[look.verge];
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cz = (bounds.minZ + bounds.maxZ) / 2;
        const water = bounds.minY - 3.5;
        ctx.waterLevel = water;
        // Sea lies beyond the circuit in this direction (coast only).
        const seaDir = new THREE.Vector2(0.8, -0.6).normalize();
        let seaEdge = -Infinity;
        for (let i = 0; i < line.n; i += 4) seaEdge = Math.max(seaEdge, (line.px[i] - cx) * seaDir.x + (line.pz[i] - cz) * seaDir.y);

        const natural = (x, z, d) => {
          if (theme === 'coast') {
            let h = (NZ.fbm(x / 240, z / 240, 101, 5) - 0.45) * 30;
            const s = (x - cx) * seaDir.x + (z - cz) * seaDir.y - seaEdge - 30;
            h -= smooth(-120, 260, s) * 46;
            return h;
          }
          if (theme === 'ridge') {
            const amp = 8 + smooth(60, 700, d) * 190;
            const ridged = 1 - Math.abs(2 * NZ.fbm(x / 420, z / 420, 202, 5) - 1);
            return (ridged - 0.3) * amp + (NZ.fbm(x / 60, z / 60, 203, 3) - 0.5) * 8;
          }
          return 0;
        };

        const heights = new Float32Array((nx + 1) * (nz + 1));
        const dists = new Float32Array((nx + 1) * (nz + 1));
        for (let iz = 0; iz <= nz; iz++) {
          for (let ix = 0; ix <= nx; ix++) {
            const x = x0 + (ix / nx) * sx;
            const z = z0 + (iz / nz) * sz;
            const nr = ctx.nearest(x, z);
            const far = ctx.baseY(x, z);
            const roadY = nr.d < 150 ? U.lerp(nr.y, far, smooth(40, 150, nr.d)) : far;
            const d = nr.d;
            const blend = smooth(26, 90, d);
            let h = roadY - drop + blend * natural(x, z, Math.min(d, 2000));
            if (ix === 0 || iz === 0 || ix === nx || iz === nz) h -= 60; // skirt
            heights[iz * (nx + 1) + ix] = h;
            dists[iz * (nx + 1) + ix] = Math.min(d, 9999);
          }
        }
        ctx.terrain = { x0, z0, sx, sz, nx, nz, heights, dists, water };
        ctx.heightAt = (x, z) => {
          const fx = U.clamp(((x - x0) / sx) * nx, 0, nx - 1e-6);
          const fz = U.clamp(((z - z0) / sz) * nz, 0, nz - 1e-6);
          const ix = Math.floor(fx);
          const iz = Math.floor(fz);
          const tx = fx - ix;
          const tz = fz - iz;
          const w = nx + 1;
          const a = heights[iz * w + ix];
          const b = heights[iz * w + ix + 1];
          const c = heights[(iz + 1) * w + ix];
          const d = heights[(iz + 1) * w + ix + 1];
          return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
        };

        const geo = new THREE.PlaneGeometry(sx, sz, nx, nz);
        geo.rotateX(-Math.PI / 2);
        geo.translate(x0 + sx / 2, 0, z0 + sz / 2);
        const pos = geo.getAttribute('position');
        const uv = geo.getAttribute('uv');
        // PlaneGeometry rows run from -z to +z after rotation; match our grid.
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const ix = Math.round(((x - x0) / sx) * nx);
          const iz = Math.round(((z - z0) / sz) * nz);
          pos.setY(i, heights[iz * (nx + 1) + ix]);
          uv.setXY(i, x / 6, z / 6);
        }
        geo.computeVertexNormals();
        const nor = geo.getAttribute('normal');
        const colors = new Float32Array(pos.count * 3);
        const c = new THREE.Color();
        const K = look.colors;
        const tone = (hex) => new THREE.Color(hex);
        const grass = tone(K.grass || K.ground);
        const dry = K.dry ? tone(K.dry) : grass;
        const rock = K.rock ? tone(K.rock) : grass;
        const sand = K.sand ? tone(K.sand) : null;
        const snow = K.snow ? tone(K.snow) : null;
        const treeLine = bounds.maxY + 55;
        const snowLine = bounds.maxY + 80;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          const ny = nor.getY(i);
          const n = NZ.fbm(x / 90, z / 90, 303, 3);
          const n2 = NZ.fbm(x / 18, z / 18, 304, 2);
          c.copy(grass).lerp(dry, U.clamp((n - 0.42) * 2.2, 0, 1));
          if (theme === 'neon') {
            c.copy(grass).multiplyScalar(0.8 + n2 * 0.4);
          } else {
            if (sand && y < water + 2.6) c.lerp(sand, smooth(water + 2.6, water + 1.2, y));
            const steep = smooth(0.86, 0.68, ny);
            if (theme === 'ridge') c.lerp(rock, Math.max(steep, smooth(treeLine - 10, treeLine + 30, y)));
            else c.lerp(rock, steep);
            if (snow && y > snowLine - 30) c.lerp(snow, smooth(snowLine - 30, snowLine + 25, y) * smooth(0.45, 0.7, ny + (n2 - 0.5) * 0.3));
            c.multiplyScalar(0.85 + n2 * 0.3);
          }
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        if (theme === 'neon' && !this.cityGround) {
          const t = this.tex.concrete();
          this.cityGround = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.9 });
        }
        const mesh = new THREE.Mesh(geo, theme === 'neon' ? this.cityGround : this.groundMaterial(look));
        mesh.receiveShadow = true;
        ctx.group.add(mesh);
      }

      buildWater(ctx) {
        const normal = this.tex.waterNormal().clone();
        normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
        normal.repeat.set(900, 900);
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a4560, roughness: 0.06, metalness: 0.15, normalMap: normal, normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 1.3 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = ctx.waterLevel;
        mesh.receiveShadow = true;
        ctx.group.add(mesh);
        ctx.waterNormal = normal;
      }

      buildRails(ctx) {
        const { line, track } = ctx;
        const start = track.startIndex;
        // Leave a gap around the start line for the grandstands.
        const seq = [];
        for (let k = start + 50; k <= start + line.n - 50; k++) seq.push(k);
        const lat = 14.8;
        const dy = profileDy(ctx.profile, lat);
        const steel = new THREE.MeshStandardMaterial({ color: 0xb7bcc4, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });
        for (const side of [-1, 1]) {
          const cols = [{ lat: side * lat, dy: dy + 0.48, u: 0 }, { lat: side * lat, dy: dy + 0.82, u: 1 }];
          this.ribbon(ctx, cols, { rows: seq, material: steel, vLen: 4, cast: true, flip: side < 0 });
        }
        // posts
        const batch = new Batcher();
        const parts = [{ geometry: M.place(new THREE.BoxGeometry(0.12, 0.9, 0.12), { y: 0.45 }), material: steel, cast: true }];
        const m = new THREE.Matrix4();
        for (let k = start + 50; k <= start + line.n - 50; k += 3) {
          const i = k % line.n;
          for (const side of [-1, 1]) {
            const x = line.px[i] + line.rx[i] * side * (lat + 0.08);
            const z = line.pz[i] + line.rz[i] * side * (lat + 0.08);
            m.makeTranslation(x, line.py[i] + dy, z);
            batch.add('post', parts, m, Math.floor(i / 150));
          }
        }
        batch.build(ctx.group, (mat) => mat, false);
      }

      buildStartMarks(ctx) {
        const { line, track } = ctx;
        const s = CL.sample(line, track.startZ, 0, {});
        const lineMat = new THREE.MeshStandardMaterial({ map: this.tex.startLine(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.3), lineMat);
        mesh.rotation.order = 'YXZ';
        mesh.rotation.set(-Math.PI / 2, -s.heading, 0);
        mesh.position.set(s.x, s.y + 0.012, s.z);
        mesh.receiveShadow = true;
        ctx.group.add(mesh);

        const boxMat = new THREE.MeshStandardMaterial({ map: this.tex.gridBox(), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
        const geo = new THREE.PlaneGeometry(2.6, 5.2);
        const fake = { track, moveEntity: SC.Race.prototype.moveEntity };
        for (let slot = 0; slot <= C.rivals; slot++) {
          const g = SC.Race.prototype.gridSlot.call(fake, slot);
          const p = CL.sample(line, g.z + 50, g.x, {}); // bracket just ahead of each car's nose
          const box = new THREE.Mesh(geo, boxMat);
          box.rotation.order = 'YXZ';
          box.rotation.set(-Math.PI / 2, -p.heading, 0);
          box.position.set(p.x, p.y + 0.012, p.z);
          box.receiveShadow = true;
          ctx.group.add(box);
        }
      }

      /** Ground height beside the road at segment i and lateral metres `lat`. */
      groundAt(ctx, i, lat, x, z) {
        const a = Math.abs(lat);
        const last = ctx.profile[ctx.profile.length - 1][0];
        if (a <= last) return ctx.line.py[i] + profileDy(ctx.profile, a);
        return ctx.heightAt(x, z);
      }

      /** The simulation's roadside objects, at the positions the physics uses. */
      placeScenery(ctx) {
        const { line, track, look, rnd } = ctx;
        const night = !!look.night;
        const theme = track.theme;
        const S = this.scenery;
        const accent = SC.THEMES[theme].accent;
        const designs = { coast: ['volta', 'orbit', 'event'], ridge: ['orbit', 'fuel', 'event'], neon: ['volta', 'orbit', 'event'] }[theme];
        const bushColors = theme === 'coast' ? [0x2f5a24, 0x6fa84a] : theme === 'ridge' ? [0x24451f, 0x5a8a45] : [0x14261b, 0x2f5a3f];
        const rockColors = theme === 'ridge' ? [0x5d5a58, 0xa4a6aa] : [0x6b5a4c, 0xb8a089];
        const batch = new Batcher();
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const p = new THREE.Vector3();
        const sc = new THREE.Vector3();
        const head = new THREE.Vector3();

        for (const seg of track.segments) {
          if (!seg.sprites.length) continue;
          const i = seg.index;
          const fx = line.fx[i];
          const fz = line.fz[i];
          for (const s of seg.sprites) {
            const lat = s.cx * SCALE.lat;
            const side = Math.sign(lat) || 0;
            const x = line.px[i] + line.rx[i] * lat;
            const z = line.pz[i] + line.rz[i] * lat;
            const y = this.groundAt(ctx, i, lat, x, z);
            let dirX = 0;
            let dirZ = 1;
            let scale = 1;
            let parts;
            switch (s.type) {
              case 'palm':
                parts = S.palm(s.variant % 3);
                scale = 0.85 + rnd() * 0.3;
                dirX = Math.cos(rnd() * 6.28);
                dirZ = Math.sin(rnd() * 6.28);
                break;
              case 'pine':
                parts = S.pine(s.variant % 3, theme === 'ridge' && s.variant !== 1);
                scale = 0.85 + rnd() * 0.4;
                dirX = Math.cos(rnd() * 6.28);
                dirZ = Math.sin(rnd() * 6.28);
                break;
              case 'bush':
                parts = S.bush(s.variant % 3, bushColors);
                scale = 0.8 + rnd() * 0.5;
                dirX = Math.cos(rnd() * 6.28);
                dirZ = Math.sin(rnd() * 6.28);
                break;
              case 'rock':
                parts = S.rock(s.variant % 2, rockColors);
                scale = 0.9 + rnd() * 0.6;
                dirX = Math.cos(rnd() * 6.28);
                dirZ = Math.sin(rnd() * 6.28);
                break;
              case 'billboard':
              case 'chevron':
                parts = s.type === 'billboard' ? S.billboard(designs[s.variant % 3], night) : S.chevron(s.variant === 0 ? 1 : -1, night);
                dirX = -fx - side * line.rx[i] * 0.35;
                dirZ = -fz - side * line.rz[i] * 0.35;
                break;
              case 'lamp':
                parts = S.lamp();
                dirX = -fx;
                dirZ = -fz;
                break;
              case 'gantry':
                parts = S.gantry(accent, night);
                dirX = -fx;
                dirZ = -fz;
                break;
              case 'stand':
                parts = S.stand(accent, night);
                dirX = -side * line.rx[i];
                dirZ = -side * line.rz[i];
                break;
              case 'house':
                parts = S.house(s.variant, theme === 'ridge');
                dirX = -side * line.rx[i];
                dirZ = -side * line.rz[i];
                break;
              case 'building': {
                const length = 12 + (s.variant % 3) * 3;
                const heights = [32, 46, 24, 60];
                ctx.lots.push({ x, z, w: length, d: s.w * SCALE.lat, h: heights[s.variant % 4] + rnd() * 10, yaw: Math.atan2(line.rx[i], line.rz[i]), y: y - 0.3, v: s.variant % 4, face: -side });
                continue;
              }
              default:
                continue;
            }
            q.setFromAxisAngle(up, Math.atan2(dirX, dirZ));
            p.set(x, y, z);
            sc.setScalar(scale);
            m.compose(p, q, sc);
            batch.add(s.type + s.variant, parts, m, Math.floor(i / 150));
            if (s.type === 'lamp') {
              for (const hx of [-1.65, 1.65]) {
                head.set(hx, 8.7, 0).applyMatrix4(m);
                ctx.lamps.push({ x: head.x, y: head.y, z: head.z, i, groundY: line.py[i] });
              }
            }
          }
        }
        this.startLightMat = this.startLightMat || new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 });
        batch.build(ctx.group, (mat) => (mat === 'startLights' ? this.startLightMat : mat), true);
      }

      /** Background props scattered over the landscape. */
      dress(ctx) {
        const { line, look, rnd, track } = ctx;
        const theme = track.theme;
        const dens = this.q.dressing;
        const S = this.scenery;
        const batch = new Batcher();
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const p = new THREE.Vector3();
        const sc = new THREE.Vector3();
        const T = ctx.terrain;
        const chunk = (x, z) => Math.floor(x / 350) * 1000 + Math.floor(z / 350);
        const put = (key, parts, x, z, scale, yaw, sink = 0.15) => {
          const y = ctx.heightAt(x, z) - sink * scale;
          q.setFromAxisAngle(up, yaw);
          p.set(x, y, z);
          sc.setScalar(scale);
          m.compose(p, q, sc);
          batch.add(key, parts, m, chunk(x, z));
        };
        const alongTrack = (minD, maxD, bias) => {
          const i = Math.floor(rnd() * line.n);
          const side = rnd() < 0.5 ? -1 : 1;
          const d = minD + Math.pow(rnd(), bias) * (maxD - minD);
          return { x: line.px[i] + line.rx[i] * side * d, z: line.pz[i] + line.rz[i] * side * d };
        };
        const anywhere = () => ({ x: T.x0 + 60 + rnd() * (T.sx - 120), z: T.z0 + 60 + rnd() * (T.sz - 120) });
        const clear = (x, z, minD) => ctx.nearest(x, z).d >= minD;

        if (theme === 'coast') {
          const bushColors = [0x2f5a24, 0x6fa84a];
          for (let k = 0; k < 520 * dens; k++) {
            const pt = alongTrack(24, 170, 1.6);
            if (!clear(pt.x, pt.z, 22) || ctx.heightAt(pt.x, pt.z) < T.water + 1.2) continue;
            put('palm' + (k % 3), S.palm(k % 3), pt.x, pt.z, 0.8 + rnd() * 0.45, rnd() * 6.28, 0.05);
          }
          for (let k = 0; k < 900 * dens; k++) {
            const pt = alongTrack(18, 320, 1.4);
            if (!clear(pt.x, pt.z, 17) || ctx.heightAt(pt.x, pt.z) < T.water + 0.8) continue;
            put('bush' + (k % 3), S.bush(k % 3, bushColors), pt.x, pt.z, 0.7 + rnd() * 0.9, rnd() * 6.28);
          }
          for (let k = 0; k < 200 * dens; k++) {
            const pt = alongTrack(22, 420, 1.2);
            if (!clear(pt.x, pt.z, 20)) continue;
            put('rock' + (k % 2), S.rock(k % 2, [0x6b5a4c, 0xb8a089]), pt.x, pt.z, 0.8 + rnd() * 1.6, rnd() * 6.28, 0.3);
          }
          for (let k = 0; k < 26; k++) {
            const pt = alongTrack(40, 170, 1);
            if (!clear(pt.x, pt.z, 36) || ctx.heightAt(pt.x, pt.z) < T.water + 2) continue;
            const nr = ctx.nearest(pt.x, pt.z);
            put('house' + (k % 3), S.house(k % 3, false), pt.x, pt.z, 1, Math.atan2(line.px[nr.i] - pt.x, line.pz[nr.i] - pt.z), 0.2);
          }
          // sea stacks
          let stacks = 0;
          for (let tries = 0; tries < 4000 && stacks < 14; tries++) {
            const pt = anywhere();
            if (ctx.heightAt(pt.x, pt.z) > T.water - 6) continue;
            stacks++;
            q.setFromAxisAngle(up, rnd() * 6.28);
            p.set(pt.x, T.water - 3, pt.z);
            const s = 8 + rnd() * 22;
            sc.set(s, s * (0.8 + rnd() * 1.2), s);
            m.compose(p, q, sc);
            batch.add('stack', S.rock(stacks % 2, [0x4d4038, 0x9c8a78]), m, chunk(pt.x, pt.z));
          }
        } else if (theme === 'ridge') {
          const treeLine = ctx.bounds.maxY + 55;
          const pines = (count, sampler, minD) => {
            for (let k = 0; k < count; k++) {
              const pt = sampler();
              if (!clear(pt.x, pt.z, minD)) continue;
              const h = ctx.heightAt(pt.x, pt.z);
              if (h > treeLine - rnd() * 40) continue;
              const v = k % 3;
              put('pine' + v, S.pine(v, h > ctx.bounds.maxY + 25 || v === 0), pt.x, pt.z, 0.75 + rnd() * 0.7, rnd() * 6.28, 0.1);
            }
          };
          pines(2600 * dens, () => alongTrack(22, 280, 1.5), 21);
          pines(2800 * dens, anywhere, 60);
          for (let k = 0; k < 420 * dens; k++) {
            const pt = rnd() < 0.5 ? alongTrack(20, 300, 1.3) : anywhere();
            if (!clear(pt.x, pt.z, 19)) continue;
            put('rock' + (k % 2), S.rock(k % 2, [0x5d5a58, 0xa4a6aa]), pt.x, pt.z, 0.8 + rnd() * 2.2, rnd() * 6.28, 0.35);
          }
          for (let k = 0; k < 12; k++) {
            const pt = alongTrack(45, 200, 1);
            if (!clear(pt.x, pt.z, 40)) continue;
            const nr = ctx.nearest(pt.x, pt.z);
            put('cabin' + (k % 2), S.house(k % 2, true), pt.x, pt.z, 1, Math.atan2(line.px[nr.i] - pt.x, line.pz[nr.i] - pt.z), 0.3);
          }
        } else {
          // City blocks on a grid around the circuit.
          const B = ctx.bounds;
          const spacing = 32;
          const cxm = (B.minX + B.maxX) / 2;
          const czm = (B.minZ + B.maxZ) / 2;
          for (let x = B.minX - 650; x < B.maxX + 650; x += spacing) {
            for (let z = B.minZ - 650; z < B.maxZ + 650; z += spacing) {
              if (rnd() > 0.82 * (dens > 0.6 ? 1 : 0.7)) continue;
              const w = 14 + rnd() * 12;
              const d = 14 + rnd() * 12;
              const bx = x + (rnd() - 0.5) * 4;
              const bz = z + (rnd() - 0.5) * 4;
              const reach = Math.hypot(w, d) / 2;
              if (!clear(bx, bz, 20 + reach)) continue;
              const nr = ctx.nearest(bx, bz);
              if (nr.d > 700) continue;
              const centre = 1 - U.clamp(Math.hypot(bx - cxm, bz - czm) / 900, 0, 1);
              const h = 14 + Math.pow(rnd(), 2) * (40 + centre * 110);
              ctx.lots.push({ x: bx, z: bz, w, d, h, yaw: 0, y: ctx.heightAt(bx, bz) - 0.5, v: Math.floor(rnd() * 4), near: nr.d < 80, toRoad: Math.atan2(line.px[nr.i] - bx, line.pz[nr.i] - bz) });
            }
          }
        }
        batch.build(ctx.group, (mat) => mat, true);
      }

      /** Merge all city buildings into a few big meshes with facade UVs in metres. */
      buildCity(ctx) {
        const rnd = ctx.rnd;
        const buckets = [0, 1, 2, 3].map(() => ({ pos: [], uv: [] }));
        const roof = { pos: [], uv: [] };
        const glow = { pos: [], uv: [] };
        const signs = new Map();
        const words = [['HOTEL', '#ff3d9a'], ['NOVA', '#46e0ff'], ['24/7', '#ffd23f'], ['ARCADE', '#b26bff'], ['NOODLES', '#ff7a3d'], ['CINEMA', '#7dffc4']];
        const quad = (arr, a, b, c, d, ua, ub, uc, ud) => {
          arr.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
          arr.uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
        };
        for (const L of ctx.lots) {
          const cos = Math.cos(L.yaw);
          const sin = Math.sin(L.yaw);
          const corner = (lx, lz) => [L.x + lx * cos + lz * sin, L.z - lx * sin + lz * cos];
          const hw = L.w / 2;
          const hd = L.d / 2;
          const ring = [corner(hw, -hd), corner(-hw, -hd), corner(-hw, hd), corner(hw, hd)];
          const y0 = L.y;
          const y1 = L.y + L.h;
          const b = buckets[L.v];
          const u0 = Math.floor(rnd() * 4) * 0.25;
          for (let k = 0; k < 4; k++) {
            const [ax, az] = ring[k];
            const [bx, bz] = ring[(k + 1) % 4];
            const len = Math.hypot(bx - ax, bz - az) / 12.8;
            const v1 = (y1 - y0) / 28;
            quad(b, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [u0, 0], [u0 + len, 0], [u0 + len, v1], [u0, v1]);
          }
          quad(roof, [ring[2][0], y1, ring[2][1]], [ring[3][0], y1, ring[3][1]], [ring[0][0], y1, ring[0][1]], [ring[1][0], y1, ring[1][1]], [0, 0], [1, 0], [1, 1], [0, 1]);
          if (rnd() < 0.35) {
            // red aircraft-warning light on the roof
            const s = 0.5;
            const x = L.x;
            const z = L.z;
            quad(glow, [x - s, y1 + 2, z], [x + s, y1 + 2, z], [x + s, y1 + 2 + s * 2, z], [x - s, y1 + 2 + s * 2, z], [0, 0], [1, 0], [1, 1], [0, 1]);
          }
          if ((L.near || L.face) && rnd() < 0.45) {
            const [word, color] = words[Math.floor(rnd() * words.length)];
            const yaw = L.face ? L.yaw + (L.face > 0 ? 0 : Math.PI) : L.toRoad;
            const fx = Math.sin(yaw);
            const fz = Math.cos(yaw);
            const reach = L.face ? hd : Math.max(hw, hd);
            const cx = L.x + fx * (reach + 0.3);
            const cz = L.z + fz * (reach + 0.3);
            const sw = Math.min(L.w, L.d) * 0.7;
            const sh = sw * 0.31;
            const sy = y0 + Math.min(L.h - sh - 2, 8 + rnd() * 10);
            const rx = Math.cos(yaw);
            const rz = -Math.sin(yaw);
            if (!signs.has(word)) signs.set(word, { color, pos: [], uv: [] });
            quad(signs.get(word), [cx - rx * sw / 2, sy, cz - rz * sw / 2], [cx + rx * sw / 2, sy, cz + rz * sw / 2], [cx + rx * sw / 2, sy + sh, cz + rz * sw / 2], [cx - rx * sw / 2, sy + sh, cz - rz * sw / 2], [0, 0], [1, 0], [1, 1], [0, 1]);
          }
        }
        const mesh = (arr, mat, cast) => {
          if (!arr.pos.length) return;
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
          g.computeVertexNormals();
          g.computeBoundingSphere();
          const me = new THREE.Mesh(g, mat);
          me.castShadow = cast;
          me.receiveShadow = true;
          ctx.group.add(me);
        };
        buckets.forEach((b, v) => {
          const f = this.tex.facade(v);
          mesh(b, new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.55, metalness: 0.2 }), true);
        });
        mesh(roof, new THREE.MeshStandardMaterial({ color: 0x18161d, roughness: 0.9 }), false);
        mesh(glow, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.4, 0.3), toneMapped: false, side: THREE.DoubleSide }), false);
        for (const [word, s] of signs) {
          mesh(s, new THREE.MeshBasicMaterial({ map: this.tex.neonSign(word, s.color), color: new THREE.Color(2.6, 2.6, 2.6), toneMapped: false, side: THREE.DoubleSide }), false);
        }
      }

      /* ---------------------------------------------------------------- */
      /* Per-frame                                                        */
      /* ---------------------------------------------------------------- */

      /** Pose one car from its simulation entity. */
      poseCar(model, e, dt, opts) {
        const tw = this.current;
        const s = CL.sample(tw.line, e.z, e.x, this.tmp);
        const v = e.speed * C.metersPerUnit;
        const st = model.state || (model.state = { x: e.x, yaw: 0, roll: 0, pitch: 0, speed: v });
        let lat = 0;
        if (dt > 0 && Math.abs(e.x - st.x) < 0.3) lat = ((e.x - st.x) * SCALE.lat) / dt;
        st.x = e.x;
        const seg = tw.track.findSegment(e.z);
        const sp = e.speed / C.maxSpeed;
        if (dt > 0) {
          st.yaw = damp(st.yaw, U.clamp(Math.atan2(lat, Math.max(v, 5)), -0.45, 0.45), 7, dt);
          const acc = (v - st.speed) / dt;
          st.speed = v;
          st.pitch = damp(st.pitch, U.clamp(acc * 0.0022, -0.035, 0.025), 5, dt);
          const rollTarget = U.clamp(seg.curve * sp * sp * 0.011 + (opts.steer || 0) * sp * 0.012, -0.06, 0.06);
          st.roll = damp(st.roll, rollTarget, 6, dt);
        }
        model.root.position.set(s.x, s.y, s.z);
        model.root.rotation.order = 'YXZ';
        model.root.rotation.set(Math.atan(s.slope), -(s.heading + st.yaw), 0);
        model.body.rotation.set(st.pitch, 0, st.roll);
        const steer = opts.steer != null ? opts.steer * 0.34 : U.clamp(seg.curve * 0.035 + st.yaw * 1.2, -0.4, 0.4);
        model.animate(dt, v, steer, !!e.braking, opts.nitro || 0);
        model.root.updateMatrixWorld(true);
        st.heading = s.heading;
        return s;
      }

      updateCars(race, dt) {
        const p = race.player;
        if (p.gear > this.lastGear && p.throttle > 0.5 && race.state === 'racing') this.playerCar.pop();
        this.lastGear = p.gear;
        this.poseCar(this.playerCar, p, dt, { steer: p.steer, nitro: p.nitroActive ? 1 : 0 });
        race.cars.forEach((car, i) => {
          const model = this.rivalCars[i];
          if (!model) return;
          if (model.colorIndex !== car.color) {
            model.colorIndex = car.color;
            const ci = car.color % SC.art.CAR_COLORS.length;
            model.setColor(SC.art.CAR_COLORS[ci][0]);
            model.paint.metalness = model.cabinMat.metalness = SC.art.CAR_METALLIC[ci];
          }
          this.poseCar(model, car, dt, {});
        });
      }

      updateCamera(race, dt, mode) {
        const cam = this.cam;
        const camera = this.camera;
        const p = race.player;
        const model = this.playerCar;
        const car = model.root.position;
        const sp = p.speed / C.maxSpeed;
        const carYaw = (model.state.heading || 0) + model.state.yaw * 0.55;
        if (mode !== cam.mode) {
          cam.mode = mode;
          cam.init = false;
          cam.tv = null;
        }
        const t = dt > 0 ? dt : 0;
        let fov = 60;

        if (mode === 'tv') {
          const L = this.current.track.length;
          const ahead = cam.tv ? U.loopDelta(p.z, cam.tv.z, L) * C.metersPerUnit : -999;
          if (!cam.tv || ahead < -28) cam.tv = this.pickTvSpot(p);
          camera.position.set(cam.tv.x, cam.tv.y, cam.tv.zz);
          this.v1.set(car.x, car.y + 0.8, car.z);
          camera.lookAt(this.v1);
          const dist = camera.position.distanceTo(this.v1);
          fov = U.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(7.5 / dist)), 9, 58);
        } else if (mode === 'hood') {
          this.v1.set(0, model.hoodCam[0], model.hoodCam[1]);
          model.root.localToWorld(this.v1);
          camera.position.copy(this.v1);
          this.v2.set(0, 0.85, -40);
          model.root.localToWorld(this.v2);
          camera.lookAt(this.v2);
          fov = 66 + sp * 8 + p.boostFx * 7;
        } else {
          const near = mode === 'near';
          const dist = (near ? 4.7 : 6.2) + sp * 0.9;
          const height = near ? 1.45 : 1.95;
          // Keep the camera above the road behind the car. Only the offset is
          // smoothed, so it never lags behind the car on steep climbs.
          const behind = CL.sample(this.current.line, p.z - dist / C.metersPerUnit, p.x, this.tmp2);
          const lift = height + Math.max(0, behind.y + 1.1 - (car.y + height));
          if (!cam.init) {
            cam.yaw = carYaw;
            cam.y = lift;
          }
          cam.yaw = dampAngle(cam.yaw, carYaw, 7, t);
          cam.y = damp(cam.y, lift, 6, t);
          const fx = Math.sin(cam.yaw);
          const fz = -Math.cos(cam.yaw);
          camera.position.set(car.x - fx * dist, car.y + cam.y, car.z - fz * dist);
          this.v1.set(car.x + fx * 6, car.y + (near ? 0.75 : 0.9), car.z + fz * 6);
          camera.lookAt(this.v1);
          fov = 58 + sp * 9 + p.boostFx * 8;
        }
        cam.init = true;
        if (race.shake > 0) {
          const k = race.shake * 0.22;
          camera.position.x += (Math.random() - 0.5) * k;
          camera.position.y += (Math.random() - 0.5) * k;
        }
        cam.fov = damp(cam.fov, fov, 6, t || 1);
        if (Math.abs(camera.fov - cam.fov) > 0.01) {
          camera.fov = cam.fov;
          camera.updateProjectionMatrix();
        }
      }

      /**
       * A trackside camera position ahead of the player, between the kerb and
       * the scenery, on a side of the road where nothing tall blocks the view.
       */
      pickTvSpot(p) {
        const tw = this.current;
        const r = Math.random;
        const night = !!tw.look.night;
        const segs = tw.track.segments;
        const n = segs.length;
        let best = null;
        for (let attempt = 0; attempt < 12; attempt++) {
          const metres = 60 + r() * 70;
          const latM = 7.2 + r() * 2.6;
          const z = p.z + metres / C.metersPerUnit;
          const i0 = Math.floor(z / C.segmentLength);
          // On a bend, stand on the inside: the warning boards line the outside.
          const curve = segs[((i0 % n) + n) % n].curve;
          const side = Math.abs(curve) > 1.5 && attempt < 8 ? Math.sign(curve) : r() < 0.5 ? -1 : 1;
          let blocked = false;
          for (let k = -30; k <= 4 && !blocked; k++) {
            for (const sp of segs[(((i0 + k) % n) + n) % n].sprites) {
              if (Math.sign(sp.cx) !== side) continue;
              const inner = (Math.abs(sp.cx) - sp.w / 2) * SCALE.lat;
              if (sp.type !== 'bush' && sp.type !== 'rock' && inner < latM + 3) blocked = true;
            }
          }
          const s = CL.sample(tw.line, z, (side * latM) / SCALE.lat, this.tmp2);
          const ground = s.y + profileDy(PROFILE[tw.look.verge], latM);
          best = { z, x: s.x, y: ground + (night ? 1.6 + r() * 2.4 : 1.4 + r() * 3.5), zz: s.z };
          if (!blocked) break;
        }
        return best;
      }

      updateLights(race) {
        const car = this.playerCar.root.position;
        // Shadow box follows the player, snapped to texels to stop shimmering.
        const d = this.sunDir;
        const range = this.q.shadowRange;
        const texel = (2 * range) / this.q.shadow;
        const right = this.v1.set(0, 1, 0).cross(d).normalize();
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
        const upv = this.v2.copy(d).cross(right).normalize();
        const a = Math.round(car.dot(right) / texel) * texel;
        const b = Math.round(car.dot(upv) / texel) * texel;
        const c = car.dot(d);
        const target = this.sun.target.position;
        target.set(0, 0, 0).addScaledVector(right, a).addScaledVector(upv, b).addScaledVector(d, c);
        this.sun.position.copy(target).addScaledVector(d, 400);
        this.sun.target.updateMatrixWorld();

        const tw = this.current;
        if (tw.look.night && tw.lamps.length) {
          const n = tw.line.n;
          const pi = Math.floor(race.player.z / C.segmentLength) % n;
          const cands = [];
          for (const L of tw.lamps) {
            let di = L.i - pi;
            if (di < -n / 2) di += n;
            if (di > n / 2) di -= n;
            const m = di * tw.line.segLen;
            if (m > -20 && m < 150) cands.push([Math.abs(m - 25), L, m]);
          }
          cands.sort((x, y) => x[0] - y[0]);
          this.lampLights.forEach((l, k) => {
            const c2 = cands[k];
            if (!c2) {
              l.intensity = 0;
              return;
            }
            const [, L, m] = c2;
            l.position.set(L.x, L.y - 0.2, L.z);
            l.target.position.set(L.x, L.groundY, L.z);
            l.target.updateMatrixWorld();
            l.intensity = 170 * smooth(150, 110, m) * smooth(-20, -8, m);
          });
        }

        // Start lights on the gantry
        if (this.startLightMat) {
          const m = this.startLightMat;
          if (race.state === 'countdown') {
            m.emissive.setHex(0xff2010);
            m.emissiveIntensity = 6;
          } else if (!race.demo && race.time < 3) {
            m.emissive.setHex(0x20ff60);
            m.emissiveIntensity = 6;
          } else m.emissiveIntensity = 0;
        }
      }

      updateParticles(race, dt) {
        const p = race.player;
        const sp = p.speed / C.maxSpeed;
        const dirt = p.offRoad && sp > 0.08;
        const rate = dirt ? 40 * Math.min(1, sp * 2) : p.skid > 0.3 ? 32 * p.skid : 0;
        if (rate > 0 && dt > 0) {
          const count = Math.floor(rate * dt + Math.random());
          const dust = this.dustColor.set(SC.THEMES[this.current.track.theme].dust);
          for (let k = 0; k < count; k++) {
            const s = this.particles[this.nextParticle];
            this.nextParticle = (this.nextParticle + 1) % this.particles.length;
            const wheel = this.playerCar.wheels[2 + (k % 2)].steer;
            wheel.getWorldPosition(s.position);
            s.position.y += 0.1;
            const u = s.userData;
            u.life = u.max = 0.7 + Math.random() * 0.5;
            u.vx = (Math.random() - 0.5) * 2;
            u.vy = 0.6 + Math.random() * 0.8;
            u.vz = (Math.random() - 0.5) * 2;
            u.size = 0.6;
            u.grow = 2.6 + Math.random() * 1.5;
            u.alpha = dirt ? 0.55 : 0.4;
            s.material.color.copy(dirt ? dust : this.smokeColor);
            s.visible = true;
          }
        }
        for (const s of this.particles) {
          if (!s.visible) continue;
          const u = s.userData;
          u.life -= dt;
          if (u.life <= 0) {
            s.visible = false;
            continue;
          }
          s.position.x += u.vx * dt;
          s.position.y += u.vy * dt;
          s.position.z += u.vz * dt;
          u.size += u.grow * dt;
          s.scale.setScalar(u.size);
          s.material.opacity = (u.life / u.max) * u.alpha;
        }
      }

      /**
       * Draw a frame. opts: { dt, frameDt, camera: 'chase'|'near'|'hood'|'tv' }
       */
      render(race, opts) {
        if (!this.current) return;
        const dt = opts.dt || 0;
        this.time += dt;
        this.updateCars(race, dt);
        this.updateCamera(race, dt, opts.camera || 'chase');
        this.updateLights(race);
        this.updateParticles(race, dt);

        const cp = this.camera.position;
        this.sky.position.copy(cp);
        this.nightDome.position.copy(cp);
        if (this.moon.visible) {
          this.moon.position.copy(cp).addScaledVector(this.sunDir, 3200);
          this.moon.lookAt(cp);
        }
        if (this.current.waterNormal) this.current.waterNormal.offset.set(this.time * 0.6, this.time * 0.35);
        this.updateReflections();

        const p = race.player;
        const sp = p.speed / C.maxSpeed;
        const chase = opts.camera !== 'tv';
        const u = this.fx.uniforms;
        u.uBlur.value = this.q.blur && chase ? U.clamp((sp - 0.7) * 0.05, 0, 0.016) + p.boostFx * 0.022 : 0;
        u.uTime.value = this.time % 100;
        this.composer.render(dt);
        this.adapt(opts.frameDt);
      }
    }

    SC.World = World;
    SC.WORLD_QUALITY = QUALITY;
  });
})();
