/* ============ Canvas art: starfield bg + character portraits ============ */
"use strict";
const Art = (() => {
  /* ---- animated background ---- */
  let stars = [], bgRunning = false, t0 = performance.now();
  function initBG(canvas) {
    function size() { canvas.width = innerWidth; canvas.height = innerHeight; }
    size(); addEventListener("resize", size);
    stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.6 + .3, s: Math.random() * .25 + .05,
      hue: [45, 190, 280, 330][Math.floor(Math.random() * 4)],
    }));
    if (!bgRunning) { bgRunning = true; requestAnimationFrame(loop); }
    function loop(t) {
      const c = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
      const g = c.createLinearGradient(0, 0, 0, h);
      const nightShift = (window.State && window.State.phase === "night") ? 1 : 0;
      if (nightShift) { g.addColorStop(0, "#0a0722"); g.addColorStop(1, "#14102f"); }
      else { g.addColorStop(0, "#241b52"); g.addColorStop(1, "#3a2a6e"); }
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (const s of stars) {
        s.y += s.s; if (s.y > h + 4) s.y = -4;
        const tw = .5 + .5 * Math.sin((t / 500) + s.x);
        c.fillStyle = `hsla(${s.hue},90%,75%,${.35 + tw * .55})`;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 7); c.fill();
      }
      // distant nebula blobs
      c.globalAlpha = .07;
      for (let i = 0; i < 3; i++) {
        const cx = w * (.2 + i * .3), cy = h * (.3 + .15 * Math.sin(t / 4000 + i));
        c.fillStyle = ["#ff6b6b", "#4ecdc4", "#ffc857"][i];
        c.beginPath(); c.arc(cx, cy, Math.min(w, h) * .25, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      requestAnimationFrame(loop);
    }
  }

  /* ---- character drawing helpers ---- */
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

  // Nimbus: teal alien with chef hat
  function drawNimbus(c, size) {
    const s = size / 200; c.save(); c.scale(s, s); c.translate(100, 100);
    // body
    c.fillStyle = "#4ecdc4"; rr(c, -34, 10, 68, 74, 26); c.fill();
    c.fillStyle = "#3bb3aa"; rr(c, -34, 46, 68, 38, 20); c.fill();
    // apron
    c.fillStyle = "#fff3e2"; rr(c, -22, 30, 44, 50, 10); c.fill();
    c.strokeStyle = "#ff6b6b"; c.lineWidth = 3; c.strokeRect(-10, 42, 20, 14);
    // head
    c.fillStyle = "#4ecdc4"; c.beginPath(); c.ellipse(0, -28, 40, 36, 0, 0, 7); c.fill();
    // eyes (three!)
    [[-16,-32],[16,-32],[0,-14]].forEach(([x,y]) => {
      c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill();
      c.fillStyle = "#14102a"; c.beginPath(); c.arc(x + 2, y + 1, 4, 0, 7); c.fill();
    });
    // smile
    c.strokeStyle = "#14102a"; c.lineWidth = 3; c.beginPath(); c.arc(0, -8, 8, .2, Math.PI - .2); c.stroke();
    // antennae
    c.lineWidth = 4; [-18, 18].forEach(x => { c.beginPath(); c.moveTo(x, -58); c.quadraticCurveTo(x * 1.4, -80, x * 1.2, -86); c.stroke();
      c.fillStyle = "#ffc857"; c.beginPath(); c.arc(x * 1.2, -88, 6, 0, 7); c.fill(); });
    // chef hat
    c.fillStyle = "#fff"; rr(c, -26, -104, 52, 26, 12); c.fill();
    c.beginPath(); c.arc(-14, -102, 14, 0, 7); c.arc(2, -110, 17, 0, 7); c.arc(16, -101, 13, 0, 7); c.fill();
    c.restore();
  }

  const ENEMY_DRAWERS = {
    grubble(c) { // three little blob gremlins
      [[-52,20,.8],[0,30,1],[48,16,.85]].forEach(([x,y,s]) => {
        c.save(); c.translate(x,y); c.scale(s,s);
        c.fillStyle = "#95e06c"; c.beginPath(); c.ellipse(0,0,26,22,0,0,7); c.fill();
        c.fillStyle="#14102a"; c.beginPath(); c.arc(-8,-4,3.4,0,7); c.arc(8,-4,3.4,0,7); c.fill();
        c.strokeStyle="#14102a"; c.lineWidth=2.4; c.beginPath(); c.moveTo(-6,8); c.lineTo(6,8); c.stroke();
        c.restore();
      });
    },
    sporeling(c) {
      c.fillStyle="#c77dff"; c.beginPath(); c.ellipse(0,6,40,34,0,0,7); c.fill();
      c.fillStyle="#e0aaff"; for(const[a,r]of[[Math.PI*1.15,14],[Math.PI*1.5,17],[Math.PI*1.85,14]]){c.beginPath();c.arc(Math.cos(a)*30,-14+Math.sin(a)*-14,r,0,7);c.fill();}
      c.fillStyle="#fff"; c.beginPath(); c.arc(-10,-2,6,0,7); c.arc(10,-2,6,0,7); c.fill();
      c.fillStyle="#14102a"; c.beginPath(); c.arc(-10,-2,3,0,7); c.arc(10,-2,3,0,7); c.fill();
      c.strokeStyle="#14102a"; c.lineWidth=3; c.beginPath(); c.arc(0,10,8,.2,Math.PI-.2); c.stroke();
    },
    magmaw(c) {
      c.fillStyle="#ff6b35"; c.beginPath(); c.ellipse(0,4,46,34,0,0,7); c.fill();
      c.fillStyle="#ffc857"; c.beginPath(); c.ellipse(0,14,30,16,0,0,7); c.fill();
      c.fillStyle="#7f1d1d"; for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(i*11,-2);c.lineTo(i*11+5,14);c.lineTo(i*11+10,-2);c.closePath();c.fill();}
      c.fillStyle="#fff"; c.beginPath(); c.arc(-16,-16,7,0,7); c.arc(16,-16,7,0,7); c.fill();
      c.fillStyle="#14102a"; c.beginPath(); c.arc(-16,-16,3.4,0,7); c.arc(16,-16,3.4,0,7); c.fill();
    },
    ashbandit(c) {
      c.fillStyle="#57606f"; rr(c,-30,-10,60,66,18); c.fill();
      c.fillStyle="#2f3542"; rr(c,-34,-30,68,26,12); c.fill(); // hood
      c.fillStyle="#1e272e"; rr(c,-22,-24,44,16,8); c.fill(); // shadow face
      c.fillStyle="#ff4757"; c.beginPath(); c.arc(-9,-16,3.4,0,7); c.arc(9,-16,3.4,0,7); c.fill(); // glowing eyes
      c.fillStyle="#ffa502"; rr(c,-44,4,12,34,6); c.fill(); // ladle arm?
      c.beginPath(); c.arc(-38,42,9,0,7); c.fill();
    },
    brinefiend(c) {
      c.fillStyle="#00b4d8"; c.beginPath(); c.ellipse(0,4,44,38,0,0,7); c.fill();
      c.strokeStyle="#90e0ef"; c.lineWidth=4; for(let i=0;i<5;i++){const a=Math.PI*(.15+i*.175);c.beginPath();c.moveTo(Math.cos(a)*40,Math.sin(a)*34);c.lineTo(Math.cos(a)*62,Math.sin(a)*56);c.stroke();}
      c.fillStyle="#caf0f8"; c.beginPath(); c.arc(-13,-8,7,0,7); c.arc(13,-8,7,0,7); c.fill();
      c.fillStyle="#023047"; c.beginPath(); c.arc(-13,-8,3.4,0,7); c.arc(13,-8,3.4,0,7); c.fill();
    },
    tidehulk(c) {
      c.fillStyle="#0077b6"; rr(c,-52,-30,104,96,34); c.fill();
      c.fillStyle="#023e8a"; rr(c,-52,20,104,46,24); c.fill();
      c.fillStyle="#48cae4"; c.beginPath(); c.moveTo(-52,-30);c.lineTo(0,-64);c.lineTo(52,-30);c.closePath();c.fill(); // fin crest
      c.fillStyle="#fff"; c.beginPath(); c.arc(-20,-8,9,0,7); c.arc(20,-8,9,0,7); c.fill();
      c.fillStyle="#023e8a"; c.beginPath(); c.arc(-20,-8,4.4,0,7); c.arc(20,-8,4.4,0,7); c.fill();
      c.strokeStyle="#caf0f8"; c.lineWidth=5; c.beginPath(); c.arc(0,16,14,.2,Math.PI-.2); c.stroke(); // frown-ish grin
      c.fillStyle="#ade8f4"; for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(i*16,16);c.lineTo(i*16+6,26);c.lineTo(i*16+12,16);c.closePath();c.fill();}
    },
    volt(c) {
      // Baron Volt: storm-critic dandy, static-frizz hair, tasting spoon, emerald buckle
      c.fillStyle="#5f27cd"; rr(c,-52,-16,104,100,26); c.fill(); // burgundy coat (approx)
      c.fillStyle="#8e44ad"; for(let i=0;i<4;i++) rr(c,-52+i*27,-16,18,100,8), c.fill();
      c.fillStyle="#ffeaa7"; for(let i=0;i<3;i++){c.beginPath();c.arc(-24+i*24,-2,3.4,0,7);c.fill();} // star buttons
      c.fillStyle="#e8dcff"; c.beginPath(); c.ellipse(0,-56,34,34,0,0,7); c.fill(); // face
      c.strokeStyle="#ecf0f1"; c.lineWidth=9; c.lineCap="round";
      for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(i*13,-84);c.lineTo(i*15+((i%2)?6:-6),-108-Math.abs(i)*4);c.stroke();} // static frizz
      c.strokeStyle="#b2bec3"; c.lineWidth=5;
      c.beginPath(); c.moveTo(-12,-46); c.quadraticCurveTo(-30,-42,-28,-32); c.stroke(); // mustache L
      c.beginPath(); c.moveTo(12,-46); c.quadraticCurveTo(30,-42,28,-32); c.stroke();   // mustache R
      c.fillStyle="#fff"; c.beginPath(); c.arc(-12,-58,5.5,0,7); c.arc(12,-58,5.5,0,7); c.fill();
      c.fillStyle="#2d3436"; c.beginPath(); c.arc(-12,-58,2.6,0,7); c.arc(12,-58,2.6,0,7); c.fill();
      c.fillStyle="#00d68f"; c.beginPath(); c.moveTo(0,20);c.lineTo(15,32);c.lineTo(0,47);c.lineTo(-15,32);c.closePath(); c.fill(); // emerald buckle
      // golden tasting spoon aloft
      c.strokeStyle="#fdcb6e"; c.lineWidth=5; c.beginPath(); c.moveTo(48,-70); c.lineTo(62,-116); c.stroke();
      c.fillStyle="#fdcb6e"; c.beginPath(); c.ellipse(64,-124,11,14,.5,0,7); c.fill();
      c.fillStyle="rgba(255,255,255,.85)"; c.beginPath(); c.arc(50,-78,3,0,7); c.arc(56,-92,2.6,0,7); c.fill(); // sparks
    },
  };

  const RIVAL_DRAWERS = {
    vex(c) {
      c.fillStyle="#e84393"; rr(c,-30,6,60,72,20); c.fill(); // gown
      c.fillStyle="#fd79a8"; c.beginPath(); c.ellipse(0,-26,30,30,0,0,7); c.fill();
      c.fillStyle="#2d3436"; c.beginPath(); c.ellipse(0,-48,32,20,0,Math.PI,0); c.fill(); // updo
      c.fillStyle="#fff"; c.beginPath(); c.arc(-10,-28,5,0,7); c.arc(10,-28,5,0,7); c.fill();
      c.fillStyle="#2d3436"; c.beginPath(); c.arc(-10,-28,2.4,0,7); c.arc(10,-28,2.4,0,7); c.fill();
      c.fillStyle="#e17055"; c.beginPath(); c.arc(-10,-16,3.5,0,7); c.arc(10,-16,3.5,0,7); c.fill(); // blush
      c.strokeStyle="#2d3436"; c.lineWidth=2.4; c.beginPath(); c.arc(0,-14,6,.3,Math.PI-.3); c.stroke();
      c.fillStyle="#ffeaa7"; c.beginPath(); c.arc(0,-52,4,0,7); c.fill(); // tiara gem
    },
    bramble(c) {
      c.fillStyle="#d63031"; rr(c,-32,4,64,76,18); c.fill(); // coat
      c.fillStyle="#ffeaa7"; for(let i=0;i<3;i++){c.beginPath();c.arc(0,16+i*16,3.6,0,7);c.fill();}
      c.fillStyle="#ffccbc"; c.beginPath(); c.ellipse(0,-28,30,30,0,0,7); c.fill();
      c.fillStyle="#6d4c41"; rr(c,-30,-58,60,18,9); c.fill(); // bandana
      c.fillStyle="#111"; c.beginPath(); c.arc(-10,-30,2.6,0,7); c.arc(10,-30,2.6,0,7); c.fill();
      c.strokeStyle="#111"; c.lineWidth=2.4; c.beginPath(); c.moveTo(-8,-16);c.lineTo(8,-16);c.stroke(); // stubble smirk
      c.fillStyle="#fff"; rr(c,-14,-20,28,8,4); c.fill(); // teeth grin? no — mustache
    },
    nell(c) {
      c.fillStyle="#0984e3"; rr(c,-32,2,64,78,20); c.fill(); // uniform
      c.fillStyle="#ffeaa7"; for(let i=0;i<2;i++){rr(c,-30+i*34,10,8,20,4);c.fill();}
      c.fillStyle="#ffeaa7"; rr(c,-10,2,20,10,4); c.fill();
      c.fillStyle="#ffe0bd"; c.beginPath(); c.ellipse(0,-28,29,30,0,0,7); c.fill();
      c.fillStyle="#ffffff"; rr(c,-32,-56,64,14,7); c.fill(); // admiral cap
      c.fillStyle="#0984e3"; rr(c,-32,-46,64,8,3); c.fill();
      c.fillStyle="#111"; c.beginPath(); c.arc(-10,-30,2.6,0,7); c.arc(10,-30,2.6,0,7); c.fill();
      c.strokeStyle="#111"; c.lineWidth=2.4; c.beginPath(); c.arc(0,-16,6,-.3,Math.PI+.3,true); c.stroke();
    },
  };

  function drawCharacter(canvas, key) {
    const c = canvas.getContext("2d"); c.clearRect(0, 0, canvas.width, canvas.height);
    c.save(); c.translate(canvas.width / 2, canvas.height / 2);
    if (key === "nimbus") drawNimbus(c, canvas.width);
    else if (ENEMY_DRAWERS[key]) { c.scale(canvas.width / 220, canvas.height / 220); ENEMY_DRAWERS[key](c); }
    else if (RIVAL_DRAWERS[key]) { c.scale(canvas.width / 180, canvas.height / 180); RIVAL_DRAWERS[key](c); }
    else { // worm portrait fallback
      c.fillStyle = "#95e06c"; c.beginPath(); c.ellipse(0, 10, 50, 34, 0, 0, 7); c.fill();
      c.fillStyle = "#14102a"; c.beginPath(); c.arc(-14, 2, 5, 0, 7); c.arc(14, 2, 5, 0, 7); c.fill();
      c.strokeStyle = "#14102a"; c.lineWidth = 4; c.beginPath(); c.arc(0, 16, 12, .2, Math.PI - .2); c.stroke();
    }
    c.restore();
  }

  /* ---- WS-11 animated intro/story scene ----
     Parallax star drift + rotating/bobbing planets + bobbing ship, drawn onto an
     off-DOM-lifecycle canvas that callers place behind intro/story cards.
     NOTE: must be declared BEFORE the return below (was previously after it,
     making `scenes` permanently uninitialized — TDZ crash). */
  const scenes = [];
  function startScene(canvas, opts = {}) {
    stopScene(canvas);
    const density = opts.density || 1;
    const starsFar = Array.from({ length: Math.round(60 * density) }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1 + .3, s: Math.random() * .008 + .002,
      hue: [45, 190, 280, 330][Math.floor(Math.random() * 4)],
    }));
    const starsNear = Array.from({ length: Math.round(30 * density) }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + .7, s: Math.random() * .02 + .006,
      hue: [45, 190, 280, 330][Math.floor(Math.random() * 4)],
    }));
    // procedural planets: hue bands rotate around a shaded sphere
    const planets = (opts.planets || [
      { hx: .78, hy: .28, r: .16, hue: 150, spin: .05, ring: false },
      { hx: .18, hy: .68, r: .11, hue: 25, spin: -.08, ring: true },
      { hx: .55, hy: .82, r: .07, hue: 210, spin: .1, ring: false },
    ]).map(p => ({ ...p, phase: Math.random() * 7 }));
    const scene = { canvas, starsFar, starsNear, planets, tint: opts.tint || "#ffd76b", t0: performance.now() };
    scenes.push(scene);
    if (scenes.length === 1) requestAnimationFrame(sceneLoop);
    return scene;
  }
  function stopScene(canvas) {
    const i = scenes.findIndex(s => s.canvas === canvas);
    if (i >= 0) scenes.splice(i, 1);
    const c = canvas.getContext("2d"); c && c.clearRect(0, 0, canvas.width, canvas.height);
  }
  function setSceneTint(canvas, tint) {
    const s = scenes.find(x => x.canvas === canvas); if (s && tint) s.tint = tint;
  }
  function sceneLoop(now) {
    if (!scenes.length) return; // loop self-stops when last scene removed
    for (const sc of scenes) {
      const cv = sc.canvas, c = cv.getContext("2d");
      if (cv.width !== cv.clientWidth || cv.height !== cv.clientHeight) {
        cv.width = cv.clientWidth || 300; cv.height = cv.clientHeight || 150;
      }
      const w = cv.width, h = cv.height, t = (now - sc.t0) / 1000;
      c.clearRect(0, 0, w, h);
      // deep space wash tinted toward the current beat color
      const g = c.createRadialGradient(w * .5, h * .35, 10, w * .5, h * .5, Math.max(w, h) * .75);
      g.addColorStop(0, hexA(sc.tint, .10)); g.addColorStop(1, "rgba(7,5,26,0)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // parallax star drift (far layer slower than near)
      for (const layer of [sc.starsFar, sc.starsNear]) {
        for (const s of layer) {
          s.x -= s.s / 60; if (s.x < -0.01) s.x = 1.01;
          const tw = .5 + .5 * Math.sin(t * 1.6 + s.y * 40);
          c.fillStyle = `hsla(${s.hue},90%,78%,${(.25 + tw * .5) * (layer === sc.starsNear ? 1 : .6)})`;
          c.beginPath(); c.arc(s.x * w, s.y * h, s.r, 0, 7); c.fill();
        }
      }
      // planets: slow rotation illusion + gentle bob
      for (const p of sc.planets) {
        const px = p.hx * w, py = p.hy * h + Math.sin(t * .5 + p.phase) * h * .012;
        const pr = Math.min(w, h) * p.r;
        c.save();
        // atmosphere glow in scene tint family
        c.shadowColor = `hsla(${p.hue},80%,65%,.5)`; c.shadowBlur = pr * .5;
        const body = c.createRadialGradient(px - pr * .4, py - pr * .4, pr * .1, px, py, pr);
        body.addColorStop(0, `hsl(${p.hue},70%,72%)`);
        body.addColorStop(.7, `hsl(${p.hue},60%,42%)`);
        body.addColorStop(1, `hsl(${p.hue},65%,20%)`);
        c.fillStyle = body;
        c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
        c.shadowBlur = 0;
        // rotating latitude bands (clipped to sphere, offset by spin*t)
        c.save(); c.beginPath(); c.arc(px, py, pr, 0, 7); c.clip();
        c.globalAlpha = .22; c.fillStyle = `hsl(${p.hue},85%,80%)`;
        for (let i = -2; i <= 2; i++) {
          const by = py + i * pr * .42 + Math.sin(t * .3 + i + p.phase) * pr * .06;
          c.beginPath(); c.ellipse(px + Math.sin(t * .2 + i) * pr * .15, by, pr * 1.1, pr * .09, 0, 0, 7); c.fill();
        }
        c.restore();
        // terminator shading so rotation reads visually
        const sh = c.createRadialGradient(px - pr * .5, py - pr * .5, pr * .2, px, py, pr * 1.25);
        sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(5,3,20,.55)");
        c.fillStyle = sh; c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
        if (p.ring) { // tilted ring behind/infront
          c.strokeStyle = `hsla(${p.hue},80%,80%,.55)`; c.lineWidth = pr * .12;
          c.save(); c.translate(px, py); c.rotate(-.45); c.scale(1, .32);
          c.beginPath(); c.arc(0, 0, pr * 1.55, 0, 7); c.stroke(); c.restore();
        }
        c.restore();
      }
      // Nimbus's rustbucket ship: gentle bob + engine flicker
      const sx = w * .30 + Math.sin(t * .23) * w * .012;
      const sy = h * .46 + Math.sin(t * .9) * h * .014 + Math.cos(t * 1.7) * h * .004;
      const ss = Math.min(w, h) * .0016;
      c.save(); c.translate(sx, sy); c.scale(ss, ss);
      c.fillStyle = "#c9b8ff"; c.beginPath();
      c.moveTo(-46, 8); c.quadraticCurveTo(0, -34, 44, 6); c.quadraticCurveTo(10, 20, -46, 8); c.closePath(); c.fill();
      c.fillStyle = "#8f7ae0"; c.beginPath(); c.arc(4, -6, 9, 0, 7); c.fill();
      c.fillStyle = "#ffd76b";
      c.beginPath(); c.moveTo(-46, 8); c.lineTo(-62 - Math.random() * 10, 12 + Math.random() * 6); c.lineTo(-44, 16); c.closePath(); c.fill();
      c.restore();
    }
    requestAnimationFrame(sceneLoop);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  return { initBG, drawCharacter, startScene, stopScene, setSceneTint };
})();
