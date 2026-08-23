/* ============ World: live 2D expedition you walk through ============ */
"use strict";
const World = (() => {
  const G = { running: false };
  const SPEED = 3.1;

  function open() {
    if (!spendEnergy(1)) { Hub.open(); return; }
    const p = DATA.planets.find(x => x.id === State.planet);
    G.canvas = $("world-canvas");
    G.ctx = G.canvas.getContext("2d");
    fit();
    G.metRival = false; // reset per expedition — critical, else rivals become unmeetable
    // world bounds scale with canvas
    G.w = G.canvas.width; G.h = G.canvas.height;
    G.player = { x: 80, y: G.h * .6, vx: 0, vy: 0, face: 1, bob: 0 };
    spawnEntities(p);
    G.timeLeft = isNight() ? 100 : 80; // generous clock — exploration should never feel like a race
    State.flags.pizazzUsed = false;
    G.pizazz = maybePizazz(p);
    G.running = true;
    bindInput();
    window.__stickHook = (dx, dy) => { G.stick = (dx || dy) ? { dx, dy } : null; };
    showScreen("screen-world");
    updateWorldHud(p);
    if (window.__WORLD_DEBUG__) window.__WORLD_DEBUG__();
    if (!State.flags["visited_" + p.id]) {
      State.flags["visited_" + p.id] = true;
      toast(`🛸 ${p.name}: collect glowing 🌱, avoid monsters, find the tea rival 🍵 → then the vault ⛩️`, "gold");
    } else toast(`🛸 Touchdown: ${p.name}`, "gold");
    let last = performance.now();
    cancelAnimationFrame(G.raf);
    const loop = (t) => {
      if (!G.running) return;
      const dt = Math.min(.05, (t - last) / 1000); last = t;
      step(dt, p); draw(p);
      G.raf = requestAnimationFrame(loop);
    };
    G.raf = requestAnimationFrame(loop);
  }

  function fit() {
    G.canvas.width = Math.min(980, innerWidth - 20);
    G.canvas.height = Math.min(520, innerHeight - 150);
  }

  function updateWorldHud(p) {
    $("world-title").textContent = `${p.icon} ${p.name} — ${isNight() ? "🌙 night run" : "day run"} · ⏱ ${Math.ceil(G.timeLeft)}s`;
    // objective line: what should I do next?
    let goal;
    if (State.jewels.includes(p.jewel)) goal = "Jewel recovered! 🌱 gather & cook, or head home (🛸)";
    else if (G.vaultLocked === true) goal = `Goal: beat ${DATA.rivals.find(r => r.id === p.rival).name} (🍵) at tea → then open the vault ⛩️`;
    else goal = "Goal: reach the glowing VAULT ⛩️ on the right!";
    $("world-sub").textContent = `${goal} · WASD/arrows move · 🔥 heals`;
  }

  function spawnEntities(p) {
    G.ents = [];
    const nIng = rand(5, 7);
    for (let i = 0; i < nIng; i++)
      G.ents.push({ kind: "ing", ing: pick(p.ingredients), x: rand(120, G.w - 60), y: rand(60, G.h - 70), r: 16 });
    const nEnemy = 2 + rand(0, 2);
    for (let i = 0; i < nEnemy; i++) {
      const key = pick(p.enemies.filter(k => k !== "tidehulk"));
      G.ents.push({ kind: "enemy", ekey: key, x: rand(200, G.w - 80), y: rand(60, G.h - 70),
        vx: pick([-1, 1]) * rand(.4, 1), vy: 0, homeY: 0,
        img: ["grubble", "magmaw", "tidehulk"].includes(DATA.enemies[key].emojiKey)
          ? "assets/" + DATA.enemies[key].emojiKey + ".png" : null, r: 26 });
    }
    if (!State.allies.includes(p.rival))
      G.ents.push({ kind: "rival", id: p.rival, x: rand(300, G.w - 120), y: rand(80, G.h - 90), r: 28,
        img: "assets/" + p.rival + ".png" });
    // vault: always visible so progress is legible; locked until the clue condition
    G.vaultLocked = State.jewels.includes(p.jewel) ? "taken" :
      !(upgradeLv("observatory") >= 1 || State.allies.includes(p.rival));
    if (G.vaultLocked !== "taken")
      G.ents.push({ kind: "vault", x: G.w - 50, y: G.h * .45, r: 34 });
    // campfire
    G.ents.push({ kind: "camp", x: rand(200, G.w - 200), y: rand(80, G.h - 90), r: 22 });
  }

  /* ---------- input ---------- */
  function bindInput() {
    G.keys = {};
    G.kd = (e) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
      G.keys[e.code] = true;
      if (e.code === "Escape") leave();
    };
    G.ku = (e) => { G.keys[e.code] = false; };
    document.addEventListener("keydown", G.kd);
    document.addEventListener("keyup", G.ku);
  }
  function unbind() {
    document.removeEventListener("keydown", G.kd);
    document.removeEventListener("keyup", G.ku);
  }

  /* ---------- simulation ---------- */
  function step(dt, p) {
    if (G.paused) return; // freeze everything during battles/tea/story — timer must NOT drain
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) return leave("The ship's timer chimes — back aboard.");
    const k = G.keys || {};
    let dx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    let dy = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
    // virtual stick
    if (G.stick) { dx += G.stick.dx; dy += G.stick.dy; }
    const len = Math.hypot(dx, dy) || 1;
    G.player.vx = dx / Math.max(1, len) * SPEED;
    G.player.vy = dy / Math.max(1, len) * SPEED;
    if (dx) G.player.face = dx > 0 ? 1 : -1;
    G.player.x = clamp(G.player.x + G.player.vx, 24, G.w - 24);
    G.player.y = clamp(G.player.y + G.player.vy, 30, G.h - 40);
    G.player.bob += dt * 10 * (Math.abs(G.player.vx) + Math.abs(G.player.vy) > .5 ? 1 : 0);

    // enemies wander & chase when close
    for (const e of G.ents) {
      if (e.kind === "enemy") {
        const d = dist(e, G.player);
        // chase only if close AND not on post-fight cooldown
        if (d < 110 && !e.cool) { e.x += (G.player.x - e.x) / d * 1.05; e.y += (G.player.y - e.y) / d * 1.05; }
        else {
          e.x += e.vx; e.y += Math.sin(performance.now() / 900 + e.x) * .4;
          if (e.x < 60 || e.x > G.w - 40) e.vx *= -1;
        }
        if (e.cool && dist(e, G.player) < 90) { /* keep distance while cooling */ }
        if (d < 32 && !G.paused) startFight(e);
      }
      if ((e.kind === "ing") && dist(e, G.player) < 26) collect(e, p);
      if (e.kind === "camp" && dist(e, G.player) < 30) rest(e);
      if (e.kind === "vault" && dist(e, G.player) < 44) {
        if (G.vaultLocked === true) {
          if (!G.lockMsgT || performance.now() - G.lockMsgT > 4000) {
            G.lockMsgT = performance.now();
            const rival = DATA.rivals.find(r => r.id === p.rival);
            floatText("🔒 sealed!", e.x, e.y - 40);
            toast(`🔒 The vault is sealed. Beat ${rival.name} at their tea party (🍵) or build an Observatory (🏠) to learn the way in.`);
          }
        } else enterVault(p);
      }
      if (e.kind === "rival" && !e.coolRival && dist(e, G.player) < 36) meetRival(e, p);
    }
    G.ents = G.ents.filter(e => !e.dead);
    if (Math.floor(G.timeLeft) % 5 === 0) updateWorldHud(p);
    // low HP heartbeat
    const low = State.hp <= State.maxHp * .25;
    if (low !== G.hbOn) { G.hbOn = low; Chip.heartbeat(low); }
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;

  function collect(e, p) {
    e.dead = true;
    addInv(e.ing, 1);
    AudioSys.good(); Chip.pickup();
    floatText(`+${DATA.ingredients[e.ing].emoji}`, e.x, e.y);
    burst(e.x, e.y, "#95e06c", 12);
    updateHUD();
  }
  function rest(e) {
    if (e.used) return;
    e.used = true;
    State.hp = clamp(State.hp + 10, 0, State.maxHp);
    AudioSys.heal(); Chip.heal(); floatText("+❤️10", e.x, e.y); updateHUD();
  }
  function startFight(e) {
    G.paused = true;
    shake(10);
    burst(e.x, e.y, "#ff5470", 18);
    Battle.start(e.ekey,
      () => { // won
        e.dead = true;
        G.paused = false;
        floatText("🏆", G.player.x, G.player.y - 40);
        burst(e.x, e.y, "#ffd76b", 22);
        Chip.victoryFanfare();
        resume();
      },
      () => { // fled
        e.cool = 5; // seconds before it can chase/fight again
        pushAway(e);
        G.paused = false;
        resume();
      });
  }
  function pushAway(e) {
    const dx = G.player.x - e.x, dy = G.player.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    G.player.x = clamp(G.player.x + dx / len * 70, 24, G.w - 24);
    G.player.y = clamp(G.player.y + dy / len * 70, 30, G.h - 40);
    setTimeout(() => e.cool = null, 5000);
  }
  function meetRival(e, p) {
    if (G.metRival || e.dead) return;
    G.metRival = true;
    G.paused = true;
    const alreadyAlly = State.allies.includes(p.rival);
    TeaParty.start(p.rival, (won) => {
      if (won) { e.dead = true; toast(`🤝 ${DATA.rivals.find(r=>r.id===p.rival).name} travels with you now!`, "gold"); }
      else {
        // lost the duel: rival stays, steps back so you can approach & retry
        e.coolRival = 3;
        pushAway(e);
        setTimeout(() => e.coolRival = null, 3000);
        G.metRival = false; // allow rematch this run
      }
      G.paused = false;
      resume();
    });
  }
  function enterVault(p) {
    if (G.inVault || State.jewels.includes(p.jewel)) return;
    G.inVault = true;
    const lines = {
      hearthstone: [
        { speaker: "", text: "The vault breathes warm air. On a stone pedestal sits the HEARTHSTONE RUBY — the whole grove leans toward it like guests toward an oven." },
        { speaker: "Nimbus Quill", text: "One jewel. Grandmother... I can feel the Kettle stirring." }],
      gale: [
        { speaker: "", text: "Winds howl around a storm vault of black glass. Wedged in the lava: the GALE EMERALD." },
        { speaker: "Nimbus Quill", text: "Two down. Baron Volt will have noticed by now." }],
      abyssal: [
        { speaker: "", text: "At the bottom of the trench-vault, the ABYSSAL SAPPHIRE glows like captured midnight." },
        { speaker: "Oracle Worm", text: "(adjusting monocle) The Kettle may be relit. Also, Baron Volt has sent threatening fruit baskets. Mostly we worry about the Kettle." }],
    };
    Story.show("💠", lines[p.jewel], () => {
      State.jewels.push(p.jewel);
      Chip.jewelArpeggio();
      toast(`💠 ${DATA.jewels[p.jewel]} RECOVERED!`, "gold");
      G.inVault = false;
      G.ents = G.ents.filter(e => e.kind !== "vault");
      if (State.jewels.length >= 3) {
        setTimeout(() => Story.show("⚡", [
          { speaker: "", text: "The sky splits. A one-eyed figure in a red cape descends, wearing a green belt buckle that absolutely does NOT match." },
          { speaker: "BARON VOLT", text: "THREE JEWELS?! You rekindle MY kettle, tiny chef? Those jewels have graced MY tasting table for an AGE!" },
          { speaker: "Nimbus Quill", text: "It was never your kettle. And that buckle clashes with everything. Let's settle it." },
          { speaker: "BARON VOLT", text: "HA! Finally — a WORTHY COURSE. To the death— er, to the DESSERT!" },
        ], () => Battle.start("volt", null)), 900);
      }
    });
  }

  function floatText(txt, x, y) {
    G.floats = G.floats || [];
    G.floats.push({ txt, x, y, life: 1.2 });
  }
  // particle burst (pizazz!)
  function burst(x, y, color, n) {
    G.parts = G.parts || [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.6;
      G.parts.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 1, life: .6 + Math.random()*.5,
        color, r: 1.5 + Math.random()*2.5 });
    }
  }

  /* ---------- render ---------- */
  function shake(px) { G.shake = px; }
  // PIZAZZ MODE: rare dazzling run — double sparkles, rainbow trail, bonus loot luck
  function maybePizazz(p) {
    if (State.flags.pizazzUsed || !chance(.18)) return false;
    State.flags.pizazzUsed = true;
    G.pizazz = true;
    toast("✨ PIZAZZ MODE! The stars are feeling generous this trip ✨", "gold");
    Chip.play("title");
    return true;
  }
  function draw(p) {
    const c = G.ctx;
    c.save();
    if (G.shake > 0) {
      c.translate((Math.random()-.5) * G.shake, (Math.random()-.5) * G.shake);
      G.shake *= .86; if (G.shake < .5) G.shake = 0;
    }
    // bg
    const img = G.bgImg && G.bgImg.src.endsWith(p.id + ".png") ? G.bgImg : null;
    if (!img) { G.bgImg = new Image(); G.bgImg.src = "assets/" + p.id + ".png"; }
    if (G.bgImg.complete) c.drawImage(G.bgImg, 0, 0, G.w, G.h);
    else { c.fillStyle = "#14102f"; c.fillRect(0, 0, G.w, G.h); }
    // night tint
    if (isNight()) { c.fillStyle = "rgba(10,8,40,.45)"; c.fillRect(0, 0, G.w, G.h); }

    // sort by y for depth
    const ents = [...G.ents].sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e.kind === "ing") {
        const t = performance.now() / 400 + e.x;
        c.save(); c.translate(e.x, e.y + Math.sin(t) * 3);
        glow(c, 18, "#95e06c");
        c.font = "22px serif"; c.textAlign = "center";
        c.fillText(DATA.ingredients[e.ing].emoji, 0, 6);
        c.restore();
      } else if (e.kind === "enemy") {
        drawSprite(c, e.img, e.x, e.y, 52, G.player.bob);
        glow(c, 20, "#ff5470");
      } else if (e.kind === "rival") {
        drawSprite(c, e.img, e.x, e.y, 56);
        glow(c, 22, "#4ecdc4");
        c.fillStyle = "#fff"; c.font = "bold 12px sans-serif"; c.textAlign = "center";
        c.fillText("🍵!", e.x, e.y - 38);
      } else if (e.kind === "vault") {
        const t = performance.now() / 300;
        glow(c, 34 + Math.sin(t) * 6, G.vaultLocked === true ? "#8d84c0" : "#ffc857");
        c.font = "34px serif"; c.textAlign = "center";
        c.fillText(G.vaultLocked === true ? "🔒⛩️" : "⛩️", e.x, e.y + 12);
        c.fillStyle = G.vaultLocked === true ? "#b3aade" : "#ffc857"; c.font = "bold 11px sans-serif";
        c.fillText(G.vaultLocked === true ? "SEALED VAULT" : "VAULT", e.x, e.y + 32);
      } else if (e.kind === "camp") {
        const f = Math.sin(performance.now() / 120) * 3;
        glow(c, 22 + f, "#ffa502");
        c.font = "26px serif"; c.textAlign = "center";
        c.fillText("🔥", e.x, e.y + 8);
      }
    }

    // player
    const pl = G.player;
    const bounce = Math.abs(Math.sin(pl.bob)) * 4;
    c.save(); c.translate(pl.x, pl.y - bounce); c.scale(pl.face, 1);
    drawSpriteAt(c, "assets/nimbus.png", 0, 0, 58);
    c.restore();

    // floats
    for (const f of (G.floats || [])) {
      f.life -= .016; f.y -= .8;
      c.globalAlpha = Math.max(0, f.life);
      c.fillStyle = "#fff"; c.font = "bold 16px sans-serif"; c.textAlign = "center";
      c.fillText(f.txt, f.x, f.y);
      c.globalAlpha = 1;
    }
    G.floats = (G.floats || []).filter(f => f.life > 0);

    // vignette
    const vg = c.createRadialGradient(G.w / 2, G.h / 2, G.h * .4, G.w / 2, G.h / 2, G.h);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)");
    c.fillStyle = vg; c.fillRect(0, 0, G.w, G.h);

    // particles
    if (G.parts) for (const q of G.parts) {
      q.x += q.vx; q.y += q.vy; q.vy += .06; q.life -= .02;
      c.globalAlpha = Math.max(0, q.life);
      c.fillStyle = q.color;
      c.beginPath(); c.arc(q.x, q.y, q.r, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
    G.parts = (G.parts || []).filter(q => q.life > 0);

    // player trail in pizazz mode
    if (G.pizazz && (Math.abs(G.player.vx) + Math.abs(G.player.vy) > .5)) {
      const hue = (performance.now() / 4) % 360;
      burst(G.player.x, G.player.y + 10, `hsl(${hue},95%,70%)`, 2);
      // extra sparkle pickups: make ingredients glimmer bigger
    }

    // pizazz frame shimmer
    if (G.pizazz) {
      const hue = (performance.now() / 6) % 360;
      c.strokeStyle = `hsla(${hue},90%,65%,.5)`; c.lineWidth = 6;
      c.strokeRect(3, 3, G.w - 6, G.h - 6);
    }
    c.restore();
  }

  function drawSprite(c, src, x, y, size, bob = 0) {
    drawSpriteAt(c, src, x, y, size, bob);
  }
  function drawSpriteAt(c, src, x, y, size, bob = 0) {
    if (!src) return;
    if (!G.spriteCache) G.spriteCache = {};
    let im = G.spriteCache[src];
    if (!im) { im = new Image(); im.src = src; G.spriteCache[src] = im; }
    if (im.complete && im.naturalWidth > 0) c.drawImage(im, x - size / 2, y - size / 2 - bob, size, size);
    else if (im.complete) { /* broken image: skip */ }
    else { c.fillStyle = "#35296e"; c.beginPath(); c.arc(x, y, size / 2.4, 0, 7); c.fill(); }
  }
  function glow(c, r, color) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, color + "88"); g.addColorStop(1, color + "00");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
  }

  /* ---------- leave / resume ---------- */
  function resume() {
    // return to a running world after an interruption (battle/tea/story)
    if (!G.running) { Hub.open(); return; }
    showScreen("screen-world");
  }

  function leave(msg) {
    if (!G.running) return;
    G.running = false;
    cancelAnimationFrame(G.raf);
    unbind();
    window.__stickHook = null;
    Chip.heartbeat(false);
    if (msg) toast(msg);
    updateHUD();
    Hub.open();
  }

  // expose for battle callbacks via window hook set below
  window.World = { open, leave, resume,
    // debug/testing hook (harmless in production; used by automated QA)
    __debug: () => G };
  return window.World;
})();

