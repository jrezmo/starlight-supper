/* ============ Cooking, Forklore, wormery, shelter, market (v2 energy) ============ */
"use strict";

/* ---------------------------------------------------------------------------
   Cooking v3 — WS-9 Tactile Cooking Rework
   A dish is cooked as a short sequence of touch-first canvas minigames, declared
   per recipe in DATA.recipes[].stages:
     chop   — tap as each ingredient rolls under the blade (rhythm + combo)
     pour   — hold to pour, drag to chase a drifting vessel, stop at the line
     stir   — drag smooth circles at a "just right" speed, obey reversals
     absorb — steer a flavor orb into matching motes, dodge the bitter ones
   then a plated-dish reveal with a 1–5 star rating.

   Public contract (unchanged, other screens rely on it):
     Cooking.open()                      → kitchen panel
     Cooking.recipeLikes(recipe)         → base likes incl. bonuses
     State.dishes[recipeId]              → count of plated dishes
     State.flags["q_" + recipeId]        → best quality so far, integer 1–5
   Extras: Cooking.stagesFor(recipe), Cooking.drawIngredient(ctx,id,x,y,r,rot),
           Cooking.mode() / Cooking.setMode("tactile"|"classic").
   The original slider survives as the "classic" accessibility mode.
--------------------------------------------------------------------------- */
const Cooking = (() => {
  let session = null;   // the dish being cooked (survives leaving the panel; cleared once served)
  let G = null;         // live canvas runtime, null whenever the minigame canvas isn't mounted
  let classicStop = null;

  const TAU = Math.PI * 2, HEAD = 46;
  const MODE_KEY = "starlight-supper-cookmode";
  const FONT = "'Trebuchet MS','Segoe UI',sans-serif";
  const COL = { gold: "#ffc857", coral: "#ff6b6b", teal: "#4ecdc4", mint: "#95e06c", lav: "#b39ddb", cream: "#fff3e2", ink: "#14102a", danger: "#ff5470" };
  const STAGE_INFO = {
    chop:    { icon: "🔪", name: "Chop",    hint: "Tap as each one rolls under the blade!", keys: "Space" },
    pour:    { icon: "💧", name: "Pour",    hint: "Hold to pour, drag to follow the bowl. Let go at the green line!", keys: "hold Space · ← →" },
    stir:    { icon: "🥄", name: "Stir",    hint: "Drag smooth circles the way the arrows point. Not too fast!", keys: "arrow keys in a circle" },
    absorb:  { icon: "🔮", name: "Infuse",  hint: "Drag to steer your orb into the flavors. Dodge the spiky bitter ones!", keys: "arrow keys" },
    garnish: { icon: "✨", name: "Garnish", hint: "Flawless! Tap when the ring meets the plate.", keys: "Space" },
  };
  const GRADE = {
    perfect: { label: "PERFECT!", col: COL.gold },
    good:    { label: "Nice!",    col: COL.teal },
    ok:      { label: "Okay",     col: COL.lav },
    miss:    { label: "Oops!",    col: COL.coral },
  };
  const ING = {
    starbloom:   { col: "#ff9ecb", hi: "#ffe08a" },
    glowsroom:   { col: "#4ecdc4", hi: "#d9fff8" },
    cloudfruit:  { col: "#bcd6ff", hi: "#ffffff" },
    emberpepper: { col: "#ff5a3c", hi: "#ffb347" },
    lavasalt:    { col: "#ffb37a", hi: "#fff0d9" },
    cinderfin:   { col: "#ff8f7a", hi: "#ffd0c4" },
    abysskelp:   { col: "#2fae7a", hi: "#7df0c0" },
    moonroe:     { col: "#b9a6ff", hi: "#f0e9ff" },
    pearlroot:   { col: "#d9ccff", hi: "#ffffff" },
    wormgold:    { col: "#ffc857", hi: "#fff3b0" },
  };

  /* ---------- small helpers ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const coarse = () => { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function starPath(c, x, y, r, rot, pts, inner) {
    pts = pts || 5; inner = inner || .46; c.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const a = (rot || 0) - Math.PI / 2 + i * Math.PI / pts, rad = i % 2 ? r * inner : r;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
  function txt(c, s, x, y, size, col, align, outline) {
    c.font = `bold ${Math.round(size)}px ${FONT}`; c.textAlign = align || "center"; c.textBaseline = "middle";
    if (outline) { c.lineWidth = Math.max(3, size / 6); c.strokeStyle = "rgba(13,10,31,.9)"; c.lineJoin = "round"; c.strokeText(s, x, y); }
    c.fillStyle = col; c.fillText(s, x, y);
  }
  function wrapTxt(c, s, x, y, maxW, size, col, lineH) {
    c.font = `bold ${Math.round(size)}px ${FONT}`;
    const words = s.split(" "), lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    lines.forEach((l, i) => txt(c, l, x, y + i * lineH, size, col));
    return lines.length;
  }

  /* ---------- procedural ingredient art (drawn in a 40×40 box, scaled to r) ---------- */
  function drawIng(c, id, x, y, r, rot) {
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(r / 20, r / 20);
    c.lineJoin = c.lineCap = "round"; c.lineWidth = 1.6;
    const edge = "rgba(20,16,42,.55)"; c.strokeStyle = edge;
    const dot = (px, py, pr, col) => { c.fillStyle = col; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); };
    switch (id) {
      case "starbloom":
        for (let i = 0; i < 5; i++) {
          c.save(); c.rotate(i * TAU / 5); c.fillStyle = i % 2 ? "#ff9ecb" : "#ffb3d6";
          c.beginPath(); c.ellipse(0, -10.5, 6.2, 9.5, 0, 0, TAU); c.fill(); c.stroke(); c.restore();
        }
        dot(0, 0, 5.5, "#ffe08a"); dot(-1.5, -1.5, 2, "#fff7d1"); break;
      case "glowsroom":
        c.fillStyle = "#fff3e2"; rr(c, -5, -1, 10, 18, 4); c.fill(); c.stroke();
        c.fillStyle = "#4ecdc4"; c.beginPath(); c.ellipse(0, 0, 18, 15, 0, Math.PI, TAU); c.closePath(); c.fill(); c.stroke();
        dot(-8, -6, 2.6, "#d9fff8"); dot(3, -9, 3.2, "#d9fff8"); dot(10, -4, 2, "#d9fff8"); break;
      case "cloudfruit":
        [[0, 6, 12.5], [-5, -4, 8.5], [5.5, -3, 8]].forEach(([px, py, pr]) => { c.beginPath(); c.arc(px, py, pr + 1, 0, TAU); c.fillStyle = edge; c.fill(); });
        [[0, 6, 12.5], [-5, -4, 8.5], [5.5, -3, 8]].forEach(([px, py, pr]) => dot(px, py, pr, "#dbe9ff"));
        dot(-4, 3, 4, "rgba(255,255,255,.85)"); dot(6, 9, 3, "rgba(255,158,203,.55)");
        c.strokeStyle = "#6b4a2e"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -11); c.lineTo(1, -17); c.stroke();
        c.fillStyle = "#95e06c"; c.beginPath(); c.ellipse(5.5, -17, 5, 2.6, -.4, 0, TAU); c.fill(); break;
      case "emberpepper":
        c.fillStyle = "#ff5a3c"; c.beginPath(); c.moveTo(-13, -8); c.quadraticCurveTo(4, -15, 15, 2);
        c.quadraticCurveTo(18, 12, 9, 13); c.quadraticCurveTo(0, 2, -13, -8); c.fill(); c.stroke();
        c.strokeStyle = "rgba(255,220,180,.8)"; c.lineWidth = 2; c.beginPath(); c.moveTo(-5, -8); c.quadraticCurveTo(5, -8, 11, 1); c.stroke();
        c.strokeStyle = "#5fae4a"; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-13, -8); c.lineTo(-18, -13); c.stroke();
        dot(14, -9, 1.6, "#ffb347"); dot(9, -14, 1.1, "#ffd76b"); break;
      case "lavasalt":
        [[-8, 4, 9, "#ffd9b0"], [6, 6, 8, "#ffe9cf"], [0, -7, 9.5, "#fff3e2"]].forEach(([px, py, s, col], k) => {
          c.fillStyle = col; c.strokeStyle = edge; c.beginPath();
          for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + k; c.lineTo(px + Math.cos(a) * s, py + Math.sin(a) * s * .85); }
          c.closePath(); c.fill(); c.stroke();
          c.strokeStyle = "#ff8a3c"; c.beginPath(); c.moveTo(px - s * .4, py); c.lineTo(px + s * .1, py - s * .3); c.lineTo(px + s * .4, py + s * .2); c.stroke();
        }); break;
      case "cinderfin":
        c.fillStyle = "#ff8f7a"; c.beginPath(); c.moveTo(-18, 2); c.quadraticCurveTo(-10, -13, 8, -10); c.quadraticCurveTo(21, -6, 18, 4);
        c.quadraticCurveTo(8, 13, -8, 11); c.quadraticCurveTo(-16, 9, -18, 2); c.fill(); c.stroke();
        c.strokeStyle = "rgba(255,240,230,.85)"; c.lineWidth = 1.8;
        for (let i = -1; i <= 2; i++) { c.beginPath(); c.moveTo(i * 7 - 4, -8); c.quadraticCurveTo(i * 7 + 1, 0, i * 7 - 4, 8); c.stroke(); }
        c.strokeStyle = "#4a2d4f"; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-15, 7); c.quadraticCurveTo(0, 14, 16, 6); c.stroke(); break;
      case "abysskelp":
        c.strokeStyle = "#2fae7a"; c.lineWidth = 8; c.beginPath(); c.moveTo(-3, 18); c.bezierCurveTo(-14, 6, 12, -4, 0, -18); c.stroke();
        c.strokeStyle = "#7df0c0"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-3, 18); c.bezierCurveTo(-14, 6, 12, -4, 0, -18); c.stroke();
        c.fillStyle = "#2fae7a"; c.beginPath(); c.ellipse(-9, 2, 6, 3.4, .7, 0, TAU); c.fill(); c.beginPath(); c.ellipse(8, -6, 6, 3.4, -.7, 0, TAU); c.fill();
        dot(-2, 8, 1.5, "#c9fff0"); dot(3, -8, 1.5, "#c9fff0"); break;
      case "moonroe":
        [[-7, 5], [5, 7], [0, -4], [10, -3], [-10, -5], [2, -13]].forEach(([px, py], i) => {
          dot(px, py, 6.6, i % 2 ? "#b9a6ff" : "#d6c8ff"); c.beginPath(); c.arc(px, py, 6.6, 0, TAU); c.stroke(); dot(px - 2, py - 2, 1.8, "rgba(255,255,255,.9)");
        }); break;
      case "pearlroot":
        c.fillStyle = "#efe9ff"; c.beginPath(); c.moveTo(0, -14); c.bezierCurveTo(16, -12, 15, 10, 0, 14); c.bezierCurveTo(-15, 10, -16, -12, 0, -14); c.fill(); c.stroke();
        dot(-4, -4, 4, "rgba(255,255,255,.95)"); dot(5, 4, 2.4, "rgba(179,157,219,.5)");
        c.strokeStyle = "#cdbfe8"; c.beginPath(); c.moveTo(0, 14); c.lineTo(-3, 19); c.moveTo(0, 14); c.lineTo(3, 19); c.stroke();
        c.strokeStyle = "#95e06c"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, -14); c.quadraticCurveTo(2, -19, 6, -19); c.stroke(); break;
      default: // wormgold + anything unknown: a little heap of golden caviar
        [[-8, 6], [0, 8], [8, 6], [-4, -1], [5, -1], [0, -8]].forEach(([px, py]) => {
          dot(px, py, 5.4, "#ffc857"); c.beginPath(); c.arc(px, py, 5.4, 0, TAU); c.stroke(); dot(px - 1.6, py - 1.6, 1.5, "#fff7d1");
        });
        c.fillStyle = "#fff"; starPath(c, 11, -11, 4.5, 0, 4, .35); c.fill(); starPath(c, -12, -8, 3, 0, 4, .35); c.fill();
    }
    c.restore();
  }

  /* ---------- procedural SFX (pentatonic, pitch climbs with the combo) ---------- */
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
  const note = i => SCALE[clamp(i, 0, SCALE.length - 1)];
  function tone(f, d, type, vol, when) { if (AudioSys.tone) AudioSys.tone(f, d, type, vol, when || 0); }
  function noise(d, vol, freq, when) { if (AudioSys.noise) AudioSys.noise(d, vol, freq, when || 0); }
  const Sfx = {
    go() { tone(659, .08, "square", .06); tone(988, .12, "square", .06, .08); },
    chop(combo) { noise(.05, .2, 2600); tone(150, .07, "square", .09); tone(note(combo), .1, "triangle", .1, .01); },
    perfect(combo) { tone(note(combo), .1, "triangle", .12); tone(note(combo + 2), .18, "sine", .1, .06); },
    miss() { tone(196, .12, "sawtooth", .07); tone(147, .2, "sawtooth", .07, .08); },
    whiff() { noise(.07, .08, 700); },
    pourTick(fill) { tone(260 + fill * 720, .05, "sine", .05); },
    spill() { noise(.09, .1, 500); },
    stirTick(p) { tone(220 + p * 330, .04, "triangle", .05); },
    flip() { tone(880, .08, "square", .07); tone(587, .14, "square", .07, .09); },
    absorb(combo) { tone(note(combo), .08, "sine", .12); tone(note(combo) * 2, .14, "sine", .06, .04); noise(.04, .05, 5000); },
    bitter() { tone(110, .22, "sawtooth", .12); tone(104, .26, "square", .07, .03); noise(.14, .12, 300); },
    combo(n) { [0, 2, 4].forEach((k, i) => tone(note(Math.min(8, n / 5 + k)), .1, "square", .06, i * .06)); },
    stageEnd(grade) {
      if (grade === "perfect") [0, 2, 4, 7].forEach((k, i) => tone(note(k), .16, "triangle", .11, i * .08));
      else if (grade === "good") [0, 2, 4].forEach((k, i) => tone(note(k), .14, "triangle", .1, i * .09));
      else if (grade === "ok") { tone(523, .12, "triangle", .09); tone(587, .16, "triangle", .09, .1); }
      else Sfx.miss();
    },
    drum() { noise(.05, .1, 1200); tone(120, .06, "sine", .1); },
    reveal() { noise(.3, .12, 4000); [0, 2, 4, 5].forEach((k, i) => tone(note(k), .22, "sine", .1, i * .05)); },
    star(i) { tone(note(i * 2), .2, "triangle", .13); tone(note(i * 2) * 2, .3, "sine", .06, .03); },
  };

  /* ---------- juice: particles, pop text, rings, shake, flash, hit-stop ---------- */
  function makeFX() {
    const parts = [], texts = [], rings = [];
    const calm = reducedMotion();
    const fx = {
      shake: 0, flash: 0, flashCol: "#fff", hitstop: 0,
      burst(x, y, col, n, o) {
        o = o || {};
        for (let i = 0; i < (n || 12); i++) {
          const a = o.angle != null ? o.angle + (Math.random() - .5) * (o.spread || 1) : Math.random() * TAU;
          const sp = (o.speed || 180) * (.35 + Math.random() * .85);
          parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), g: o.g != null ? o.g : 520,
            r: (o.size || 4) * (.55 + Math.random() * .9), col: Array.isArray(col) ? col[i % col.length] : col,
            life: 0, max: (o.life || .6) * (.6 + Math.random() * .7), shape: o.shape || "dot", rot: Math.random() * TAU, vr: (Math.random() - .5) * 12 });
        }
        if (parts.length > 420) parts.splice(0, parts.length - 420);
      },
      ring(x, y, col, r0, r1, life) { rings.push({ x, y, col, r0: r0 || 10, r1: r1 || 70, life: 0, max: life || .35 }); },
      text(x, y, str, col, size) { texts.push({ x, y, str, col: col || "#fff", size: size || 20, life: 0, max: .95 }); if (texts.length > 14) texts.shift(); },
      kick(amt) { if (!calm) fx.shake = Math.max(fx.shake, amt); },
      flashNow(col, a) { if (!calm) { fx.flash = a || .3; fx.flashCol = col || "#fff"; } },
      stop(sec) { if (!calm) fx.hitstop = Math.max(fx.hitstop, sec); },
      update(dt) {
        fx.shake = Math.max(0, fx.shake - dt * (18 + fx.shake * 6)); fx.flash = Math.max(0, fx.flash - dt * 1.6);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; }
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        }
        for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life += dt; if (t.life >= t.max) texts.splice(i, 1); }
        for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life += dt; if (r.life >= r.max) rings.splice(i, 1); }
      },
      draw(c) {
        for (const r of rings) {
          const k = r.life / r.max; c.globalAlpha = 1 - k; c.strokeStyle = r.col; c.lineWidth = 4 * (1 - k) + 1;
          c.beginPath(); c.arc(r.x, r.y, lerp(r.r0, r.r1, easeOutCubic(k)), 0, TAU); c.stroke();
        }
        for (const p of parts) {
          const k = p.life / p.max; c.globalAlpha = k < .7 ? 1 : (1 - k) / .3; c.fillStyle = p.col;
          if (p.shape === "star") { starPath(c, p.x, p.y, p.r * 1.5, p.rot, 4, .4); c.fill(); }
          else if (p.shape === "shard") { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.r, -p.r * .45, p.r * 2, p.r * .9); c.restore(); }
          else { c.beginPath(); c.arc(p.x, p.y, p.r * (1 - k * .5), 0, TAU); c.fill(); }
        }
        for (const t of texts) {
          const k = t.life / t.max, pop = k < .18 ? easeOutBack(k / .18) : 1;
          c.globalAlpha = k < .65 ? 1 : (1 - k) / .35;
          txt(c, t.str, t.x, t.y - k * 38, t.size * pop, t.col, "center", true);
        }
        c.globalAlpha = 1;
      },
    };
    return fx;
  }

  /* ---------- preferences ---------- */
  function mode() { try { return localStorage.getItem(MODE_KEY) === "classic" ? "classic" : "tactile"; } catch (e) { return "tactile"; } }
  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, m === "classic" ? "classic" : "tactile"); } catch (e) {}
    syncMenuToggle();
  }
  function syncMenuToggle() {
    const b = $("btn-cookmode"); if (b) b.textContent = mode() === "classic" ? "🍳 Cooking: Classic slider" : "🍳 Cooking: Tactile";
  }
  function kitchenListShowing() { return !session && activeScreen() === "screen-panel" && ($("panel-title").textContent || "").indexOf("🍳") === 0; }
  // pause-menu toggle is injected here so index.html stays untouched
  function installMenuToggle() {
    const card = document.querySelector("#overlay-menu .menu-card");
    if (!card || $("btn-cookmode")) return;
    const b = document.createElement("button"); b.id = "btn-cookmode"; b.className = "btn";
    b.title = "Switch between hands-on cooking minigames and the simple one-button slider";
    b.onclick = () => { setMode(mode() === "classic" ? "tactile" : "classic"); if (kitchenListShowing()) render(); };
    card.insertBefore(b, $("btn-howto") || null);
    syncMenuToggle();
  }

  /* ---------- kitchen panel ---------- */
  function recipeLikes(r) { return Math.round(r.baseLikes * likesBonusMult()); }
  function visibleRecipes() { return DATA.recipes.filter(r => !r.hidden); }
  function canMake(r) { return Object.entries(r.req).every(([ing, n]) => invCount(ing) >= n); }
  function stagesFor(r) {
    const s = (r.stages || []).filter(k => STAGES[k] && k !== "garnish");
    if (s.length >= 2) return s;
    return r.difficulty <= 2 ? ["chop", "stir"] : ["chop", "pour", "stir"];
  }

  function open() { render(); showScreen("screen-panel"); }

  function render() {
    teardown();
    const body = $("panel-body"); $("panel-title").textContent = "🍳 Kitchen (Lv " + upgradeLv("kitchen") + ")";
    if (session && session.committed) session = null;       // left during the reveal: the dish is already plated
    if (session) { session.mode === "classic" ? renderClassic() : mount(); return; }
    const classic = mode() === "classic";
    body.innerHTML = `<p class="map-desc">${classic
        ? "Hit the green zone for each ingredient. Perfect timing → gourmet quality → more likes & stronger battle dishes."
        : "Chop, pour, stir and infuse with your own hands. Cleaner prep → more ⭐ → more likes & stronger battle dishes."}</p>
      <div class="cook-mode-row"><span>Cooking style: <b>${classic ? "🎚 Classic slider" : "🖐 Tactile"}</b></span>
        <button class="btn btn-small" id="cook-mode-toggle">${classic ? "Switch to tactile" : "Switch to classic slider"}</button></div>` +
      visibleRecipes().map(r => {
        const can = canMake(r);
        const reqTxt = Object.entries(r.req).map(([ing, n]) => {
          return `${DATA.ingredients[ing].emoji}${DATA.ingredients[ing].name} ${invCount(ing)}/${n}`;
        }).join(" · ");
        const q = State.flags["q_" + r.id];
        const chips = classic ? "" : `<div class="stage-chips">${stagesFor(r).map(k => `<span>${STAGE_INFO[k].icon} ${STAGE_INFO[k].name}</span>`).join("")}</div>`;
        return `<div class="card asset-card"><img class="dish-art" src="assets/${r.art}" alt="" onerror="this.style.display='none'">
          <div class="asset-body"><div class="row spread">
          <div><h4>${r.emoji} ${r.name} ${q ? `<span class="tag">best ⭐${q}</span>` : ""}</h4><p>${r.lore}<br><small>${reqTxt}</small></p>${chips}</div>
          <button class="btn ${can ? "btn-primary" : ""}" data-cook="${r.id}" ${can && State.energy > 0 ? "" : "disabled"}>Cook ⚡1</button>
        </div></div></div>`;
      }).join("");
    body.querySelectorAll("[data-cook]").forEach(b => b.onclick = () => start(b.dataset.cook));
    $("cook-mode-toggle").onclick = () => { setMode(classic ? "tactile" : "classic"); AudioSys.click(); render(); };
  }

  function start(recipeId) {
    let r = DATA.recipes.find(x => x.id === recipeId);
    if (!r || r.hidden) return;
    // First-cook curriculum: the very first dish is always the gentle Nectarfoam — but only if
    // the pantry can actually make it (older saves may not have the ingredients).
    if (!State.flags.firstCookDone) {
      const first = DATA.recipes.find(x => x.id === "nectarfoam");
      if (first && canMake(first)) r = first;
    }
    if (!canMake(r)) { toast("Missing ingredients for that one."); return; }
    if (!spendEnergy(1)) return;
    State.flags.firstCookDone = true;
    Object.entries(r.req).forEach(([ing, n]) => useInv(ing, n));   // consume only once the final recipe is known
    session = { recipe: r, mode: mode(), combo: 0, maxCombo: 0, committed: false, quality: 0,
      prevBest: State.flags["q_" + r.id] || 0 };
    if (session.mode === "classic") {
      session.steps = [];
      Object.entries(r.req).forEach(([ing, n]) => { for (let i = 0; i < n; i++) session.steps.push(ing); });
      Object.assign(session, { stepIdx: 0, perfects: 0, goods: 0 });
    } else {
      Object.assign(session, { stages: stagesFor(r).slice(), stageIdx: 0, results: [], platingBonus: 0 });
    }
    AudioSys.click();
    render();
  }

  /* Plate the dish into State. flourish: true = perfect plating (feeds Star Chef), false = streak
     broken, null = leave the streak alone. Shared by both cooking modes. */
  function commit(s, quality, flourish) {
    quality = clamp(Math.round(quality), 1, 5);
    if (flourish === true) {
      State.flags.perfectDishesToday = (State.flags.perfectDishesToday || 0) + 1;
      if (State.flags.perfectDishesToday >= 3) State.flags.starChefStreak = true;
    } else if (flourish === false) {
      State.flags.perfectDishesToday = 0;
      State.flags.starChefStreak = false;
    }
    State.dishes[s.recipe.id] = (State.dishes[s.recipe.id] || 0) + 1;
    State.flags["q_" + s.recipe.id] = Math.max(State.flags["q_" + s.recipe.id] || 0, quality);
    s.quality = quality; s.committed = true;
    log(`🍳 Cooked <b>${s.recipe.emoji} ${s.recipe.name}</b> — ${"⭐".repeat(quality)}`);
    updateHUD();
  }
  function leaveKitchen() { teardown(); session = null; if (!offerSleep()) Hub.open(); }

  /* ======================= tactile canvas runtime ======================= */
  function isPaused() {
    const up = id => { const e = $(id); return e && !e.classList.contains("hidden"); };
    return document.hidden || up("overlay-menu") || up("overlay-story") || up("save-manager");
  }

  function teardown() {
    if (classicStop) { classicStop(); classicStop = null; }
    if (!G) return;
    cancelAnimationFrame(G.raf);
    G.off.forEach(f => f());
    G = null;
  }

  function mount() {
    const body = $("panel-body");
    setTitle();
    body.innerHTML = `<div class="cook-stage-wrap"><canvas class="cook-canvas" tabindex="0" role="application"
      aria-label="Cooking minigame. Prefer one button? Switch to the classic slider from the pause menu."></canvas></div>
      <p class="cook-help" id="cook-help"></p>`;
    const canvas = body.querySelector("canvas");
    // #panel-body shrink-wraps its content, so measure the screen itself (16px side padding)
    const room = ($("screen-panel").clientWidth || innerWidth) - 32;
    const W = Math.round(clamp(room, 280, 620));
    const avail = innerHeight - canvas.getBoundingClientRect().top - 86;
    const H = Math.round(clamp(avail, 330, Math.min(580, W * 1.3)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";                     // CSS keeps the aspect ratio (height:auto, max-width:100%)
    const off = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); off.push(() => el.removeEventListener(ev, fn, opt)); };
    G = { canvas, c: canvas.getContext("2d"), W, H, dpr, off, raf: 0, last: 0, time: 0, fx: makeFX(),
      keys: { left: false, right: false, up: false, down: false, act: false }, pid: null, wasPaused: false,
      phase: "intro", phaseT: 0, stage: null, kind: null, banner: null, comboPulse: 0,
      stars: Array.from({ length: 28 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .4, ph: Math.random() * 7 })) };

    const at = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * W / (b.width || W), (e.clientY - b.top) * H / (b.height || H)]; };
    on(canvas, "pointerdown", e => {
      if (!G || (G.pid != null && e.pointerId !== G.pid) || e.button > 0) return;
      G.pid = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); const p = at(e); input("down", p[0], p[1]);
    });
    on(canvas, "pointermove", e => { if (!G || e.pointerId !== G.pid) return; e.preventDefault(); const p = at(e); input("move", p[0], p[1]); });
    const release = e => { if (!G || e.pointerId !== G.pid) return; G.pid = null; input("up"); };
    on(canvas, "pointerup", release); on(canvas, "pointercancel", release);
    // iOS Safari: belt-and-braces against scroll / double-tap zoom / long-press callout while playing
    ["touchstart", "touchmove", "touchend"].forEach(ev => on(canvas, ev, e => { if (e.cancelable) e.preventDefault(); }, { passive: false }));
    on(canvas, "contextmenu", e => e.preventDefault());
    const KEYMAP = { Space: "act", Enter: "act", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
      ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
    const onKey = down => e => {
      if (!G) return;
      const k = KEYMAP[e.code]; if (!k) return;
      const tgt = e.target;
      if (tgt && tgt !== canvas && tgt.closest && tgt.closest("button,input,select,textarea,a")) return;
      if (isPaused()) return;
      e.preventDefault(); if (down && e.repeat) return;
      G.keys[k] = down; input("key", k, down);
    };
    on(document, "keydown", onKey(true)); on(document, "keyup", onKey(false));

    const s = session, scored = s.stages[s.stageIdx] === "garnish" ? !!s.platingBonus : s.results.length > s.stageIdx;
    if (scored) advance(); else beginStage();   // left during an outro banner: that stage is already scored
    G.last = performance.now();
    G.raf = requestAnimationFrame(frame);
  }

  function setTitle() {
    const s = session;
    $("panel-title").textContent = `🍳 ${s.recipe.name} (${Math.min(s.stageIdx + 1, s.stages.length)}/${s.stages.length})`;
  }
  function setHelp() {
    const el = $("cook-help"); if (!el || !G) return;
    const info = STAGE_INFO[G.kind];
    el.textContent = !info ? "" : coarse() ? info.hint : `${info.hint}  ·  ⌨ ${info.keys}`;
  }

  function comboUp(n) {
    const s = session; n = n || 1;
    for (let i = 0; i < n; i++) {
      s.combo++;
      if (s.combo % 5 === 0 && G) { G.fx.text(G.W / 2, HEAD + 34, `COMBO x${s.combo}!`, COL.gold, 26); Sfx.combo(s.combo); }
    }
    s.maxCombo = Math.max(s.maxCombo, s.combo); if (G) G.comboPulse = 1;
  }
  function comboBreak() { if (session) session.combo = 0; }

  function beginStage() {
    const s = session, kind = s.stages[s.stageIdx], keys = Object.keys(s.recipe.req);
    const ing = keys[s.stageIdx % Math.max(1, keys.length)] || "starbloom";
    G.kind = kind; G.phase = "intro"; G.phaseT = 0; G.banner = null;
    const E = { W: G.W, H: G.H, top: HEAD, fx: G.fx, keys: G.keys, session: s, recipe: s.recipe,
      diff: clamp(s.recipe.difficulty || 1, 1, 5), ease: 1 + .1 * upgradeLv("kitchen"),   // kitchen upgrade = wider windows
      ing, ings: keys.length ? keys : ["starbloom"], style: ING[ing] || ING.wormgold, comboUp, comboBreak };
    G.E = E; G.stage = STAGES[kind](E);
    setTitle(); setHelp();
  }

  function gradeOf(score) { return score >= .9 ? "perfect" : score >= .6 ? "good" : score >= .3 ? "ok" : "miss"; }

  function endStage() {
    const s = session, st = G.stage, score = clamp(st.score, 0, 1), grade = gradeOf(score);
    if (G.kind === "garnish") s.platingBonus = st.bonus || 1;
    else s.results.push({ kind: G.kind, score, grade });
    G.phase = "outro"; G.phaseT = 0;
    G.banner = { label: G.kind === "garnish" ? st.label : GRADE[grade].label, col: G.kind === "garnish" ? COL.gold : GRADE[grade].col, sub: st.summary || "" };
    Sfx.stageEnd(grade);
    if (grade === "perfect") { G.fx.kick(8); G.fx.flashNow(COL.gold, .22); G.fx.burst(G.W / 2, G.H * .45, [COL.gold, COL.cream, COL.teal], 36, { speed: 320, shape: "star", life: .9 }); }
  }

  function advance() {
    const s = session;
    s.stageIdx++;
    if (s.stageIdx < s.stages.length) { beginStage(); return; }
    // WS-1 plating finisher: a flawless prep earns the garnish flourish
    if (!s.platingBonus && s.results.length && s.results.every(r => r.grade === "perfect")) { s.stages.push("garnish"); beginStage(); return; }
    startReveal();
  }

  function starsFor(results) {
    const avg = results.reduce((a, r) => a + r.score, 0) / Math.max(1, results.length);
    return avg >= .88 ? 5 : avg >= .72 ? 4 : avg >= .52 ? 3 : avg >= .3 ? 2 : 1;
  }

  function startReveal() {
    const s = session;
    if (!s.committed) {
      const allPerfect = s.results.every(r => r.grade === "perfect");
      commit(s, starsFor(s.results), allPerfect ? (s.platingBonus > 1 ? true : null) : false);
    }
    s.phase = "reveal";
    G.kind = "reveal"; G.phase = "reveal"; G.phaseT = 0; G.banner = null;
    G.stage = makeReveal(G.E || { W: G.W, H: G.H, top: HEAD, fx: G.fx });
    const el = $("cook-help"); if (el) el.textContent = "";
  }

  function input(type, a, b) {
    if (!G || !session || isPaused()) return;
    const press = type === "down" || (type === "key" && a === "act" && b);
    if (G.phase === "intro") { if (press && G.phaseT > .25) { G.phase = "play"; G.phaseT = 0; G.keys.act = false; Sfx.go(); } return; }
    if (G.phase === "reveal") { if (press) G.stage.tap(); return; }
    if (G.phase !== "play") return;
    const st = G.stage;
    if (type === "down") st.down && st.down(a, b);
    else if (type === "move") st.move && st.move(a, b);
    else if (type === "up") st.up && st.up();
    else if (type === "key") st.key && st.key(a, b);
  }

  function frame(now) {
    if (!G) return;
    if (!G.canvas.isConnected || activeScreen() !== "screen-panel" || !session) { teardown(); return; }
    const raw = Math.max(0, (now - G.last) / 1000), dt = Math.min(.05, raw); G.last = now;
    G.rawDt = Math.min(.25, raw);   // true frame time, so gesture speed isn't over-read on slow devices
    const paused = isPaused();
    if (paused && !G.wasPaused) { G.pid = null; Object.keys(G.keys).forEach(k => G.keys[k] = false); if (G.phase === "play" && G.stage.up) G.stage.up(); }
    G.wasPaused = paused;
    if (!paused) {
      G.time += dt; G.phaseT += dt; G.comboPulse = Math.max(0, G.comboPulse - dt * 4);
      if (G.fx.hitstop > 0) G.fx.hitstop -= dt;
      else if (G.phase === "play") { G.stage.update(dt); if (G.stage.done) endStage(); }
      else if (G.phase === "reveal") G.stage.update(dt);
      else if (G.phase === "outro" && G.phaseT > 1.25) advance();
      G.fx.update(dt);
    }
    if (G) { draw(paused); G.raf = requestAnimationFrame(frame); }
  }

  function draw(paused) {
    const c = G.c, W = G.W, H = G.H, fx = G.fx;
    c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a1440"); bg.addColorStop(1, "#30245f");
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    for (const s of G.stars) { c.globalAlpha = .25 + .35 * (.5 + .5 * Math.sin(G.time * 1.7 + s.ph)); c.fillStyle = "#fff3e2"; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    c.save();
    if (fx.shake > .2) c.translate((Math.random() - .5) * 2 * fx.shake, (Math.random() - .5) * 2 * fx.shake);
    G.stage.draw(c, G.time);
    fx.draw(c);
    c.restore();
    if (G.phase !== "reveal") drawHeader(c);
    if (G.phase === "intro") drawIntro(c);
    if (G.phase === "outro" && G.banner) drawBanner(c);
    if (fx.flash > 0) { c.globalAlpha = fx.flash; c.fillStyle = fx.flashCol; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    if (paused) { c.fillStyle = "rgba(13,10,31,.6)"; c.fillRect(0, 0, W, H); txt(c, "Paused", W / 2, H / 2, 26, COL.cream); }
  }

  function drawHeader(c) {
    const W = G.W, s = session, info = STAGE_INFO[G.kind];
    c.fillStyle = "rgba(13,10,31,.6)"; c.fillRect(0, 0, W, HEAD);
    c.fillStyle = "rgba(255,200,87,.35)"; c.fillRect(0, HEAD - 2, W, 2);
    txt(c, `${info.icon} ${info.name}`, 12, HEAD / 2, 17, COL.gold, "left");
    const n = s.stages.length;
    for (let i = 0; i < n; i++) {
      const x = W / 2 + (i - (n - 1) / 2) * 22, res = s.results[i];
      c.beginPath(); c.arc(x, HEAD / 2, 6, 0, TAU);
      if (s.stages[i] === "garnish") { c.fillStyle = s.platingBonus ? COL.gold : "rgba(255,200,87,.3)"; starPath(c, x, HEAD / 2, 8, 0); c.fill(); }
      else if (res) { c.fillStyle = GRADE[res.grade].col; c.fill(); }
      else if (i === s.stageIdx) { c.strokeStyle = COL.cream; c.lineWidth = 2 + Math.sin(G.time * 6); c.stroke(); }
      else { c.fillStyle = "rgba(255,255,255,.18)"; c.fill(); }
    }
    if (s.combo >= 2) {
      const col = s.combo >= 10 ? COL.coral : s.combo >= 5 ? COL.gold : COL.teal;
      txt(c, (s.combo >= 5 ? "🔥" : "") + "x" + s.combo, W - 12, HEAD / 2, (17 + Math.min(s.combo, 10) * .6) * (1 + G.comboPulse * .35), col, "right", true);
    }
  }

  function drawIntro(c) {
    const W = G.W, H = G.H, info = STAGE_INFO[G.kind], E = G.E, k = Math.min(1, G.phaseT / .3);
    c.fillStyle = `rgba(13,10,31,${.66 * k})`; c.fillRect(0, HEAD, W, H - HEAD);
    const cw = Math.min(W - 28, 380), ch = 236, x = (W - cw) / 2, y = HEAD + (H - HEAD - ch) / 2 + (1 - easeOutBack(k)) * 30;
    c.globalAlpha = k;
    c.fillStyle = "rgba(42,33,88,.97)"; rr(c, x, y, cw, ch, 20); c.fill(); c.strokeStyle = COL.gold; c.lineWidth = 3; c.stroke();
    txt(c, info.icon, W / 2 - 46, y + 50, 44, COL.cream);
    if (G.kind === "garnish") { c.fillStyle = COL.gold; starPath(c, W / 2 + 40, y + 50, 26, G.time); c.fill(); }
    else drawIng(c, E.ing, W / 2 + 40, y + 50 + Math.sin(G.time * 3) * 3, 30, Math.sin(G.time * 2) * .15);
    txt(c, info.name.toUpperCase() + "!", W / 2, y + 104, 28, COL.gold, "center", true);
    if (G.kind !== "garnish" && DATA.ingredients[E.ing]) txt(c, DATA.ingredients[E.ing].name, W / 2, y + 130, 13, COL.teal);
    wrapTxt(c, info.hint, W / 2, y + 156, cw - 36, 14, COL.cream, 19);
    c.globalAlpha = k * (.6 + .4 * Math.sin(G.time * 5));
    txt(c, coarse() ? "TAP TO START" : "TAP / SPACE TO START", W / 2, y + ch - 22, 15, COL.mint);
    c.globalAlpha = 1;
  }

  function drawBanner(c) {
    const W = G.W, H = G.H, b = G.banner, k = Math.min(1, G.phaseT / .28), sc = easeOutBack(k);
    c.fillStyle = `rgba(13,10,31,${.45 * k})`; c.fillRect(0, HEAD, W, H - HEAD);
    c.save(); c.translate(W / 2, H * .46); c.scale(sc, sc); c.rotate(-.04);
    txt(c, b.label, 0, 0, Math.min(52, W * .13), b.col, "center", true);
    c.restore();
    if (b.sub) txt(c, b.sub, W / 2, H * .46 + 44, 15, COL.cream, "center", true);
  }

  /* ============================== STAGES ==============================
     Each factory gets an env E and returns { update(dt), draw(c,t), down/move/up/key?,
     done, score (0–1), summary, peek() }. */
  const STAGES = {};

  /* ---- CHOP: tap as each ingredient rolls under the cleaver ---- */
  STAGES.chop = E => {
    const { W, H, fx } = E;
    const boardY = Math.round(H * .68), bladeX = W / 2, r = clamp(W * .075, 22, 34);
    const n = 6 + E.diff, travel = 1.35 - E.diff * .1, v = (bladeX + r) / travel, beat = .64 - E.diff * .045;
    const winP = .08 * E.ease, winG = .16 * E.ease, winBad = .3;
    const pieces = [], halves = [];
    let tt = .55;
    for (let i = 0; i < n; i++) {
      pieces.push({ at: tt, x: -r, state: "in", res: "", fade: 0 });
      tt += beat * ((E.diff >= 3 && i % 4 === 2) ? .55 : (i % 3 === 2 ? 1.5 : 1));
    }
    let t = 0, perfect = 0, good = 0, resolved = 0, knife = 0, squash = 0, endT = 0;
    const lane = boardY - r * .92;
    const st = {
      done: false, score: 0, summary: "",
      update(dt) {
        t += dt; knife = Math.max(0, knife - dt * 5.5); squash = Math.max(0, squash - dt * 7);
        for (const p of pieces) {
          if (p.state === "in") {
            p.x = -r + v * (t - p.at);
            if (t - (p.at + travel) > winG + .03) { p.state = "gone"; p.res = "m"; resolved++; E.comboBreak(); fx.text(p.x, lane - r * 1.5, "missed", "#ff8fa3", 15); Sfx.whiff(); }
          } else if (p.state === "gone") { p.x += v * dt; p.fade += dt; }
        }
        for (let i = halves.length - 1; i >= 0; i--) {
          const h = halves[i]; h.life += dt; h.vy += 900 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.spin += h.vs * dt;
          if (h.y > boardY - r * .5 && h.vy > 0) { h.y = boardY - r * .5; h.vy *= -.35; h.vx *= .6; h.vs *= .5; }
          if (h.life > 1.1) halves.splice(i, 1);
        }
        if (resolved >= n) {
          endT += dt;
          if (endT > .75) { st.score = (perfect + good * .6) / n; st.summary = `${perfect + good}/${n} clean cuts · ${perfect} perfect`; st.done = true; }
        }
      },
      down() { st.chop(); },
      key(k, isDown) { if (k === "act" && isDown) st.chop(); },
      chop() {
        if (resolved >= n) return;
        knife = 1; squash = 1;
        let best = null, bd = 1e9;
        for (const p of pieces) if (p.state === "in") { const d = Math.abs(t - (p.at + travel)); if (d < bd) { bd = d; best = p; } }
        if (!best || bd > winBad) { Sfx.whiff(); E.comboBreak(); fx.burst(bladeX, boardY, COL.lav, 5, { speed: 110, up: 80, size: 2.5 }); return; }
        resolved++;
        if (bd > winG) {        // clumsy: the piece is bruised, not cut
          best.state = "gone"; best.res = "m"; E.comboBreak(); Sfx.miss(); fx.kick(3);
          fx.text(best.x, lane - r * 1.5, t < best.at + travel ? "too early" : "too late", "#ff8fa3", 16); return;
        }
        const isP = bd <= winP; best.state = "cut"; best.res = isP ? "p" : "g";
        if (isP) perfect++; else good++;
        E.comboUp(); const combo = E.session.combo;
        const rot0 = best.x / r;
        [-1, 1].forEach(side => halves.push({ x: best.x + side * r * .3, y: lane, vx: side * (110 + Math.random() * 90), vy: -(200 + Math.random() * 120),
          spin: 0, vs: side * (4 + Math.random() * 5), side, rot0, life: 0 }));
        fx.burst(best.x, lane, [E.style.col, E.style.hi, COL.cream], isP ? 20 : 10, { speed: isP ? 300 : 200, up: 120, size: 3.4, shape: isP ? "star" : "dot" });
        fx.burst(best.x, boardY - 4, "#c9a2e0", 5, { speed: 120, up: 60, size: 2, shape: "shard" });
        if (isP) { fx.kick(7); fx.stop(.045); fx.ring(best.x, lane, COL.gold, r, r * 3); fx.text(best.x, lane - r * 1.7, "PERFECT!", COL.gold, 22); Sfx.chop(combo); Sfx.perfect(combo); }
        else { fx.kick(3); fx.text(best.x, lane - r * 1.7, "good", COL.teal, 17); Sfx.chop(combo); }
      },
      draw(c, time) {
        // counter + cutting board
        c.fillStyle = "#231a4d"; c.fillRect(0, boardY + 34, W, H - boardY - 34);
        const by = boardY + squash * 3;
        c.fillStyle = "rgba(0,0,0,.3)"; rr(c, W * .05, by + 8, W * .9, 44, 14); c.fill();
        c.fillStyle = "#7a5590"; rr(c, W * .05, by, W * .9, 44, 14); c.fill();
        c.fillStyle = "#946cab"; rr(c, W * .05, by, W * .9, 12, 10); c.fill();
        c.fillStyle = COL.gold; [W * .09, W * .91].forEach(x => { c.beginPath(); c.arc(x, by + 22, 4, 0, TAU); c.fill(); });
        // timing zones under the blade
        const gw = winG * v, pw = winP * v;
        c.fillStyle = "rgba(149,224,108,.16)"; rr(c, bladeX - gw, lane - r * 1.25, gw * 2, r * 2.3, 10); c.fill();
        c.fillStyle = `rgba(255,200,87,${.22 + .1 * Math.sin(time * 6)})`; rr(c, bladeX - pw, lane - r * 1.25, pw * 2, r * 2.3, 8); c.fill();
        c.setLineDash([5, 6]); c.strokeStyle = "rgba(255,243,226,.5)"; c.lineWidth = 2; c.beginPath(); c.moveTo(bladeX, lane - r * 1.9); c.lineTo(bladeX, by); c.stroke(); c.setLineDash([]);
        // ingredients rolling in
        for (const p of pieces) {
          if (p.state === "cut" || p.x < -r * 2 || p.x > W + r * 2) continue;
          c.globalAlpha = p.state === "gone" ? clamp(.75 - p.fade * 1.6, 0, 1) : 1;
          const bob = Math.abs(Math.sin(p.x / r * 1.1)) * 3;
          drawIng(c, E.ing, p.x, lane - bob, r, p.x / r);
        }
        c.globalAlpha = 1;
        for (const h of halves) {
          c.save(); c.translate(h.x, h.y); c.rotate(h.spin); c.globalAlpha = clamp(1.5 - h.life * 1.4, 0, 1);
          c.beginPath(); c.rect(h.side < 0 ? -r * 1.5 : 0, -r * 1.5, r * 1.5, r * 3); c.clip();
          drawIng(c, E.ing, 0, 0, r, h.rot0); c.restore();
        }
        c.globalAlpha = 1;
        // cleaver
        const ky = lerp(lane - r * 1.7 + Math.sin(time * 3) * 3, by + 2, easeOutCubic(knife));
        c.save(); c.translate(bladeX, ky); c.rotate(-.06 * (1 - knife));
        const g = c.createLinearGradient(0, -52, 0, 0); g.addColorStop(0, "#8f93b8"); g.addColorStop(1, "#eef0ff");
        c.fillStyle = g; rr(c, -36, -54, 72, 54, [6, 6, 12, 4]); c.fill(); c.strokeStyle = "rgba(20,16,42,.6)"; c.lineWidth = 2; c.stroke();
        c.fillStyle = "rgba(20,16,42,.45)"; c.beginPath(); c.arc(-22, -40, 4, 0, TAU); c.fill();
        c.fillStyle = "#b5651d"; rr(c, 30, -50, 50, 15, 7); c.fill(); c.stroke();
        c.restore();
        // tally
        pieces.forEach((p, i) => {
          const x = W / 2 + (i - (n - 1) / 2) * 16, y = H - 16;
          c.fillStyle = p.res === "p" ? COL.gold : p.res === "g" ? COL.teal : p.res === "m" ? "#6b4a6e" : "rgba(255,255,255,.2)";
          c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
        });
      },
      peek() { return { t, hits: pieces.map(p => p.at + travel), states: pieces.map(p => p.state), n }; },
    };
    return st;
  };

  /* ---- POUR: hold to pour, drag to follow the drifting bowl, stop at the line ---- */
  STAGES.pour = E => {
    const { W, H, fx } = E;
    const vh = 116, mouthY = H - vh - 40, floorY = H - 22, vw = clamp(W * .3, 100, 170) * Math.sqrt(E.ease);
    const spoutY = E.top + 64;
    const A = W * (.09 + .028 * E.diff), w1 = .8 + .2 * E.diff, w2 = 1.5 + .28 * E.diff, ph = Math.random() * TAU;
    const target = .8, half = .07 * E.ease, lo = target - half, hi = Math.min(.95, target + half);
    const rate = .27, supply0 = 1.5, fallV = (floorY - spoutY) / .24;   // whole drop takes ~¼s on any canvas size
    let supply = supply0, t = 0, bx = W / 2, tx = W / 2, held = false, fill = 0, waste = 0, cx = W / 2, slosh = 0, tilt = 0;
    let settle = 0, over = false, endT = -1, acc = 0, tickT = 0, said = false;
    const drops = [], puddles = [];
    const vesselX = tt => clamp(W / 2 + A * Math.sin(tt * w1 + ph) + A * .45 * Math.sin(tt * w2 + 1.3), vw / 2 + 8, W - vw / 2 - 8);
    const fy = f => mouthY + vh * (1 - f) - 4 * f;
    function finish() {
      if (endT >= 0) return; endT = 0;
      let base;
      if (over) base = .22; else if (fill > hi) base = lerp(.8, .45, (fill - hi) / (1 - hi)); else if (fill >= lo) base = 1; else base = .6 * fill / lo;
      st.score = clamp(base - Math.min(.4, waste * .8), 0, 1);
      const g = gradeOf(st.score);
      st.summary = over ? "Overflowed!" : `${Math.round(fill * 100)}% full` + (waste > .03 ? ` · spilled ${Math.round(waste * 100)}%` : " · not a drop wasted");
      if (g === "perfect") { E.comboUp(3); fx.burst(cx, mouthY, [E.style.col, E.style.hi, COL.gold], 26, { speed: 260, up: 160, shape: "star" }); fx.ring(cx, mouthY + vh / 2, COL.gold, 30, 120); }
      else if (g === "good") E.comboUp(1); else E.comboBreak();
    }
    const st = {
      done: false, score: 0, summary: "",
      update(dt) {
        t += dt;
        const pcx = cx; cx = vesselX(t); slosh = lerp(slosh, clamp((cx - pcx) / dt / 180, -1, 1), damp(6, dt));
        if (E.keys.left) tx -= 360 * dt; if (E.keys.right) tx += 360 * dt;
        tx = clamp(tx, 24, W - 24); bx = lerp(bx, tx, damp(16, dt));
        const pouring = (held || E.keys.act) && supply > 0 && endT < 0;
        tilt = lerp(tilt, pouring ? 1 : 0, damp(14, dt));
        if (pouring && tilt > .55) {
          supply -= rate * dt; acc += dt * 72;
          while (acc >= 1) { acc--; drops.push({ x: bx + (Math.random() - .5) * 3, y: spoutY + 4, vx: (Math.random() - .5) * 14, vy: fallV * (.6 + Math.random() * .08), amt: rate / 72, in: 0 }); }
        }
        const surf = fy(fill);
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]; d.vy += fallV * 3 * dt; d.y += d.vy * dt; d.x += d.vx * dt;
          if (!d.in && d.y >= mouthY) d.in = Math.abs(d.x - cx) < vw / 2 - 5 ? 1 : -1;
          if (d.in === 1 && d.y >= surf) {
            drops.splice(i, 1);
            if (!over) { fill += d.amt; tickT -= 1; if (tickT <= 0) { tickT = 5; Sfx.pourTick(fill); } if (Math.random() < .3) fx.burst(d.x, surf, E.style.hi, 1, { speed: 70, up: 70, size: 2, life: .3 }); }
          } else if (d.in === -1 && d.y >= floorY) {
            drops.splice(i, 1); waste += d.amt;
            if (Math.random() < .5) fx.burst(d.x, floorY, E.style.col, 2, { speed: 90, up: 90, size: 2.4, life: .35 });
            if (Math.random() < .12) Sfx.spill();
            const pd = puddles.find(p => Math.abs(p.x - d.x) < 26); if (pd) pd.s = Math.min(30, pd.s + .5); else if (puddles.length < 12) puddles.push({ x: d.x, s: 6 });
            if (!said && waste > .04) { said = true; fx.text(d.x, floorY - 26, "spilling!", "#ff8fa3", 16); }
          }
        }
        if (!over && fill >= 1 && endT < 0) {
          over = true; fill = 1; fx.kick(9); fx.flashNow(COL.coral, .2); Sfx.miss(); Sfx.spill();
          fx.burst(cx, mouthY, E.style.col, 40, { speed: 300, up: 220, size: 4 }); fx.text(cx, mouthY - 30, "OVERFLOW!", COL.coral, 24); finish();
        }
        if (endT < 0) {
          if (!pouring && !drops.length && fill >= lo) { settle += dt; if (settle > .7) finish(); } else settle = 0;
          if (supply <= 0 && !drops.length) finish();
          if (t > 18) finish();
        } else { endT += dt; if (endT > .7 && !drops.length) st.done = true; }
      },
      down(x) { held = true; tx = x; },
      move(x) { if (held) tx = x; },
      up() { held = false; },
      draw(c, time) {
        c.fillStyle = "#231a4d"; c.fillRect(0, floorY, W, H - floorY);
        c.fillStyle = "rgba(255,200,87,.25)"; c.fillRect(0, floorY, W, 2);
        for (const p of puddles) { c.globalAlpha = .55; c.fillStyle = E.style.col; c.beginPath(); c.ellipse(p.x, floorY + 5, p.s, p.s * .22, 0, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
        // bowl
        const inBand = fill >= lo && fill <= hi, bot = mouthY + vh;
        const shape = () => {
          c.beginPath(); c.moveTo(cx - vw / 2, mouthY); c.lineTo(cx - vw * .42, bot - 22); c.quadraticCurveTo(cx - vw * .4, bot, cx - vw * .22, bot);
          c.lineTo(cx + vw * .22, bot); c.quadraticCurveTo(cx + vw * .4, bot, cx + vw * .42, bot - 22); c.lineTo(cx + vw / 2, mouthY);
        };
        c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(cx, bot + 4, vw * .4, 7, 0, 0, TAU); c.fill();
        c.save(); shape(); c.closePath(); c.clip();
        c.fillStyle = "rgba(255,255,255,.07)"; c.fillRect(cx - vw, mouthY, vw * 2, vh);
        if (fill > 0) {
          const sy = fy(fill); c.fillStyle = E.style.col; c.beginPath(); c.moveTo(cx - vw / 2, bot + 2);
          for (let i = 0; i <= 12; i++) { const px = cx - vw / 2 + vw * i / 12; c.lineTo(px, sy + Math.sin(i * .9 + time * 6) * 2 + slosh * ((px - cx) / (vw / 2)) * 9); }
          c.lineTo(cx + vw / 2, bot + 2); c.closePath(); c.fill();
          c.fillStyle = E.style.hi; c.globalAlpha = .35; c.fillRect(cx - vw / 2, sy - 1 + slosh * 2, vw, 4); c.globalAlpha = 1;
        }
        c.fillStyle = `rgba(149,224,108,${inBand ? .4 : .2})`; c.fillRect(cx - vw, fy(hi), vw * 2, fy(lo) - fy(hi));
        c.fillStyle = "rgba(255,84,112,.22)"; c.fillRect(cx - vw, mouthY, vw * 2, fy(.97) - mouthY);
        c.restore();
        c.setLineDash([6, 5]); c.strokeStyle = COL.mint; c.lineWidth = 2;
        [lo, hi].forEach(f => { c.beginPath(); c.moveTo(cx - vw * .5, fy(f)); c.lineTo(cx + vw * .5, fy(f)); c.stroke(); }); c.setLineDash([]);
        c.fillStyle = COL.mint; c.beginPath(); c.moveTo(cx - vw / 2 - 16, fy(target) - 7); c.lineTo(cx - vw / 2 - 5, fy(target)); c.lineTo(cx - vw / 2 - 16, fy(target) + 7); c.fill();
        c.beginPath(); c.moveTo(cx + vw / 2 + 16, fy(target) - 7); c.lineTo(cx + vw / 2 + 5, fy(target)); c.lineTo(cx + vw / 2 + 16, fy(target) + 7); c.fill();
        shape(); c.strokeStyle = inBand ? COL.mint : "rgba(220,235,255,.8)"; c.lineWidth = inBand ? 4 : 3; c.stroke();
        c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - vw * .36, mouthY + 14); c.lineTo(cx - vw * .31, bot - 30); c.stroke();
        if (inBand && endT < 0) {
          txt(c, (held || E.keys.act) ? "LET GO!" : "hold still…", cx, mouthY - 22, 17 + Math.sin(time * 12) * 1.5, COL.gold, "center", true);
          if (settle > 0) { c.strokeStyle = COL.gold; c.lineWidth = 4; c.beginPath(); c.arc(cx, mouthY - 46, 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, settle / .7)); c.stroke(); }
        } else if (endT < 0) txt(c, Math.round(fill * 100) + "%", cx, bot - 16, 14, "rgba(255,255,255,.85)", "center", true);
        // falling stream
        c.fillStyle = E.style.col;
        for (const d of drops) { c.beginPath(); c.ellipse(d.x, d.y, 2.8, 5.5, 0, 0, TAU); c.fill(); }
        // bottle (pivots on its spout, which sits exactly where you point)
        c.save(); c.translate(bx, spoutY); c.rotate(tilt * 2.25);
        c.fillStyle = "rgba(210,235,255,.22)"; c.strokeStyle = "rgba(230,242,255,.85)"; c.lineWidth = 2.5;
        rr(c, -7, 0, 14, 18, 3); c.fill(); c.stroke();
        rr(c, -19, 16, 38, 56, 10); c.fill(); c.stroke();
        const lv = clamp(supply / supply0, 0, 1);
        if (lv > 0) { c.fillStyle = E.style.col; c.globalAlpha = .9; rr(c, -15, 68 - 48 * lv, 30, 48 * lv, 6); c.fill(); c.globalAlpha = 1; }
        c.fillStyle = "rgba(255,255,255,.5)"; rr(c, -13, 22, 5, 30, 2); c.fill();
        c.restore();
        if (endT < 0 && !held && !E.keys.act && fill < .02) { c.globalAlpha = .6 + .4 * Math.sin(time * 5); txt(c, "☝ hold here", bx, spoutY + 104, 14, COL.cream, "center", true); c.globalAlpha = 1; }
      },
      peek() { return { cx, bx, fill, lo, hi, target, waste, supply, over, endT, spoutY, mouthY, drops: drops.length }; },
    };
    return st;
  };

  /* ---- STIR: smooth circles at a just-right speed; obey the reversals ---- */
  STAGES.stir = E => {
    const { W, H, fx } = E;
    const cx = W / 2, cy = E.top + (H - E.top) * .47, R = Math.min(W * .37, (H - E.top) * .33);
    const turns = 3 + Math.ceil(E.diff / 2), need = turns * TAU;
    const vMin = (2 + E.diff * .2) / Math.sqrt(E.ease), vMax = (10 - E.diff * .45) * Math.sqrt(E.ease);
    const flips = E.diff >= 5 ? [1 / 3, 2 / 3] : E.diff >= 3 ? [.5] : [];
    const par = turns * 1.5 + 3 + flips.length;
    let t = 0, prog = 0, qsum = 0, qtot = 0, dir = Math.random() < .5 ? 1 : -1, vel = 0, swirl = 0, swirlV = 0;
    let lastA = null, pending = 0, lap = 0, lapQ = 0, laps = 0, splashCd = 0, wrongCd = 0, tickAcc = 0, endT = -1, zone = "idle", held = false;
    let keyA = null, lastKeyT = 0, kq = null;
    const spoon = { x: cx + R * .5, y: cy };
    const bits = Array.from({ length: 9 }, (_, i) => ({ a: i * TAU / 9, rad: .28 + ((i * 37) % 10) / 10 * .5, ing: E.ings[i % E.ings.length], sp: .75 + (i % 3) * .12 }));
    const st = {
      done: false, score: 0, summary: "",
      update(dt) {
        t += dt; splashCd -= dt; wrongCd -= dt;
        let da = pending; pending = 0;
        if (kq) {
          const step = Math.min(Math.abs(kq.rem), kq.rate * dt), sg = Math.sign(kq.rem);
          da += sg * step; kq.rem -= sg * step; kq.a += sg * step;
          spoon.x = cx + Math.cos(kq.a) * R * .6; spoon.y = cy + Math.sin(kq.a) * R * .6;
          if (Math.abs(kq.rem) < 1e-3) kq = null;
        }
        if (endT >= 0) da = 0;
        vel = lerp(vel, da / Math.max(G ? G.rawDt : dt, dt, .001), damp(10, dt));
        const sp = Math.abs(vel), right = Math.sign(vel) === dir;
        zone = sp < .5 ? "idle" : !right ? "wrong" : sp < vMin ? "slow" : sp > vMax ? "fast" : "sweet";
        swirlV = lerp(swirlV, vel, damp(2.2, dt)); swirl += swirlV * dt;
        const fwd = Math.max(0, da * dir);
        if (fwd > 0 && endT < 0) {
          const w = zone === "sweet" ? 1 : zone === "fast" ? .25 : .55;
          prog += fwd * (zone === "fast" ? .6 : 1); qsum += fwd * w; qtot += fwd; lap += fwd; lapQ += fwd * w;
          tickAcc += fwd; if (tickAcc > Math.PI / 2) { tickAcc = 0; Sfx.stirTick(prog / need); }
          if (lap >= TAU) {
            const smooth = lapQ / lap > .82; lap = 0; lapQ = 0; laps++;
            if (smooth) { E.comboUp(); Sfx.perfect(E.session.combo); fx.ring(cx, cy, COL.gold, R * .5, R * 1.15, .4); fx.text(cx, cy - R * .5, "silky!", COL.gold, 20); fx.burst(spoon.x, spoon.y, [E.style.hi, COL.gold], 8, { speed: 150, shape: "star" }); }
            else fx.text(cx, cy - R * .5, "lumpy…", COL.lav, 16);
          }
          if (flips.length && prog / need >= flips[0] && prog < need) {
            flips.shift(); dir = -dir; vel = 0; Sfx.flip(); fx.flashNow(COL.teal, .16); fx.kick(4);
            fx.text(cx, cy, "REVERSE!", COL.teal, 30);
          }
        }
        if (zone === "fast" && splashCd <= 0 && endT < 0) {
          splashCd = .55; E.comboBreak(); Sfx.spill(); fx.kick(4); fx.text(cx, cy - R * .5, "too fast!", COL.coral, 18);
          const a = Math.atan2(spoon.y - cy, spoon.x - cx);
          fx.burst(cx + Math.cos(a) * R, cy + Math.sin(a) * R, E.style.col, 12, { angle: a, spread: 1.2, speed: 240, size: 3.4 });
        }
        if (zone === "wrong" && wrongCd <= 0 && endT < 0) { wrongCd = 1.1; fx.text(cx, cy - R * .5, "other way!", COL.coral, 18); Sfx.whiff(); }
        if (endT < 0 && (prog >= need || t > par * 2.2)) {
          endT = 0;
          const qual = qtot ? qsum / qtot : 0, late = clamp((t - par) / par, 0, 1), fin = Math.min(1, prog / need);
          st.score = clamp(qual * (1 - late * .25) * (fin < 1 ? fin * .7 : 1), 0, 1);
          st.summary = fin < 1 ? "Ran out of time" : `${Math.round(qual * 100)}% smooth · ${laps} laps`;
          if (fin >= 1) { fx.burst(cx, cy, [E.style.col, E.style.hi, COL.gold], 30, { speed: 280, shape: "star" }); fx.ring(cx, cy, COL.gold, R * .3, R * 1.3, .5); }
        }
        if (endT >= 0) { endT += dt; if (endT > .65) st.done = true; }
      },
      down(x, y) { held = true; st.move(x, y, true); },
      move(x, y, first) {
        if (!held) return;
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), m = Math.min(d, R * .9);
        spoon.x = cx + Math.cos(a) * m; spoon.y = cy + Math.sin(a) * m;
        if (!first && lastA != null && d > R * .18 && d < R * 1.5) pending += angDiff(a, lastA);
        lastA = d > R * .18 ? a : null;
      },
      up() { held = false; lastA = null; },
      key(k, isDown) {
        if (!isDown) return;
        const a = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[k];
        if (a == null) return;
        if (keyA != null) {
          const d = angDiff(a, keyA);
          if (Math.abs(d) > .1 && Math.abs(d) < 2) kq = { rem: d + (kq ? kq.rem : 0), rate: Math.abs(d) / clamp(t - lastKeyT, .16, .9), a: keyA };
        } else { spoon.x = cx + Math.cos(a) * R * .6; spoon.y = cy + Math.sin(a) * R * .6; }
        keyA = a; lastKeyT = t;
      },
      draw(c, time) {
        const p = Math.min(1, prog / need);
        // pot
        c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(cx, cy + R + 20, R * 1.05, 14, 0, 0, TAU); c.fill();
        c.fillStyle = "#5b4f9c"; rr(c, cx - R - 40, cy - 13, 34, 26, 10); c.fill(); rr(c, cx + R + 6, cy - 13, 34, 26, 10); c.fill();
        const rim = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); rim.addColorStop(0, "#a79be0"); rim.addColorStop(1, "#4b3f86");
        c.fillStyle = rim; c.beginPath(); c.arc(cx, cy, R + 14, 0, TAU); c.fill();
        c.fillStyle = "#1b1438"; c.beginPath(); c.arc(cx, cy, R + 3, 0, TAU); c.fill();
        // broth: gets richer as you stir
        c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
        const lg = c.createRadialGradient(cx, cy, R * .1, cx, cy, R); lg.addColorStop(0, E.style.hi); lg.addColorStop(1, E.style.col);
        c.fillStyle = "#3a2d6b"; c.fillRect(cx - R, cy - R, R * 2, R * 2);
        c.globalAlpha = .35 + .65 * p; c.fillStyle = lg; c.fillRect(cx - R, cy - R, R * 2, R * 2); c.globalAlpha = 1;
        c.lineCap = "round";
        for (let k = 0; k < 6; k++) {
          const a0 = swirl * (1 + k * .13) + k * 1.1;
          c.strokeStyle = `rgba(255,255,255,${.1 + .12 * p})`; c.lineWidth = 6 - k * .5;
          c.beginPath(); c.arc(cx, cy, R * (.18 + k * .14), a0, a0 + 1.1 + p * 1.2); c.stroke();
        }
        for (const b of bits) { const a = b.a + swirl * b.sp; drawIng(c, b.ing, cx + Math.cos(a) * R * b.rad, cy + Math.sin(a) * R * b.rad, R * .11, a * 1.3); }
        const zc = zone === "sweet" ? COL.mint : (zone === "fast" || zone === "wrong") ? COL.coral : "rgba(255,243,226,.75)";
        for (let i = 0; i < 8; i++) {   // direction chevrons riding the rim
          const a = i * TAU / 8 + dir * time * 1.4, x = cx + Math.cos(a) * R * .9, y = cy + Math.sin(a) * R * .9;
          c.save(); c.translate(x, y); c.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2)); c.fillStyle = zc; c.globalAlpha = .85;
          c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -6); c.lineTo(-2, 0); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore();
        }
        c.restore();
        // progress ring
        c.lineCap = "round"; c.lineWidth = 7; c.strokeStyle = "rgba(255,255,255,.14)"; c.beginPath(); c.arc(cx, cy, R + 24, 0, TAU); c.stroke();
        if (p > 0) { c.strokeStyle = COL.gold; c.beginPath(); c.arc(cx, cy, R + 24, -Math.PI / 2, -Math.PI / 2 + TAU * p); c.stroke(); }
        // spoon
        c.strokeStyle = "rgba(255,255,255,.3)"; c.lineWidth = 2; c.beginPath(); c.arc(spoon.x, spoon.y, 15 + Math.sin(time * 9) * 2, 0, TAU); c.stroke();
        c.strokeStyle = "#c98a4b"; c.lineWidth = 9; c.beginPath(); c.moveTo(spoon.x, spoon.y); c.lineTo(spoon.x + R * .5, spoon.y - R * .75); c.stroke();
        c.fillStyle = "#e0a765"; c.beginPath(); c.ellipse(spoon.x, spoon.y, 13, 10, -.6, 0, TAU); c.fill(); c.strokeStyle = "rgba(20,16,42,.5)"; c.lineWidth = 2; c.stroke();
        // speed gauge
        const gw = Math.min(W - 48, 300), gx = (W - gw) / 2, gy = H - 30, top = vMax * 1.45;
        c.fillStyle = "rgba(13,10,31,.7)"; rr(c, gx, gy, gw, 12, 6); c.fill();
        c.fillStyle = "rgba(149,224,108,.75)"; rr(c, gx + gw * vMin / top, gy, gw * (vMax - vMin) / top, 12, 6); c.fill();
        const nx = gx + gw * clamp(Math.abs(vel) / top, 0, 1);
        c.fillStyle = zone === "fast" || zone === "wrong" ? COL.coral : COL.cream; rr(c, nx - 3, gy - 5, 6, 22, 3); c.fill();
        txt(c, "slow", gx, gy - 11, 11, "rgba(255,243,226,.6)", "left"); txt(c, "just right", gx + gw * (vMin + vMax) / 2 / top, gy - 11, 11, COL.mint); txt(c, "too fast", gx + gw, gy - 11, 11, "rgba(255,243,226,.6)", "right");
        if (endT < 0 && zone === "idle" && prog < .2) { c.globalAlpha = .6 + .4 * Math.sin(time * 5); txt(c, dir > 0 ? "↻ drag in circles" : "↺ drag in circles", cx, cy, 17, COL.cream, "center", true); c.globalAlpha = 1; }
      },
      peek() { return { cx, cy, R, dir, prog, need, vMin, vMax, zone, vel, endT }; },
    };
    return st;
  };

  /* ---- ABSORB (Osmo-style): steer the flavor orb, drink the good motes, dodge the bitter ---- */
  STAGES.absorb = E => {
    const { W, H, fx } = E;
    const x0 = 8, y0 = E.top + 30, x1 = W - 8, y1 = H - 8;
    const nGood = 6 + E.diff, nBad = 2 + E.diff, limit = 10 + nGood * .9;
    const orb = { x: W / 2, y: (y0 + y1) / 2, vx: 0, vy: 0, r: 15, inv: 0, squash: 0 };
    let target = null, t = 0, got = 0, hits = 0, endT = -1;
    const motes = [], trail = [];
    const spawn = bad => {
      let x, y, tries = 0;
      do { x = lerp(x0 + 24, x1 - 24, Math.random()); y = lerp(y0 + 24, y1 - 24, Math.random()); tries++; }
      while (tries < 40 && (Math.hypot(x - orb.x, y - orb.y) < 110 || motes.some(m => Math.hypot(x - m.x, y - m.y) < 44)));
      const a = Math.random() * TAU, sp = (22 + Math.random() * 30) * (1 + E.diff * .13) * (bad ? 1.15 : 1);
      motes.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: bad ? 13 + E.diff * .8 : 14, bad, ing: E.ings[motes.length % E.ings.length], ph: Math.random() * 7 });
    };
    for (let i = 0; i < nGood; i++) spawn(false);
    for (let i = 0; i < nBad; i++) spawn(true);
    const st = {
      done: false, score: 0, summary: "",
      update(dt) {
        t += dt; orb.inv = Math.max(0, orb.inv - dt); orb.squash = Math.max(0, orb.squash - dt * 4);
        let dvx = 0, dvy = 0;
        if (target) { dvx = (target.x - orb.x) * 9; dvy = (target.y - orb.y) * 9; const sp = Math.hypot(dvx, dvy), mx = 470; if (sp > mx) { dvx *= mx / sp; dvy *= mx / sp; } }
        else { dvx = ((E.keys.right ? 1 : 0) - (E.keys.left ? 1 : 0)) * 300; dvy = ((E.keys.down ? 1 : 0) - (E.keys.up ? 1 : 0)) * 300; }
        const k = damp(target || dvx || dvy ? 12 : 3.5, dt);
        orb.vx = lerp(orb.vx, dvx, k); orb.vy = lerp(orb.vy, dvy, k);
        if (endT >= 0) { orb.vx *= .9; orb.vy *= .9; }
        orb.x = clamp(orb.x + orb.vx * dt, x0 + orb.r, x1 - orb.r); orb.y = clamp(orb.y + orb.vy * dt, y0 + orb.r, y1 - orb.r);
        trail.push({ x: orb.x, y: orb.y }); if (trail.length > 12) trail.shift();
        for (let i = motes.length - 1; i >= 0; i--) {
          const m = motes[i];
          if (m.bad && E.diff >= 3) {   // bitter motes slowly hunt you on harder dishes
            const dx = orb.x - m.x, dy = orb.y - m.y, d = Math.hypot(dx, dy) || 1, ac = 16 * (E.diff - 2);
            m.vx += dx / d * ac * dt; m.vy += dy / d * ac * dt;
            const sp = Math.hypot(m.vx, m.vy), mx = 60 + E.diff * 14; if (sp > mx) { m.vx *= mx / sp; m.vy *= mx / sp; }
          }
          m.x += m.vx * dt; m.y += m.vy * dt;
          if (m.x < x0 + m.r) { m.x = x0 + m.r; m.vx = Math.abs(m.vx); } if (m.x > x1 - m.r) { m.x = x1 - m.r; m.vx = -Math.abs(m.vx); }
          if (m.y < y0 + m.r) { m.y = y0 + m.r; m.vy = Math.abs(m.vy); } if (m.y > y1 - m.r) { m.y = y1 - m.r; m.vy = -Math.abs(m.vy); }
          if (endT >= 0 || Math.hypot(m.x - orb.x, m.y - orb.y) > orb.r + m.r * .8) continue;
          if (!m.bad) {
            motes.splice(i, 1); got++; orb.r = Math.min(30, orb.r + 1.3); orb.squash = 1; E.comboUp();
            const st2 = ING[m.ing] || E.style; Sfx.absorb(E.session.combo);
            fx.burst(m.x, m.y, [st2.col, st2.hi, COL.cream], 12, { speed: 190, g: 0, shape: "star", life: .45 }); fx.ring(orb.x, orb.y, st2.col, orb.r, orb.r * 2.6, .3);
            fx.text(m.x, m.y - 18, pick(["yum!", "mmm!", "zing!", "+flavor"]), COL.gold, 17);
          } else if (orb.inv <= 0) {
            motes.splice(i, 1); hits++; orb.inv = 1; orb.r = Math.max(12, orb.r - 2.5); E.comboBreak(); Sfx.bitter();
            fx.kick(9); fx.flashNow("#7a3cff", .22); fx.burst(m.x, m.y, ["#3b1f4f", "#a05cff", "#9be15d"], 16, { speed: 220, shape: "shard" });
            fx.text(orb.x, orb.y - 30, "BITTER!", "#c79bff", 20);
            const dx = orb.x - m.x, dy = orb.y - m.y, d = Math.hypot(dx, dy) || 1; orb.vx = dx / d * 320; orb.vy = dy / d * 320;
          }
        }
        if (endT < 0 && (got >= nGood || t >= limit)) {
          endT = 0; st.score = clamp(got / nGood - hits * .12, 0, 1);
          st.summary = `${got}/${nGood} flavors` + (hits ? ` · ${hits} bitter` : " · zero bitterness");
          if (got >= nGood) { fx.burst(orb.x, orb.y, [COL.gold, COL.cream, E.style.col], 30, { speed: 280, g: 0, shape: "star", life: .8 }); fx.ring(orb.x, orb.y, COL.gold, orb.r, 150, .5); }
        }
        if (endT >= 0) { endT += dt; if (endT > .65) st.done = true; }
      },
      down(x, y) { target = { x, y }; },
      move(x, y) { if (target) { target.x = x; target.y = y; } },
      up() { target = null; },
      draw(c, time) {
        // timer + tally
        const left = clamp(1 - t / limit, 0, 1), bw = W - 110;
        c.fillStyle = "rgba(13,10,31,.7)"; rr(c, 12, E.top + 9, bw, 10, 5); c.fill();
        c.fillStyle = left < .25 ? COL.coral : COL.teal; if (left > 0) { rr(c, 12, E.top + 9, Math.max(8, bw * left), 10, 5); c.fill(); }
        txt(c, `${got}/${nGood}`, W - 14, E.top + 14, 15, COL.gold, "right");
        drawIng(c, E.ing, W - 74, E.top + 14, 9);
        c.fillStyle = "rgba(13,10,31,.35)"; rr(c, x0, y0, x1 - x0, y1 - y0, 16); c.fill();
        c.strokeStyle = "rgba(179,157,219,.3)"; c.lineWidth = 2; c.stroke();
        for (const m of motes) {
          const bob = Math.sin(time * 3 + m.ph);
          if (!m.bad) {
            const s2 = ING[m.ing] || E.style, g = c.createRadialGradient(m.x, m.y, 2, m.x, m.y, m.r * 1.7);
            g.addColorStop(0, s2.hi); g.addColorStop(.55, s2.col); g.addColorStop(1, "rgba(255,255,255,0)");
            c.globalAlpha = .45; c.fillStyle = g; c.beginPath(); c.arc(m.x, m.y, m.r * 1.7, 0, TAU); c.fill(); c.globalAlpha = 1;
            c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 1.5; c.beginPath(); c.arc(m.x, m.y, m.r + 2 + bob, 0, TAU); c.stroke();
            drawIng(c, m.ing, m.x, m.y, m.r * .82, bob * .25);
          } else {
            c.fillStyle = "rgba(160,92,255,.2)"; c.beginPath(); c.arc(m.x, m.y, m.r * 1.6, 0, TAU); c.fill();
            c.fillStyle = "#3b1f4f"; c.strokeStyle = "#a05cff"; c.lineWidth = 2; starPath(c, m.x, m.y, m.r * 1.15 + bob, time * .8 + m.ph, 9, .62); c.fill(); c.stroke();
            c.strokeStyle = "#e8ffb0"; c.lineWidth = 2; c.lineCap = "round";
            c.beginPath(); c.moveTo(m.x - 6, m.y - 4); c.lineTo(m.x - 2, m.y - 2); c.moveTo(m.x + 6, m.y - 4); c.lineTo(m.x + 2, m.y - 2); c.stroke();
            c.beginPath(); c.arc(m.x, m.y + 6, 3.5, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
          }
        }
        if (target) {
          c.setLineDash([4, 6]); c.strokeStyle = "rgba(255,243,226,.4)"; c.lineWidth = 2; c.beginPath(); c.moveTo(orb.x, orb.y); c.lineTo(target.x, target.y); c.stroke(); c.setLineDash([]);
          c.strokeStyle = "rgba(255,243,226,.6)"; c.beginPath(); c.arc(target.x, target.y, 10, 0, TAU); c.stroke();
        }
        trail.forEach((p, i) => { c.globalAlpha = i / trail.length * .3; c.fillStyle = COL.gold; c.beginPath(); c.arc(p.x, p.y, orb.r * (i / trail.length), 0, TAU); c.fill(); });
        c.globalAlpha = orb.inv > 0 && Math.floor(time * 16) % 2 ? .35 : 1;
        const sp = Math.hypot(orb.vx, orb.vy), ang = Math.atan2(orb.vy, orb.vx), pop = 1 + orb.squash * .25;
        c.save(); c.translate(orb.x, orb.y); c.rotate(ang); c.scale((1 + Math.min(.3, sp / 1400)) * pop, (1 - Math.min(.18, sp / 2400)) * pop);
        const og = c.createRadialGradient(0, 0, 2, 0, 0, orb.r * 2); og.addColorStop(0, "rgba(255,200,87,.55)"); og.addColorStop(1, "rgba(255,200,87,0)");
        c.fillStyle = og; c.beginPath(); c.arc(0, 0, orb.r * 2, 0, TAU); c.fill();
        const bg2 = c.createRadialGradient(-orb.r * .3, -orb.r * .3, 1, 0, 0, orb.r); bg2.addColorStop(0, "#fffbe8"); bg2.addColorStop(.6, COL.gold); bg2.addColorStop(1, "#ff9e5e");
        c.fillStyle = bg2; c.beginPath(); c.arc(0, 0, orb.r, 0, TAU); c.fill(); c.strokeStyle = "rgba(20,16,42,.5)"; c.lineWidth = 2; c.stroke();
        c.restore();
        const ex = sp > 20 ? Math.cos(ang) * 3 : 0, ey = sp > 20 ? Math.sin(ang) * 3 : 0;   // eyes look where it's going
        c.fillStyle = COL.ink; c.beginPath(); c.arc(orb.x - 5 + ex, orb.y - 2 + ey, 2.6, 0, TAU); c.arc(orb.x + 5 + ex, orb.y - 2 + ey, 2.6, 0, TAU); c.fill();
        c.globalAlpha = 1;
        if (endT < 0 && !target && t < 2.5 && !sp) { c.globalAlpha = .6 + .4 * Math.sin(time * 5); txt(c, "☝ drag anywhere", orb.x, orb.y + 40, 14, COL.cream, "center", true); c.globalAlpha = 1; }
      },
      peek() { return { orb: { x: orb.x, y: orb.y, r: orb.r }, motes: motes.map(m => ({ x: m.x, y: m.y, r: m.r, bad: m.bad })), got, nGood, hits, endT }; },
    };
    return st;
  };

  /* ---- GARNISH: the WS-1 plating finisher, earned by a flawless prep ---- */
  STAGES.garnish = E => {
    const { W, H, fx } = E;
    const cx = W / 2, cy = E.top + (H - E.top) * .5, R = Math.min(W, H - E.top) * .2, period = 1.5 - E.diff * .08;
    let t = 0, endT = -1, rad = R * 2.5;
    const st = {
      done: false, score: 1, bonus: 1, label: "", summary: "",
      update(dt) {
        if (endT < 0) { t += dt; rad = R * lerp(2.5, .45, (t % period) / period); if (t > period * 4) st.tap(); }
        else { endT += dt; if (endT > .5) st.done = true; }
      },
      tap() {
        if (endT >= 0) return; endT = 0;
        const d = Math.abs(rad - R) / R;
        if (d < .09 * E.ease) { st.bonus = 1.5; st.label = "🌟 PLATINUM PLATING!"; fx.kick(8); fx.burst(cx, cy, [COL.gold, "#fff", COL.teal], 40, { speed: 320, shape: "star", life: .9 }); }
        else if (d < .22 * E.ease) { st.bonus = 1.2; st.label = "✨ GOLD PLATING!"; fx.burst(cx, cy, [COL.gold, COL.cream], 22, { speed: 240, shape: "star" }); }
        else { st.bonus = 1; st.label = "SILVER PLATING"; }
        st.summary = st.bonus > 1 ? "Star Chef streak +1" : "So close!";
        st.score = st.bonus > 1 ? 1 : .7;
      },
      down() { st.tap(); },
      key(k, isDown) { if (k === "act" && isDown) st.tap(); },
      draw(c, time) {
        c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(cx, cy + R * .9, R * 1.2, R * .22, 0, 0, TAU); c.fill();
        c.fillStyle = COL.cream; c.beginPath(); c.arc(cx, cy, R * 1.25, 0, TAU); c.fill();
        c.fillStyle = "#e6d8f5"; c.beginPath(); c.arc(cx, cy, R * .95, 0, TAU); c.fill();
        txt(c, E.recipe.emoji, cx, cy + 4, R * 1.05, COL.cream);
        c.strokeStyle = "rgba(255,200,87,.55)"; c.lineWidth = 6; c.setLineDash([8, 8]); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke(); c.setLineDash([]);
        c.strokeStyle = COL.gold; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.stroke();
        for (let i = 0; i < 6; i++) { const a = time * 2 + i * TAU / 6; c.fillStyle = COL.gold; starPath(c, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 6, a, 4, .4); c.fill(); }
      },
      peek() { return { rad, R, endT }; },
    };
    return st;
  };

  /* ---- plated-dish reveal: cloche lift, stars, breakdown ---- */
  function makeReveal(E) {
    const { W, H, fx } = E, s = session, q = s.quality, r = s.recipe;
    const cx = W / 2, cy = HEAD + (H - HEAD) * .33, PR = Math.min(W * .25, (H - HEAD) * .21);
    const img = new Image(); img.src = "assets/" + r.art;
    const sy = cy + PR * 1.2 + 30, u = clamp((H - 16 - sy) / 5.4, 14, 23);   // star row + line spacing that fits any canvas
    const LIFT = 1.15, STAR0 = 1.55, GAP = .3, readyAt = STAR0 + q * GAP + .45;
    const likes = Math.round(recipeLikes(r) * (0.6 + q * 0.15));
    const title = ["", "Rustic… charm?", "Edible!", "Tasty!", "Gourmet!", "COSMIC MASTERPIECE!"][q];
    let t = 0, lifted = false, shown = 0, drumT = 0, confetti = 0, hailed = false;
    return {
      update(dt) {
        t += dt;
        if (!lifted && t < LIFT) { drumT -= dt; if (drumT <= 0) { drumT = lerp(.16, .05, t / LIFT); Sfx.drum(); } }
        if (!lifted && t >= LIFT) {
          lifted = true; Sfx.reveal(); fx.flashNow("#fff", .35); fx.kick(6);
          fx.burst(cx, cy, [COL.gold, COL.cream, COL.teal, COL.coral], 40, { speed: 340, shape: "star", life: .9 });
        }
        while (shown < q && t >= STAR0 + shown * GAP) {
          Sfx.star(shown); fx.kick(3 + shown); const sx = cx + (shown - 2) * PR * .52;
          fx.burst(sx, sy, [COL.gold, "#fff"], 12, { speed: 200, shape: "star" }); fx.ring(sx, sy, COL.gold, 8, 44, .3); shown++;
        }
        if (!hailed && t >= readyAt - .3) {
          hailed = true;
          if (q >= 5) { AudioSys.jewel(); confetti = 2.2; } else if (q >= 3) AudioSys.good();
        }
        if (confetti > 0) { confetti -= dt; if (Math.random() < .7) fx.burst(Math.random() * W, HEAD, [COL.gold, COL.coral, COL.teal, COL.mint, COL.lav], 2, { angle: Math.PI / 2, spread: 1, speed: 160, g: 260, shape: "shard", life: 1.6, size: 4 }); }
      },
      tap() { if (t < readyAt) { t = readyAt; return; } AudioSys.click(); leaveKitchen(); },
      draw(c, time) {
        txt(c, r.name, cx, HEAD * .55, Math.min(15, W / 24), COL.cream);
        const inK = clamp(t / .5, 0, 1), py = cy + (1 - easeOutBack(inK)) * (H - cy + PR);
        if (lifted) {   // glory rays
          c.save(); c.translate(cx, py); c.rotate(time * .35); c.globalAlpha = .05 + .02 * q;
          c.fillStyle = COL.gold; for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-PR * .22, -PR * 2.3); c.lineTo(PR * .22, -PR * 2.3); c.fill(); }
          c.restore(); c.globalAlpha = 1;
        }
        c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(cx, py + PR * 1.02, PR * 1.25, PR * .2, 0, 0, TAU); c.fill();
        c.fillStyle = COL.cream; c.beginPath(); c.arc(cx, py, PR * 1.2, 0, TAU); c.fill();
        c.strokeStyle = COL.gold; c.lineWidth = 3; c.beginPath(); c.arc(cx, py, PR * 1.12, 0, TAU); c.stroke();
        c.save(); c.beginPath(); c.arc(cx, py, PR * .96, 0, TAU); c.clip();
        if (img.complete && img.naturalWidth) c.drawImage(img, cx - PR, py - PR, PR * 2, PR * 2);
        else { c.fillStyle = "#e6d8f5"; c.fillRect(cx - PR, py - PR, PR * 2, PR * 2); txt(c, r.emoji, cx, py + 4, PR * 1.1, COL.cream); }
        c.restore();
        // cloche
        const lk = clamp((t - LIFT) / .5, 0, 1);
        if (lk < 1) {
          const rattle = lifted ? 0 : Math.sin(time * 50) * 3.5 * (t / LIFT);
          c.save(); c.translate(cx + rattle, py - easeOutCubic(lk) * PR * 2.6); c.rotate(lk * .5); c.globalAlpha = 1 - lk;
          const g = c.createLinearGradient(-PR, -PR, PR, 0); g.addColorStop(0, "#f4f5ff"); g.addColorStop(.5, "#b9bedf"); g.addColorStop(1, "#7f84ad");
          c.fillStyle = g; c.beginPath(); c.arc(0, PR * .25, PR * 1.14, Math.PI, TAU); c.closePath(); c.fill(); c.strokeStyle = "rgba(20,16,42,.5)"; c.lineWidth = 2; c.stroke();
          c.fillStyle = COL.gold; c.beginPath(); c.arc(0, -PR * .95, PR * .12, 0, TAU); c.fill();
          c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.ellipse(-PR * .5, -PR * .35, PR * .1, PR * .32, .5, 0, TAU); c.fill();
          c.restore(); c.globalAlpha = 1;
        }
        // stars
        const sr = Math.min(20, PR * .24);
        for (let i = 0; i < 5; i++) {
          const sx = cx + (i - 2) * PR * .52, age = t - (STAR0 + i * GAP);
          c.fillStyle = "rgba(255,255,255,.12)"; starPath(c, sx, sy, sr, 0); c.fill();
          if (i < q && age > 0) { const k = clamp(age / .3, 0, 1); c.fillStyle = COL.gold; starPath(c, sx, sy, sr * easeOutBack(k) * 1.1, (1 - k) * -1.2); c.fill(); c.strokeStyle = "#b9791f"; c.lineWidth = 1.5; c.stroke(); }
        }
        if (t >= readyAt - .3) {
          const k = clamp((t - (readyAt - .3)) / .3, 0, 1); c.globalAlpha = k;
          txt(c, title, cx, sy + u * 1.7, Math.min(q === 5 ? 24 : 22, W / 15) * easeOutBack(k), q >= 4 ? COL.gold : COL.cream, "center", true);
          const n = s.results.length; c.font = `bold 13px ${FONT}`;
          s.results.forEach((res, i) => {
            const x = cx + (i - (n - 1) / 2) * Math.min(104, (W - 20) / n);
            txt(c, `${STAGE_INFO[res.kind].icon} ${GRADE[res.grade].label.replace("!", "")}`, x, sy + u * 3, 13, GRADE[res.grade].col);
          });
          let line = `❤️ ~${likes} likes on Forklore`;
          if (s.maxCombo >= 5) line += ` · 🔥 combo x${s.maxCombo}`;
          if (s.platingBonus > 1) line += s.platingBonus >= 1.5 ? " · 🌟 platinum plating" : " · ✨ gold plating";
          txt(c, line, cx, sy + u * 4.1, Math.min(13, W / 30), COL.cream);
          if (q > s.prevBest && s.prevBest > 0) txt(c, "NEW BEST!", cx + PR * 1.25, cy - PR * .95, 15, COL.mint, "center", true);
          c.globalAlpha = 1;
        }
        if (t >= readyAt) { c.globalAlpha = .6 + .4 * Math.sin(time * 5); txt(c, coarse() ? "TAP TO SERVE ▸" : "TAP / SPACE TO SERVE ▸", cx, H - 16, 15, COL.mint); c.globalAlpha = 1; }
      },
      peek() { return { t, readyAt, q }; },
    };
  }

  /* ======================= classic slider (accessibility fallback) ======================= */
  function renderClassic() {
    const s = session; if (!s) return;
    if (classicStop) { classicStop(); classicStop = null; }
    const isPlating = s.isPlatingFinisher;
    const ing = isPlating ? DATA.recipes.find(r => r.id === "platingFinisher") : DATA.ingredients[s.steps[s.stepIdx]];
    // kitchen upgrade widens the window (+10%/level), as the upgrade text promises
    const widthPct = (isPlating ? 12 : (26 - s.recipe.difficulty * 2.5)) * (1 + .1 * upgradeLv("kitchen"));
    $("panel-title").textContent = `🍳 ${s.recipe.name} (${isPlating ? "Plating Finisher" : (s.stepIdx + 1) + "/" + s.steps.length})`;
    $("panel-body").innerHTML = `
      <div class="card cook-card">
        <h4 style="font-size:20px">${ing.emoji} ${isPlating ? "Final Plating!" : "Adding " + ing.name}</h4>
        ${isPlating ? `<p class="map-desc">Hit the narrow zone for a bonus multiplier!</p>` : `<div class="cook-ticks">${"★".repeat(s.recipe.difficulty)}</div>`}
        <div class="cook-zone"><div class="cook-target"></div><div class="cook-marker" id="marker"></div></div>
        <button id="btn-strike" class="btn btn-primary big-strike">⬇ ${isPlating ? "FINISH!" : "ADD IT! (space)"}</button>
        <img class="cook-scene" src="assets/cooking.png" alt="" onerror="this.remove()">
        <div class="combo-display" id="combo-display">Combo: x${s.combo}</div>
      </div>`;
    const target = document.querySelector(".cook-target");
    target.style.left = `calc(${50 - widthPct / 2}%)`; target.style.width = widthPct + "%";
    const markerEl = $("marker");
    let pos = 0, dir = 1, raf = 0, running = true, lastT = performance.now();
    const speed = (1.1 + s.recipe.difficulty * .45) * 60;   // % per second (frame-rate independent)
    function tick(now) {
      if (!running) return;
      if (!markerEl.isConnected || activeScreen() !== "screen-panel") { stop(); return; }
      const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
      if (!isPaused()) { pos += dir * speed * dt; if (pos > 100) { pos = 100; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } }
      markerEl.style.left = "calc(" + pos + "% - 3px)";
      raf = requestAnimationFrame(tick);
    }
    const onKey = e => { if (e.code === "Space" && !isPaused()) { e.preventDefault(); strike(); } };
    function stop() { running = false; cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); if (classicStop === stop) classicStop = null; }
    classicStop = stop;
    raf = requestAnimationFrame(tick);
    function strike() {
      if (!running || !session) return;
      stop();
      const dist = Math.abs(pos - 50);
      if (isPlating) {
        if (dist < widthPct / 4) { s.platingBonus = 1.5; toast("🌟 PLATINUM PLATING! x1.5!"); AudioSys.jewel(); }
        else if (dist < widthPct / 2) { s.platingBonus = 1.2; toast("✨ GOLD PLATING! x1.2!"); AudioSys.good(); }
        else { s.platingBonus = 1.0; toast("⚪ SILVER PLATING! x1.0"); AudioSys.click(); }
        setTimeout(finishClassic, 500);
        return;
      }
      if (dist < widthPct / 4) { s.perfects++; s.combo++; toast(`✨ PERFECT! COMBO x${s.combo}!`); AudioSys.good(); }
      else if (dist < widthPct / 2 + 3) { s.goods++; s.combo = 0; AudioSys.click(); }
      else { toast("💥 Fumbled!"); s.combo = 0; AudioSys.bad(); }
      s.stepIdx++;
      const again = () => { if (session === s && activeScreen() === "screen-panel" && $("marker")) renderClassic(); };
      if (s.stepIdx >= s.steps.length) {
        // WS-1: Plating Finisher — only after an all-perfect run
        if (s.perfects === s.steps.length) { s.isPlatingFinisher = true; setTimeout(again, 450); }
        else setTimeout(finishClassic, 500);
      } else setTimeout(again, 450);
    }
    $("btn-strike").onclick = strike;
    document.addEventListener("keydown", onKey);
  }

  function finishClassic() {
    const s = session; if (!s || s.committed) return;
    let quality = clamp(Math.round((s.perfects * 2 + s.goods) * 10 / (s.steps.length * 2)), 1, 5);
    let flourish = false;
    if (s.isPlatingFinisher && s.platingBonus) {
      quality = clamp(Math.round(quality * s.platingBonus), 1, 5);
      flourish = s.platingBonus > 1.0 ? true : null;
    }
    commit(s, quality, flourish);
    toast(`${s.recipe.emoji} ${s.recipe.name}: ${"⭐".repeat(s.quality)}`, "gold");
    leaveKitchen();
  }

  installMenuToggle();

  return { open, recipeLikes, stagesFor, drawIngredient: drawIng, mode, setMode,
    _peek: () => ({ session, phase: G && G.phase, kind: G && G.kind, W: G && G.W, H: G && G.H, stage: G && G.stage && G.stage.peek ? G.stage.peek() : null }) };
})();

