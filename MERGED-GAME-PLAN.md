# Starlight Supper — MERGED Game Plan (v2)

**Status:** PLAN (v2) — supersedes build order in `GAME-PLAN-TOBUILD.md` (v1 kept for reference).
**Progress ledger:** WS-1 ✅ and WS-2 ✅ shipped (commit `0c63b4d`, before playtest feedback arrived).
WS-11 🔄 in progress. Everything else not started.
> Note on WS-2: since it's already live, keep rolling HP + tiered Volt defeat + Elroy phase;
> simply don't invest further duel depth until after WS-8/WS-9 land.
**Basis:**
- Classic Mechanics Codex research — `/home/j/apps/game-mechanics-wiki/` (mechanics.asimplenoise.com)
- **Playtest feedback doc** — "Starlight supper notes" (Google Doc, Aug 2026): Myla + Jeanne playtest.
  Core finding: **genre mismatch.** Testers want live-action, real-time, tactile interaction
  (Dave the Diver, Toca Boca). Turn-based combat and the slider cooking minigame feel static.
  Wormery is confusing/non-functional for new players. Intro feels static.

**Codebase reality:** vanilla JS + Canvas 2D, `js/{engine,data,story,cooking,battle,world,worldmap,hub,intro,art,audio,chip}.js`.
`State` object + `DATA` tables centralize everything. No frameworks — all new interactivity is canvas/DOM event work.

---

## Strategy

The v1 plan deepened classic loops. The playtest says the *surface* of those loops must become
interactive first. So: **new interactive-layer workstreams (WS-8..11) take priority; v1 depth
workstreams are kept but re-sequenced and re-scoped around them.**

Attack order:
1. **WS-11 Quick Wins** (S) — animated intro + wormery onboarding. Immediate visible improvement.
2. **WS-8 Live-Action Kitchen Service** (L) ⭐ — the big swing that answers the core complaint.
3. **WS-9 Tactile Cooking Rework** (M) — replaces/augments the slider with interactive prep minigames.
4. **WS-10 Customization Lite** (M) — drag-and-drop outfit/decor picker (Toca Boca flavor).
5. Then resume v1 depth: **WS-1 Cooking Feel → WS-3 Forklore Market → WS-6 wormery depth**, etc.

---

## New Workstreams (from playtest)

### WS-11: Quick Wins — Animated Intro & Wormery Onboarding ⭐ ship first (S)
**Source:** Myla feedback ("static intro", "wormery confusing").
**Files:** `js/intro.js`, `js/art.js`, `js/hub.js`, `js/cooking.js` (wormery section), `js/story.js`

1. **Animated intro cards** — replace static splash backgrounds on intro/story cards with animated
   planets: slow parallax star drift, rotating planet canvases (reuse bg-canvas renderer), gentle
   ship bob. Pure canvas animation loop keyed off existing art assets.
2. **Wormery guided tutorial** — first visit triggers a 4-step overlay walkthrough: buy slot → feed →
   trait appears → breed. Each step highlights the actual UI element and waits for the player to do it.
   Store `State.flags.wormeryTutorialDone`.
3. **Cause/effect clarity** — every worm trait gets an explicit one-line "what this does today" line in
   its roster card, plus a dawn toast when a trait fires ("✨ Shimmerback: +15% likes applied!").

**Done when:** intro animates on title + each story card; a fresh save sees the wormery tutorial exactly
once and can complete it without outside explanation; trait toasts fire at dawn.

---

### WS-8: Live-Action Kitchen Service ⭐ the big swing (L)
**Source:** Jeanne feedback — "physically work at the restaurant, move characters, serve customers real time."
Dave-the-Diver service floor, our art style.
**Files:** new `js/service.js` + new screen in `index.html`; hooks into cooking output and Forklore panel.

1. **Service screen** — side-view restaurant scene (canvas): counter, tables, walk zones. Nimbus sprite
   moves with arrow keys / virtual stick / tap-to-move.
2. **Real-time loop (~90s shifts):** customers arrive at a spawn rate tuned by day/fame; they sit, think,
   then order (speech bubble shows desired dish icon). Prepped dishes from that day's cooking sit on the
   pass counter. Pick up dish → carry to the right customer before their patience ring empties.
3. **Scoring:** satisfaction per customer = dish quality (cooking minigame result) × speed bonus.
   Satisfaction converts to likes + money at shift end (feeds existing Forklore numbers).
