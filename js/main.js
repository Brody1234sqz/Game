/*
 * Sundown Circuit — application controller.
 * Owns the screens (menu, race, pause, results), settings and records,
 * and runs the frame loop that feeds input to the race and the race to the
 * renderer and audio.
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

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      return {};
    }
  }

  const stored = loadStore();
  const settings = Object.assign({ track: 'coast', difficulty: 'normal', laps: 3, units: 'kmh', sound: true }, stored.settings);
  if (!SC.TRACK_DEFS.some((d) => d.id === settings.track)) settings.track = 'coast';
  if (!C.difficulties[settings.difficulty]) settings.difficulty = 'normal';
  if (![1, 3, 5].includes(settings.laps)) settings.laps = 3;
  if (settings.units !== 'mph') settings.units = 'kmh';
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
  const canvas = $('#view');
  const renderer = new SC.Renderer(canvas);
  const audio = new SC.AudioFX();
  const input = new SC.Input();
  audio.setMuted(!settings.sound);

  const els = {
    menu: $('#menu'),
    pause: $('#pause'),
    results: $('#results'),
    touch: $('#touch'),
    pauseBtn: $('#pause-btn'),
    start: $('#start-btn'),
    trackList: $('#track-list'),
    record: $('#record'),
    sound: $('#sound'),
    soundBtn: $('#sound-btn'),
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
  let isTouch = window.matchMedia('(pointer: coarse)').matches;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  renderer.reducedMotion = reduceMotion.matches;
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', (e) => (renderer.reducedMotion = e.matches));

  /* ---------------------------------------------------------------- */
  /* Layout                                                           */
  /* ---------------------------------------------------------------- */

  function resize() {
    const w = Math.max(1, app.clientWidth);
    const h = Math.max(1, app.clientHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = 2560 * 1440;
    if (w * h * dpr * dpr > budget) dpr = Math.sqrt(budget / (w * h));
    renderer.resize(w, h, dpr);
    app.style.setProperty('--hud', String(renderer.hud / dpr));
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

  function bindRadios(name, key, parse) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = String(settings[key]) === el.value;
      el.addEventListener('change', () => {
        if (!el.checked) return;
        settings[key] = parse ? parse(el.value) : el.value;
        saveStore();
        updateRecordLine();
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

  /* ---------------------------------------------------------------- */
  /* Screens                                                          */
  /* ---------------------------------------------------------------- */

  function showOnly(screen) {
    els.menu.hidden = screen !== 'menu';
    els.pause.hidden = screen !== 'pause';
    els.results.hidden = screen !== 'results';
    const racing = mode === 'race' || mode === 'paused';
    els.pauseBtn.hidden = mode !== 'race';
    els.touch.hidden = !(isTouch && mode === 'race');
    app.classList.toggle('is-racing', racing);
  }

  function blurActive() {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  function startDemo() {
    const track = getTrack(settings.track);
    renderer.setTheme(track.theme);
    race = new SC.Race(track, { demo: true, seed: 11 });
    for (let i = 0; i < 120 * 5; i++) race.update(1 / 120);
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

  function startRace() {
    if (mode === 'boot') return;
    audio.unlock();
    audio.setPaused(false);
    audio.play('click');
    const track = getTrack(settings.track);
    renderer.setTheme(track.theme);
    race = new SC.Race(track, { laps: settings.laps, difficulty: settings.difficulty });
    mode = 'race';
    toasts = [];
    finishDelay = 0;
    input.reset();
    input.capture = true;
    showOnly(null);
    blurActive();
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
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;

    for (const a of input.consumeActions()) {
      if (a === 'pause') {
        if (mode === 'race') pauseGame();
        else if (mode === 'paused') resumeGame();
      } else if (a === 'mute') {
        setSound(!settings.sound);
      }
    }

    if (!race) return;
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

    renderer.render(race, {
      hud: mode === 'race' || mode === 'paused',
      dt: running ? dt : 0,
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
    els.sound.checked = settings.sound;
    els.sound.addEventListener('change', () => setSound(els.sound.checked));
    setSound(settings.sound);

    els.start.addEventListener('click', startRace);
    els.pauseBtn.addEventListener('click', pauseGame);
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

  function boot() {
    resize();
    wire();
    buildTrackList();
    mode = 'menu';
    showMenu();
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
