/* ============ Hub v2: energy-aware home base & travel ============ */
"use strict";
const Hub = (() => {

  function open() {
    updateHUD();
    const atHome = !State.planet;
    const p = State.planet ? DATA.planets.find(x => x.id === State.planet) : null;
    setPlanetBG(atHome ? null : p.id);
    $("hub-title").textContent = atHome
      ? `🏠 Home Shelter — Day ${State.day}`
      : `${p.icon} ${p.name} — Expedition`;
    // objective line so players always know the next step
    let goal;
    if (State.jewels.length >= 3) goal = "⚡ All jewels found! Face BARON VOLT and end this!";
    else {
      const next = DATA.planets.filter(pl => !State.jewels.includes(pl.jewel));
      const np = State.planet ? p : null;
      if (np && !State.jewels.includes(np.jewel)) {
        const allyIn = State.allies.includes(np.rival);
        goal = allyIn
          ? `${DATA.rivals.find(r => r.id === np.rival).name} is your ally — explore to find the vault ⛩️`
          : `Goal: on ${np.name}, befriend ${DATA.rivals.find(r => r.id === np.rival).name} (🍵) → then open the vault`;
      } else if (State.money < 30 && atHome) goal = "Tip: cook a dish, post it on Forklore 📱 for cash";
      else goal = `Jewels: ${State.jewels.length}/3 · launch an expedition to ${next[0] ? next[0].name : "..."}`;
    }
    $("hub-goal") && ($("hub-goal").textContent = "🎯 " + goal);
    const grid = $("hub-buttons"); grid.innerHTML = "";

    if (State.energy > 0) {
      if (atHome) {
        mkBtn("🍳 Cook Gourmet", () => Cooking.open(), true);
        mkBtn("📱 Forklore", () => forkloreOpen());
        mkBtn("🪱 Wormery", () => wormeryOpen());
        mkBtn("🏠 Upgrades", () => shelterOpen());
        mkBtn("🛒 Market", () => marketOpen());
        mkBtn("🛸 Launch Expedition", travelOpen, true);
      } else {
        mkBtn("🗺️ Explore " + p.name, () => World.open(), true);
        mkBtn("🍳 Field Kitchen", () => Cooking.open());
        mkBtn("📱 Forklore", () => forkloreOpen());
        mkBtn("🛸 Return Home", () => { State.planet = null; Hub.open(); });
      }
      if (State.jewels.length >= 3)
        mkBtn("⚡ FACE BARON VOLT", () => Story.show("⚡", [
          { speaker: "", text: "You set the three jewels on the table. They hum a chord. Outside, thunder applauds." },
          { speaker: "Nimbus Quill", text: "No more waiting. Baron Volt — dinner is SERVED." },
        ], () => Battle.start("volt", null)), true);
    } else {
      grid.innerHTML = `<p class="map-desc">The day is spent. ${atHome ? "Your bedroll (and the worms) await." : "You could push on in the dark — riskier, richer — or rest."}</p>`;
      if (!atHome) mkBtn("🌙 Push On (night expedition)", () => World.open(), true);
      mkBtn("🌅 Sleep until Dawn", () => sleepToDawn(), true);
    }
    showScreen("screen-hub");
  }

  function setPlanetBG(id) {
    const el = $("planet-bg");
    if (!id) { el.style.backgroundImage = "url(assets/hub.png)"; el.classList.add("visible"); return; }
    el.style.backgroundImage = `url(assets/${id}.png)`;
    el.classList.add("visible");
  }

  function travelOpen() {
    WorldMap.open();
    return;
    // (old flat list retired — classic world chart above)
    const obsClue = upgradeLv("observatory") >= 1;
    $("panel-body").innerHTML = DATA.planets.map(p => {
      const done = State.jewels.includes(p.jewel);
      const rivalDone = State.allies.includes(p.rival);
      const rival = DATA.rivals.find(r => r.id === p.rival);
      return `<div class="card asset-card"><img class="dish-art wide" src="assets/${p.id}.png" alt="" onerror="this.style.display='none'">
        <div class="asset-body"><div class="row spread">
        <div><h4>${p.icon} ${p.name} ${done ? "✅" : ""}</h4><p>${p.blurb}<br>
          Jewel: ${done ? "<b>recovered</b>" : DATA.jewels[p.jewel]}
          ${obsClue && !done ? `<br>🔭 ${rivalDone ? "your ally here knows the way to the vault." : "seek " + rival.name + " — keeper of this world's vault secret."}` : ""}
          ${rivalDone ? "<br>🤝 Ally: " + rival.name : ""}</p></div>
        ${done && State.jewels.length < 3 ? '<span class="tag">cleared</span>' : `<button class="btn btn-primary" data-go="${p.id}">Launch ⚡1</button>`}
      </div></div></div>`;
    }).join("");
    showScreen("screen-panel");
    document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
      if (!spendEnergy(1)) return;
      State.planet = b.dataset.go;
      AudioSys.good();
      toast(`🚀 Touchdown: ${DATA.planets.find(x => x.id === State.planet).name}!`, "gold");
      log(`🚀 Landed on <b>${DATA.planets.find(x => x.id === State.planet).name}</b>.`);
      open();
    });
  }

  function mkBtn(label, fn, primary) {
    const b = document.createElement("button");
    b.className = "btn" + (primary ? " btn-primary" : "");
    b.textContent = label; b.onclick = () => { AudioSys.click(); fn(); };
    $("hub-buttons").appendChild(b);
  }

  return { open };
})();
