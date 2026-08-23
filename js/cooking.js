/* ============ Cooking, Forklore, wormery, shelter, market (v2 energy) ============ */
"use strict";

const Cooking = (() => {
  let session = null;

  function recipeLikes(r) { return Math.round(r.baseLikes * likesBonusMult()); }

  function open() { render(); showScreen("screen-panel"); }

  function render() {
    const body = $("panel-body"); $("panel-title").textContent = "🍳 Kitchen (Lv " + upgradeLv("kitchen") + ")";
    if (session) { renderMinigame(); return; }
    body.innerHTML = `<p class="map-desc">Hit the green zone for each ingredient. Perfect timing → gourmet quality → more likes & stronger battle dishes.</p>` +
      DATA.recipes.map(r => {
        const can = Object.entries(r.req).every(([ing, n]) => invCount(ing) >= n);
        const reqTxt = Object.entries(r.req).map(([ing, n]) => {
          return `${DATA.ingredients[ing].emoji}${DATA.ingredients[ing].name} ${invCount(ing)}/${n}`;
        }).join(" · ");
        const q = State.flags["q_" + r.id];
        return `<div class="card asset-card"><img class="dish-art" src="assets/${r.art}" alt="" onerror="this.style.display='none'">
          <div class="asset-body"><div class="row spread">
          <div><h4>${r.emoji} ${r.name} ${q ? `<span class="tag">best ⭐${q}</span>` : ""}</h4><p>${r.lore}<br><small>${reqTxt}</small></p></div>
          <button class="btn ${can ? "btn-primary" : ""}" data-cook="${r.id}" ${can && State.energy > 0 ? "" : "disabled"}>Cook ⚡1</button>
        </div></div></div>`;
      }).join("");
    body.querySelectorAll("[data-cook]").forEach(b => b.onclick = () => start(b.dataset.cook));
  }

  function start(recipeId) {
    if (!spendEnergy(1)) return;
    const r = DATA.recipes.find(x => x.id === recipeId);
    Object.entries(r.req).forEach(([ing, n]) => useInv(ing, n));
    const steps = [];
    Object.entries(r.req).forEach(([ing, n]) => { for (let i = 0; i < n; i++) steps.push(ing); });
    session = { recipe: r, steps, stepIdx: 0, perfects: 0, goods: 0 };
    AudioSys.click();
    renderMinigame();
  }

  function renderMinigame() {
    const s = session; if (!s) return;
    const ing = DATA.ingredients[s.steps[s.stepIdx]];
    const widthPct = 26 - s.recipe.difficulty * 2.5;
    $("panel-title").textContent = `🍳 ${s.recipe.name} (${s.stepIdx + 1}/${s.steps.length})`;
    $("panel-body").innerHTML = `
      <div class="card cook-card">
        <h4 style="font-size:20px">${ing.emoji} Adding ${ing.name}</h4>
        <div class="cook-ticks">${"★".repeat(s.recipe.difficulty)}</div>
        <div class="cook-zone"><div class="cook-target"></div><div class="cook-marker" id="marker"></div></div>
        <button id="btn-strike" class="btn btn-primary big-strike">⬇ ADD IT! (space)</button>
        <img class="cook-scene" src="assets/cooking.png" alt="" onerror="this.remove()">
      </div>`;
    const target = document.querySelector(".cook-target");
    target.style.left = `calc(${50 - widthPct / 2}%)`; target.style.width = widthPct + "%";
    const markerEl = $("marker");
    let pos = 0, dir = 1;
    const speed = 1.1 + s.recipe.difficulty * .45 + upgradeLv("kitchen") * .12;
    let raf, running = true;
    function tick() {
      pos += dir * speed; if (pos > 100) { pos = 100; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
      markerEl.style.left = "calc(" + pos + "% - 3px)";
      raf = requestAnimationFrame(tick);
    }
    tick();
    function strike() {
      if (!running || !session) return;
      running = false; cancelAnimationFrame(raf);
      const dist = Math.abs(pos - 50);
      if (dist < widthPct / 4) { s.perfects++; toast("✨ PERFECT!"); AudioSys.good(); }
      else if (dist < widthPct / 2 + 3) { s.goods++; AudioSys.click(); }
      else { toast("💥 Fumbled!"); AudioSys.bad(); }
      s.stepIdx++;
      document.onkeydown = null;
      if (s.stepIdx >= s.steps.length) setTimeout(finish, 500);
      else setTimeout(renderMinigame, 450);
    }
    $("btn-strike").onclick = strike;
    document.onkeydown = e => { if (e.code === "Space") { e.preventDefault(); strike(); } };
  }

  function finish() {
    const s = session; session = null;
    const quality = clamp(Math.round((s.perfects * 2 + s.goods) * 10 / (s.steps.length * 2)), 1, 5);
    State.dishes[s.recipe.id] = (State.dishes[s.recipe.id] || 0) + 1;
    State.flags["q_" + s.recipe.id] = Math.max(State.flags["q_" + s.recipe.id] || 0, quality);
    log(`🍳 Cooked <b>${s.recipe.emoji} ${s.recipe.name}</b> — ${"⭐".repeat(quality)}`);
    toast(`${s.recipe.emoji} ${s.recipe.name}: ${"⭐".repeat(quality)}`, "gold");
    updateHUD();
    if (!offerSleep()) Hub.open();
  }

  return { open, recipeLikes };
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
    const art = PANEL_ART[t[0]];
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
    const likes = Math.round(Cooking.recipeLikes(r) * (0.6 + q * 0.15));
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
