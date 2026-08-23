/* ============ WebAudio bleeps & ambient ============ */
"use strict";
const AudioSys = (() => {
  let ctx = null, muted = false, ambientTimer = null;
  function ensure() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ctx; }
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
    toggleMute() { muted = !muted; return muted; },
  };
  return api;
})();
