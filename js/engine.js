/* ============ Engine v2: energy-based loop, save/load, UI helpers ============ */
"use strict";
const SAVE_KEY = "starlight-supper-save-v2";

const State = {
  day: 1, energy: 3, maxEnergy: 3, hp: 30, maxHp: 30, money: 50, followers: 12,
  planet: null,
  inventory: {}, dishes: {},
  upgrades: {}, worms: [], allies: [], jewels: [],
  flags: {}, introDone: false, previousFollowers: 12,
};

function saveGame() { localStorage.setItem(AUTOS_KEY, JSON.stringify(State)); toast("💾 Saved", "gold"); }
/* ---- multi-slot save manager ---- */
const SLOTS_KEY = "starlight-supper-slots-v1";
const AUTOS_KEY = "starlight-supper-autosave";
function slotList() { try { return JSON.parse(localStorage.getItem(SLOTS_KEY)) || []; } catch (e) { return []; } }
function saveSlotMeta(list) { localStorage.setItem(SLOTS_KEY, JSON.stringify(list)); }
function slotDataKey(i) { return "starlight-supper-slot-" + i; }
function autoslot() { localStorage.setItem(AUTOS_KEY, JSON.stringify(State)); }
function loadAutos() {
  const raw = localStorage.getItem(AUTOS_KEY); if (!raw) return false;
  try { Object.assign(State, JSON.parse(raw)); return true; } catch (e) { return false; }
}
function slotSnapshot() {
  return {
    day: State.day, money: State.money, followers: State.followers,
    planet: State.planet, allies: State.allies.slice(), jewels: State.jewels.slice(),
    energy: State.energy, hp: State.hp,
    ts: Date.now(),
  };
}
function saveToSlot(i) {
  localStorage.setItem(slotDataKey(i), JSON.stringify(State));
  const list = slotList().filter(s => s.i !== i);
  list.push(Object.assign({ i }, slotSnapshot()));
  list.sort((a, b) => a.i - b.i);
  saveSlotMeta(list);
}
function loadFromSlot(i) {
  const raw = localStorage.getItem(slotDataKey(i)); if (!raw) return false;
  try { resetState(); Object.keys(State).forEach(k => delete State[k]); Object.assign(State, JSON.parse(raw)); return true; } catch (e) { return false; }
}
function deleteSlot(i) {
  localStorage.removeItem(slotDataKey(i));
  saveSlotMeta(slotList().filter(s => s.i !== i));
}
function mostRecentSlot() {
  const list = slotList(); if (!list.length) return -1;
  return list.reduce((a, b) => (b.ts > a.ts ? b : a)).i;
}
function loadGame() { if (loadAutos()) return true; return false; }
function hasSave() { return !!localStorage.getItem(AUTOS_KEY) || slotList().length > 0; }