/* ---------- Panel screen: watermarked context art per section ---------- */
const PANEL_ART = {
  "🍳": "cooking", "📱": "cooking", "🪱": "hub", "🏠": "hub", "🛒": "hub", "🛸": null,
};
let __panelArtHooked = false;
function hookPanelArt() {
  if (__panelArtHooked) return; __panelArtHooked = true;
  new MutationObserver(() => {
    const t = ($("panel-title").textContent || "").trim();
    const art = PANEL_ART[Array.from(t)[0]];   // first code point (t[0] is only half an emoji)
    const el = $("planet-bg");
    if (art) { el.style.backgroundImage = `url(assets/${art}.png)`; el.classList.add("visible"); }
  }).observe($("panel-title"), { childList: true, characterData: true, subtree: true });
}
hookPanelArt();

/* ---------- Forklore ---------- */
function forkloreOpen() {
  $("panel-title").textContent = "📱 Forklore — the galaxy is hungry";
  const entries = Object.entries(State.dishes);
  let html = "";
  if (!entries.length) html = `<p class="map-desc">Nothing plated. The algorithm weeps.</p>`;
  else html = entries.map(([id, n]) => {
    const r = DATA.recipes.find(x => x.id === id);
    const q = State.flags["q_" + id] || 3;
    let likes = Math.round(Cooking.recipeLikes(r) * (0.6 + q * 0.15));
    if (State.flags.starChefStreak) { likes += State.dishes[id]; } // +1 like per dish posted if Star Chef streak is active
    const cash = Math.round(likes * (0.9 + Math.random() * .4) * (1 + upgradeLv("studio") * .3));
    return `<div class="card asset-card"><img class="dish-art" src="assets/${r.art}" alt="" onerror="this.style.display='none'">
      <div class="asset-body"><div class="row spread">
      <div><h4>${r.emoji} ${r.name} ×${n}</h4><p>${"⭐".repeat(q)} · ❤️~${likes} → 💰~${cash}</p></div>
      <button class="btn btn-teal" data-post="${id}" data-cash="${cash}" data-likes="${likes}">Post 📸</button>
    </div></div></div>`;
  }).join("");
  html += `<div class="card"><h4>Trending tags</h4><p>${pick(["#rusticplating", "#kettlecore", "#wormgoldwednesdays", "#voltEatsWhat", "#sousvidebutmakeitspace"])} · your followers love ${pick(["drama", "plating shots", "worm content", "feud tea"])}</p></div>`;
  $("panel-body").innerHTML = html;
  showScreen("screen-panel");
  document.querySelectorAll("[data-post]").forEach(b => b.onclick = () => {
    const id = b.dataset.post;
    State.dishes[id]--; if (State.dishes[id] <= 0) delete State.dishes[id];
    const likes = parseInt(b.dataset.likes), cash = parseInt(b.dataset.cash);
    State.followers += Math.max(1, Math.round(likes / 8));
    State.money += cash;
    AudioSys.good(); toast(`📸 Viral! +${likes} likes, +💰${cash}`, "gold");
    log(`📱 Posted: +${likes} likes, +💰${cash}`);
    updateHUD(); forkloreOpen();
  });
}

