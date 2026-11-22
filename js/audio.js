/* ============ WebAudio bleeps & ambient ============ */
"use strict";
const AudioSys = (() => {
  let ctx = null, muted = false, ambientTimer = null;
  function ensure() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx; }
  function tone(freq, dur, type = "sine", vol = .12, when = 0) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  }
  const api = {
    click() { tone(660, .06, "square", .06); },
    good() { tone(523, .1); tone(659, .1, "sine", .12, .08); tone(784, .16, "sine", .12, .16); },
    bad() { tone(220, .18, "sawtooth", .09); tone(160, .25, "sawtooth", .09, .12); },
    hit() { tone(180, .1, "square", .14); },
    heal() { tone(440, .12, "triangle", .1); tone(554, .14, "triangle", .1, .09); },
    jewel() { [523,659,784,1047].forEach((f,i)=>tone(f,.3,"sine",.13,i*.13)); },
    victory() { [392,494,587,784].forEach((f,i)=>tone(f,.22,"square",.08,i*.11)); },
    thunder() { if (muted||!ensure())return; const t=ctx.currentTime;
      const b=ctx.createBufferSource(); const buf=ctx.createBuffer(1,ctx.sampleRate*.8,ctx.sampleRate);
      const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.5);
      const f=ctx.createBiquadFilter(); f.type="lowpass"; f.frequency.value=300;
      const g=ctx.createGain(); g.gain.value=.35; b.buffer=buf; b.connect(f).connect(g).connect(ctx.destination); b.start(t); },
    tick() { tone(1200, .02, "square", .02); },
    // generic building blocks for procedural SFX (cooking minigames)
    tone,
    noise(dur = .08, vol = .1, freq = 1800, when = 0) {
      if (muted || !ensure()) return;
      const t = ctx.currentTime + when, len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = .8; g.gain.value = vol;
      src.connect(f).connect(g).connect(ctx.destination); src.start(t);
    },
    toggleMute() { muted = !muted; return muted; },
  };
  return api;
})();