/* ---- save manager UI (pause menu) ---- */
function openSaveManager() {
  const ov = $("save-manager");
  const listEl = $("save-slots");
  const render = () => {
    const list = slotList();
    listEl.innerHTML = "";
    // autosave row
    const autoRaw = localStorage.getItem(AUTOS_KEY);
    if (autoRaw) {
      try {
        const a = JSON.parse(autoRaw);
        const row = document.createElement("div"); row.className = "save-row";
        row.innerHTML = `<span>⚡ Autosave — Day ${a.day} · 💰${a.money} · 👥${a.followers}${a.planet ? " · 🪐" : " · 🏠"}</span>`;
        const bLoad = document.createElement("button"); bLoad.className = "btn btn-small"; bLoad.textContent = "Load";
        bLoad.onclick = () => { loadGame(); closeSaveManager(); updateHUD(); Hub.open(); toast("📂 Autosave loaded", "gold"); };
        const bSaveAs = document.createElement("button"); bSaveAs.className = "btn btn-small"; bSaveAs.textContent = "Save As…";
        bSaveAs.onclick = () => { const i = nextFreeSlot(); if (i < 0) { toast("All 6 slots full"); return; } saveToSlot(i); render(); toast("💾 Saved to slot " + (i + 1)); };
        row.appendChild(bLoad); row.appendChild(bSaveAs);
        listEl.appendChild(row);
      } catch (e) {}
    }
    for (let i = 0; i < 6; i++) {
      const meta = list.find(s => s.i === i);
      const row = document.createElement("div"); row.className = "save-row";
      if (meta) {
        const d = new Date(meta.ts);
        row.innerHTML = `<span>💾 Slot ${i + 1} — Day ${meta.day} · 💰${meta.money} · 👥${meta.followers} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>`;
        const bLoad = document.createElement("button"); bLoad.className = "btn btn-small"; bLoad.textContent = "Load";
        bLoad.onclick = () => {
          if (loadFromSlot(i)) { closeSaveManager(); updateHUD(); Hub.open(); toast("📂 Slot " + (i + 1) + " loaded", "gold"); }
          else toast("⚠️ Could not load slot " + (i + 1));
        };
        const bOver = document.createElement("button"); bOver.className = "btn btn-small"; bOver.textContent = "Re-save";
        bOver.onclick = () => { saveToSlot(i); render(); toast("💾 Slot " + (i + 1) + " updated"); };
        const bDel = document.createElement("button"); bDel.className = "btn btn-small btn-danger"; bDel.textContent = "✕";
        bDel.onclick = () => { if (confirm("Delete slot " + (i + 1) + "?")) { deleteSlot(i); render(); } };
        row.appendChild(bLoad); row.appendChild(bOver); row.appendChild(bDel);
      } else {
        row.innerHTML = `<span class="dim">Slot ${i + 1} — empty</span>`;
        const bNew = document.createElement("button"); bNew.className = "btn btn-small"; bNew.textContent = "Save here";
        bNew.onclick = () => { saveToSlot(i); render(); toast("💾 Saved to slot " + (i + 1)); };
        row.appendChild(bNew);
      }
      listEl.appendChild(row);
    }
  };
  render();
  ov.classList.remove("hidden");
}
function nextFreeSlot() {
  const list = slotList();
  for (let i = 0; i < 6; i++) if (!list.find(s => s.i === i)) return i;
  return -1;
}
function closeSaveManager() { $("save-manager").classList.add("hidden"); }

/* ---- helpers ---- */
function $(id) { return document.getElementById(id); }
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function chance(p) { return Math.random() < p; }

let AudioMuted = false;
function toast(msg, cls = "") {
  const t = document.createElement("div"); t.className = "toast " + cls; t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; setTimeout(() => t.remove(), 400); }, 2400);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  window.__activeScreen = id;
  // HUD (day/energy/☰ menu) shows for every in-game screen, hidden on title
  $("hud").classList.toggle("hidden", id === "screen-title");
  // adaptive soundtrack per area
  const music = {
    "screen-title": "title",
    "screen-hub": State.planet || "home",
    "screen-world": State.planet,
    "screen-panel": State.planet || "home",
    "screen-map": State.planet || "home",
    "screen-battle": window.__battleKind === "tea" ? "tea" : (window.__battleThor ? "thor" : "battle"),
  }[id];
  if (music && typeof Chip !== "undefined" && !AudioMuted) Chip.play(music);
}
function activeScreen() { return window.__activeScreen; }