/* ---------- Wormery ---------- */
function wormeryOpen() {
  $("panel-title").textContent = "🪱 Wormery";
  const slots = 1 + upgradeLv("wormery");
  let html = `<p class="map-desc">The rarest, smartest worms in the galaxy — and they have opinions.</p>
  <div class="card"><h4>Residents (${State.worms.length}/${slots})</h4>`;
  if (!State.worms.length) html += `<p>The bins are tragically empty.</p>`;
  State.worms.forEach(w => {
    const t = DATA.wormTraits[w.trait], r = DATA.wormRarities.find(x => x.id === w.rarity);
    html += `<div style="padding:4px 0"><img src="assets/worm.png" class="worm-icon" onerror="this.remove()"> 🪱 <b style="color:${r.color}">${t.name}</b> <span class="tag">${r.name}</span> <small>${t.effect}</small></div>`;
  });
  html += `</div>`;
  const cost = 30 + (State.wormBuys || 0) * 15;
  html += `<div class="card row spread"><div><h4>Specimen Market</h4><p>Pedigree stock from across the galaxy.</p></div>
    <button id="btn-buy-worm" class="btn btn-primary" ${State.worms.length >= slots || State.money < cost ? "disabled" : ""}>Buy — 💰${cost}</button></div>`;
  if (State.worms.length >= 2)
    html += `<div class="card row spread"><div><h4>Breeding Chamber</h4><p>Two worms in, one ambitious egg out.</p></div>
      <button id="btn-breed" class="btn btn-teal">🥚 Breed ⚡1</button></div>`;
  $("panel-body").innerHTML = html;
  showScreen("screen-panel");
  $("btn-buy-worm").onclick = () => {
    if (State.money < cost) return;
    State.money -= cost; State.wormBuys = (State.wormBuys || 0) + 1;
    const rarity = weightedRarity(), trait = pick(Object.keys(DATA.wormTraits));
    State.worms.push({ trait, rarity });
    AudioSys.good(); toast(`🪱 New arrival: ${DATA.wormTraits[trait].name}!`, "gold");
    updateHUD(); wormeryOpen();
  };
  const bb = $("btn-breed");
  bb && (bb.onclick = () => {
    if (!spendEnergy(1)) return;
    const a = pick(State.worms), b = pick(State.worms);
    const order = ["common", "rare", "epic", "legendary"];
    const childRarity = order[Math.min(3, Math.max(order.indexOf(a.rarity), order.indexOf(b.rarity)) + (chance(.35) ? 1 : 0))];
    const childTrait = chance(.5) ? a.trait : b.trait;
    State.worms.unshift({ trait: childTrait, rarity: childRarity });
    while (State.worms.length > slots) State.worms.pop();
    AudioSys.jewel();
    toast(`🥚 Offspring: ${DATA.wormTraits[childTrait].name} (${childRarity})!`, "gold");
    updateHUD(); wormeryOpen();
    offerSleep();
  });
}
function weightedRarity() {
  const total = DATA.wormRarities.reduce((a, r) => a + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of DATA.wormRarities) { roll -= r.weight; if (roll <= 0) return r.id; }
  return "common";
}

