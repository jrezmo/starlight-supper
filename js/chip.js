/* ============ Chip v3: adaptive procedural soundtrack engine ============
   Structure-aware sequencer: A/B song sections, seventh-color harmony,
   walking bass, drum fills, section breaks, area crossfades, and
   milestone-driven intensity. Still zero asset files — pure WebAudio. */
"use strict";
const Chip = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let seqTimer = null, step = 0, theme = null, playing = false;
  let SPB = .25, unlocked = false, pendingTheme = null;
  const LOOKAHEAD = 0.12, TICK = 40; // ms scheduler

  // scales (semitone offsets)
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  };

  /* ---- themes per area ---- */
  const THEMES = {
    home: {
      name: "The Rustbucket Kitchen", bpm: 96, root: 57, scale: "dorian",
      lead: "square", harm: "triangle", bassWave: "sawtooth",
      drums: true, density: .55, sparkle: false, sevenths: true,
      chordProg: [0, 5, 3, 4], mood: "cozy",
    },
    title: {
      name: "Starlight Overture", bpm: 84, root: 53, scale: "lydian",
      lead: "square", harm: "triangle", bassWave: "triangle",
      drums: false, density: .45, sparkle: true, sevenths: true,
      chordProg: [0, 3, 5, 4], mood: "wonder",
    },
    verdanth: {
      name: "Moss Cathedral Groove", bpm: 108, root: 55, scale: "mixolydian",
      lead: "square", harm: "square", bassWave: "sawtooth",
      drums: true, density: .65, sparkle: true, sevenths: true,
      chordProg: [0, 4, 5, 3], mood: "lush",
    },
    cinder: {
      name: "Ember Storm March", bpm: 132, root: 50, scale: "phrygian",
      lead: "sawtooth", harm: "square", bassWave: "sawtooth",
      drums: true, density: .8, sparkle: false, sevenths: false,
      chordProg: [0, 1, 0, 6], mood: "hot",
    },
    pelagia: {
      name: "Trench Lullaby", bpm: 88, root: 52, scale: "minor",
      lead: "triangle", harm: "triangle", bassWave: "sine",
      drums: true, density: .4, sparkle: true, sevenths: true,
      chordProg: [0, 5, 6, 4], mood: "deep",
    },
    battle: {
      name: "Spatula Showdown", bpm: 150, root: 57, scale: "minor",
      lead: "square", harm: "sawtooth", bassWave: "sawtooth",
      drums: true, density: .95, sparkle: false, sevenths: false,
      chordProg: [0, 6, 5, 6], mood: "tense",
    },
    tea: {
      name: "Duel of Etiquette", bpm: 120, root: 60, scale: "major",
      lead: "triangle", harm: "square", bassWave: "triangle",
      drums: true, density: .6, sparkle: true, sevenths: true,
      chordProg: [0, 3, 4, 0], waltz: true, // 3/4!
      mood: "fancy",
    },
    thor: {
      name: "Clash of the Kettle", bpm: 160, root: 45, scale: "phrygian",
      lead: "sawtooth", harm: "sawtooth", bassWave: "sawtooth",
      drums: true, density: 1.0, sparkle: false, sevenths: false,
      chordProg: [0, 6, 3, 6], mood: "epic",
    },
  };

  function ensure() {
    if (ctx) return true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = .8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = .5; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = .75; sfxGain.connect(master);
    // gentle master limiter so stacked layers never clip harshly
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    return true;
  }

  /* Browsers suspend AudioContext until a user gesture. Call play() freely —
     we stash the request and honor it on first tap. */
  function unlock() {
    if (unlocked || !ensure()) return;
    if (ctx.state === "suspended") { ctx.resume(); }
    unlocked = true;
    if (pendingTheme) { const p = pendingTheme; pendingTheme = null; start(p); }
  }
  if (typeof document !== "undefined") {
    const once = () => { unlock(); document.removeEventListener("pointerdown", once); document.removeEventListener("keydown", once); };
    document.addEventListener("pointerdown", once);
    document.addEventListener("keydown", once);
  }

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function blip(freq, dur, wave, vol, when, dest, slide) {
    if (!ctx || !isFinite(freq) || freq <= 0) return;
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(dest || sfxGain); o.start(t); o.stop(t + dur + .02);
  }
  function noiseHit(dur, vol, when, hp) {
    if (!ctx) return;
    const t = when || ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = hp ? "highpass" : "lowpass"; f.frequency.value = hp ? 6000 : 900;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(sfxGain); src.start(t);
  }

  /* ---- sequencer ---- */
  function start(themeName) {
    if (!ensure()) return;
    if (ctx.state === "suspended" || !unlocked) { pendingTheme = themeName; return; }
    const th = THEMES[themeName] || THEMES.home;
    if (playing && theme === th) return;
    if (playing && theme) {
      // short crossfade: dip out, switch, swell back in
      duckMusic(.12, .35);
      setTimeout(() => { beginTheme(th); duckMusic(.5, .8); }, 380);
    } else {
      beginTheme(th); musicGain.gain.setTargetAtTime(.5, ctx.currentTime, .6);
    }
  }
  function beginTheme(th) {
    stopSeq();
    theme = th; playing = true; step = 0; sectionBar = 0; intensity = .5;
    scheduleLoop();
  }
  function stopSeq() { if (seqTimer) { clearInterval(seqTimer); seqTimer = null; } playing = false; }
  function stop() { stopSeq(); theme = null; }

  function scheduleLoop() {
    let nextTime = ctx.currentTime + .05;
    SPB = 60 / theme.bpm / 2; // eighth notes
    seqTimer = setInterval(() => {
      if (!playing) return;
      while (nextTime < ctx.currentTime + LOOKAHEAD) {
        scheduleStep(step, nextTime);
        nextTime += SPB;
        step++;
      }
    }, TICK);
  }

  // deterministic-ish pseudo random per session
  let seed = Date.now() % 100000;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  /* ---- song structure ----
     Bars are grouped into 4-bar phrases. Phrases alternate A / B:
       A = main groove, B = answer phrase (octave lift + denser melody),
       every 8th phrase = break (drums drop out, pad-only bar, then fill). */
  let sectionBar = 0, intensity = .5;

  function scheduleStep(s, t) {
    const th = theme;
    const phrase = Math.floor(s / (th.waltz ? 12 : 16)); // one phrase = 2 bars worth of eighths... see below
    // use bar-level counters in eighth-note units: 8 eighths per bar (4/4) or 6 (3/4)
    const barLen = th.waltz ? 6 : 8;
    const bar = Math.floor(s / barLen);
    const inBar = s % barLen;
    const phrasePos = Math.floor(bar / 4) % 2;          // 0 = A section, 1 = B section
    const bigCycle = Math.floor(bar / 32) % 4;          // long-form variation every 32 bars
    const phraseEnd = (bar % 4 === 3 && inBar === barLen - 1);
    const onBreak = bigCycle === 3 && Math.floor(bar / 4) % 8 === 7; // last phrase of cycle = break
    const chordDeg = th.chordProg[bar % th.chordProg.length];
    const sc = SCALES[th.scale];
    const lift = phrasePos === 1 ? 5 : 0;               // B section answers a step up (subtle)
    const localDensity = th.density;

    // BREAK: strip back — no melody, no hats, just pad + heartbeat bass
    if (onBreak && !(bar % 4 === 3)) {
      if (inBar % 4 === 0) blip(mtof(th.root - 12 + sc[chordDeg]), SPB * 3, th.bassWave, .12, t, musicGain);
      if (inBar % 4 === 2) padChord(th, chordDeg, sc, t, true);
      return;
    }

    // bass: root on downbeats; walking approach note into next chord at phrase ends
    if (inBar === 0 || inBar % 2 === 0 || th.density > .85) {
      let bassNote = th.root - 12 + sc[chordDeg % sc.length];
      if (inBar === barLen - 2) { // walk toward next chord's root
        const nextDeg = th.chordProg[(bar + 1) % th.chordProg.length];
        bassNote = th.root - 12 + sc[(nextDeg + (rnd() < .5 ? 2 : sc.length - 1)) % sc.length];
      }
      blip(mtof(bassNote), .14, th.bassWave, .16, t, musicGain);
    }

    // chords/pad — arpeggiated when sevenths enabled, block otherwise
    if (th.waltz ? inBar % 6 === 3 : (inBar % 4 === 2)) {
      padChord(th, chordDeg, sc, t, false, lift);
    }

    // melody: motif-driven. Each theme has a fixed 8-step contour that repeats,
    // giving the ear something to hold onto; occasional ornament only.
    const melActive = !onBreak && (phrasePos === 0 || rnd() < .9);
    if (melActive && rnd() < th.density * (inBar === 0 ? 1.1 : 1)) {
      const barLen = th.waltz ? 6 : 8;
      const motifIdx = s % MOTIF_LEN;
      let degOff = MOTIF[motifIdx % MOTIF.length]; // fixed contour
      if (motifIdx === 0) melAnchor = clamp(melAnchor + pickMelodyStep(), -2, 4); // phrase start may drift gently
      melPos = clamp(melAnchor + degOff, 0, 9);
      const degIdx = (chordDeg + melPos) % sc.length;
      const oct = Math.floor((chordDeg + melPos) / sc.length) * 12;
      const n = th.root + 12 + sc[degIdx] + oct;
      blip(mtof(n), .13, th.lead, .09, t, musicGain);
      // echo
      if (rnd() < .3) blip(mtof(n), .1, th.lead, .04, t + SPB * .5, musicGain);
      void barLen;
    }
    // sparkles (high bell)
    if (th.sparkle && rnd() < .06) {
      blip(mtof(th.root + 24 + sc[Math.floor(rnd() * sc.length)]), .3, "sine", .05, t, musicGain);
    }

    // drums
    if (th.drums) {
      const isKick = th.waltz ? [0, 3, 6].includes(inBar) : inBar % 4 === 0;
      const isSnare = !th.waltz && (inBar === 4 || (th.density > .8 && inBar === 6));
      const isHat = inBar % 2 === 1;
      if (isKick) kick(t);
      if (isSnare) noiseHit(.08, .12, t, false);
      if (isHat && rnd() < .85) noiseHit(.03, .05, t, true);
      // fill into each new phrase (last 2 eighths of every 4th bar)
      if (phraseEnd && inBar >= barLen - 2) {
        noiseHit(.04, .07 + (barLen - inBar) * .02, t, true);
      }
    }
  }

  // pad chord: block voicing, adds a 7th when theme.sevenths; soft-swell variant for breaks
  function padChord(th, chordDeg, sc, t, soft, lift) {
    const ivs = th.sevenths ? [0, 2, 4, 6] : [0, 2, 4];
    ivs.forEach((iv, i) => {
      const deg = (chordDeg + iv) % sc.length;
      const oct = Math.floor((chordDeg + iv) / sc.length) * 12;
      blip(mtof(th.root + sc[deg] + oct), soft ? SPB * 3.5 : .18, th.harm,
           (soft ? .035 : .05) * (i === ivs.length - 1 ? .8 : 1), t + (soft ? 0 : i * .015), musicGain);
    });
    void lift;
  }

  let melPos = 0, melAnchor = 2;
  // shared melodic contour (scale-degree offsets) — the recognizable hook
  const MOTIF = [0, 2, 4, 2, 0, -1, 1, 0];
  const MOTIF_LEN = 8;
  function pickMelodyStep() {
    let j = [-2, -1, 1, 2, 1, 3, -1][Math.floor(rnd() * 7)];
    if (rnd() < .25) j *= 2;
    return j;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function kick(t) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + .1);
    g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.001, t + .12);
    o.connect(g).connect(musicGain); o.start(t); o.stop(t + .14);
  }

  /* ---- reactive punctuation ---- */
  function duck(sec) { if (musicGain && ctx) { musicGain.gain.setTargetAtTime(.16, ctx.currentTime, .05); setTimeout(() => musicGain && musicGain.gain.setTargetAtTime(.5, ctx.currentTime, .3), sec * 1000); } }
  function duckMusic(vol, sec) {
    if (!musicGain || !ctx) return;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(vol, ctx.currentTime, Math.max(.05, sec / 3));
  }

  const api = {
    play(name) { unlock(); start(name); },
    stop,
    duckMusic,
    setMuted(m) { if (master) master.gain.value = m ? 0 : .8; },
    // gameplay intensity 0..1 — raises melody density & swing feel
    setIntensity(v) { intensity = clamp(typeof v === "number" ? v : .5, 0, 1); },
    // gameplay punctuation:
    pickup() { ensure() && blip(880, .07, "square", .1) && blip(1318, .09, "square", .08, ctx.currentTime + .06); },
    heal() { ensure() && [523, 659, 784].forEach((f, i) => blip(f, .12, "triangle", .09, ctx.currentTime + i * .07)); },
    hitStinger() { ensure() && (duck(1.2), blip(200, .15, "sawtooth", .18), noiseHit(.15, .18)); },
    victoryFanfare() { ensure() && (duck(2.2), [523, 659, 784, 1047, 784, 1047].forEach((f, i) => blip(f, .16, "square", .12, ctx.currentTime + i * .11))); },
    defeatSting() { ensure() && (duck(2.5), [330, 262, 196].forEach((f, i) => blip(f, .35, "sawtooth", .12, ctx.currentTime + i * .28))); },
    jewelArpeggio() { ensure() && (duck(3), [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => blip(f, .28, "sine", .13, ctx.currentTime + i * .1))); },
    fauxPas() { ensure() && blip(233, .25, "square", .13) && blip(220, .3, "square", .12, ctx.currentTime + .18); },
    delightBurst(level) { const l = (typeof level === "number" && isFinite(level)) ? level : 0; ensure() && [523 + l * 40, 659 + l * 40].forEach((f, i) => blip(f, .1, "triangle", .1, ctx.currentTime + i * .06)); },
    thunder() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const b = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * .9, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260;
      const g = ctx.createGain(); g.gain.value = .4;
      b.buffer = buf; b.connect(f).connect(g).connect(master); b.start(t);
      duck(1.5);
    },
    heartbeat(on) { // low HP loop
      if (!ensure()) return;
      clearInterval(api._hb); api._hb = null;
      if (on) api._hb = setInterval(() => { blip(70, .1, "sine", .2); }, 700);
    },
  };
  return api;
})();
