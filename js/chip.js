/* ============ Chip: adaptive procedural chiptune engine ============ */
"use strict";
const Chip = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let seqTimer = null, step = 0, theme = null, playing = false, duckUntil = 0;
  const LOOKAHEAD = 0.12, TICK = 40; // ms scheduler

  // scales (semitone offsets), keys as midi note numbers
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
  };

  /* ---- themes per area ---- */
  const THEMES = {
    home: {
      name: "The Rustbucket Kitchen", bpm: 96, root: 57 /* A3 */, scale: "dorian",
      lead: "square", harm: "triangle", bassWave: "sawtooth",
      drums: true, density: .55, sparkle: false,
      chordProg: [0, 5, 3, 4], // scale-degree roots of chords
      mood: "cozy",
    },
    title: {
      name: "Starlight Overture", bpm: 84, root: 53 /* F3 */, scale: "lydian",
      lead: "square", harm: "triangle", bassWave: "triangle",
      drums: false, density: .45, sparkle: true,
      chordProg: [0, 3, 5, 4],
      mood: "wonder",
    },
    verdanth: {
      name: "Moss Cathedral Groove", bpm: 108, root: 55 /* G3 */, scale: "major",
      lead: "square", harm: "square", bassWave: "sawtooth",
      drums: true, density: .65, sparkle: true,
      chordProg: [0, 4, 5, 3],
      mood: "lush",
    },
    cinder: {
      name: "Ember Storm March", bpm: 132, root: 50 /* D3 */, scale: "phrygian",
      lead: "sawtooth", harm: "square", bassWave: "sawtooth",
      drums: true, density: .8, sparkle: false,
      chordProg: [0, 1, 0, 6],
      mood: "hot",
    },
    pelagia: {
      name: "Trench Lullaby", bpm: 88, root: 52 /* E3 */, scale: "minor",
      lead: "triangle", harm: "triangle", bassWave: "sine",
      drums: true, density: .4, sparkle: true,
      chordProg: [0, 5, 6, 4],
      mood: "deep",
    },
    battle: {
      name: "Spatula Showdown", bpm: 150, root: 57 /* A3 */, scale: "minor",
      lead: "square", harm: "sawtooth", bassWave: "sawtooth",
      drums: true, density: .95, sparkle: false,
      chordProg: [0, 6, 5, 6],
      mood: "tense",
    },
    tea: {
      name: "Duel of Etiquette", bpm: 120, root: 60 /* C4 */, scale: "major",
      lead: "triangle", harm: "square", bassWave: "triangle",
      drums: true, density: .6, sparkle: true,
      chordProg: [0, 3, 4, 0], waltz: true, // 3/4!
      mood: "fancy",
    },
    thor: {
      name: "Clash of the Kettle", bpm: 160, root: 45 /* A2 */, scale: "phrygian",
      lead: "sawtooth", harm: "sawtooth", bassWave: "sawtooth",
      drums: true, density: 1.0, sparkle: false,
      chordProg: [0, 6, 3, 6],
      mood: "epic",
    },
  };

  function ensure() {
    if (ctx) return true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = .8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = .5; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = .75; sfxGain.connect(master);
    return true;
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
    const th = THEMES[themeName] || THEMES.home;
    if (playing && theme === th) return;
    stopSeq();
    theme = th; playing = true; step = 0;
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
        if (step % 64 === 0 && Math.random() < .35) vary();
      }
    }, TICK);
  }
  let SPB = .25;

  // deterministic-ish pseudo random per session
  let seed = Date.now() % 100000;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  function scheduleStep(s, t) {
    const th = theme;
    const bar = Math.floor(s / 8) % th.chordProg.length;
    const inBar = s % 8;
    const chordDeg = th.chordProg[bar];
    const sc = SCALES[th.scale];

    // bass on beats (or all eighths at high intensity)
    if (inBar % 2 === 0 || th.density > .85) {
      const bassNote = th.root - 12 + sc[chordDeg % sc.length];
      blip(mtof(bassNote), .14, th.bassWave, .16, t, musicGain);
    }
    // chords/pad on off-beats
    if (th.waltz ? inBar % 6 === 3 : (inBar % 4 === 2)) {
      [0, 2, 4].forEach(iv => {
        const deg = (chordDeg + iv) % sc.length;
        const oct = Math.floor((chordDeg + iv) / sc.length) * 12;
        blip(mtof(th.root + sc[deg] + oct), .18, th.harm, .05, t, musicGain);
      });
    }
    // melody: probabilistic arpeggio-run generator with motif memory
    if (rnd() < th.density * (inBar === 0 ? 1.15 : 1)) {
      const jump = pickMelodyStep();
      melPos = clamp(melPos + jump, 0, 9);
      const degIdx = (chordDeg + melPos) % sc.length;
      const oct = Math.floor((chordDeg + melPos) / sc.length) * 12;
      const n = th.root + 12 + sc[degIdx] + oct;
      blip(mtof(n), .13, th.lead, .09, t, musicGain);
      // echo
      if (rnd() < .3) blip(mtof(n), .1, th.lead, .04, t + SPB * .5, musicGain);
    }
    // sparkles (high bell)
    if (th.sparkle && rnd() < .06) {
      blip(mtof(th.root + 24 + sc[Math.floor(rnd() * sc.length)]), .3, "sine", .05, t, musicGain);
    }
    // drums
    if (th.drums) {
      const waltzBeat = th.waltz ? [0, 3, 6] : null;
      const isKick = th.waltz ? waltzBeat.includes(inBar) : inBar % 4 === 0;
      const isSnare = !th.waltz && (inBar === 4 || (th.density > .8 && inBar === 6));
      const isHat = th.waltz ? inBar % 2 === 1 : inBar % 2 === 1;
      if (isKick) kick(t);
      if (isSnare) noiseHit(.08, .12, t, false);
      if (isHat && rnd() < .85) noiseHit(.03, .05, t, true);
    }
  }

  let melPos = 0, lastJumps = [];
  function pickMelodyStep() {
    let j = [-2, -1, 1, 2, 1, 3, -1][Math.floor(rnd() * 7)];
    if (rnd() < .25) j *= 2;
    return j;
  }
  function vary() { melPos = Math.floor(rnd() * 5); } // phrase reset

  function kick(t) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + .1);
    g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.001, t + .12);
    o.connect(g).connect(musicGain); o.start(t); o.stop(t + .14);
  }

  /* ---- reactive punctuation ---- */
  function duck(sec) { if (musicGain) { musicGain.gain.setTargetAtTime(.16, ctx.currentTime, .05); duckUntil = performance.now() + sec * 1000; setTimeout(() => musicGain && musicGain.gain.setTargetAtTime(.5, ctx.currentTime, .3), sec * 1000); } }
  // smooth music-volume ramp used by intro crossfades: duckMusic(targetVol, seconds)
  function duckMusic(vol, sec) {
    if (!musicGain || !ctx) return;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(vol, ctx.currentTime, Math.max(.05, sec / 3));
  }

  const api = {
    play(name) { start(name); },
    stop,
    duckMusic,
    setMuted(m) { if (master) master.gain.value = m ? 0 : .8; },
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