4. **Escalation:** later days add multi-course orders, table bussing (drag plates to wash bin),
   ally helpers (recruited rivals staff stations: Vex greets/seats faster, Bramble preps dishes onto
   the pass automatically, Nell refills patience).
5. **Failure is cozy:** unhappy customers leave a mild review on Forklore instead of game-over;
   streak of great reviews feeds the Star Chef streak (v1 WS-1).

**Done when:** a full playable shift runs start→end at 60fps on mobile Safari; keyboard + touch both work;
dish quality demonstrably affects payout; at least one ally helper visibly changes the shift.

---

### WS-9: Tactile Cooking Rework (M)
**Source:** doc strategy — inject contemporary interactive mechanics (Cut the Rope / Candy Crush /
Osmo absorption concepts); Jeanne's live-action preference.
**Files:** `js/cooking.js`, `js/art.js`

Replace the single sliding bar with a **prep-stage sequence** — 2–3 mini-interactions per dish,
drawn from a family of reusable tactile primitives:

1. **Chop** — tap/click rhythm on a moving ingredient (timing windows, combo taps).
2. **Pour** — hold-to-fill with drift (tilt the pour by dragging; overflow = waste).
3. **Stir** — circular drag gesture tracked for coverage/speed.
4. **Absorb** (Osmo-style) — guide a flavor orb with touches into matching ingredient targets while
   avoiding bitter ones.
5. Recipes declare which stages they use (`stages:["chop","pour","stir"]`) in `DATA.recipes`;
   difficulty scales stage count/speed. Perfect chains still feed the v1 WS-1 combo/plating systems.

**Done when:** every recipe plays through ≥2 distinct tactile stages; touch + mouse parity; old slider
retained as fallback accessibility option (toggle in menu).

---

### WS-10: Customization Lite (M)
**Source:** Myla feedback — Toca Boca-style sandbox customization, scoped down to stay shippable.
**Files:** new `js/customize.js`, shelter/hub screens, `State.cosmetics` in saves.

1. **Nimbus dresser** — pick color palette (skin/outfit/hat/scarf variants as palette swaps on the
   existing canvas sprite — no new art pipeline).
2. **Shelter decor** — drag-and-drop placeable decorations (rug, plants, lamps, posters) on a grid in
   the hub screen; positions persist in save. A few items unlock via likes milestones (ties to WS-7 bonus room idea).
3. **Restaurant skin** — decor set also renders inside the WS-8 service scene so customization matters where players spend time.

**Done when:** outfit change persists through save/load; ≥8 placeable decor items draggable with
snap-to-grid; chosen items visible during service shifts.

---

## Re-scoped v1 Workstreams

- **WS-1 Cooking Feel Pack** — KEEP as-is, but build AFTER WS-9 (combo/plating now attach to the new
  tactile stages instead of the slider).
- **WS-2 Duel Depth** — DEMOTE. Testers flagged turn-based combat specifically. Keep only:
  rolling HP odometer + tiered Volt defeat + Volt Elroy phase (small). Defer palate weaknesses and
  table combos until combat proves itself post-rework.
- **WS-3 Forklore Market** — KEEP unchanged (S). Demand triad gives the day cycle its decision and
  feeds WS-8 payouts.
- **WS-4 Night Mirror / World layer** — DEFER one cycle.
- **WS-5 Day/Energy** — KEEP deferred position (after WS-4).
- **WS-6 Wormery depth** — KEEP affix-name generator (do it inside WS-11 so onboarding teaches the
  readable names from day one); defer hidden potency stats/upkeep/seeded breeding until after WS-8.
- **WS-7 Base & Finale polish** — DEFER; fold "rest = autosave" into any early commit.

## Explicitly deferred (don't build yet)
Full sandbox character/house editor (beyond WS-10 scope), physics-engine adoption (canvas math suffices),
multiplayer/leaderboards, reputation single-pool economy, EV-style meta layer.

---

## Verification (every workstream)
- Play through affected loop end-to-end; fresh-save AND loaded-save paths.
- Mobile Safari + desktop Chrome: no console errors; touch and mouse both work for anything interactive.
- Save/reload mid-feature: cosmetics, streaks, tutorial flags persist correctly.
- Deploy check: game.asimplenoise.com loads clean, chiptune audio intact, bump cache-bust versions.
