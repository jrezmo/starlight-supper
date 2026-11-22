/* ============ WS-8: Live-Action Kitchen Service ============
   A 90-second real-time dinner rush. Customers walk in, sit, think, order;
   Nimbus grabs plates off the pass and runs them to the right table before
   the patience ring empties. Streaks, a rush-hour wave, a VIP critic, ally
   helpers, and an end-of-shift tally that pays into State.
   Canvas logical size: 960x540 (landscape) or 540x900 (portrait phones). */
"use strict";
const Service = (() => {
  const SHIFT = 90;                 // seconds
  const RUSH = [36, 58];            // rush-hour window (shift seconds)
  const LAST_CALL = SHIFT - 14;     // no new customers after this
  const HAND_MAX = 2;

  /* ---------- menu: house specials (never a dead end) + Bramble's flambé ---------- */
  const HOUSE = [
    { id: "h_noodle", name: "Nebula Noodles", emoji: "🍜", baseLikes: 3, price: 2, house: true, plate: "#ffb86b" },
    { id: "h_toast",  name: "Comet Toast",    emoji: "🍞", baseLikes: 3, price: 2, house: true, plate: "#ffd76b" },
    { id: "h_mochi",  name: "Moon Mochi",     emoji: "🍡", baseLikes: 4, price: 3, house: true, plate: "#f7a8d8" },
  ];
  const FLAMBE = { id: "b_flambe", name: "Bramble's Lava Flambé", emoji: "🥘", baseLikes: 16, price: 14, flambe: true, plate: "#ff6b35" };

  /* ---------- customer personalities ---------- */
  const PERS = {
    cozy:   { name: "Cozy Comet",       body: "#95e06c", belly: "#cdf3ad", patience: 22, think: 2.4, speed: 95,  tip: 1.0,  fol: 1,   w: 38 },
    zippy:  { name: "Hasty Zipper",     body: "#ff8a5c", belly: "#ffc3a6", patience: 14, think: 1.2, speed: 165, tip: 1.4,  fol: 1,   w: 22 },
    dreamy: { name: "Dreamy Drifter",   body: "#b39ddb", belly: "#ddd0f5", patience: 32, think: 3.4, speed: 62,  tip: 0.85, fol: 1,   w: 20 },
    tipper: { name: "Big Tipper Blorb", body: "#ffc857", belly: "#ffe7a8", patience: 20, think: 2.2, speed: 80,  tip: 2.1,  fol: 1,   w: 8 },
    influ:  { name: "Influencer Gloop", body: "#4ecdc4", belly: "#b5efea", patience: 17, think: 1.8, speed: 110, tip: 1.0,  fol: 2,   w: 12 },
    critic: { name: "Critic Quasar",    body: "#e8dcff", belly: "#ffffff", patience: 21, think: 2.0, speed: 85,  tip: 2.0,  fol: 3,   w: 0, vip: true },
  };

  const REVIEWS = {
    angry: ["Cold tart, colder stare. ★★", "Waited so long I evolved a new stomach. ★★", "Lovely room. Shame about the timeline. ★★",
      "My order is still orbiting somewhere. ★", "The vibe: immaculate. The wait: galactic. ★★", "I came for supper and stayed for… nothing. ★★"],
    happy: ["Tasted like a supernova gave me a hug. ★★★★★", "Nimbus moves like a comet with an apron. ★★★★", "Ate it in one bite. Regret nothing. ★★★★★",
      "Ten out of ten moons. ★★★★★", "Cozy, quick, and it hummed at me. ★★★★", "Would orbit back. ★★★★"],
    critic: ["Critic Quasar: 'A five-star orbit. Bring your appetite and your sunglasses.' ★★★★★",
      "Critic Quasar: 'Precise, warm, and suspiciously delicious.' ★★★★★"],
    criticMeh: ["Critic Quasar: 'Promising. Slow. Promising.' ★★★", "Critic Quasar: 'I have tasted greatness. Eventually.' ★★★"],
    criticLeft: ["Critic Quasar: 'I left before dessert. And before the entrée.' ★★"],
  };

  const G = { running: false };
  let ensured = false;

  /* =====================================================================
     State plumbing (safe defaults for old saves)
     ===================================================================== */
  function ensureState() {
    if (!Array.isArray(State.pass)) State.pass = [];
    const s = (State.service && typeof State.service === "object") ? State.service : {};
    State.service = Object.assign({ shifts: 0, served: 0, bestStars: 0, bestStreak: 0, lastDay: 0, reviews: [] }, s);
    if (!Array.isArray(State.service.reviews)) State.service.reviews = [];
    ensured = true;
  }

  /* State.dishes holds plate COUNTS (Forklore posting spends them); State.pass holds each
     plate's cooking quality. Reconcile so the two always agree (old saves, Forklore posts). */
  function syncPass() {
    ensureState();
    const by = {};
    for (const p of State.pass) {
      if (!p || !DATA.recipes.find(r => r.id === p.id)) continue;
      (by[p.id] = by[p.id] || []).push(clamp(Math.round(p.q) || 3, 1, 5));
    }
    const out = [];
    for (const [id, nRaw] of Object.entries(State.dishes || {})) {
      const n = Math.max(0, nRaw | 0);
      if (!DATA.recipes.find(r => r.id === id) || !n) continue;
      const qs = (by[id] || []).sort((a, b) => b - a).slice(0, n);
      while (qs.length < n) qs.push(clamp(State.flags["q_" + id] || 3, 1, 5));
      qs.forEach(q => out.push({ id, q }));
    }
    State.pass = out;
  }

  /* Called by Cooking.finish() — every cooked plate lands on the pass with its quality. */
  function deposit(id, quality) {
    ensureState();
    State.pass.push({ id, q: clamp(Math.round(quality) || 3, 1, 5), day: State.day });
    syncPass();
  }

  const qMult = q => 0.6 + (clamp(q, 1, 5) - 1) * 0.225;   // 1★ → 0.6 … 5★ → 1.5
  const stars = (q) => "★".repeat(Math.round(q)) + "☆".repeat(5 - Math.round(q));
  function dishDef(id) {
    return HOUSE.find(h => h.id === id) || (id === FLAMBE.id ? FLAMBE : DATA.recipes.find(r => r.id === id));
  }
  const hasAlly = id => (State.allies || []).includes(id);

  /* =====================================================================
     Audio (procedural chiptune through Chip; respects mute)
     ===================================================================== */
  const sfx = {
    _ok() { return typeof Chip !== "undefined" && Chip.tone && !AudioMuted; },
    pickup() { if (!this._ok()) return; Chip.tone(660, .06, "square", .08); Chip.tone(990, .08, "square", .07, .05); },
    order() { if (!this._ok()) return; Chip.tone(1047, .12, "triangle", .09); Chip.tone(1319, .18, "triangle", .08, .09); },
    door() { if (!this._ok()) return; Chip.tone(1568, .2, "sine", .05); Chip.tone(2093, .25, "sine", .04, .1); },
    serve(streak) { if (!this._ok()) return; const b = 1 + Math.min(10, streak) * .04;
      [784, 1047, 1319].forEach((f, i) => Chip.tone(f * b, .1, "square", .08, i * .05)); },
    perfect() { if (!this._ok()) return; [1047, 1319, 1568, 2093].forEach((f, i) => Chip.tone(f, .14, "triangle", .1, i * .055));
      Chip.noise(.15, .06, .05, true); },
    coin() { if (!this._ok()) return; Chip.tone(1319, .06, "square", .06, .12); Chip.tone(1760, .16, "square", .06, .18); },
    reject() { if (!this._ok()) return; Chip.tone(233, .18, "square", .1); Chip.tone(208, .26, "square", .09, .14); },
    sigh() { if (!this._ok()) return; Chip.tone(392, .5, "sawtooth", .07, 0, .5); },
    rush() { if (!this._ok()) return; [392, 523, 392, 523, 659].forEach((f, i) => Chip.tone(f, .12, "square", .1, i * .1)); },
    critic() { if (!this._ok()) return; [523, 659, 784, 1047].forEach((f, i) => Chip.tone(f, .2, "triangle", .1, i * .09)); },
    wash() { if (!this._ok()) return; Chip.noise(.25, .1, 0, true); Chip.tone(1760, .12, "sine", .05, .15); },
    whoosh() { if (!this._ok()) return; Chip.noise(.35, .12, 0, false); Chip.tone(200, .3, "sawtooth", .05, 0, 2.2); },
    whistle() { if (!this._ok()) return; Chip.tone(900, .18, "sine", .07, 0, 1.8); },
    tick() { if (!this._ok()) return; Chip.tone(1800, .03, "square", .04); },
    bell() { if (!this._ok()) return; [1568, 1175, 1568, 1175].forEach((f, i) => Chip.tone(f, .3, "sine", .07, i * .16)); },
    star(i) { if (!this._ok()) return; Chip.tone(784 * Math.pow(1.122, i * 2), .2, "triangle", .1); },
    bump() { if (!this._ok()) return; Chip.tone(330, .05, "square", .05); },
  };
  function music(name) { if (typeof Chip !== "undefined" && !AudioMuted) Chip.play(name); }

  /* =====================================================================
     Layout (landscape 960x540 or portrait 540x900)
     ===================================================================== */
  function makeLayout(portrait, nSlots, nTables) {
    const W = portrait ? 540 : 960, H = portrait ? 900 : 540;
    const wallH = 170;
    const slotW = portrait ? 76 : 86;
    const right = W - 22;
    const cx0 = right - nSlots * slotW - 14;
    const L = {
      portrait, W, H, wallH, slotW,
      door: { x: portrait ? 60 : 72, y: wallH, w: 76, h: 112 },
      counter: { x0: cx0, x1: right, y: wallH - 22, h: 46 },
      window: { x0: cx0 + 6, x1: right - 6, y0: 58, y1: wallH - 30 },
      bin: portrait ? { x: W - 56, y: H - 52 } : { x: W - 52, y: H - 60 },
      vex: { x: (portrait ? 60 : 72) + 70, y: wallH + 36 },
      nellHome: { x: cx0 - 34, y: wallH + 56 },
      bounds: { x0: 28, x1: W - 28, y0: wallH + 40, y1: H - 24 },
      start: portrait ? { x: W / 2, y: 470 } : { x: 470, y: 400 },
    };
    L.slots = [];
    for (let i = 0; i < nSlots; i++) {
      const x = cx0 + 14 + slotW * i + slotW / 2;
      L.slots.push({ x, y: wallH - 18, sx: x, sy: wallH + 58 });
    }
    // table arrangements per count, spread to fill the floor
    const TL = portrait ? {
      2: [[170, 400], [400, 560]], 3: [[160, 380], [400, 420], [250, 640]],
      4: [[160, 370], [400, 410], [170, 610], [400, 660]], 5: [[150, 350], [395, 385], [160, 560], [400, 610], [260, 790]],
    } : {
      2: [[300, 360], [600, 380]], 3: [[250, 330], [520, 340], [400, 470]],
      4: [[240, 320], [520, 320], [340, 470], [640, 470]], 5: [[230, 315], [470, 315], [710, 345], [350, 470], [600, 480]],
    };
    L.tables = TL[nTables].map(([x, y]) => ({ x, y }));
    return L;
  }

  /* =====================================================================
     Open / pre-shift panel
     ===================================================================== */
  function open() {
    ensureState(); syncPass();
    if (State.planet) { toast("Service runs from the Home Shelter kitchen."); Hub.open(); return; }
    if (State.energy <= 0) { toast("Too late to open tonight — sleep first."); Hub.open(); return; }
    buildDom();
    G.phase = "pre";
    planShift();
    showScreen("screen-service");
    $("planet-bg").classList.remove("visible");
    music("service");
    startLoop();
    renderPre();
  }

  function buildDom() {
    G.canvas = $("service-canvas");
    G.ctx = G.canvas.getContext("2d");
    G.ui = $("service-ui");
    if (!$("service-quit")) {
      const b = document.createElement("button");
      b.id = "service-quit"; b.className = "btn btn-small service-quit"; b.textContent = "🚪 Close early";
      b.onclick = () => { if (G.phase === "live") endShift(true); };
      $("screen-service").appendChild(b);
    }
    $("service-quit").classList.add("hidden");
  }

  // What's on tonight: stock, slots, tables, staff
  function planShift() {
    const portrait = innerHeight > innerWidth * 1.05;
    const allies = { vex: hasAlly("madame_vex"), bramble: hasAlly("chef_bramble"), nell: hasAlly("admiral_nell") };
    // cooked stock by recipe (best quality first)
    const stock = {};
    for (const p of State.pass) (stock[p.id] = stock[p.id] || []).push(p.q);
    Object.values(stock).forEach(a => a.sort((x, y) => y - x));
    const cookedIds = Object.keys(stock).sort((a, b) => dishDef(b).baseLikes - dishDef(a).baseLikes);
    const maxCooked = 5 - 1 - (allies.bramble ? 1 : 0);
    const slotIds = cookedIds.slice(0, maxCooked);
    if (allies.bramble) slotIds.push(FLAMBE.id);
    for (const h of HOUSE) if (slotIds.length < 5) slotIds.push(h.id);
    const nTables = clamp(2 + (State.service.shifts >= 1 ? 1 : 0) + upgradeLv("guesthall") + (State.day >= 4 ? 1 : 0), 2, 5);
    G.allies = allies;
    G.stock = {};
    slotIds.forEach(id => { G.stock[id] = id === FLAMBE.id ? [] : (stock[id] ? stock[id].slice() : null); });
    G.slotIds = slotIds;
    G.L = makeLayout(portrait, slotIds.length, nTables);
    G.L.slots.forEach((s, i) => { s.id = slotIds[i]; });
    G.multiCourse = (State.allies || []).length >= 1 || State.day >= 5;
    G.bussing = State.service.shifts >= 2 || State.day >= 4;
    G.tutorial = State.service.shifts < 2;
    G.bg = null; // rebuilt lazily for this layout
    resetSim();
  }

  function resetSim() {
    const L = G.L;
    G.t = 0; G.spawnT = 1.0; G.custId = 0;
    G.customers = []; G.floats = []; G.parts = []; G.banners = [];
    G.tables = L.tables.map(t => ({ x: t.x, y: t.y, cust: null, dirty: false, dirtyT: 0, worm: 0 }));
    G.N = { x: L.start.x, y: L.start.y, face: 1, carry: [], walkT: 0, moving: false, target: null, act: null, squash: 0 };
    G.score = { likes: 0, money: 0, fol: 0, served: 0, perfect: 0, left: 0, wrong: 0, washed: 0, arrived: 0,
      streak: 0, bestStreak: 0, sats: [], lines: [], reviews: [], critic: null, qualSum: 0 };
    G.shake = 0; G.flash = 0; G.streakPop = 0; G.likesShown = 0; G.moneyShown = 0;
    G.rushOn = false; G.rushAnnounced = false; G.lastCallAnnounced = false;
    G.criticAt = rand(46, 62); G.criticDone = false;
    G.bramble = { t: 9, pop: 0 };
    G.nell = { t: 7, state: "idle", x: L.nellHome.x, y: L.nellHome.y, target: null, dish: null, face: -1 };
    G.vex = { bow: 0, line: 0 };
    G.keys = {}; G.lastTick = -1; G.closingT = 0;
  }

  function renderPre() {
    const plates = State.pass.length;
    const cooked = G.slotIds.filter(id => G.stock[id] && !dishDef(id).house && id !== FLAMBE.id);
    const lines = cooked.map(id => {
      const d = dishDef(id), qs = G.stock[id];
      return `<div class="svc-dish"><img src="assets/${d.art}" alt="" onerror="this.remove()"><div><b>${d.emoji} ${d.name}</b>
        <span class="svc-stars">${qs.map(q => "★".repeat(q)).join(" · ")}</span><small>×${qs.length} plate${qs.length > 1 ? "s" : ""} on the pass</small></div></div>`;
    }).join("");
    const extra = plates - cooked.reduce((a, id) => a + G.stock[id].length, 0);
    const house = HOUSE.filter(h => G.slotIds.includes(h.id)).map(h => `${h.emoji} ${h.name}`).join(" · ");
    const staff = [
      ["madame_vex", "Madame Vex", "Hostess", "Seats guests 40% faster, +10% patience", G.allies.vex],
      ["chef_bramble", "Chef Bramble", "Kitchen", "Fires a Lava Flambé onto the pass every 15s", G.allies.bramble],
      ["admiral_nell", "Admiral Nell", "Runner", "Runs a plate to a waiting guest every 12s", G.allies.nell],
    ].map(([id, name, role, fx, on]) => `<div class="svc-ally ${on ? "on" : "off"}"><img src="assets/${id}.png" alt="" onerror="this.remove()">
        <div><b>${name}</b> <span class="tag">${role}</span><small>${on ? fx : "Win their tea party to hire them"}</small></div></div>`).join("");
    const touch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 1;
    G.ui.innerHTML = `<div class="svc-card">
      <h2>🍽️ Open for Service</h2>
      <p class="svc-sub">Day ${State.day} · ${G.L.tables.length} tables · 90-second dinner rush</p>
      <div class="svc-cols">
        <div class="svc-col"><h4>On the pass</h4>
          ${lines || `<p class="svc-empty">No gourmet plates cooked yet — Nimbus will sling house specials. Cook first for bigger tips! 🍳</p>`}
          ${extra > 0 ? `<small class="dim">+${extra} more plate${extra > 1 ? "s" : ""} waiting in the walk-in for another night</small>` : ""}
          <p class="svc-house">House specials (unlimited): ${house}</p></div>
        <div class="svc-col"><h4>Staff on duty</h4>${staff}</div>
      </div>
      <p class="svc-how">${touch ? "<b>Tap</b> a plate on the pass to grab it, then <b>tap</b> the guest who ordered it." : "<b>WASD / arrows</b> to move · <b>E / Space</b> to grab & serve · or just <b>click</b> plates and guests."}
        Match the dish in their bubble before the ring runs out. Fast serves build a 🔥 streak!</p>
      <div class="svc-actions"><button class="btn" id="svc-back">← Back</button>
        <button class="btn btn-primary" id="svc-go">🔔 Open the Doors! ⚡1</button></div>
    </div>`;
    G.ui.classList.remove("hidden");
    $("svc-back").onclick = () => { AudioSys.click(); exit(); Hub.open(); };
    $("svc-go").onclick = () => startShift();
  }

  /* =====================================================================
     Shift lifecycle
     ===================================================================== */
  function startShift() {
    if (G.phase !== "pre") return;
    if (!spendEnergy(1)) { exit(); Hub.open(); return; }
    AudioSys.click();
    G.ui.classList.add("hidden"); G.ui.innerHTML = "";
    $("service-quit").classList.remove("hidden");
    resetSim();
    G.phase = "live";
    banner("🔔 Doors open!", "#ffc857", 1.6);
    sfx.bell();
    if (G.tutorial) setTimeout(() => G.phase === "live" && banner("Grab the dish they ask for → bring it to them!", "#4ecdc4", 3.2), 1700);
  }

  function startLoop() {
    if (G.running) return;
    G.running = true;
    bindInput();
    fit();
    G.last = performance.now();
    const loop = (t) => {
      if (!G.running) return;
      G.raf = requestAnimationFrame(loop);
      if (activeScreen() !== "screen-service") { exit(); return; }   // navigated away (save load etc) → closed, no payout
      const dt = Math.min(.05, Math.max(0, (t - G.last) / 1000)); G.last = t;
      const paused = isPaused();
      if (!paused) {
        if (G.phase === "live") update(dt);
        else if (G.phase === "closing") closing(dt);
        fx(dt);
      }
      draw(paused);
    };
    G.raf = requestAnimationFrame(loop);
  }

  function isPaused() {
    return document.hidden || !$("overlay-menu").classList.contains("hidden") ||
      !$("overlay-story").classList.contains("hidden") || !$("save-manager").classList.contains("hidden");
  }

  function exit() {
    G.running = false;
    cancelAnimationFrame(G.raf);
    unbindInput();
    G.phase = "off";
    if (G.ui) { G.ui.classList.add("hidden"); G.ui.innerHTML = ""; }
    const q = $("service-quit"); if (q) q.classList.add("hidden");
  }

  function endShift(early) {
    if (G.phase !== "live") return;
    G.phase = "closing"; G.closingT = 0; G.early = !!early;
    $("service-quit").classList.add("hidden");
    banner(early ? "🚪 Closing early" : "🌙 Closing time!", "#b39ddb", 2);
    sfx.bell();
    // everyone still waiting heads home politely — no review
    for (const c of G.customers) if (c.state === "walk" || c.state === "think" || c.state === "order") leave(c, "neutral");
    G.N.target = null; G.N.act = null;
  }

  function closing(dt) {
    G.closingT += dt;
    stepCustomers(dt);
    if (G.closingT > 2.2 && G.phase === "closing") tally();
  }

  /* =====================================================================
     Simulation
     ===================================================================== */
  function update(dt) {
    G.t += dt;
    const prog = G.t / SHIFT;
    // rush hour
    const inRush = G.t >= RUSH[0] && G.t < RUSH[1];
    if (inRush && !G.rushOn) { G.rushOn = true; banner("🔥 RUSH HOUR! 🔥", "#ff6b6b", 2.2); sfx.rush(); music("rush"); shake(6); }
    if (!inRush && G.rushOn) { G.rushOn = false; banner("Phew — the rush is over", "#95e06c", 1.8); music("service"); }
    if (G.t >= LAST_CALL && !G.lastCallAnnounced) { G.lastCallAnnounced = true; banner("🌆 Last call!", "#ffc857", 1.8); }
    const sec = Math.ceil(SHIFT - G.t);
    if (sec <= 5 && sec !== G.lastTick) { G.lastTick = sec; sfx.tick(); }
    if (G.t >= SHIFT) { endShift(false); return; }

    // spawning
    G.spawnT -= dt;
    const wantCritic = !G.criticDone && G.t >= G.criticAt;
    if (G.t < LAST_CALL && (G.spawnT <= 0 || (wantCritic && G.spawnT < 2.5))) {
      if (spawnCustomer(wantCritic)) {
        const base = clamp(6.0 - (State.day - 1) * .2 - State.followers / 500, 3.2, 6.0);
        G.spawnT = base * (1 - .35 * prog) * (G.rushOn ? .5 : 1) * (G.allies.vex ? .9 : 1) * (.8 + Math.random() * .4);
      } else G.spawnT = .7;
    }

    moveNimbus(dt);
    stepCustomers(dt);
    stepTables(dt);
    stepAllies(dt);
  }

  function freeTable() {
    const free = G.tables.filter(t => !t.cust && !t.dirty);
    return free.length ? pick(free) : null;
  }

  function spawnCustomer(critic) {
    const t = freeTable(); if (!t) return false;
    let pk = "cozy";
    if (critic) { pk = "critic"; G.criticDone = true; }
    else {
      const pool = Object.entries(PERS).filter(([, p]) => p.w > 0);
      let r = Math.random() * pool.reduce((a, [, p]) => a + p.w, 0);
      for (const [k, p] of pool) { r -= p.w; if (r <= 0) { pk = k; break; } }
    }
    const P = PERS[pk], L = G.L;
    const prog = G.t / SHIFT;
    const dayMod = clamp(1.1 - State.day * .02, .85, 1.1);
    const patience = Math.max(10, P.patience * (G.allies.vex ? 1.1 : 1) * (1 - .15 * prog) * (G.rushOn ? .9 : 1) * dayMod);
    const c = {
      id: ++G.custId, pk, P, table: t, x: L.door.x, y: L.door.y + 14,
      tx: t.x - 46, ty: t.y - 6, state: "walk", t: 0,
      patienceMax: patience, patience, courses: [], ci: 0, served: [],
      face: 1, bob: Math.random() * 6, blink: Math.random() * 3, mood: "ok", alpha: 0, rush: G.rushOn,
    };
    t.cust = c;
    G.customers.push(c);
    G.score.arrived++;
    sfx.door();
    if (G.allies.vex) { G.vex.bow = 1; G.vex.line = 1.6; }
    if (critic) {
      banner("🎩 A Forklore CRITIC just walked in!", "#ffc857", 2.4); sfx.critic();
      burst(c.x, c.y - 30, ["#ffc857", "#fff3e2"], 22, 3);
    }
    return true;
  }

  // available units of a dish = stock + in hands + with Nell − already promised to guests
  function avail(id) {
    const s = G.stock[id];
    if (s === null || s === undefined) return dishDef(id) && dishDef(id).house ? Infinity : 0;
    let n = s.length + G.N.carry.filter(it => it.id === id).length + (G.nell.dish && G.nell.dish.id === id ? 1 : 0);
    for (const c of G.customers) if (c.state !== "gone" && c.state !== "leave") for (let i = c.ci; i < c.courses.length; i++) if (c.courses[i] === id) n--;
    return n;
  }

  function chooseDish(critic) {
    const opts = G.slotIds.filter(id => avail(id) > 0);
    const premium = opts.filter(id => !dishDef(id).house);
    if (critic) {
      if (premium.length) return premium.sort((a, b) => dishDef(b).baseLikes - dishDef(a).baseLikes)[0];
      return pick(opts);
    }
    // premium plates are tempting: 3× weight each
    const bag = [];
    opts.forEach(id => { const w = dishDef(id).house ? 1 : 3; for (let i = 0; i < w; i++) bag.push(id); });
    return pick(bag);
  }

  function stepCustomers(dt) {
    for (const c of G.customers) {
      c.t += dt; c.bob += dt * (c.state === "walk" || c.state === "leave" ? 9 : 2.2);
      c.blink -= dt; if (c.blink < -0.12) c.blink = 2 + Math.random() * 3;
      c.alpha = Math.min(1, c.alpha + dt * 3);
      if (c.shakeT) c.shakeT = Math.max(0, c.shakeT - dt);
      if (c.state === "walk") {
        const spd = c.P.speed * (G.allies.vex ? 1.4 : 1);
        if (walkTo(c, c.tx, c.ty, spd * dt)) {
          c.state = "think"; c.t = 0;
          c.thinkFor = c.P.think * (G.allies.vex ? .6 : 1);
        }
      } else if (c.state === "think") {
        if (c.t >= c.thinkFor) placeOrder(c);
      } else if (c.state === "order") {
        if (G.phase === "live") c.patience -= dt;
        if (c.patience <= 0) {
          c.patience = 0;
          leave(c, "angry");
        }
      } else if (c.state === "eat") {
        if (Math.random() < dt * 5) burst(c.x + 18, c.y - 22, ["#fff3e2", "#ffc857"], 1, 1.2);
        if (c.t >= c.eatFor) {
          if (c.ci < c.courses.length && G.phase === "live") { c.state = "think"; c.t = 0; c.thinkFor = .8; }
          else leave(c, "happy");
        }
      } else if (c.state === "leave") {
        if (walkTo(c, G.L.door.x, G.L.door.y + 14, c.P.speed * 1.3 * dt)) { c.state = "gone"; }
        if (c.y < G.L.door.y + 40) c.alpha = Math.max(0, c.alpha - dt * 4);
      }
    }
    G.customers = G.customers.filter(c => c.state !== "gone");
  }

  function walkTo(o, tx, ty, step) {
    const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
    if (d <= step || d < 1) { o.x = tx; o.y = ty; return true; }
    o.x += dx / d * step; o.y += dy / d * step;
    if (Math.abs(dx) > 1) o.face = dx > 0 ? 1 : -1;
    return false;
  }

  function placeOrder(c) {
    if (!c.courses.length) {
      const first = chooseDish(c.P.vip);
      c.courses.push(first);
      if (G.multiCourse && !c.P.vip && Math.random() < .28) {
        c.courses.push(chooseDish(false)); // reserved up-front so stock is honest
      }
    }
    c.state = "order"; c.t = 0;
    c.patience = c.ci === 0 ? c.patienceMax : Math.max(c.patience, c.patienceMax * .75);
    c.orderPop = 1;
    sfx.order();
  }

  function leave(c, how) {
    if (c.table && c.table.cust === c) {
      c.table.cust = null;
      if (how === "happy" && G.bussing) { c.table.dirty = true; c.table.dirtyT = 0; c.table.worm = 0; }
    }
    c.state = "leave"; c.t = 0; c.mood = how;
    if (how === "angry") {
      G.score.left++;
      G.score.sats.push(0);
      breakStreak();
      sfx.sigh();
      const rv = c.P.vip ? pick(REVIEWS.criticLeft) : pick(REVIEWS.angry);
      G.score.reviews.push({ mood: "angry", text: rv, who: c.P.name });
      if (c.P.vip) G.score.critic = "left";
      float("💢 left a review", c.x, c.y - 70, "#ff8a8a", 15);
      burst(c.x, c.y - 40, ["#8d84c0", "#5a5080"], 10, 1.6);
      c.shakeT = .5;
    } else if (how === "happy") {
      burst(c.x, c.y - 40, ["#ff6b9a", "#ffc857"], 8, 1.4);
    }
  }

  function breakStreak() {
    if (G.score.streak >= 3) float("streak lost", G.N.x, G.N.y - 90, "#b3aade", 14);
    G.score.streak = 0;
  }

  function stepTables(dt) {
    for (const t of G.tables) {
      if (!t.dirty) continue;
      t.dirtyT += dt;
      if (t.dirtyT > 13) {           // a wormery worm wiggles over and licks it clean
        t.worm = Math.min(1, t.worm + dt * 1.2);
        if (t.dirtyT > 15) { t.dirty = false; t.worm = 0; burst(t.x, t.y - 10, ["#95e06c"], 6, 1); }
      }
    }
  }

  /* ---------- allies ---------- */
  function stepAllies(dt) {
    if (G.vex.line > 0) G.vex.line -= dt;
    if (G.vex.bow > 0) G.vex.bow = Math.max(0, G.vex.bow - dt * 1.5);
    // Bramble: a flambé hits the pass every 15s
    if (G.allies.bramble) {
      G.bramble.t -= dt; G.bramble.pop = Math.max(0, G.bramble.pop - dt);
      if (G.bramble.t <= 0) {
        G.bramble.t = 15;
        const s = G.stock[FLAMBE.id];
        if (s && s.length < 4) {
          s.push(4); G.bramble.pop = 1.6; sfx.whoosh();
          const slot = G.L.slots.find(x => x.id === FLAMBE.id);
          if (slot) { burst(slot.x, slot.y - 6, ["#ff6b35", "#ffc857", "#ff3d3d"], 18, 2.4); float("🔥 Flambé up!", slot.x, slot.y - 40, "#ffb86b", 15); }
        }
      }
    }
    // Nell: every 12s, runs a pass plate to the most impatient guest who wants it
    if (G.allies.nell) {
      const n = G.nell;
      if (n.state === "idle") {
        n.t -= dt;
        if (n.t <= 0) {
          const has = id => { const s = G.stock[id]; return s ? s.length > 0 : !!(dishDef(id) && dishDef(id).house); };
          const cand = G.customers.filter(c => c.state === "order" && has(c.courses[c.ci]) &&
            !G.N.carry.some(it => it.id === c.courses[c.ci]))
            .sort((a, b) => a.patience / a.patienceMax - b.patience / b.patienceMax)[0];
          if (cand) {
            const id = cand.courses[cand.ci];
            const slot = G.L.slots.find(s => s.id === id);
            n.dish = { id, q: G.stock[id] ? G.stock[id].shift() : (G.allies.bramble ? 4 : 3) };
            n.target = cand; n.state = "run"; n.slot = slot;
            sfx.whistle();
            float("⚓ Nell's on it!", n.x, n.y - 70, "#6cb8ff", 14);
          } else n.t = 1;
        }
      } else if (n.state === "run") {
        const c = n.target;
        if (!c || c.state !== "order" || c.courses[c.ci] !== n.dish.id) {
          // guest left or got served — put the plate back
          if (n.dish && G.stock[n.dish.id]) { G.stock[n.dish.id].push(n.dish.q); G.stock[n.dish.id].sort((a, b) => b - a); }
          n.dish = null; n.state = "back";
        } else if (walkTo(n, c.x + 30, c.y + 10, 430 * dt)) {
          serve(c, n.dish, "nell");
          n.dish = null; n.state = "back";
        }
        if (Math.random() < dt * 30) burst(n.x, n.y + 6, ["#6cb8ff", "#caf0f8"], 1, .6);
      } else if (n.state === "back") {
        if (walkTo(n, G.L.nellHome.x, G.L.nellHome.y, 330 * dt)) { n.state = "idle"; n.t = 12; n.face = -1; }
      }
    }
  }

  /* ---------- Nimbus ---------- */
  function moveNimbus(dt) {
    const N = G.N, k = G.keys, B = G.L.bounds;
    let dx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    let dy = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
    const speed = (N.carry.length >= 2 ? 235 : 265) * (N.boost > 0 ? 1.12 : 1);
    if (N.boost > 0) N.boost -= dt;
    N.moving = false;
    if (dx || dy) {
      N.target = null; N.act = null;
      const len = Math.hypot(dx, dy);
      N.x += dx / len * speed * dt; N.y += dy / len * speed * dt;
      if (dx) N.face = dx > 0 ? 1 : -1;
      N.moving = true;
    } else if (N.target) {
      const arrived = walkTo(N, N.target.x, N.target.y, speed * dt);
      N.moving = !arrived;
      if (arrived) {
        const act = N.act; N.target = null; N.act = null;
        if (act) doAct(act);
      }
    }
    N.x = clamp(N.x, B.x0, B.x1); N.y = clamp(N.y, B.y0, B.y1);
    if (N.moving) { N.walkT += dt * 11; if (Math.random() < dt * 8) burst(N.x - N.face * 10, N.y + 2, ["rgba(255,255,255,.5)"], 1, .4); }
    N.squash = Math.max(0, N.squash - dt * 4);
    G.focus = findFocus();
  }

  // what would E/Space do right now?
  function findFocus() {
    const N = G.N, L = G.L, opts = [];
    const carryIds = N.carry.filter(it => it.id).map(it => it.id);
    for (const c of G.customers) {
      if (c.state !== "order") continue;
      const d = Math.min(Math.hypot(N.x - c.x, N.y - c.y), Math.hypot(N.x - c.table.x, N.y - c.table.y));
      if (d < 92 && N.carry.some(it => it.id)) opts.push({ kind: "cust", c, d: d - (carryIds.includes(c.courses[c.ci]) ? 60 : 0), pri: 1 });
    }
    for (const s of L.slots) {
      const d = Math.hypot(N.x - s.sx, (N.y - s.sy) * 1.4);
      if (d < 62) opts.push({ kind: "slot", s, d, pri: 2 });
    }
    if (N.carry.length < HAND_MAX) for (const t of G.tables) {
      if (!t.dirty) continue;
      const d = Math.hypot(N.x - t.x, N.y - t.y);
      if (d < 84) opts.push({ kind: "dirty", t, d, pri: 3 });
    }
    if (N.carry.some(it => it.dirty)) {
      const d = Math.hypot(N.x - L.bin.x, N.y - L.bin.y);
      if (d < 90) opts.push({ kind: "bin", d, pri: 0 });
    }
    opts.sort((a, b) => a.pri - b.pri || a.d - b.d);
    return opts[0] || null;
  }

  function interact() {
    if (G.phase !== "live") return;
    const f = G.focus;
    if (!f) { G.N.squash = .6; sfx.bump(); return; }
    doAct(f);
  }

  function doAct(a) {
    const N = G.N;
    if (G.phase !== "live") return;
    if (a.kind === "slot") {
      const id = a.s.id, d = dishDef(id);
      if (N.carry.length >= HAND_MAX) {
        // hands full: put one plate back (the one that matches this slot if any, else the oldest dish)
        let i = N.carry.findIndex(it => it.id === id);
        if (i < 0) i = N.carry.findIndex(it => it.id);
        if (i < 0) { float("Hands full!", N.x, N.y - 90, "#ffc857", 14); sfx.bump(); return; }
        const it = N.carry.splice(i, 1)[0];
        if (G.stock[it.id]) { G.stock[it.id].push(it.q); G.stock[it.id].sort((x, y) => y - x); }
        float("↩ back on the pass", N.x, N.y - 90, "#cfc7f2", 13); sfx.bump();
        return;
      }
      const s = G.stock[id];
      let q;
      if (s === null || s === undefined) q = G.allies.bramble ? 4 : 3;   // house special, ladled fresh
      else if (!s.length) { float(id === FLAMBE.id ? "Bramble's cooking…" : "Sold out!", a.s.x, a.s.y - 46, "#ff8a8a", 14); sfx.bump(); return; }
      else q = s.shift();
      N.carry.push({ id, q });
      N.squash = 1; sfx.pickup();
      burst(a.s.x, a.s.y - 10, ["#fff3e2", d.plate || "#ffc857"], 6, 1.2);
      float(`${d.emoji} ${"★".repeat(q)}`, a.s.x, a.s.y - 46, "#fff3e2", 14);
    } else if (a.kind === "cust") {
      const c = a.c;
      if (c.state !== "order") return;
      const want = c.courses[c.ci];
      const i = N.carry.findIndex(it => it.id === want);
      if (i >= 0) {
        const it = N.carry.splice(i, 1)[0];
        serve(c, it, "nimbus");
      } else if (N.carry.some(it => it.id)) {
        // wrong dish — guest is not amused
        c.patience = Math.max(.5, c.patience - c.patienceMax * .15);
        c.shakeT = .45;
        G.score.wrong++;
        breakStreak();
        sfx.reject(); shake(4);
        float(`Not mine! I want ${dishDef(want).emoji}`, c.x, c.y - 92, "#ff8a8a", 15);
      } else {
        float(`wants ${dishDef(want).emoji}`, c.x, c.y - 92, "#fff3e2", 14);
      }
    } else if (a.kind === "dirty") {
      if (!a.t.dirty || N.carry.length >= HAND_MAX) return;
      a.t.dirty = false; a.t.worm = 0;
      N.carry.push({ dirty: true });
      sfx.pickup(); N.squash = 1;
      float("🧺 bussed!", a.t.x, a.t.y - 40, "#cfc7f2", 14);
    } else if (a.kind === "bin") {
      const n = N.carry.filter(it => it.dirty).length;
      if (!n) return;
      N.carry = N.carry.filter(it => !it.dirty);
      G.score.washed += n;
      const bonus = 2 * n;
      G.score.likes += bonus;
      sfx.wash();
      burst(G.L.bin.x, G.L.bin.y - 20, ["#caf0f8", "#ffffff", "#6cb8ff"], 14, 2);
      float(`✨ Squeaky! +${bonus}❤️`, G.L.bin.x, G.L.bin.y - 50, "#caf0f8", 15);
    }
  }

  /* ---------- the money moment ---------- */
  function serve(c, item, who) {
    const d = dishDef(item.id);
    const frac = clamp(c.patience / c.patienceMax, 0, 1);
    const qm = qMult(item.q);
    const speedBonus = 1 + .3 * frac;
    const onTime = frac >= .4, perfect = frac >= .7;
    const sc = G.score;
    if (onTime) { sc.streak++; sc.bestStreak = Math.max(sc.bestStreak, sc.streak); G.streakPop = 1; }
    const streakMult = 1 + Math.min(10, sc.streak) * .1;
    const baseLikes = d.house || d.flambe ? Math.round(d.baseLikes * likesBonusMult()) : Cooking.recipeLikes(d);
    let likes = baseLikes * qm * speedBonus * streakMult * (c.P.vip ? 3 : 1) * (.85 + c.P.tip * .15);
    // the bill: cooked plates sell at ~80% of menu price (service still beats a Forklore post), house specials at cost
    let money = (d.price || 2) * (d.house ? 1 : .8) * qm * speedBonus * c.P.tip * (1 + Math.min(10, sc.streak) * .05);
    likes = Math.max(1, Math.round(likes)); money = Math.max(1, Math.round(money));
    const fol = Math.round(likes / 8 * c.P.fol);
    sc.likes += likes; sc.money += money; sc.fol += fol; sc.served++; sc.qualSum += item.q;
    if (perfect) sc.perfect++;
    sc.sats.push(clamp(.4 + .4 * frac + .2 * (item.q - 1) / 4, 0, 1));
    sc.lines.push({ who: c.P.name, emoji: d.emoji, name: d.name, q: item.q, frac, likes, money, by: who, vip: !!c.P.vip });
    c.ci++;
    c.served.push(item.id);
    c.state = "eat"; c.t = 0; c.eatFor = c.pk === "zippy" ? 1.8 : 2.8; c.mood = "happy";
    // juice
    const col = perfect ? ["#ffc857", "#fff3e2", "#ff6b9a"] : ["#95e06c", "#fff3e2"];
    burst(c.x, c.y - 40, col, perfect ? 26 : 12, perfect ? 3.2 : 2);
    float(`+${likes} ❤️`, c.x, c.y - 80, "#ff8ab8", perfect ? 24 : 19, 1.5);
    float(`+💰${money}`, c.x + 34, c.y - 58, "#ffd76b", 16, 1.3);
    if (c.P.vip) {
      sc.critic = perfect ? "rave" : "meh";
      sc.reviews.push({ mood: "critic", text: perfect ? pick(REVIEWS.critic) : pick(REVIEWS.criticMeh), who: c.P.name });
      banner(perfect ? "⭐ CRITIC'S PICK! ⭐" : "The critic nods… cautiously", "#ffc857", 2.2);
      shake(12); G.flash = .5;
    } else if (perfect && Math.random() < .35) sc.reviews.push({ mood: "happy", text: pick(REVIEWS.happy), who: c.P.name });
    if (perfect) { float("PERFECT!", c.x, c.y - 112, "#ffc857", 26, 1.1); shake(9); G.flash = Math.max(G.flash, .25); sfx.perfect(); }
    else if (onTime) sfx.serve(sc.streak);
    else { float("phew…", c.x, c.y - 112, "#cfc7f2", 16); sfx.serve(0); }
    sfx.coin();
    if (onTime && sc.streak > 0 && sc.streak % 5 === 0) { banner(`🔥 ${sc.streak} STREAK! x${(1 + Math.min(10, sc.streak) * .1).toFixed(1)}`, "#ff9f43", 1.6); G.N.boost = 3; }
    if (who === "nell") float("⚓", c.x - 26, c.y - 64, "#6cb8ff", 18);
  }

  /* =====================================================================
     Tally & payout
     ===================================================================== */
  function tally() {
    G.phase = "tally";
    const sc = G.score;
    // hands & Nell return unserved plates to stock
    for (const it of G.N.carry) if (it.id && G.stock[it.id]) G.stock[it.id].push(it.q);
    if (G.nell.dish && G.stock[G.nell.dish.id]) G.stock[G.nell.dish.id].push(G.nell.dish.q);
    G.N.carry = []; G.nell.dish = null;
    // write cooked plates back: State.dishes counts + State.pass qualities
    const leftover = {};
    for (const id of G.slotIds) if (G.stock[id] && !dishDef(id).house && id !== FLAMBE.id) leftover[id] = G.stock[id];
    const untouched = State.pass.filter(p => !(p.id in leftover));
    const newPass = untouched.slice();
    for (const [id, qs] of Object.entries(leftover)) qs.forEach(q => newPass.push({ id, q }));
    State.pass = newPass;
    const counts = {};
    newPass.forEach(p => counts[p.id] = (counts[p.id] || 0) + 1);
    for (const id of Object.keys(State.dishes)) if (DATA.recipes.find(r => r.id === id)) { if (counts[id]) State.dishes[id] = counts[id]; else delete State.dishes[id]; }
    for (const [id, n] of Object.entries(counts)) State.dishes[id] = n;

    const ordered = sc.sats.length;
    const mean = ordered ? sc.sats.reduce((a, b) => a + b, 0) / ordered : 0;
    let st = mean >= .8 ? 5 : mean >= .66 ? 4 : mean >= .5 ? 3 : mean >= .3 ? 2 : 1;
    if (!sc.served) st = 1;
    const tipJar = st * 2 + (st === 5 ? 5 : 0);
    const money = sc.money + tipJar;
    const fol = sc.fol + Math.round(sc.washed / 2) + (st === 5 ? 3 : 0);

    State.money += money;
    State.followers += fol;
    const S = State.service;
    S.shifts++; S.served += sc.served; S.lastDay = State.day;
    S.bestStars = Math.max(S.bestStars, st); S.bestStreak = Math.max(S.bestStreak, sc.bestStreak);
    const reviews = sc.reviews.slice(-4);
    if (!reviews.length) reviews.push({ mood: st >= 3 ? "happy" : "angry", text: st >= 3 ? pick(REVIEWS.happy) : pick(REVIEWS.angry), who: "A regular" });
    S.reviews = reviews.concat(S.reviews).slice(0, 10).map(r => ({ text: r.text, who: r.who, mood: r.mood, day: State.day }));
    let starChef = false;
    if (st >= 4) { State.flags.starChefStreak = true; starChef = true; }
    log(`🍽️ Service, day ${State.day}: ${sc.served} served, ${"⭐".repeat(st)} → +${money}💰, +${fol}📱`);
    reviews.forEach(r => log(`📱 Forklore review — <i>${r.text}</i>`));
    updateHUD();
    autoslot();
    G.payout = { money, fol, st };
    renderTally(st, tipJar, money, fol, reviews, starChef);
  }

  function renderTally(st, tipJar, money, fol, reviews, starChef) {
    const sc = G.score;
    const rows = sc.lines.slice(0, 14).map(l => `<div class="svc-line ${l.vip ? "vip" : ""}"><span>${l.emoji} ${l.name}<small>${l.who}${l.by === "nell" ? " · ⚓Nell" : ""}</small></span>
      <span class="svc-q">${"★".repeat(l.q)}</span><span class="svc-spd" style="--f:${Math.round(l.frac * 100)}%"></span><span>+${l.likes}❤️ +${l.money}💰</span></div>`).join("");
    const more = sc.lines.length > 14 ? `<div class="dim">…and ${sc.lines.length - 14} more happy plates</div>` : "";
    G.ui.innerHTML = `<div class="svc-card svc-tally">
      <h2>${G.early ? "🚪 Closed early" : "🌙 Shift complete!"}</h2>
      <div class="svc-stars-big">${[1, 2, 3, 4, 5].map(i => `<span class="${i <= st ? "on" : ""}" style="animation-delay:${.25 + i * .22}s">★</span>`).join("")}</div>
      <div class="svc-stats">
        <div><b>${sc.served}</b><small>served</small></div>
        <div><b>${sc.perfect}</b><small>perfect</small></div>
        <div><b>${sc.bestStreak}</b><small>best streak</small></div>
        <div><b>${sc.left}</b><small>walked out</small></div>
      </div>
      <div class="svc-lines">${rows || `<p class="svc-empty">No plates served — the doors were barely open.</p>`}${more}</div>
      <div class="svc-pay"><span>❤️ <b data-count="${sc.likes}">0</b> likes</span><span>💰 <b data-count="${money}">0</b> <small>(tip jar +${tipJar})</small></span><span>📱 +<b data-count="${fol}">0</b> followers</span></div>
      ${sc.critic ? `<p class="svc-critic">${sc.critic === "rave" ? "🎩 The critic RAVED." : sc.critic === "meh" ? "🎩 The critic was… intrigued." : "🎩 The critic left before being served."}</p>` : ""}
      ${starChef ? `<p class="svc-critic">🌟 Star Chef streak lit — Forklore posts get a bonus today!</p>` : ""}
      <div class="svc-reviews"><h4>📱 Forklore reviews</h4>${reviews.map(r => `<p class="${r.mood}">“${r.text}” <small>— ${r.who}</small></p>`).join("")}</div>
      <div class="svc-actions"><button class="btn btn-primary" id="svc-done">Back to the Shelter ▸</button></div>
    </div>`;
    G.ui.classList.remove("hidden");
    // count-up + star dings
    for (let i = 1; i <= st; i++) setTimeout(() => G.phase === "tally" && sfx.star(i), 250 + i * 220);
    if (st >= 4) setTimeout(() => G.phase === "tally" && typeof Chip !== "undefined" && !AudioMuted && Chip.victoryFanfare(), 1500);
    G.ui.querySelectorAll("[data-count]").forEach(el => {
      const to = +el.dataset.count, t0 = performance.now();
      const stepC = (now) => { const k = Math.min(1, (now - t0) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1 && G.phase === "tally") requestAnimationFrame(stepC); else el.textContent = to; };
      requestAnimationFrame(stepC);
    });
    $("svc-done").onclick = () => { AudioSys.click(); exit(); if (!offerSleep()) Hub.open(); };
  }

  /* =====================================================================
     FX helpers
     ===================================================================== */
  function float(txt, x, y, color, size, life) { G.floats.push({ txt, x, y, color, size: size || 16, life: life || 1.2, max: life || 1.2 }); }
  function burst(x, y, colors, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (40 + Math.random() * 90) * (sp || 1);
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: .5 + Math.random() * .5, max: 1,
        color: colors[i % colors.length], r: 1.5 + Math.random() * 2.8, star: Math.random() < .35 });
    }
    if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
  }
  function banner(txt, color, life) { G.banners = [{ txt, color, life, max: life }]; }
  function shake(px) { G.shake = Math.max(G.shake, px); }

  function fx(dt) {
    for (const f of G.floats) { f.life -= dt; f.y -= 38 * dt; }
    G.floats = G.floats.filter(f => f.life > 0);
    for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.vx *= .985; p.life -= dt; }
    G.parts = G.parts.filter(p => p.life > 0);
    for (const b of G.banners) b.life -= dt;
    G.banners = G.banners.filter(b => b.life > 0);
    G.shake = G.shake > .3 ? G.shake * Math.pow(.0009, dt) : 0;
    G.flash = Math.max(0, G.flash - dt * 1.6);
    G.streakPop = Math.max(0, G.streakPop - dt * 3);
    for (const c of G.customers) if (c.orderPop) c.orderPop = Math.max(0, c.orderPop - dt * 4);
    // rolling counters
    G.likesShown += (G.score.likes - G.likesShown) * Math.min(1, dt * 8);
    G.moneyShown += (G.score.money - G.moneyShown) * Math.min(1, dt * 8);
  }

  /* =====================================================================
     Input — keyboard + tap/click-to-move (auto-interacts on arrival)
     ===================================================================== */
  function bindInput() {
    G.kd = (e) => {
      if (activeScreen() !== "screen-service" || isPaused()) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (G.phase === "pre" && e.code === "Enter") { e.preventDefault(); startShift(); return; }
      if (G.phase !== "live") return;
      if (e.code === "Escape") { $("overlay-menu").classList.remove("hidden"); return; }
      if ((e.code === "KeyE" || e.code === "Space" || e.code === "Enter") && !e.repeat) { e.preventDefault(); interact(); return; }
      G.keys[e.code] = true;
    };
    G.ku = (e) => { G.keys[e.code] = false; };
    G.blur = () => { G.keys = {}; };
    G.pd = (e) => {
      if (G.phase !== "live" || isPaused()) return;
      e.preventDefault();
      const p = toLogical(e.clientX, e.clientY);
      tapAt(p.x, p.y);
    };
    G.rs = () => fit();
    document.addEventListener("keydown", G.kd);
    document.addEventListener("keyup", G.ku);
    window.addEventListener("blur", G.blur);
    window.addEventListener("resize", G.rs);
    G.canvas.addEventListener("pointerdown", G.pd);
  }
  function unbindInput() {
    document.removeEventListener("keydown", G.kd);
    document.removeEventListener("keyup", G.ku);
    window.removeEventListener("blur", G.blur);
    window.removeEventListener("resize", G.rs);
    if (G.canvas) G.canvas.removeEventListener("pointerdown", G.pd);
    G.keys = {};
  }
  function toLogical(cx, cy) {
    const r = G.canvas.getBoundingClientRect();
    return { x: (cx - r.left) / r.width * G.L.W, y: (cy - r.top) / r.height * G.L.H };
  }
  function tapAt(x, y) {
    const N = G.N, L = G.L, B = L.bounds;
    let act = null, tgt = null;
    // generous hit-tests: plates on the pass, guests, dirty tables, wash bin
    const slot = L.slots.find(s => Math.abs(x - s.x) < L.slotW / 2 && y > s.y - 70 && y < s.sy + 30);
    const cust = G.customers.filter(c => c.state === "order" || c.state === "think" || c.state === "eat")
      .find(c => Math.hypot(x - c.x, y - (c.y - 30)) < 48 || (c.state === "order" && Math.hypot(x - c.x, y - (c.y - 84)) < 36));
    const tbl = G.tables.find(t => Math.hypot(x - t.x, y - t.y) < 48);
    if (slot) { act = { kind: "slot", s: slot }; tgt = { x: slot.sx, y: slot.sy }; }
    else if (cust) {
      if (cust.state === "order") act = { kind: "cust", c: cust };
      tgt = { x: cust.x + 52, y: cust.y + 22 };
    } else if (tbl && tbl.dirty) { act = { kind: "dirty", t: tbl }; tgt = { x: tbl.x + 40, y: tbl.y + 30 }; }
    else if (tbl && tbl.cust && tbl.cust.state === "order") { act = { kind: "cust", c: tbl.cust }; tgt = { x: tbl.x + 40, y: tbl.y + 28 }; }
    else if (Math.hypot(x - L.bin.x, y - L.bin.y) < 56) { act = { kind: "bin" }; tgt = { x: L.bin.x - 44, y: L.bin.y }; }
    else tgt = { x, y };
    tgt.x = clamp(tgt.x, B.x0, B.x1); tgt.y = clamp(tgt.y, B.y0, B.y1);
    N.target = tgt; N.act = act;
    G.tapMark = { x: tgt.x, y: tgt.y, life: .5 };
    if (act && Math.hypot(N.x - tgt.x, N.y - tgt.y) < 6) { N.target = null; N.act = null; doAct(act); }
  }

  /* =====================================================================
     Rendering
     ===================================================================== */
  function fit() {
    if (!G.canvas || !G.L) return;
    const hud = $("hud");
    const top = (hud && !hud.classList.contains("hidden")) ? hud.getBoundingClientRect().bottom : 0;
    const availW = Math.min(innerWidth, 1100) - 8, availH = innerHeight - top - 10;
    const s = Math.min(availW / G.L.W, availH / G.L.H);
    const cssW = Math.floor(G.L.W * s), cssH = Math.floor(G.L.H * s);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    G.canvas.style.width = cssW + "px"; G.canvas.style.height = cssH + "px";
    G.canvas.style.marginTop = Math.max(0, top + 4) + "px";
    G.canvas.width = Math.round(cssW * dpr); G.canvas.height = Math.round(cssH * dpr);
    G.scale = G.canvas.width / G.L.W;
    G.bg = null;
  }

  function draw(paused) {
    const c = G.ctx, L = G.L;
    if (!c || !L) return;
    if (G.canvas.width === 0) fit();
    c.setTransform(G.scale, 0, 0, G.scale, 0, 0);
    c.save();
    if (G.shake) c.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
    if (!G.bg) G.bg = buildBG();
    c.drawImage(G.bg, 0, 0, L.W, L.H);
    drawWindowsLive(c);
    drawCounter(c);
    drawAlliesBack(c);
    G.tables.forEach(t => drawChair(c, t));
    // depth-sorted floor actors
    const actors = [];
    G.tables.forEach(t => actors.push({ y: t.y, fn: () => drawTable(c, t) }));
    G.customers.forEach(cu => actors.push({ y: cu.y, fn: () => drawCustomer(c, cu) }));
    actors.push({ y: G.N.y, fn: () => drawNimbus(c, G.N) });
    if (G.allies.nell) actors.push({ y: G.nell.y, fn: () => drawNell(c) });
    if (G.allies.vex) actors.push({ y: L.vex.y, fn: () => drawVex(c) });
    actors.push({ y: L.bin.y, fn: () => drawBin(c) });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.fn());
    // bubbles always above actors
    G.customers.forEach(cu => drawBubble(c, cu));
    drawFocus(c);
    drawGuide(c);
    drawParts(c);
    drawFloats(c);
    if (G.tapMark) { G.tapMark.life -= 1 / 60; const k = Math.max(0, G.tapMark.life / .5);
      c.strokeStyle = `rgba(255,200,87,${k})`; c.lineWidth = 3; c.beginPath(); c.ellipse(G.tapMark.x, G.tapMark.y, 20 * (1.6 - k), 8 * (1.6 - k), 0, 0, 7); c.stroke();
      if (G.tapMark.life <= 0) G.tapMark = null; }
    c.restore();
    // screen-space overlays
    if (G.rushOn) { const a = .12 + .06 * Math.sin(performance.now() / 160);
      const g = c.createRadialGradient(L.W / 2, L.H / 2, L.H * .35, L.W / 2, L.H / 2, L.H * .9);
      g.addColorStop(0, "rgba(255,80,60,0)"); g.addColorStop(1, `rgba(255,80,60,${a})`); c.fillStyle = g; c.fillRect(0, 0, L.W, L.H); }
    if (G.flash > 0) { c.fillStyle = `rgba(255,240,200,${G.flash * .45})`; c.fillRect(0, 0, L.W, L.H); }
    drawHud(c);
    drawBanners(c);
    if (paused && G.phase === "live") {
      c.fillStyle = "rgba(10,8,24,.55)"; c.fillRect(0, 0, L.W, L.H);
      text(c, "⏸ Paused", L.W / 2, L.H / 2, 34, "#fff3e2", "center");
    }
  }

  function text(c, s, x, y, size, color, align, stroke) {
    c.font = `bold ${size}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
    c.textAlign = align || "center"; c.textBaseline = "middle";
    if (stroke !== false) { c.lineJoin = "round"; c.lineWidth = Math.max(3, size / 5); c.strokeStyle = "rgba(20,16,42,.9)"; c.strokeText(s, x, y); }
    c.fillStyle = color; c.fillText(s, x, y);
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }

  /* ---------- static background (pre-rendered per layout) ---------- */
  function buildBG() {
    const L = G.L;
    const cv = document.createElement("canvas");
    cv.width = Math.round(L.W * G.scale); cv.height = Math.round(L.H * G.scale);
    const c = cv.getContext("2d"); c.scale(G.scale, G.scale);
    // back wall
    let g = c.createLinearGradient(0, 0, 0, L.wallH);
    g.addColorStop(0, "#2a1f5c"); g.addColorStop(1, "#3d2c78");
    c.fillStyle = g; c.fillRect(0, 0, L.W, L.wallH);
    c.fillStyle = "rgba(255,255,255,.04)";
    for (let x = 0; x < L.W; x += 36) c.fillRect(x, 0, 18, L.wallH);
    // wainscot
    c.fillStyle = "#24194d"; c.fillRect(0, L.wallH - 34, L.W, 34);
    c.fillStyle = "#ffc857"; c.fillRect(0, L.wallH - 36, L.W, 3);
    // portholes between door and kitchen
    const left = L.door.x + 70, right = L.counter.x0 - 20;
    const nWin = Math.max(1, Math.floor((right - left) / 130));
    G.portholes = [];
    for (let i = 0; i < nWin; i++) {
      const x = left + (right - left) * (i + .5) / nWin, y = 92;
      G.portholes.push({ x, y, r: 34 });
      c.fillStyle = "#6c5aa8"; c.beginPath(); c.arc(x, y, 40, 0, 7); c.fill();
      c.fillStyle = "#c9b8ff"; c.beginPath(); c.arc(x, y, 37, 0, 7); c.fill();
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(k => { const a = k * Math.PI / 4; c.fillStyle = "#8d7bd0"; c.beginPath(); c.arc(x + Math.cos(a) * 38.5, y + Math.sin(a) * 38.5, 2.4, 0, 7); c.fill(); });
    }
    // door
    const D = L.door;
    c.fillStyle = "#1a1238"; rr(c, D.x - D.w / 2 - 6, D.y - D.h - 6, D.w + 12, D.h + 6, [40, 40, 0, 0]); c.fill();
    g = c.createLinearGradient(0, D.y - D.h, 0, D.y);
    g.addColorStop(0, "#ffcf7a"); g.addColorStop(1, "#ff9f43");
    c.fillStyle = g; rr(c, D.x - D.w / 2, D.y - D.h, D.w, D.h, [36, 36, 0, 0]); c.fill();
    c.fillStyle = "rgba(20,16,42,.25)"; for (let i = 0; i < 4; i++) c.fillRect(D.x - D.w / 2 + 8, D.y - D.h + 40 + i * 18, D.w - 16, 2);
    c.fillStyle = "#95e06c"; rr(c, D.x - 22, D.y - D.h + 14, 44, 16, 6); c.fill();
    text(c, "OPEN", D.x, D.y - D.h + 22, 10, "#14102a", "center", false);
    // kitchen window above the pass
    const Wd = L.window;
    c.fillStyle = "#1a1238"; rr(c, Wd.x0 - 6, Wd.y0 - 6, Wd.x1 - Wd.x0 + 12, Wd.y1 - Wd.y0 + 12, 12); c.fill();
    g = c.createLinearGradient(0, Wd.y0, 0, Wd.y1);
    g.addColorStop(0, "#5a3a2a"); g.addColorStop(1, "#8a5a32");
    c.fillStyle = g; rr(c, Wd.x0, Wd.y0, Wd.x1 - Wd.x0, Wd.y1 - Wd.y0, 8); c.fill();
    // pots & hanging pans
    for (let x = Wd.x0 + 30; x < Wd.x1 - 20; x += 64) {
      c.strokeStyle = "#c9a37a"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, Wd.y0); c.lineTo(x, Wd.y0 + 14); c.stroke();
      c.fillStyle = "#b0b6c8"; c.beginPath(); c.arc(x, Wd.y0 + 24, 10, 0, 7); c.fill();
    }
    c.fillStyle = "#3a2a20"; c.fillRect(Wd.x0, Wd.y1 - 14, Wd.x1 - Wd.x0, 14);
    if (!L.portrait) text(c, "THE PASS ▾", Wd.x1 - 44, Wd.y1 - 7, 9, "#ffc857", "center", false);
    // floor: warm checker
    const fy = L.wallH;
    g = c.createLinearGradient(0, fy, 0, L.H);
    g.addColorStop(0, "#5b3f86"); g.addColorStop(1, "#3a2766");
    c.fillStyle = g; c.fillRect(0, fy, L.W, L.H - fy);
    const ts = 48;
    for (let y = fy, r = 0; y < L.H; y += ts, r++) for (let x = (r % 2) * ts; x < L.W; x += ts * 2) {
      c.fillStyle = "rgba(255,255,255,.045)"; c.fillRect(x, y, ts, ts);
    }
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(0, fy, L.W, 8);
    // rug under the dining area (hugs the tables)
    const xs = L.tables.map(t => t.x), ys = L.tables.map(t => t.y);
    const rx0 = Math.max(20, Math.min(...xs) - 110), rx1 = Math.min(L.W - 20, Math.max(...xs) + 80);
    const ry0 = Math.min(...ys) - 80, ry1 = Math.min(L.H - 16, Math.max(...ys) + 60);
    c.fillStyle = "rgba(255,107,107,.13)";
    rr(c, rx0, ry0, rx1 - rx0, ry1 - ry0, 30); c.fill();
    c.strokeStyle = "rgba(255,200,87,.18)"; c.lineWidth = 3; c.stroke();
    // floor lamps glow
    return cv;
  }

  function drawWindowsLive(c) {
    const now = performance.now() / 1000;
    const dusk = clamp((G.t - (SHIFT - 30)) / 30, 0, 1);
    for (const p of (G.portholes || [])) {
      c.save(); c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.clip();
      const g = c.createLinearGradient(0, p.y - p.r, 0, p.y + p.r);
      g.addColorStop(0, G.rushOn ? "#3a1240" : dusk > 0 ? `rgb(${20 + 40 * dusk},${12},${50 + 10 * dusk})` : "#0c0a2a");
      g.addColorStop(1, G.rushOn ? "#7a2a4a" : "#2a1f5c");
      c.fillStyle = g; c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      for (let i = 0; i < 7; i++) {
        const sx = p.x - p.r + ((i * 37 + now * 8 + p.x) % (p.r * 2)), sy = p.y - p.r + (i * 23 % (p.r * 2));
        c.fillStyle = `rgba(255,255,255,${.4 + .5 * Math.sin(now * 3 + i)})`; c.fillRect(sx, sy, 2, 2);
      }
      c.fillStyle = ["#ff9f43", "#4ecdc4", "#b39ddb"][Math.floor(p.x) % 3];
      c.beginPath(); c.arc(p.x + 14, p.y + 12, 11, 0, 7); c.fill();
      c.restore();
    }
    // steam over the kitchen
    const Wd = G.L.window;
    for (let i = 0; i < 3; i++) {
      const x = Wd.x0 + (Wd.x1 - Wd.x0) * (.25 + i * .25), y = Wd.y1 - 20 - ((now * 22 + i * 13) % 30);
      c.fillStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.arc(x + Math.sin(now * 2 + i) * 4, y, 7, 0, 7); c.fill();
    }
  }

  /* ---------- pass counter & plates ---------- */
  function drawCounter(c) {
    const L = G.L, C = L.counter;
    // counter body
    c.fillStyle = "#6b3f2a"; rr(c, C.x0, C.y, C.x1 - C.x0, C.h + 10, 10); c.fill();
    c.fillStyle = "#c98b56"; rr(c, C.x0 - 6, C.y - 6, C.x1 - C.x0 + 12, 16, 8); c.fill();
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(C.x0, C.y + C.h + 4, C.x1 - C.x0, 6);
    const now = performance.now() / 1000;
    for (const s of L.slots) {
      const d = dishDef(s.id), st = G.stock[s.id];
      const n = st === null || st === undefined ? Infinity : st.length;
      const empty = n === 0;
      // plate
      c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(s.x, s.y + 4, 30, 10, 0, 0, 7); c.fill();
      c.fillStyle = empty ? "#8d84a8" : "#fff8ee"; c.beginPath(); c.ellipse(s.x, s.y, 30, 11, 0, 0, 7); c.fill();
      c.fillStyle = empty ? "#7a7294" : (d.plate || "#ffe3c2"); c.beginPath(); c.ellipse(s.x, s.y - 1, 20, 7, 0, 0, 7); c.fill();
      if (!empty) {
        const bob = Math.sin(now * 3 + s.x) * 1.5;
        const th = thumb(d);
        if (th) { c.drawImage(th, s.x - 22, s.y - 38 + bob, 44, 44); }
        else text(c, d.emoji, s.x, s.y - 16 + bob, 28, "#fff", "center", false);
        // steam
        c.fillStyle = "rgba(255,255,255,.18)";
        c.beginPath(); c.arc(s.x - 8 + Math.sin(now * 2 + s.x) * 3, s.y - 46 - (now * 18 + s.x) % 14, 4, 0, 7); c.fill();
      } else {
        text(c, s.id === FLAMBE.id ? "🔥…" : "sold out", s.x, s.y - 16, 11, "#cfc7f2", "center");
      }
      // counter-front label: emoji + count (matches the guest's bubble), best plate's stars
      const label = n === Infinity ? "∞" : "×" + n;
      c.fillStyle = "rgba(20,16,42,.55)"; rr(c, s.x - 28, C.y + 14, 56, 20, 10); c.fill();
      text(c, d.emoji, s.x - 13, C.y + 24, 14, "#fff", "center", false);
      text(c, label, s.x + 13, C.y + 24, 12, n === Infinity ? "#7fe8df" : empty ? "#8d84a8" : "#ffc857", "center", false);
      if (!empty && n !== Infinity) text(c, "★".repeat(st[0]), s.x, C.y + 43, 9, "#ffc857", "center", false);
      else if (d.house) text(c, "house", s.x, C.y + 43, 9, "#b5efea", "center", false);
    }
  }

  // round dish photo thumbnails (cooked recipes have painted art)
  const thumbs = {};
  function thumb(d) {
    if (!d.art) return null;
    const t = thumbs[d.id];
    if (t && t.ready) return t.cv;
    if (t) return null;
    const rec = thumbs[d.id] = { ready: false };
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 96;
      const x = cv.getContext("2d");
      x.save(); x.beginPath(); x.arc(48, 48, 44, 0, 7); x.clip();
      x.drawImage(im, 0, 0, 96, 96);
      x.restore();
      x.strokeStyle = "#fff8ee"; x.lineWidth = 6; x.beginPath(); x.arc(48, 48, 44, 0, 7); x.stroke();
      rec.cv = cv; rec.ready = true;
    };
    im.src = "assets/" + d.art;
    return null;
  }

  /* ---------- tables ---------- */
  function drawChair(c, t) {
    c.fillStyle = "#4a2f7a"; rr(c, t.x - 64, t.y - 52, 36, 50, 10); c.fill();
    c.fillStyle = "#5e3d96"; rr(c, t.x - 60, t.y - 48, 28, 12, 6); c.fill();
  }
  function drawTable(c, t) {
    // shadow
    c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(t.x, t.y + 22, 44, 12, 0, 0, 7); c.fill();
    // leg
    c.fillStyle = "#2a1f5c"; c.fillRect(t.x - 5, t.y, 10, 22);
    // top + cloth
    c.fillStyle = "#fff3e2"; c.beginPath(); c.ellipse(t.x, t.y - 2, 42, 15, 0, 0, 7); c.fill();
    c.fillStyle = "#ff6b6b"; c.beginPath(); c.ellipse(t.x, t.y + 4, 42, 10, 0, 0, Math.PI); c.fill();
    // candle
    const fl = Math.sin(performance.now() / 90 + t.x) * 1.5;
    c.fillStyle = "#ffe7a8"; c.fillRect(t.x + 18, t.y - 18, 5, 12);
    c.fillStyle = "#ffb347"; c.beginPath(); c.ellipse(t.x + 20.5, t.y - 22 + fl * .3, 3, 5 + fl * .4, 0, 0, 7); c.fill();
    if (t.cust && t.cust.state === "eat") {
      const d = dishDef(t.cust.served[t.cust.served.length - 1]);
      c.fillStyle = "#fff"; c.beginPath(); c.ellipse(t.x - 8, t.y - 6, 16, 6, 0, 0, 7); c.fill();
      text(c, d.emoji, t.x - 8, t.y - 14, 18, "#fff", "center", false);
    }
    if (t.dirty) {
      c.fillStyle = "#ddd6ea"; c.beginPath(); c.ellipse(t.x - 6, t.y - 6, 15, 5, 0, 0, 7); c.fill();
      c.fillStyle = "#c9b8a0"; c.beginPath(); c.ellipse(t.x - 2, t.y - 9, 13, 4.5, 0, 0, 7); c.fill();
      c.fillStyle = "#a08a6a"; c.beginPath(); c.arc(t.x - 4, t.y - 10, 3, 0, 7); c.fill();
      if (!t.worm && Math.sin(performance.now() / 300 + t.x) > .2) text(c, "🧺", t.x + 30, t.y - 36, 16, "#fff", "center", false);
      if (t.worm) { // wormery cleanup crew
        const wx = t.x - 40 + t.worm * 34;
        c.fillStyle = "#95e06c";
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(wx - i * 6, t.y - 12 + Math.sin(performance.now() / 120 + i) * 2, 4, 0, 7); c.fill(); }
        c.fillStyle = "#14102a"; c.beginPath(); c.arc(wx + 1.5, t.y - 13, 1.2, 0, 7); c.fill();
      }
    }
  }

  /* ---------- customers: palette-swapped blob-folk ---------- */
  function drawCustomer(c, cu) {
    const P = cu.P;
    const seated = cu.state === "think" || cu.state === "order" || cu.state === "eat";
    const hop = (cu.state === "walk" || cu.state === "leave") ? Math.abs(Math.sin(cu.bob)) * 6 : Math.sin(cu.bob) * 1.2;
    const sx = cu.shakeT ? Math.sin(cu.shakeT * 60) * 3 : 0;
    const lowP = cu.state === "order" && cu.patience / cu.patienceMax < .3;
    c.save();
    c.globalAlpha = cu.alpha;
    c.translate(cu.x + sx + (lowP ? Math.sin(performance.now() / 40) * 1.2 : 0), cu.y - hop);
    // shadow
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(0, hop + 4, 20, 6, 0, 0, 7); c.fill();
    if (P.vip) { // golden aura
      const a = .25 + .15 * Math.sin(performance.now() / 200);
      c.fillStyle = `rgba(255,200,87,${a})`; c.beginPath(); c.ellipse(0, -24, 34, 38, 0, 0, 7); c.fill();
    }
    const angry = cu.mood === "angry";
    const body = angry ? "#d96a7a" : P.body;
    const sq = seated ? 1 : 1 + Math.sin(cu.bob * 2) * .04;
    // feet
    if (!seated) { c.fillStyle = body; c.beginPath(); c.ellipse(-8, 0, 6, 4, 0, 0, 7); c.ellipse(8, 0, 6, 4, 0, 0, 7); c.fill(); }
    // body blob
    c.fillStyle = body; c.beginPath(); c.ellipse(0, -24, 21 / sq, 26 * sq, 0, 0, 7); c.fill();
    c.fillStyle = P.belly; c.beginPath(); c.ellipse(0, -16, 13, 14, 0, 0, 7); c.fill();
    // face
    const f = cu.face || 1;
    const blink = cu.blink < 0;
    const ey = -32;
    [-7, 7].forEach(ex => {
      if (blink || (cu.pk === "dreamy" && cu.state !== "eat")) {
        c.strokeStyle = "#14102a"; c.lineWidth = 2; c.beginPath(); c.arc(ex + f * 2, ey, 3.5, 0, Math.PI); c.stroke();
      } else {
        c.fillStyle = "#fff"; c.beginPath(); c.arc(ex + f * 2, ey, 5, 0, 7); c.fill();
        c.fillStyle = "#14102a"; c.beginPath(); c.arc(ex + f * 3.4, ey + .5, 2.4, 0, 7); c.fill();
      }
    });
    c.strokeStyle = "#14102a"; c.lineWidth = 2;
    c.beginPath();
    if (angry || lowP) { c.arc(f * 2, -16, 5, Math.PI + .3, -.3); }
    else if (cu.state === "eat") { c.ellipse(f * 2, -19, 4, 3 + Math.abs(Math.sin(cu.t * 12)) * 2, 0, 0, 7); }
    else c.arc(f * 2, -21, 5, .2, Math.PI - .2);
    c.stroke();
    if (angry || lowP) { c.beginPath(); c.moveTo(-11 + f * 2, -40); c.lineTo(-3 + f * 2, -37); c.moveTo(11 + f * 2, -40); c.lineTo(3 + f * 2, -37); c.stroke(); }
    if (cu.mood === "happy" || cu.state === "eat") { c.fillStyle = "rgba(255,107,154,.5)"; c.beginPath(); c.arc(-12, -24, 3.5, 0, 7); c.arc(12, -24, 3.5, 0, 7); c.fill(); }
    // personality accessories
    if (cu.pk === "zippy") { c.fillStyle = "#ff3d3d"; c.fillRect(-20, -46, 40, 6);
      if (!seated) { c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-f * 26, -30 + i * 8); c.lineTo(-f * 40, -30 + i * 8); c.stroke(); } } }
    if (cu.pk === "dreamy") { const t = performance.now() / 500; text(c, "z", 18 + Math.sin(t) * 3, -54 - (t * 8 % 10), 11, "#ddd0f5", "center", false); }
    if (cu.pk === "tipper") { c.fillStyle = "#2d2150"; c.fillRect(-11, -66, 22, 16); c.fillRect(-16, -51, 32, 4); c.fillStyle = "#ffc857"; c.fillRect(-11, -55, 22, 3); }
    if (cu.pk === "influ") { c.fillStyle = "#14102a"; rr(c, f * 18, -34, 8, 13, 2); c.fill(); c.fillStyle = "#6cf"; c.fillRect(f * 18 + 1.5, -32, 5, 8);
      if (cu.state === "eat" && Math.sin(cu.t * 6) > .9) { c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); c.arc(f * 22, -28, 9, 0, 7); c.fill(); } }
    if (cu.pk === "critic") { c.fillStyle = "#5f27cd"; c.beginPath(); c.ellipse(0, -50, 18, 6, -.15, 0, 7); c.fill(); c.beginPath(); c.arc(2, -53, 4, 0, 7); c.fill();
      c.strokeStyle = "#ffc857"; c.lineWidth = 1.6; c.beginPath(); c.arc(7 + f * 2, ey, 6, 0, 7); c.stroke(); c.beginPath(); c.moveTo(13 + f * 2, ey); c.lineTo(15, -14); c.stroke(); }
    c.restore();
  }

  function drawBubble(c, cu) {
    if (cu.alpha < .5) return;
    const x = cu.x, y = cu.y - 86;
    if (cu.state === "think") {
      c.fillStyle = "rgba(255,248,238,.92)";
      rr(c, x - 22, y - 2, 44, 24, 12); c.fill();
      for (let i = 0; i < 3; i++) { const a = Math.sin(performance.now() / 160 - i) > 0 ? 1 : .35;
        c.fillStyle = `rgba(20,16,42,${a})`; c.beginPath(); c.arc(x - 10 + i * 10, y + 10, 3, 0, 7); c.fill(); }
      return;
    }
    if (cu.state === "leave" && cu.mood === "angry" && cu.t < 1.4) { text(c, "💢", x, y + 10, 24, "#fff", "center", false); return; }
    if (cu.state === "eat" && cu.ci >= cu.courses.length) { if (Math.sin(cu.t * 5) > 0) text(c, "♥", x + 16, y + 16 - cu.t * 6, 16, "#ff6b9a", "center", false); return; }
    if (cu.state !== "order") return;
    const frac = cu.patience / cu.patienceMax;
    const pop = 1 + (cu.orderPop || 0) * .35;
    c.save(); c.translate(x, y); c.scale(pop, pop);
    // bubble
    c.fillStyle = cu.P.vip ? "#fff3c4" : "#fff8ee";
    c.beginPath(); c.arc(0, 0, 25, 0, 7); c.fill();
    c.beginPath(); c.moveTo(-6, 22); c.lineTo(0, 34); c.lineTo(6, 22); c.fill();
    // patience ring
    c.lineWidth = 6; c.strokeStyle = "rgba(20,16,42,.25)"; c.beginPath(); c.arc(0, 0, 29, 0, 7); c.stroke();
    const hue = Math.round(120 * frac);
    c.strokeStyle = `hsl(${hue},85%,55%)`; c.lineCap = "round";
    c.beginPath(); c.arc(0, 0, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke(); c.lineCap = "butt";
    const d = dishDef(cu.courses[cu.ci]);
    const th = thumb(d);
    if (th) c.drawImage(th, -19, -19, 38, 38);
    else text(c, d.emoji, 0, 1, 26, "#fff", "center", false);
    if (th) text(c, d.emoji, 17, 17, 14, "#fff", "center", false);
    if (cu.courses.length > 1) { c.fillStyle = "#b39ddb"; rr(c, -36, -32, 26, 15, 7); c.fill(); text(c, `${cu.ci + 1}/${cu.courses.length}`, -23, -24.5, 10, "#14102a", "center", false); }
    if (cu.P.vip) text(c, "🎩", 22, -24, 16, "#fff", "center", false);
    c.restore();
  }

  /* ---------- Nimbus (vector chef, carries plates on a tray) ---------- */
  function drawNimbus(c, N) {
    const walk = N.moving ? Math.sin(N.walkT) : 0;
    const hop = N.moving ? Math.abs(walk) * 5 : Math.sin(performance.now() / 400) * 1.2;
    const sq = 1 + N.squash * .14;
    c.save();
    c.translate(N.x, N.y);
    c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(0, 3, 24, 7, 0, 0, 7); c.fill();
    if (N.boost > 0) { c.fillStyle = `rgba(255,159,67,${.25 + .15 * Math.sin(performance.now() / 60)})`; c.beginPath(); c.ellipse(0, -30, 30, 40, 0, 0, 7); c.fill(); }
    c.translate(0, -hop);
    c.scale(N.face * (1 / sq), sq);
    // legs
    c.fillStyle = "#2f9e96";
    c.beginPath(); c.ellipse(-9 + walk * 5, -4, 7, 5, 0, 0, 7); c.ellipse(9 - walk * 5, -4, 7, 5, 0, 0, 7); c.fill();
    // body + apron
    c.fillStyle = "#4ecdc4"; rr(c, -19, -40, 38, 38, 15); c.fill();
    c.fillStyle = "#fff3e2"; rr(c, -12, -32, 24, 28, 6); c.fill();
    c.strokeStyle = "#ff6b6b"; c.lineWidth = 1.6; c.strokeRect(-6, -24, 12, 8);
    // head
    c.fillStyle = "#4ecdc4"; c.beginPath(); c.ellipse(0, -56, 22, 19, 0, 0, 7); c.fill();
    [[-8, -59], [8, -59], [0, -49]].forEach(([x, y], i) => {
      c.fillStyle = "#fff"; c.beginPath(); c.arc(x + 3, y, i === 2 ? 4 : 5, 0, 7); c.fill();
      c.fillStyle = "#14102a"; c.beginPath(); c.arc(x + 4.5, y + .5, 2.2, 0, 7); c.fill();
    });
    c.strokeStyle = "#14102a"; c.lineWidth = 1.8; c.beginPath(); c.arc(4, -45, 4, .2, Math.PI - .2); c.stroke();
    // antennae
    c.strokeStyle = "#4ecdc4"; c.lineWidth = 2.4;
    [-9, 9].forEach(x => { c.beginPath(); c.moveTo(x, -72); c.quadraticCurveTo(x * 1.5, -84, x * 1.3 + 3, -88 + walk * 2); c.stroke();
      c.fillStyle = "#ffc857"; c.beginPath(); c.arc(x * 1.3 + 3, -89 + walk * 2, 3.2, 0, 7); c.fill(); });
    // chef hat
    c.fillStyle = "#fff"; rr(c, -14, -84, 28, 12, 5); c.fill();
    c.beginPath(); c.arc(-8, -86, 8, 0, 7); c.arc(2, -91, 10, 0, 7); c.arc(10, -85, 7, 0, 7); c.fill();
    // arms up holding tray if carrying
    if (N.carry.length) {
      c.strokeStyle = "#4ecdc4"; c.lineWidth = 5; c.lineCap = "round";
      c.beginPath(); c.moveTo(-16, -34); c.lineTo(-20, -100); c.moveTo(16, -34); c.lineTo(20, -100); c.stroke(); c.lineCap = "butt";
    } else {
      c.fillStyle = "#4ecdc4"; c.beginPath(); c.ellipse(-20, -24 - walk * 3, 5, 9, .3, 0, 7); c.ellipse(20, -24 + walk * 3, 5, 9, -.3, 0, 7); c.fill();
    }
    c.restore();
    // tray + plates drawn un-mirrored above the head
    if (N.carry.length) {
      const ty = N.y - hop - 104;
      c.fillStyle = "#c9b8ff"; rr(c, N.x - 34, ty, 68, 7, 3); c.fill();
      N.carry.forEach((it, i) => {
        const px = N.x + (N.carry.length === 1 ? 0 : (i ? 16 : -16));
        if (it.dirty) {
          c.fillStyle = "#ddd6ea"; c.beginPath(); c.ellipse(px, ty - 4, 15, 5, 0, 0, 7); c.fill();
          c.fillStyle = "#a08a6a"; c.beginPath(); c.arc(px, ty - 7, 3, 0, 7); c.fill();
          text(c, "🫧", px, ty - 16, 12, "#fff", "center", false);
        } else {
          const d = dishDef(it.id);
          c.fillStyle = "#fff8ee"; c.beginPath(); c.ellipse(px, ty - 2, 16, 5, 0, 0, 7); c.fill();
          text(c, d.emoji, px, ty - 13, 22, "#fff", "center", false);
        }
      });
    }
  }

  /* ---------- allies ---------- */
  const allySprites = {};
  function allySprite(key) {
    if (allySprites[key]) return allySprites[key];
    const cv = document.createElement("canvas"); cv.width = cv.height = 180;
    try { Art.drawCharacter(cv, key); } catch (e) { /* art missing: blank */ }
    return (allySprites[key] = cv);
  }
  function drawAlliesBack(c) {
    if (!G.allies.bramble) return;
    const Wd = G.L.window, b = G.bramble;
    const x = Wd.x0 + 46, rise = 18 + b.pop * 10 + Math.sin(performance.now() / 300) * 2;
    c.save();
    c.beginPath(); c.rect(Wd.x0, Wd.y0, Wd.x1 - Wd.x0, Wd.y1 - Wd.y0 - 12); c.clip();
    c.drawImage(allySprite("bramble"), x - 50, Wd.y1 - 12 - 50 - rise, 100, 100);
    if (b.pop > 0) { c.fillStyle = `rgba(255,120,40,${b.pop * .5})`; c.beginPath(); c.arc(x + 46, Wd.y1 - 22, 18 + b.pop * 6, 0, 7); c.fill(); }
    c.restore();
    // countdown pip
    const k = 1 - b.t / 15;
    c.strokeStyle = "#ff9f43"; c.lineWidth = 3; c.beginPath(); c.arc(x + 32, Wd.y0 + 14, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
    text(c, "🔥", x + 32, Wd.y0 + 14, 9, "#fff", "center", false);
  }
  function drawVex(c) {
    const v = G.L.vex, bow = G.vex.bow;
    c.save(); c.translate(v.x, v.y);
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(0, 2, 18, 5, 0, 0, 7); c.fill();
    c.rotate(-bow * .25);
    c.drawImage(allySprite("vex"), -52, -100, 104, 104);
    c.restore();
    if (G.vex.line > 0) {
      c.fillStyle = "rgba(255,248,238,.95)"; rr(c, v.x + 14, v.y - 104, 110, 22, 10); c.fill();
      text(c, "This way, darling!", v.x + 69, v.y - 93, 10, "#e84393", "center", false);
    }
  }
  function drawNell(c) {
    const n = G.nell;
    const run = n.state !== "idle";
    const hop = run ? Math.abs(Math.sin(performance.now() / 60)) * 6 : 0;
    c.save(); c.translate(n.x, n.y - hop);
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(0, 2 + hop, 18, 5, 0, 0, 7); c.fill();
    c.drawImage(allySprite("nell"), -50, -96, 100, 100);
    if (n.dish) text(c, dishDef(n.dish.id).emoji, 0, -92, 22, "#fff", "center", false);
    c.restore();
    if (n.state === "idle") {
      const k = 1 - n.t / 12;
      c.strokeStyle = "#6cb8ff"; c.lineWidth = 3; c.beginPath(); c.arc(n.x + 26, n.y - 82, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(k, 0, 1)); c.stroke();
    }
  }
  function drawBin(c) {
    const b = G.L.bin;
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(b.x, b.y + 4, 28, 8, 0, 0, 7); c.fill();
    c.fillStyle = "#4a6fa5"; rr(c, b.x - 26, b.y - 34, 52, 38, 8); c.fill();
    c.fillStyle = "#9fd3ff"; c.beginPath(); c.ellipse(b.x, b.y - 34, 24, 7, 0, 0, 7); c.fill();
    const now = performance.now() / 400;
    c.fillStyle = "rgba(255,255,255,.7)";
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(b.x - 10 + i * 10, b.y - 38 - ((now * 10 + i * 7) % 12), 2.5, 0, 7); c.fill(); }
    text(c, "WASH", b.x, b.y - 14, 10, "#fff3e2", "center", false);
  }

  /* ---------- focus ring + newbie guidance ---------- */
  function drawFocus(c) {
    if (G.phase !== "live" || !G.focus) return;
    const f = G.focus, pulse = 1 + .08 * Math.sin(performance.now() / 120);
    let x, y, label;
    if (f.kind === "slot") { x = f.s.x; y = f.s.y - 14; label = G.N.carry.length >= HAND_MAX ? "put back" : "grab"; }
    else if (f.kind === "cust") { x = f.c.x; y = f.c.y - 30; label = G.N.carry.some(it => it.id === f.c.courses[f.c.ci]) ? "serve!" : "serve?"; }
    else if (f.kind === "dirty") { x = f.t.x; y = f.t.y - 8; label = "bus"; }
    else { x = G.L.bin.x; y = G.L.bin.y - 18; label = "wash"; }
    c.strokeStyle = "#ffc857"; c.lineWidth = 3; c.setLineDash([6, 5]);
    c.beginPath(); c.ellipse(x, y, 36 * pulse, 22 * pulse, 0, 0, 7); c.stroke(); c.setLineDash([]);
    const touch = "ontouchstart" in window;
    text(c, (touch ? "" : "E · ") + label, x, y + 36, 12, "#ffc857", "center");
  }
  function drawGuide(c) {
    if (!G.tutorial || G.phase !== "live") return;
    const N = G.N;
    const waiting = G.customers.filter(cu => cu.state === "order").sort((a, b) => a.patience - b.patience);
    if (!waiting.length) return;
    let tx, ty;
    const holdFor = waiting.find(cu => N.carry.some(it => it.id === cu.courses[cu.ci]));
    if (holdFor) { tx = holdFor.x; ty = holdFor.y - 128; }
    else {
      const want = waiting[0].courses[waiting[0].ci];
      const s = G.L.slots.find(sl => sl.id === want);
      if (!s) return;
      tx = s.x; ty = s.y - 64;
    }
    const b = Math.sin(performance.now() / 150) * 6;
    c.fillStyle = "#ffc857";
    c.beginPath(); c.moveTo(tx, ty + 12 + b); c.lineTo(tx - 11, ty - 4 + b); c.lineTo(tx + 11, ty - 4 + b); c.fill();
  }

  function drawParts(c) {
    for (const p of G.parts) {
      c.globalAlpha = clamp(p.life / .6, 0, 1);
      c.fillStyle = p.color;
      if (p.star) { const r = p.r * 1.6; c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr2 = i % 2 ? r * .4 : r; c.lineTo(p.x + Math.cos(a) * rr2, p.y + Math.sin(a) * rr2); }
        c.fill(); }
      else { c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }
    }
    c.globalAlpha = 1;
  }
  function drawFloats(c) {
    for (const f of G.floats) {
      const k = f.life / f.max;
      const pop = k > .85 ? 1 + (k - .85) * 3 : 1;
      c.globalAlpha = clamp(k * 2, 0, 1);
      text(c, f.txt, f.x, f.y, f.size * pop, f.color, "center");
    }
    c.globalAlpha = 1;
  }

  /* ---------- HUD ---------- */
  function drawHud(c) {
    const L = G.L, sc = G.score;
    // top strip
    c.fillStyle = "rgba(20,16,42,.72)"; rr(c, 8, 6, L.W - 16, 40, 14); c.fill();
    text(c, `❤️ ${Math.round(G.likesShown)}`, 22, 26, 18, "#ff8ab8", "left");
    text(c, `💰 ${Math.round(G.moneyShown)}`, L.portrait ? 120 : 130, 26, 18, "#ffd76b", "left");
    text(c, `🍽️ ${sc.served}`, L.portrait ? 214 : 236, 26, 16, "#b5efea", "left");
    // streak meter
    const sx = L.portrait ? 300 : L.W / 2 + 40;
    const mult = 1 + Math.min(10, sc.streak) * .1;
    const pop = 1 + G.streakPop * .4;
    c.save(); c.translate(sx, 26); c.scale(pop, pop);
    text(c, sc.streak ? `🔥 x${mult.toFixed(1)}` : "🔥 x1.0", 0, 0, 16, sc.streak >= 5 ? "#ff9f43" : sc.streak ? "#ffc857" : "#8d84c0", "center");
    c.restore();
    c.fillStyle = "rgba(255,255,255,.12)"; rr(c, sx - 40, 38, 80, 4, 2); c.fill();
    c.fillStyle = "#ff9f43"; rr(c, sx - 40, 38, 80 * Math.min(10, sc.streak) / 10, 4, 2); c.fill();
    if (sc.streak >= 3 && G.phase === "live" && Math.random() < .3) burst(sx + (Math.random() - .5) * 60, 30, ["#ff9f43", "#ffc857"], 1, .3);
    // shift clock ring (top-right)
    const rx = L.W - (L.portrait ? 32 : 40), ry = 26;
    const left = clamp(SHIFT - G.t, 0, SHIFT);
    const k = left / SHIFT;
    c.fillStyle = "rgba(20,16,42,.85)"; c.beginPath(); c.arc(rx, ry, 22, 0, 7); c.fill();
    c.lineWidth = 5; c.strokeStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.arc(rx, ry, 18, 0, 7); c.stroke();
    c.strokeStyle = G.rushOn ? "#ff6b6b" : left < 15 ? "#b39ddb" : "#4ecdc4";
    c.beginPath(); c.arc(rx, ry, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
    text(c, String(Math.ceil(left)), rx, ry + 1, left <= 5 && G.phase === "live" ? 17 + Math.sin(performance.now() / 80) * 2 : 15, left <= 10 ? "#ff8a8a" : "#fff3e2", "center", false);
    if (G.rushOn) text(c, "RUSH", rx - 44, ry, 12, "#ff6b6b", "center");
    // carry slots hint
    const hx = L.W - (L.portrait ? 90 : 110);
    for (let i = 0; i < HAND_MAX; i++) {
      const it = G.N.carry[i];
      c.fillStyle = it ? "rgba(255,200,87,.9)" : "rgba(255,255,255,.12)";
      c.beginPath(); c.arc(hx - 40 + i * 26, ry, 11, 0, 7); c.fill();
      if (it) text(c, it.dirty ? "🫧" : dishDef(it.id).emoji, hx - 40 + i * 26, ry + 1, 13, "#fff", "center", false);
    }
  }
  function drawBanners(c) {
    const L = G.L;
    for (const b of G.banners) {
      const k = b.life / b.max, inT = clamp((1 - k) * 6, 0, 1), out = clamp(k * 5, 0, 1);
      const y = (L.portrait ? 210 : 150) - (1 - inT) * 30;
      c.globalAlpha = Math.min(inT, out);
      const size = L.portrait ? 22 : 28;
      c.font = `bold ${size}px 'Trebuchet MS', sans-serif`;
      const w = Math.min(L.W - 20, c.measureText(b.txt).width + 40);
      c.fillStyle = "rgba(20,16,42,.85)"; rr(c, L.W / 2 - w / 2, y - size * .9, w, size * 1.8, 16); c.fill();
      c.strokeStyle = b.color; c.lineWidth = 3; c.stroke();
      text(c, b.txt, L.W / 2, y, size, b.color, "center");
      c.globalAlpha = 1;
    }
  }

  /* =====================================================================
     Forklore hook: reviews digest + an "open for service" nudge
     ===================================================================== */
  function forkloreCard() {
    ensureState();
    const S = State.service;
    const rv = S.reviews.slice(0, 3).map(r => `<br>“${r.text}” <small>— ${r.who}, day ${r.day}</small>`).join("");
    const can = !State.planet && State.energy > 0;
    return `<div class="card row spread"><div><h4>🍽️ Live service reviews</h4><p>${S.shifts ? `${S.shifts} shift${S.shifts > 1 ? "s" : ""} · best ${"⭐".repeat(S.bestStars)} · best streak ${S.bestStreak}${rv}` :
      "Serve your plates to real guests for bigger tips than a post — and reviews that travel."}</p></div>
      ${can ? `<button class="btn btn-primary" data-open-service="1">Open for Service ⚡1</button>` : ""}</div>`;
  }
  document.addEventListener("click", e => {
    const b = e.target && e.target.closest && e.target.closest("[data-open-service]");
    if (b) { AudioSys.click(); open(); }
  });

  // QA/debug handle (harmless): lets automated tests inspect a shift
  const api = { open, deposit, syncPass, forkloreCard, ensureState, __debug: () => G, __SHIFT: SHIFT };
  return api;
})();