function updateHUD() {
  $("hud-day").textContent = "Day " + State.day;
  $("hud-energy").textContent = "⚡ " + State.energy + "/" + State.maxEnergy;
  const pc = $("hud-phase");
  const night = isNight();
  pc.textContent = night ? "🌙 NIGHT" : "☀️ DAY";
  pc.classList.toggle("night", night);
  $("hud-location").textContent = State.planet
    ? (DATA.planets.find(p => p.id === State.planet).icon + " " + DATA.planets.find(p => p.id === State.planet).name)
    : "🏠 Home Shelter";
  $("hud-hp").textContent = `❤️ ${State.hp}/${State.maxHp}`;
  $("hud-money").textContent = "💰 " + State.money;

  // WS-1: Rolling Likes Odometer
  const hudFollowersEl = $("hud-followers");
  const oldFollowers = State.previousFollowers || 0;
  const newFollowers = State.followers;

  if (newFollowers !== oldFollowers) {
    let current = oldFollowers;
    const increment = Math.ceil((newFollowers - oldFollowers) / 20); // Animate in 20 steps
    const duration = 500; // ms
    const stepTime = duration / Math.abs(newFollowers - oldFollowers || 1);

    const animate = () => {
      current += increment;
      if ((increment > 0 && current < newFollowers) || (increment < 0 && current > newFollowers)) {
        hudFollowersEl.textContent = "📱 " + Math.round(current);
        requestAnimationFrame(animate);
      } else {
        hudFollowersEl.textContent = "📱 " + newFollowers;
        State.previousFollowers = newFollowers; // Update previous after animation
        // Check for milestones to play chiptune
        if (newFollowers > oldFollowers && newFollowers >= 100 && oldFollowers < 100) {
          if (typeof Chip !== "undefined" && !AudioMuted) Chip.delightBurst(1); // Small burst for 100 followers
          toast("🎉 Viral! 100+ Followers!");
        } else if (newFollowers > oldFollowers && newFollowers >= 500 && oldFollowers < 500) {
          if (typeof Chip !== "undefined" && !AudioMuted) Chip.delightBurst(2); // Medium burst for 500 followers
          toast("🚀 Mega Viral! 500+ Followers!");
        } else if (newFollowers > oldFollowers && newFollowers >= 1000 && oldFollowers < 1000) {
          if (typeof Chip !== "undefined" && !AudioMuted) Chip.delightBurst(3); // Large burst for 1000 followers
          toast("🌠 Galaxy Famous! 1000+ Followers!");
        }
      }
    };
    requestAnimationFrame(animate);
  } else {
    hudFollowersEl.textContent = "📱 " + State.followers;
    State.previousFollowers = State.followers;
  }
}

/* Energy: day runs 06:00–20:00; each energy spent advances the clock 4.5h */
const DAY_HOURS = 6, NIGHT_HOURS = 20;
function clockHour() { return (DAY_HOURS + (State.maxEnergy - State.energy) * (NIGHT_HOURS - DAY_HOURS) / State.maxEnergy); }
function isNight() { return clockHour() >= NIGHT_HOURS - .1 || State.energy <= 0; }

function spendEnergy(n = 1) {
  if (State.energy < n) { toast("Too late in the day for that — sleep and start fresh."); return false; }
  State.energy -= n; updateHUD(); return true;
}

function invCount(ing) { return State.inventory[ing] || 0; }
function addInv(ing, n = 1) { State.inventory[ing] = invCount(ing) + n; }
function useInv(ing, n = 1) { State.inventory[ing] -= n; if (State.inventory[ing] <= 0) delete State.inventory[ing]; }
function upgradeLv(id) { return State.upgrades[id] || 0; }

function log(msg, boxId = "hub-log") {
  const box = $(boxId); if (!box) return;
  const d = document.createElement("div"); d.innerHTML = msg; box.prepend(d);
  while (box.children.length > 40) box.lastChild.remove();
}

function likesBonusMult() {
  let m = 1;
  for (const w of State.worms) if (w.trait === "shimmer") m += .15;
  m += upgradeLv("kitchen") * .15;
  return m;
}

/* ---- dawn ---- */
function sleepToDawn() {
  State.day++; State.energy = State.maxEnergy;
  State.hp = State.maxHp;
  State.flags.perfectDishesToday = 0; // WS-1: Reset perfect dishes count each day
  State.flags.starChefStreak = false; // WS-1: Reset star chef streak each day
  const gourmet = State.worms.filter(w => w.trait === "gourmet").length;
  if (gourmet) { addInv("wormgold", gourmet); toast(`✨ Gourmand Grub: +${gourmet} Vermicelli Caviar delivered!`); }
  const philo = State.worms.filter(w => w.trait === "philosopher").length;
  if (philo) { State.maxHp += 2 * philo; State.hp = State.maxHp; toast(`✨ Philosopher Worm: +${2 * philo} max HP (permanent)!`); }
  if (State.flags.rations === undefined) State.flags.rations = 0;
  updateHUD();
  autoslot(); // autosave at dawn so a refresh never loses the day
  toast(`☀️ Day ${State.day} — fully rested, ⚡${State.maxEnergy} energy`);
  Hub.open();
}

/* out of energy at end of day: gentle prompt, not forced */
function offerSleep() {
  if (State.energy > 0) return false;
  Story.show("🌙", [{ speaker: "", text: "The day's light is spent. Your worms tuck themselves in and gesture pointedly at your bedroll." }],
    () => sleepToDawn());
  return true;
}
