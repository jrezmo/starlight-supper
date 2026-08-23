/* ============ Main bootstrap v2 ============ */
"use strict";
(function () {
  Art.initBG($("bg-canvas"));
  // title theme — deferred by Chip's gesture unlock if audio is still suspended
  if (typeof Chip !== "undefined" && !AudioMuted) Chip.play("title");

  $("btn-new-game").onclick = () => {
    // peek BEFORE wiping saves — cineSeen must survive a new-game reset
    resetState();
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem("starlight-supper-autosave");
    // first-time players get the cinematic; returning players (cineSeen or
    // introDone) skip it entirely and land on the hub
    if (!State.flags.cineSeen && typeof Cinematic !== "undefined") {
      Cinematic.play(() => {
        State.flags.cineSeen = true;
        State.introDone = true;
        autoslot();
        updateHUD();
        Hub.open();
        toast("☀️ Day 1 — ⚡3 energy. Spend it well.", "gold");
      });
    } else {
      State.introDone = true;
      updateHUD();
      Hub.open();
      toast("☀️ Day 1 — ⚡3 energy. Spend it well.", "gold");
    }
  };
  $("btn-continue").style.display = hasSave() ? "" : "none";
  $("btn-continue").onclick = () => { loadGame(); updateHUD(); Hub.open(); };

  $("world-leave").onclick = () => World.leave();
  $("panel-back").onclick = () => { document.onkeydown = null; Hub.open(); };
  $("btn-menu").onclick = () => $("overlay-menu").classList.remove("hidden");
  $("btn-resume").onclick = () => $("overlay-menu").classList.add("hidden");
  $("btn-save").onclick = () => saveGame();
  $("btn-saves").onclick = () => { $("overlay-menu").classList.add("hidden"); openSaveManager(); };
  $("btn-saves-close").onclick = () => closeSaveManager();
  $("btn-mute").onclick = () => {
    const m = AudioSys.toggleMute();
    AudioMuted = m;
    if (typeof Chip !== "undefined") Chip.setMuted(m);
    $("btn-mute").textContent = m ? "🔇 Sound: Off" : "🔊 Sound: On";
  };
  $("btn-howto").onclick = () => $("howto").classList.toggle("hidden");
  $("btn-wipe").onclick = () => {
    if (confirm("Erase your save and return to title?")) { localStorage.removeItem(SAVE_KEY); location.reload(); }
  };
  $("story-next").onclick = () => Story.next();

  function resetState() {
    let hadCineSeen = !!(State.flags && State.flags.cineSeen);
    try { // State isn't hydrated from autosave until Continue, so peek there too
      const auto = JSON.parse(localStorage.getItem("starlight-supper-autosave") || "null");
      if (auto && auto.flags && auto.flags.cineSeen) hadCineSeen = true;
    } catch (_) {}
    Object.assign(State, {
      day: 1, energy: 3, maxEnergy: 3, hp: 30, maxHp: 30, money: 50, followers: 12,
      planet: null, inventory: {}, dishes: {}, upgrades: {},
      worms: [{ trait: "oracle", rarity: "rare" }], allies: [], jewels: [],
      flags: { rations: 1, wormBlessing: 0 }, introDone: false, wormBuys: 0,
    });
    addInv("starbloom", 2); addInv("glowsroom", 2);
    State.flags.cineSeen = hadCineSeen; // one-time cinematic flag survives a new-game reset
  }

  function startIntro() {
    if (typeof Intro !== "undefined") {
      Intro.start(() => {
        State.introDone = true;
        updateHUD(); Hub.open();
        toast("☀️ Day 1 — ⚡3 energy. Spend it well.", "gold");
      });
    } else {
      Story.show("🛸", DATA.introStory, () => {
        State.introDone = true;
        updateHUD(); Hub.open();
        toast("☀️ Day 1 — ⚡3 energy. Spend it well.", "gold");
      });
    }
  }

  // space/enter advances story when it's up (cooking binds its own handler during minigame)
  document.addEventListener("keydown", e => {
    const ov = $("overlay-story");
    if (!ov.classList.contains("hidden") && (e.code === "Space" || e.code === "Enter")) {
      if ($("story-next").style.display !== "none") { e.preventDefault(); Story.next(); }
    }
  });

  updateHUD();
})();
