/*
 * Sundown Circuit — application controller.
 * Owns the screens (menu, race, pause, results), settings and records, boots
 * the 3D world once three.js has loaded, and runs the frame loop that feeds
 * input to the race and the race to the world, HUD and audio.
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.util;
  const C = SC.CONFIG;
  const $ = (sel) => document.querySelector(sel);

  /* ---------------------------------------------------------------- */
  /* Settings and records (localStorage may be unavailable)           */
  /* ---------------------------------------------------------------- */

  const STORE_KEY = 'sundown-circuit:v1';
  const VIEWS = ['chase', 'near', 'hood'];
  const VIEW_NAMES = { chase: 'Chase cam', near: 'Close cam', hood: 'Hood cam' };

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      return {};
    }
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const stored = loadStore();
  const settings = Object.assign(
    { track: 'coast', difficulty: 'normal', laps: 3, units: 'kmh', sound: true, graphics: coarse ? 'performance' : 'quality', view: 'chase' },
    stored.settings,
  );
  if (!SC.TRACK_DEFS.some((d) => d.id === settings.track)) settings.track = 'coast';
  if (!C.difficulties[settings.difficulty]) settings.difficulty = 'normal';
  if (![1, 3, 5].includes(settings.laps)) settings.laps = 3;
  if (settings.units !== 'mph') settings.units = 'kmh';
  if (settings.graphics !== 'performance') settings.graphics = 'quality';
  if (!VIEWS.includes(settings.view)) settings.view = 'chase';
  settings.sound = settings.sound !== false;
  const records = stored.records && typeof stored.records === 'object' ? stored.records : {};

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ settings, records }));
    } catch (err) {
      /* private mode or storage blocked: settings just won't persist */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Core objects                                                     */
  /* ---------------------------------------------------------------- */

  const app = $('#app');
  const hud = new SC.Hud($('#hud'));
  const audio = new SC.AudioFX();
  const input = new SC.Input();
  audio.setMuted(!settings.sound);
  let world = null;

  const els = {
    menu: $('#menu'),
    pause: $('#pause'),
    results: $('#results'),
    touch: $('#touch'),
    pauseBtn: $('#pause-btn'),
    viewBtn: $('#view-btn'),
    start: $('#start-btn'),
    trackList: $('#track-list'),
    record: $('#record'),
    sound: $('#sound'),
    soundBtn: $('#sound-btn'),
    loading: $('#loading'),
    loadingText: $('#loading-text'),
  };

  const tracks = new Map();
  function getTrack(id) {
    if (!tracks.has(id)) tracks.set(id, new SC.Track(SC.TRACK_DEFS.find((d) => d.id === id)));
    return tracks.get(id);
  }

  let mode = 'boot'; // boot | menu | race | paused | results
  let race = null;
  let toasts = [];
  let finishDelay = 0;
  let pausedFrameDrawn = false;
  let busy = false;
  let isTouch = coarse;

  /* ---------------------------------------------------------------- */
  /* Layout                                                           */
  /* ---------------------------------------------------------------- */

  function resize() {
    const w = Math.max(1, app.clientWidth);
    const h = Math.max(1, app.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hud.resize(w, h, dpr);
    if (world) world.resize(w, h);
    app.style.setProperty('--hud', String(hud.hud / dpr));
    pausedFrameDrawn = false;
  }

  if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
  else window.addEventListener('resize', resize);

  function setTouch(on) {
    if (isTouch === on) return;
    isTouch = on;
    els.touch.hidden = !(isTouch && mode === 'race');
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') setTouch(true);
  });

  /* ---------------------------------------------------------------- */
  /* Loading                                                          */
  /* ---------------------------------------------------------------- */

  function showLoading(text) {
    els.loadingText.textContent = text;
    els.loading.hidden = false;
    els.loading.classList.remove('is-error');
  }

  function hideLoading() {
    els.loading.hidden = true;
  }

  function showError(text) {
    els.loadingText.textContent = text;
    els.loading.hidden = false;
    els.loading.classList.add('is-error');
  }

  /** Let the browser paint (e.g. a loading message) before blocking work. */
  const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  /** Build (or reuse) the 3D circuit, showing a message if it takes a moment. */
  async function prepareTrack(id) {
    const track = getTrack(id);
    if (!world.hasTrack(id)) {
      showLoading(`Building ${track.name}…`);
      await nextPaint();
    }
    world.setTrack(track);
    hideLoading();
    return track;
  }

  function createWorld() {
    const old = $('#view');
    const canvas = document.createElement('canvas');
    canvas.id = 'view';
    canvas.className = 'view';
    canvas.setAttribute('aria-label', 'Race view');
    if (world) {
      world.renderer.dispose();
      world.renderer.forceContextLoss();
    }
    old.replaceWith(canvas);
    world = new SC.World(canvas, { quality: settings.graphics });
    resize();
  }

  /* ---------------------------------------------------------------- */
  /* Menu                                                             */
  /* ---------------------------------------------------------------- */

  function recordFor(id) {
    return records[id] || {};
  }

  function buildTrackList() {
    els.trackList.textContent = '';
    for (const def of SC.TRACK_DEFS) {
      const track = getTrack(def.id);
      const label = document.createElement('label');
      label.className = 'track-card';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'track';
      radio.value = def.id;
      radio.id = 'track-' + def.id;
      radio.checked = settings.track === def.id;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        settings.track = def.id;
        saveStore();
        updateRecordLine();
        startDemo();
      });
      const thumb = SC.art.thumbnail(def.theme, 264, 160);
      thumb.className = 'track-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = def.name;
      const meta = document.createElement('span');
      meta.className = 'track-meta';
      meta.textContent = `${track.lengthKm.toFixed(2)} km · ${SC.THEMES[def.theme].label} · ${def.character}`;
      const best = document.createElement('span');
      best.className = 'track-best';
      best.dataset.track = def.id;
      label.append(radio, thumb, name, meta, best);
      els.trackList.append(label);
    }
    updateTrackBests();
  }

  function updateTrackBests() {
    els.trackList.querySelectorAll('.track-best').forEach((el) => {
      const rec = recordFor(el.dataset.track);
      el.textContent = rec.lap ? `Lap record ${U.formatTime(rec.lap)}` : SC.TRACK_DEFS.find((d) => d.id === el.dataset.track).blurb;
      el.style.color = rec.lap ? '' : 'var(--muted)';
    });
  }

  function updateRecordLine() {
    const rec = recordFor(settings.track);
    const raceBest = rec['race' + settings.laps];
    const lapsWord = settings.laps === 1 ? '1 lap' : `${settings.laps} laps`;
    els.record.textContent = '';
    if (!rec.lap && !raceBest) {
      els.record.textContent = `No times set on ${getTrack(settings.track).name} yet.`;
      return;
    }
    const parts = [];
    if (raceBest) parts.push([`Best over ${lapsWord} `, U.formatTime(raceBest)]);
    if (rec.lap) parts.push(['Lap record ', U.formatTime(rec.lap)]);
    if (rec.bestPos) parts.push(['Best finish ', U.ordinal(rec.bestPos)]);
    parts.forEach(([label, value], i) => {
      if (i) els.record.append(' · ');
      els.record.append(label);
      const strong = document.createElement('strong');
      strong.textContent = value;
      els.record.append(strong);
    });
  }

  function bindRadios(name, key, parse, onChange) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = String(settings[key]) === el.value;
      el.addEventListener('change', () => {
        if (!el.checked) return;
        settings[key] = parse ? parse(el.value) : el.value;
        saveStore();
        updateRecordLine();
        if (onChange) onChange();
      });
    });
  }

  function setSound(on) {
    settings.sound = on;
    audio.setMuted(!on);
    els.sound.checked = on;
    els.soundBtn.textContent = on ? 'Sound: on' : 'Sound: off';
    els.soundBtn.setAttribute('aria-pressed', String(on));
    saveStore();
  }

  function cycleView() {
    settings.view = VIEWS[(VIEWS.indexOf(settings.view) + 1) % VIEWS.length];
    saveStore();
    const radio = document.querySelector(`input[name="view"][value="${settings.view}"]`);
    if (radio) radio.checked = true;
    if (mode === 'race') toast({ kind: 'small', text: VIEW_NAMES[settings.view], dur: 1.2, color: SC.HUD_COLORS.text });
  }

  async function changeGraphics() {
    if (!world || busy) return;
    busy = true;
    showLoading('Applying graphics settings…');
    await nextPaint();
    createWorld();
    busy = false;
    await startDemo();
  }

  /* ---------------------------------------------------------------- */
  /* Screens                                                          */
  /* ---------------------------------------------------------------- */

  function showOnly(screen) {
    els.menu.hidden = screen !== 'menu';
    els.pause.hidden = screen !== 'pause';
    els.results.hidden = screen !== 'results';
    const racing = mode === 'race' || mode === 'paused';
    els.pauseBtn.hidden = mode !== 'race';
    els.viewBtn.hidden = mode !== 'race';
    els.touch.hidden = !(isTouch && mode === 'race');
    app.classList.toggle('is-racing', racing);
  }

  function blurActive() {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  async function startDemo() {
    if (!world) return;
    const track = await prepareTrack(settings.track);
    if (mode !== 'menu') return;
    race = new SC.Race(track, { demo: true, seed: 11 });
    for (let i = 0; i < 120 * 6; i++) race.update(1 / 120);
    race.events.length = 0;
  }

  function showMenu() {
    mode = 'menu';
    input.capture = false;
    audio.setPaused(false);
    toasts = [];
    showOnly('menu');
    updateTrackBests();
    updateRecordLine();
    startDemo();
    els.start.focus({ preventScroll: true });
  }

  async function startRace() {
    if (mode === 'boot' || busy || !world) return;
    busy = true;
    audio.unlock();
    audio.setPaused(false);
    audio.play('click');
    const track = await prepareTrack(settings.track);
    race = new SC.Race(track, { laps: settings.laps, difficulty: settings.difficulty });
    mode = 'race';
    toasts = [];
    finishDelay = 0;
    input.reset();
    input.capture = true;
    showOnly(null);
    blurActive();
    busy = false;
  }

  function pauseGame() {
    if (mode !== 'race') return;
    mode = 'paused';
    pausedFrameDrawn = false;
    input.capture = false;
    input.reset();
    audio.setPaused(true);
    showOnly('pause');
    $('#resume-btn').focus({ preventScroll: true });
  }

  function resumeGame() {
    if (mode !== 'paused') return;
    mode = 'race';
    input.reset();
    input.capture = true;
    audio.unlock();
    audio.setPaused(false);
    showOnly(null);
    blurActive();
  }

  function showResults() {
    mode = 'results';
    input.capture = false;
    const p = race.player;
    const rows = race.results();
    const id = race.track.id;
    const rec = Object.assign({}, recordFor(id));
    const flags = [];
    if (isFinite(p.bestLap) && (!rec.lap || p.bestLap < rec.lap)) {
      rec.lap = p.bestLap;
      flags.push('New lap record');
    }
    const raceKey = 'race' + race.laps;
    if (!rec[raceKey] || p.finishTime < rec[raceKey]) {
      rec[raceKey] = p.finishTime;
      flags.push(`New best over ${race.laps === 1 ? '1 lap' : race.laps + ' laps'}`);
    }
    if (!rec.bestPos || p.position < rec.bestPos) rec.bestPos = p.position;
    records[id] = rec;
    saveStore();

    const pos = p.position;
    $('#result-pos').textContent = 'P' + pos;
    $('#result-title').textContent = pos === 1 ? 'Victory' : pos <= 3 ? `${U.ordinal(pos)} · Podium` : `${U.ordinal(pos)} place`;
    $('#result-sub').textContent = `${race.track.name} · ${race.difficulty.label} rivals · ${race.laps === 1 ? '1 lap' : race.laps + ' laps'}`;
    $('#result-time').textContent = U.formatTime(p.finishTime);
    $('#result-lap').textContent = isFinite(p.bestLap) ? U.formatTime(p.bestLap) : '—';
    $('#result-flags').textContent = flags.join(' · ');

    const body = $('#result-rows');
    body.textContent = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      if (r.isPlayer) tr.className = 'is-you';
      const tdPos = document.createElement('td');
      tdPos.textContent = r.position;
      const tdName = document.createElement('td');
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = r.isPlayer ? SC.art.PLAYER_COLOR[0] : SC.art.CAR_COLORS[r.color % SC.art.CAR_COLORS.length][0];
      tdName.append(chip, r.isPlayer ? 'You' : r.name);
      const tdTime = document.createElement('td');
      tdTime.className = 'num';
      if (r.position === 1) tdTime.textContent = U.formatTime(r.time);
      else tdTime.textContent = U.formatGap(r.gap);
      if (r.estimated) {
        tdTime.classList.add('est');
        tdTime.title = 'Still running: estimated';
        tdTime.textContent = '≈ ' + tdTime.textContent;
      }
      tr.append(tdPos, tdName, tdTime);
      body.append(tr);
    }
    showOnly('results');
    $('#again-btn').focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- */
  /* Race events → sound and messages                                 */
  /* ---------------------------------------------------------------- */

  function toast(t) {
    if (t.kind !== 'small') toasts = toasts.filter((x) => x.kind === 'small');
    else toasts = toasts.filter((x) => x.kind !== 'small');
    toasts.push(Object.assign({ age: 0, dur: 2 }, t));
  }

  function vibrate(ms) {
    if (!isTouch || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (err) {
      /* not allowed here */
    }
  }

  function handleEvents() {
    const H = SC.HUD_COLORS;
    for (const e of race.events) {
      switch (e.type) {
        case 'count':
          audio.play('count');
          break;
        case 'go':
          audio.play('go');
          break;
        case 'crash':
          audio.play('crash', e);
          vibrate(120);
          break;
        case 'bump':
          audio.play('bump', e);
          vibrate(40);
          break;
        case 'scrape':
          audio.play('scrape');
          break;
        case 'shift':
          audio.play('shift');
          break;
        case 'nitro':
          audio.play('nitro');
          break;
        case 'overtake':
          audio.play('overtake');
          toast({ kind: 'small', text: `P${e.position} ▲  +nitro`, dur: 1.3 });
          break;
        case 'lap':
          audio.play(e.best ? 'best' : 'lap');
          toast({
            text: e.final ? 'Final lap' : `Lap ${e.lap}`,
            sub: U.formatTime(e.time) + (e.best ? '  ·  fastest lap' : ''),
            color: e.final ? H.accent : e.best ? H.flare : null,
            dur: 2.2,
          });
          break;
        case 'finish':
          audio.play('finish');
          toast({
            text: e.position === 1 ? 'Winner!' : 'Finish',
            sub: `${U.ordinal(e.position)} place  ·  ${U.formatTime(e.time)}`,
            color: e.position === 1 ? H.flare : null,
            dur: 3,
          });
          finishDelay = 2.8;
          break;
        default:
          break;
      }
    }
    race.events.length = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Frame loop                                                       */
  /* ---------------------------------------------------------------- */

  const STEP = 1 / 120;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, frameDt);
    last = now;

    for (const a of input.consumeActions()) {
      if (a === 'pause') {
        if (mode === 'race') pauseGame();
        else if (mode === 'paused') resumeGame();
      } else if (a === 'mute') {
        setSound(!settings.sound);
      } else if (a === 'camera' && (mode === 'race' || mode === 'menu')) {
        cycleView();
      }
    }

    if (!race || !world || busy) return;
    const running = mode === 'menu' || mode === 'race' || mode === 'results';
    if (running) {
      const inp = mode === 'race' ? input.read() : SC.NEUTRAL_INPUT;
      const steps = Math.max(1, Math.ceil(dt / STEP - 1e-6));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) race.update(h, inp);
      if (mode === 'race') handleEvents();
      else race.events.length = 0;

      for (const t of toasts) t.age += dt;
      toasts = toasts.filter((t) => t.age < t.dur);

      if (mode === 'race' && race.state === 'finished') {
        finishDelay -= dt;
        if (finishDelay <= 0) showResults();
      }
    } else if (pausedFrameDrawn) {
      return; // paused: the last frame stays on screen
    }

    const p = race.player;
    audio.update({
      active: mode === 'race',
      rpm: p.rpm,
      throttle: p.throttle || 0,
      speed: p.speed / C.maxSpeed,
      skid: p.skid,
      offRoad: p.offRoad,
      nitro: p.nitroActive,
    });

    const camera = mode === 'race' || mode === 'paused' ? (race.state === 'finished' ? 'tv' : settings.view) : 'tv';
    world.render(race, { dt: running ? dt : 0, frameDt: running ? frameDt : 0, camera });
    hud.render(race, {
      hud: mode === 'race' || mode === 'paused',
      units: settings.units,
      touch: isTouch,
      toasts,
    });
    if (mode === 'paused') pausedFrameDrawn = true;
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                           */
  /* ---------------------------------------------------------------- */

  function wire() {
    bindRadios('difficulty', 'difficulty');
    bindRadios('laps', 'laps', (v) => parseInt(v, 10));
    bindRadios('units', 'units');
    bindRadios('graphics', 'graphics', null, changeGraphics);
    bindRadios('view', 'view');
    els.sound.checked = settings.sound;
    els.sound.addEventListener('change', () => setSound(els.sound.checked));
    setSound(settings.sound);

    els.start.addEventListener('click', startRace);
    els.pauseBtn.addEventListener('click', pauseGame);
    els.viewBtn.addEventListener('click', cycleView);
    $('#resume-btn').addEventListener('click', resumeGame);
    $('#restart-btn').addEventListener('click', startRace);
    $('#quit-btn').addEventListener('click', showMenu);
    els.soundBtn.addEventListener('click', () => {
      audio.unlock();
      setSound(!settings.sound);
    });
    $('#again-btn').addEventListener('click', startRace);
    $('#menu-btn').addEventListener('click', showMenu);

    input.bindTouch(els.touch);

    // Enter starts a race from the menu or the results screen.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.repeat) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A') return;
      if (mode === 'menu' || mode === 'results') {
        e.preventDefault();
        startRace();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseGame();
    });
  }

  /** Resolves once the three.js bootstrap module has loaded the engine. */
  function threeReady() {
    return new Promise((resolve, reject) => {
      if (globalThis.THREE && globalThis.THREE.addons) return resolve(globalThis.THREE);
      if (globalThis.SC_THREE_ERROR) return reject(globalThis.SC_THREE_ERROR);
      const timer = setTimeout(() => reject(new Error('timeout')), 30000);
      window.addEventListener('sc:three-ready', () => {
        clearTimeout(timer);
        resolve(globalThis.THREE);
      }, { once: true });
      window.addEventListener('sc:three-failed', (e) => {
        clearTimeout(timer);
        reject(e.detail);
      }, { once: true });
    });
  }

  async function boot() {
    resize();
    wire();
    buildTrackList();
    mode = 'menu';
    showOnly('menu');
    updateRecordLine();
    els.start.disabled = true;
    showLoading('Loading 3D engine…');
    let THREE;
    try {
      THREE = await threeReady();
    } catch (err) {
      showError('The 3D engine could not load. Check your internet connection, then reload the page.');
      return;
    }
    for (const init of SC.threeInit) init(THREE);
    try {
      createWorld();
    } catch (err) {
      showError('This browser could not start WebGL, which the game needs. Try an up-to-date Chrome, Edge, Firefox or Safari.');
      return;
    }
    await startDemo();
    els.start.disabled = false;
    els.start.focus({ preventScroll: true });
    requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
  }

  // Wait briefly for the web fonts so text baked into billboards uses them.
  const fontsReady =
    document.fonts && document.fonts.load
      ? Promise.race([
          Promise.all([document.fonts.load('800 40px "Saira Condensed"'), document.fonts.load('italic 800 40px "Saira Condensed"')]),
          new Promise((r) => setTimeout(r, 1500)),
        ])
      : Promise.resolve();
  fontsReady.catch(() => {}).then(boot);
})();
