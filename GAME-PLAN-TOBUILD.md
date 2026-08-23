# Starlight Supper — Enhancement Upgrade Plan (v1)

**Status:** PLAN — not yet built. Assign to a worker (Codex lane, Claude Code, or self-run) per workstream.
**Basis:** Classic Mechanics Codex research — `/home/j/apps/game-mechanics-wiki/` (live at
[mechanics.asimplenoise.com](https://mechanics.asimplenoise.com)). Every item below cites its
trope source in the wiki (`standards/mechanic-tropes.md`, `standards/starlight-supper-applications.md`).
**Codebase reality:** vanilla JS + Canvas 2D, ~2,350 lines across `js/{engine,data,story,cooking,battle,world,worldmap,hub,intro,art,audio,chip}.js`. No frameworks. `State` object + `DATA` tables centralize everything — most of these features are data-table edits plus small logic branches.

---

## The Pitch

Starlight Supper already has strong bones (cooking loop → duels → recruits → worlds → Volt).
What it's missing is what made the classics *classic*: legible risk/reward, systems that talk to
each other, juice on every number, and failure that teaches instead of punishes. This plan ports
the best-documented mechanic tropes of 1980s–90s design into our game in ten shippable slices.

---

## Workstreams

### WS-1: Cooking Feel Pack ⭐ ship first
**Tropes:** Combo vs. Chain Split (Tetris Attack), Earned Momentum "On Fire" (NBA Jam), Rolling Odometer (Earthbound), Teach-by-Composition (SMB 1-1)
**Files:** `js/cooking.js`, small `js/data.js` additions

1. **Combo + Plating Finisher** — consecutive Perfects build a combo multiplier (+5%/step); an all-perfect dish adds one bonus "plating" bar with a narrow zone that multiplies the whole dish ×1.0–×1.5.
   - `session.combo++` on perfect, reset otherwise; if `combo === steps.length`, push finisher step.
2. **Rolling Likes Odometer** — likes counter rolls up odometer-style after cooking; crossing a milestone ("Viral!") fires a chiptune sting (`js/chip.js`).
3. **Star Chef streak** — 3 perfect dishes across days → streak flag in `State.flags`: +1 like per post, gold trail, until a miss. Both sides can earn/lose it — momentum as reward, not rubber-band cheat.
4. **First-cook curriculum** — first-ever cook is forced to Nectarfoam (2 identical steps) so rhythm is learned before variation.

**Done when:** combo meter visible during cooking, finisher triggers, odometer animation plays, streak persists through save/load.

---

### WS-2: Duel Depth Pack
**Tropes:** Boss Weakness Cycle (Mega Man), Combo Ability Grammar (Chrono Trigger), Rolling Damage Meter (Earthbound), Cruise Elroy (Pac-Man), Tiered Defeat (Mario/DKC)
**Files:** `js/battle.js`, `js/data.js`

1. **Rival palate weaknesses** — each rival gets `{weakTag}` (sweet/spicy/savory/seafood — ingredient tags exist). Matching disliked tag = ×1.5 course damage. Beating a rival reveals the next rival's hint. Data-table only.
2. **Table Combos** — seated pairs of complementary allies unlock named combo courses from a small pair table ("Velvet Interlude"); damage = sum × ~1.2. Authored names only; math generated.
3. **Rolling HP** — duel HP rolls down odometer-style; a fatal course can be clutch-saved by picking the refill action mid-roll. Death triggers only when display hits 0.
4. **Volt Elroy phase** — Baron Volt below 30% HP accelerates his timer / raises attack — pressure exactly when winning.
5. **Tiered defeat vs Volt** — losing isn't game-over: lose one jewel's luster (re-win one vault duel) + he posts a mocking Forklore thread. Cozy-tone failure.

**Done when:** weakness multiplier demonstrably changes duel outcomes; at least 3 table combos fire; HP visibly rolls; Volt phase 2 triggers; a scripted loss shows the setback path.

---

### WS-3: Forklore Market Dynamics
**Tropes:** Visible Demand Triad (SimCity RCI), Rank-Based Trend Events (Mario Kart item odds), Dual-Purpose Resources
**Files:** daily tick in `js/engine.js`, Forklore panel UI

1. **Demand triad** — three drifting meters (Sweet/Savory/Seafood) shown on the Forklore panel; posting into high demand multiplies likes.
2. **Daily trends** — one random trend/day (#SpicySunday): matching-tag dishes get ×2 likes. One line in the tick + banner display.
3. **Likes as dual currency** — spend likes on shelter upgrades OR "boost a post" (reroll today's demand multipliers).

**Done when:** meters drift visibly day-to-day, trend banner appears, both like-sink paths work and compete.

---

### WS-4: World Layer & Night Mirror
**Tropes:** Gated-Ability Progression (Metroid/Zelda), Mirror Worlds (LttP), Breadcrumbs (DKC), Risk/Reward Routes (Sonic), Collectible-as-Skill-Test (KONG letters)
**Files:** `js/world.js`, `js/worldmap.js`

1. **Night node layer** — night versions of each map reveal hidden nodes/NPCs; same tilemap, second layer toggled by `dayPhase`. Makes Oracle Worm's existing trait a real system.
2. **Gated-ability rivals** — recruited champions open traversal: Bramble's flame-tongs open Cinder vents; Nell's dive-bell opens Pelagia trenches. Recruiting re-maps old worlds.
3. **Breadcrumb sparkles** — planet-specific ingredient glints tracing intended routes toward unexplored nodes.
4. **One risk/reward side path per world** — hazard-lined shortcut guarding rich ingredient clusters; optional.
5. **Recipe fragments** — 3 hidden fragments/world; all collected unlocks a secret dish row in `DATA.recipes`.

**Done when:** night toggle reveals distinct content, each recruit demonstrably unlocks geography, breadcrumbs render, one fragment set completes.

---

### WS-5: Day/Energy Rhythm
**Tropes:** Scatter/Chase Wave Timer (Pac-Man), Vancian Rest Economy (BG), Auto-Resolve Trivial Encounters (Earthbound), Hoardable Panic Buttons (E-Tanks), Dual-Clock Pressure (PoP)
**Files:** `js/engine.js` tick, `js/hub.js`, sleep/rest logic

1. **Wave-structured day** — explicit chase (day)/release (night) windows with dusk warning banner; players plan around a predictable rhythm.
2. **Partial rest away from home** — sleeping outside Home Shelter restores partial energy with a nocturnal critter encounter chance. "Push one more node vs walk home" becomes real.
3. **Auto-resolve cleared nodes** — revisiting beaten nodes costs no energy, skips fanfare.
4. **Espresso of the Comet** — craftable out-of-home energy restore, inventory capped at 3.
5. **Soft story clock** — rivals grow restless / Volt taunts via Forklore posts at day thresholds; never hard-fails.

**Done when:** dusk banner fires, partial-rest branch + encounter rolls, cleared nodes are free, espresso craftable/capped, day-count taunts appear.

---

### WS-6: Wormery Legibility & Depth
**Tropes:** Legible Procedural Loot (Diablo affixes), Hidden Effort Stats (Pokémon EVs), Slot-Based Ability Economy (materia), Level-Up Stat Steering (espers)
**Files:** wormery section of `js/cooking.js`, `js/data.js`

1. **Affix worm names** — rarity + prefix/suffix name generator ("Regal Shimmerback of the Deep") derived from actual trait mods. Ship this before any deeper breeding work so later layers inherit readable names.
2. **Hidden flavor exp** — feeding accumulates hidden stat exp folded into offspring potency (√-curve caps, Gen-1 formula style). Casuals see traits, grinders discover potency.
3. **Priced legendary slots** — top-tier worms impose upkeep (eats a luxury ingredient/day) — power always costs.
4. **Dawn-tick trait table** — every trait gets a morning effect (Philosopher: +2 max HP at dawn) making equipped worms build decisions, not pets.
5. **Seeded breeding** — deterministic offspring RNG for shareable rare results.

**Done when:** generated names show in roster/UI, potency math verified against formula, upkeep deducts, dawn effects tick, same seed → same child.

---

### WS-7: Base & Finale Polish
**Tropes:** Cadence Pacing (SMW), Performance-Gated Bonus Access (keyholes), Checkpoint Economics, Environment-as-Rulebook
**Files:** `js/hub.js`, `js/story.js`

1. **Story-gated upgrade tiers** — kitchen Lv2 after first recruit; wormery Lv2 after Verdanth jewel — base grows on story cadence.
2. **Like-threshold bonus room** — hidden shelter room at total-likes milestone; pure vanity sink.
3. **Rest = autosave snapshot** — "Day saved" toast on shelter sleep.
4. **Vault riddle ladder** — each jewel vault displays its own requirement riddle; the world's recruited champion narrows it in tiers (Visible-Lock Hint Ladder + Knowledge-Only Progression).
5. **Punchline vault dish** — vault-opening requires a foreshadowed absurd dish (lore lines already plant these).

**Done when:** tiers refuse early purchase, room unlocks at threshold, toast appears, riddle narrows via champion dialogue, vault accepts its gag dish.

---

## Build Order & Sizing

| Order | Workstream | Size | Why this order |
|---|---|---|---|
| 1 | WS-1 Cooking Feel | S–M | Core loop played most; biggest feel-per-line ratio |
| 2 | WS-2 Duels | M | Second-most-played loop; data-table heavy, low risk |
| 3 | WS-3 Forklore Market | S | Gives the day cycle its decision |
| 4 | WS-6 Wormery names first | S–M | Must precede deeper breeding layers |
| 5 | WS-4 Worlds/Night | M–L | Biggest new-system lift; reuses worldmap renderer |
| 6 | WS-5 Day/Energy | M | Layers onto rhythms established above |
| 7 | WS-7 Base & Finale | M | Polish pass; needs earlier systems present |

Rule of thumb: everything in WS-1→WS-3 ships inside existing screens with no new UI surfaces;
WS-4+ add systems. Each workstream is independently assignable and testable.

## Verification (per workstream)
- Play through the affected loop end-to-end after implementation.
- Save/reload mid-feature: streaks, worms, jewels, trends must persist correctly.
- `docker ps --format '{{.Names}}\t{{.Ports}}' | grep 0.0.0.0` must stay empty (static site — no containers involved; this is just standing policy).
- Deploy check: game.asimplenoise.com loads, console clean, chiptune still plays.

## Explicitly deferred (don't build yet)
Reputation single-pool economy (punitive risk), menu-planning sliders (endgame-only audience),
full EV-style meta layer (needs community to discover), recipe fragment content expansion beyond
one proof set.
