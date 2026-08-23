# 🛸 Starlight Supper

*A Cosmic Culinary Odyssey — a browser-based cooking adventure.*

The Great Kettle went cold at the Sundering. Three jewels once warmed the first broth of the cosmos. You are **Nimbus Quill**, last of the Vessari Gourmand Nomads. Cook. Breed worms. Duel with etiquette. Rekindle the Kettle.

**▶ Play now: [game.asimplenoise.com](https://game.asimplenoise.com)**

---

## What is it?

Starlight Supper is a day-cycle survival-cooking RPG that runs entirely in your browser. Each day you manage limited energy across cooking, foraging expeditions, worm husbandry, and building up your interstellar reputation — one follower, one dish, one duel of manners at a time.

### Features

- 🍳 **Cosmic Cooking** — combine exotic ingredients (Starbloom Nectar, Cinderfin Fillet, Vermicelli Caviar) into dishes worth serving to discerning alien guests
- 🪱 **Worm Breeding** — run the Wormery, pair Oracle and Philosopher worms, and trade rare wormgold
- ⚔️ **Etiquette Duels** — settle disputes with rival nomads through formal dining combat, not violence
- 🌍 **World Expeditions** — leave the Home Shelter to forage by day; survive Ash Bandits, Brine Fiends, Magmaw Wyrmlings, and Angry Sporelings
- 📱 **Follower Economy** — grow your Forklore Studio audience; reputation is currency
- 🔁 **Day/night cycle** with energy management, HP, and a persistent save
- 🎵 **Chiptune audio** generated in-browser (best with sound on)

## Tech

- Pure vanilla JavaScript + Canvas 2D — no frameworks, no build step
- ~2,300 lines across 13 modules (`js/engine.js`, `js/cooking.js`, `js/battle.js`, `js/worldmap.js`, …)
- Procedural chiptune soundtrack via Web Audio (`js/audio.js`, `js/chip.js`)
- Single static site; deployable anywhere

## Run locally

No install required:

```bash
git clone https://github.com/jrezmo/starlight-supper.git
cd starlight-supper
python3 -m http.server 8080
# open http://localhost:8080
```

(Any static file server works. Opening `index.html` directly also works in most browsers.)

## Project structure

```
index.html      # screens, HUD, game shell
style.css       # UI theme
js/
  engine.js     # core loop & state
  data.js       # ingredients, recipes, creatures, lore tables
  story.js      # narrative beats
  cooking.js    # cooking minigame
  battle.js     # etiquette duels
  world.js / worldmap.js  # expeditions & map
  hub.js        # Home Shelter base-building
  intro.js      # opening sequence
  art.js        # canvas rendering
  chip.js / audio.js      # procedural music
genassets.py    # asset generation helpers
assets/         # character & scene art
```

## Credits

Built as part of the [asimplenoise.com](https://asimplenoise.com) personal lab. Art assets are original generated illustrations.

---

*Cook well. The Kettle remembers.*