/* touch stick for mobile / iPad */
(function () {
  let stickId = null, sx = 0, sy = 0;
  const el = () => document.getElementById("touch-stick");
  const knob = () => document.getElementById("stick-knob");
  const worldOpen = () => document.getElementById("screen-world")?.classList.contains("active");

  function setKnob(dx, dy) {
    const k = knob(); if (!k) return;
    k.style.left = (33 + dx * 33) + "px";
    k.style.top  = (33 + dy * 33) + "px";
  }
  function emit(e) {
    const dx = clamp((e.clientX - sx) / 40, -1, 1), dy = clamp((e.clientY - sy) / 40, -1, 1);
    if (Math.abs(dx) < .18 && Math.abs(dy) < .18) { if (window.__stickHook) window.__stickHook(0, 0); setKnob(0, 0); return; }
    if (window.__stickHook) window.__stickHook(dx, dy);
    setKnob(clamp(dx * 1.4, -1, 1), clamp(dy * 1.4, -1, 1));
  }
  // Stick control: use the on-screen stick itself (pointerdown ON it), with
  // capture so iPad Safari keeps sending moves even when the finger drifts off.
  document.addEventListener("pointerdown", e => {
    if (!worldOpen() || touchDriving) return;
    const s = el();
    if (!s || s.style.display === "none") return;
    if (!s.contains(e.target)) return;          // only start drags on the stick
    stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
    try { s.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }, { passive: false });
  document.addEventListener("pointermove", e => {
    if (touchDriving || stickId === null || e.pointerId !== stickId) return;
    e.preventDefault(); emit(e);
  }, { passive: false });
  const end = e => {
    if (touchDriving || stickId === null || e.pointerId !== stickId) return;
    stickId = null;
    if (window.__stickHook) window.__stickHook(0, 0);
    setKnob(0, 0);
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);

  /* --- touch-event fallback (iPad Safari) --------------------------------
     Safari often fires pointercancel almost immediately on drags that start
     inside a scrollable ancestor (.screen has overflow-y:auto) because its
     gesture recognizer claims the touch for scrolling — the pointer stream
     dies and the stick never moves. Handling raw touch events with
     preventDefault() blocks that gesture takeover. When touch is driving,
     pointer handlers stand down to avoid double-processing. */
  let touchDriving = false;
  const stickEl = () => {
    const s = el();
    if (!s || s.style.display === "none" || !worldOpen()) return null;
    return s;
  };
  let s0 = null;
  window.__touchProbe = () => ({touchDriving, s0, sx, sy});
  function touchStart(e) {
    const s = stickEl();
    if (!s) return;
    const t = [...e.changedTouches].find(t => s.contains(t.target));
    if (!t) return;
    touchDriving = true;
    sx = t.clientX; sy = t.clientY; s0 = t.identifier;
    e.preventDefault();
  }
  function touchMove(e) {
    if (!touchDriving || s0 === null) return;
    const t = [...e.changedTouches].find(t => t.identifier === s0);
    if (!t) return;
    e.preventDefault();
    emit(t);
  }
  function touchEnd(e) {
    if (!touchDriving || s0 === null) return;
    if ([...e.changedTouches].some(t => t.identifier === s0)) {
      s0 = null; touchDriving = false;
      if (window.__stickHook) window.__stickHook(0, 0);
      setKnob(0, 0);
      e.preventDefault();
    }
  }
  document.addEventListener("touchstart", touchStart, { passive: false });
  document.addEventListener("touchmove", touchMove, { passive: false });
  document.addEventListener("touchend", touchEnd, { passive: false });
  document.addEventListener("touchcancel", touchEnd, { passive: false });


  /* show stick on any touch-capable device (iPad reports pointer:fine in some modes) */
  const touchy = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 1;
  if (touchy) {
    const show = () => { const s = el(); if (s) s.classList.add("js-touch"); };
    show();
    // re-assert each time the world screen opens (CSS media query may hide it)
    new MutationObserver(show).observe(document.getElementById("screen-world") || document.body, { attributes: true, attributeFilter: ["class"] });
  }
})();
