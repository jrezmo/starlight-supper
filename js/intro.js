/* ============ Intro Cinematic v2 — scored, art-backed opener ============ */
"use strict";
const Intro = (() => {
  const BEATS = [
    { label: "", cue: "title", art: "title", tint: "#ffd76b",
      text: "Three hundred years ago, the Great Kettle — the cosmic hearth that simmered the First Broth — went cold." },
    { label: "THE SUNDERING", cue: null, sting: "defeatSting",
      text: "They call it the Sundering. The stars went quiet. The broth went bland." },
    { label: "GRANDMOTHER'S MAP", cue: null,
      text: "Grandmother said the Kettle burned on three jewels — one on each of three worlds. She drew them on a napkin. We still have the napkin." },
    { label: "VERDANTH · Moss Cathedral", cue: "verdanth", art: "verdanth", tint: "#7de08a",
      text: "Verdanth, where forests hum in major keys and Madame Vex judges your table manners before your courage." },
    { label: "CINDER-9 · Ember Storm", cue: "cinder", art: "cinder", tint: "#ff8a5c",
      text: "Cinder-9, where it is always too hot for soup, and Chef Braxo solves disagreements with spatulas." },
    { label: "PELAGIA · The Trench", cue: "pelagia", art: "pelagia", tint: "#6cb8ff",
      text: "Pelagia, where Admiral Mor pressure-cooks everything beautifully and speaks only in whale song and sighs." },
    { label: "NIMBUS QUILL", cue: "home", art: "nimbus", tint: "#c9b8ff",
      text: "You are Nimbus Quill — last of the Vessari Gourmand Nomads. You inherit her recipes, one rustbucket ship, and a family of worms with strong opinions." },
    { label: "BY DAY", cue: null, sting: "delightBurst",
      text: "BY DAY: cook gourmet dishes, post them on Forklore, raise the galaxy's smartest worms. Fame is fuel. Likes are money." },
    { label: "BY EXPEDITION", cue: "battle", sting: "hitStinger",
      text: "BY ⚡ENERGY: explore the worlds. Fight what fights you. Befriend who bakes." },
    { label: "TEA, NOT WAR", cue: "tea", sting: "victoryFanfare", art: "madame_vex", tint: "#ffb3d9",
      text: "Every rival can be beaten at a TEA PARTY. Win the duel of etiquette and they fight beside you." },
    { label: "AND THEN…", cue: "thor", sting: "thunder", art: "volt", tint: "#ffd76b",
      text: "Take all three jewels, rekindle the Kettle — and BARON VOLT will come down to take them back personally. The galaxy's grumpiest storm-food critic wears the Emerald as a belt buckle. It 'matched nothing.'" },
    { label: "", cue: null, final: true,
      title: "STARLIGHT SUPPER",
      text: "Cook. Duel. Brew. Rekindle the Kettle." },
  ];

  const ART_V = "20260822t";
  let idx = 0, typeTimer = null;

  // gentle crossfaded theme switching
  let fadeTimer = null;
  function cueTheme(name) {
    if (typeof Chip === "undefined" || AudioMuted) return;
    clearInterval(fadeTimer);
    // fade out current music over ~1s, then start next theme (Chip handles its own gain)
    Chip.duckMusic(0.0, .9); // ramp down
    fadeTimer = setTimeout(() => { Chip.play(name); Chip.duckMusic(.5, .8); }, 950);
  }

  function preloadArt() {
    BEATS.forEach(b => { if (b.art) { const i = new Image(); i.src = "assets/" + b.art + ".png?v=" + ART_V; } });
  }

  function start() {
    idx = 0;
    showScreen("screen-intro");
    $("intro-dots").innerHTML = BEATS.map((_, i) => `<span data-i="${i}"></span>`).join("");
    const stage = document.getElementById("screen-intro");
    stage.onclick = () => advance();
    introKeyHandler = e => {
      if ($("screen-intro").classList.contains("active") && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault(); advance();
      }
    };
    document.addEventListener("keydown", introKeyHandler);
    preloadArt();
    playBeat();
  }
  let introKeyHandler = null;

  function stop() {
    if (typeTimer) clearInterval(typeTimer);
    clearTimeout(fadeTimer);
    if (introKeyHandler) document.removeEventListener("keydown", introKeyHandler);
    document.getElementById("screen-intro").onclick = null;
  }

  function playBeat() {
    const b = BEATS[idx];
    if (b.cue) cueTheme(b.cue);
    else if (!b.final && b.sting && typeof Chip !== "undefined" && !AudioMuted) {
      if (b.sting === "delightBurst") Chip.delightBurst(1); else setTimeout(() => Chip[b.sting](), 250);
    }
    if (b.final && typeof Chip !== "undefined" && !AudioMuted) Chip.victoryFanfare();

    document.querySelectorAll("#intro-dots span").forEach((s, i) => s.classList.toggle("on", i <= idx));

    const lb = $("intro-label");
    lb.textContent = b.label || "";
    lb.style.color = b.tint || "var(--accent)";

    // watermark art backdrop with soft ken-burns drift
    const stage = document.querySelector("#screen-intro .intro-stage");
    if (b.art) {
      stage.style.setProperty("--intro-art", `url(assets/${b.art}.png?v=${ART_V})`);
      stage.classList.add("has-art");
      stage.classList.remove("art-swap"); void stage.offsetWidth; stage.classList.add("art-swap");
    } else {
      stage.style.setProperty("--intro-art", "none");
      stage.classList.remove("has-art");
    }

    // big title on finale
    const tt = $("intro-title");
    tt.textContent = b.title || "";
    tt.style.display = b.title ? "" : "none";

    // typewriter
    const tx = $("intro-text");
    tx.textContent = "";
    let pos = 0; const full = b.text;
    clearInterval(typeTimer);
    typeTimer = setInterval(() => {
      pos += 2;
      tx.textContent = full.slice(0, pos);
      if (pos % 12 === 0 && typeof AudioSys !== "undefined" && !AudioMuted) AudioSys.tick();
      if (pos >= full.length) { clearInterval(typeTimer); typeTimer = null; }
    }, 18);

    $("intro-btn").textContent = b.final ? "☕ Light the Stove" : "▸";
  }

  function skipTypewriter() {
    if (!typeTimer) return false;
    clearInterval(typeTimer); typeTimer = null;
    $("intro-text").textContent = BEATS[idx].text;
    return true;
  }

  function advance() {
    if (skipTypewriter()) return;
    if (idx < BEATS.length - 1) { idx++; AudioSys.click(); playBeat(); return; }
    stop();
    State.introDone = true;
    updateHUD(); Hub.open();
    toast("☀️ Day 1 — ⚡3 energy. Spend it well.", "gold");
  }

  return { start, advance };
})();