/* ---------- Shelter ---------- */
function shelterOpen() {
  $("panel-title").textContent = "🏠 Shelter";
  $("panel-body").innerHTML = `<p class="map-desc">A ramshackle dome of salvage and ambition. Every upgrade changes what your days can hold.</p>` +
    DATA.upgrades.map(u => {
      const lv = upgradeLv(u.id);
      const maxed = lv >= u.levels.length;
      const cost = maxed ? null : u.levels[lv].cost;
      return `<div class="card row spread">
      <div><h4>${u.icon} ${u.name} — Lv ${lv}/${u.levels.length}</h4><p>${u.desc(Math.max(1, lv))}</p></div>
      <button class="btn btn-primary" data-upg="${u.id}" ${maxed || State.money < cost ? "disabled" : ""}>${maxed ? "MAX" : "Upgrade 💰" + cost}</button>
    </div>`;
    }).join("");
  showScreen("screen-panel");
  document.querySelectorAll("[data-upg]").forEach(b => b.onclick = () => {
    const u = DATA.upgrades.find(x => x.id === b.dataset.upg);
    const lv = upgradeLv(u.id); const cost = u.levels[lv].cost;
    if (State.money < cost) return;
    State.money -= cost; State.upgrades[u.id] = lv + 1;
    AudioSys.victory(); toast(`${u.icon} ${u.name} → Lv${lv + 1}!`, "gold");
    updateHUD(); shelterOpen();
  });
}

/* ---------- Market ---------- */
function marketOpen() {
  $("panel-title").textContent = "🛒 Galactic Provisioner";
  const ingEntries = Object.entries(State.inventory).filter(([, n]) => n > 0);
  let html = `<div class="card"><h4>Sell ingredients</h4>` +
    (ingEntries.length ? ingEntries.map(([id, n]) =>
      `<div class="row spread" style="padding:3px 0"><span>${DATA.ingredients[id].emoji} ${DATA.ingredients[id].name} ×${n} <span class="tag">💰${DATA.ingredients[id].value}ea</span></span>
       <button class="btn btn-small" data-sell="${id}">Sell 1</button></div>`).join("")
    : "<p>Empty pockets, full heart.</p>") + `</div>`;
  html += `<div class="card row spread"><div><h4>Trek rations</h4><p>+8 HP during expeditions.</p></div>
    <button id="btn-buy-ration" class="btn btn-primary" ${State.money < 25 ? "disabled" : ""}>💰25</button></div>`;
  $("panel-body").innerHTML = html;
  showScreen("screen-panel");
  document.querySelectorAll("[data-sell]").forEach(b => b.onclick = () => {
    const id = b.dataset.sell; useInv(id, 1);
    State.money += DATA.ingredients[id].value;
    AudioSys.click(); toast(`+💰${DATA.ingredients[id].value}`);
    updateHUD(); marketOpen();
  });
  $("btn-buy-ration").onclick = () => {
    if (State.money < 25) return;
    State.money -= 25; State.flags.rations = (State.flags.rations || 0) + 1;
    AudioSys.good(); toast("🥪 Ration acquired"); updateHUD(); marketOpen();
  };
}
