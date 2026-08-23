/* ============ STARLIGHT SUPPER — game data ============ */
"use strict";
const DATA = {};

/* ---------- Ingredients ---------- */
DATA.ingredients = {
  starbloom:   { name: "Starbloom Nectar",  emoji: "🌸", planet: "verdanth", value: 6,  tags: ["sweet"] },
  glowsroom:   { name: "Glowsroom",         emoji: "🍄", planet: "verdanth", value: 5,  tags: ["earthy"] },
  cloudfruit:  { name: "Cloudfruit",        emoji: "🍐", planet: "verdanth", value: 7,  tags: ["sweet"] },
  emberpepper: { name: "Emberpepper",       emoji: "🌶️", planet: "cinder",  value: 8,  tags: ["spicy"] },
  lavasalt:    { name: "Lavasalt",          emoji: "🧂", planet: "cinder",  value: 5,  tags: ["savory"] },
  cinderfin:   { name: "Cinderfin Fillet",  emoji: "🐟", planet: "cinder",  value: 12, tags: ["seafood"] },
  abysskelp:   { name: "Abysskelp",         emoji: "🌿", planet: "pelagia", value: 6,  tags: ["seafood"] },
  moonroe:     { name: "Moonroe",           emoji: "🥩", planet: "pelagia", value: 14, tags: ["savory"] },
  pearlroot:   { name: "Pearlroot",         emoji: "🦪", planet: "pelagia", value: 9,  tags: ["earthy"] },
  wormgold:    { name: "Vermicelli Caviar", emoji: "✨", planet: null,      value: 20, tags: ["luxury"] }, // from wormery
};

/* ---------- Recipes (gourmet!) ---------- */
DATA.recipes = [
  { id: "nectarfoam",     name: "Starbloom Foam w/ Glowsroom Dust", emoji: "🍮", art: "dish1.png",
    req: { starbloom: 2, glowsroom: 1 }, baseLikes: 14, price: 18,
    lore: "A dessert that hums when the spoon touches it.", difficulty: 1 },
  { id: "cloudtart",      name: "Cloudfruit Tart, Lavasalt Crust", emoji: "🥧", art: "dish2.png",
    req: { cloudfruit: 2, lavasalt: 1 }, baseLikes: 22, price: 30,
    lore: "Sweet as a rumor, sharp as a goodbye.", difficulty: 2 },
  { id: "emberceviche",   name: "Ember-Cured Cinderfin Ceviche", emoji: "🍤", art: "dish3.png",
    req: { cinderfin: 1, emberpepper: 2 }, baseLikes: 34, price: 46,
    lore: "Cooked by anger alone. Serve cold to confuse everyone.", difficulty: 3 },
  { id: "abyssrisotto",   name: "Abysskelp Risotto, Pearlroot Chip", emoji: "🍚", art: "dish4.png",
    req: { abysskelp: 2, pearlroot: 1, lavasalt: 1 }, baseLikes: 40, price: 58,
    lore: "The deep sea's apology for everything down there.", difficulty: 3 },
  { id: "moonwellington", name: "Moonroe Wellington in Starbloom Jus", emoji: "🥮", art: "dish5.png",
    req: { moonroe: 1, starbloom: 1, glowsroom: 2 }, baseLikes: 55, price: 80,
    lore: "The dish that ended a 300-year feud on Verdanth. Twice.", difficulty: 4 },
  { id: "kettlebroth",    name: "First Broth of the Cosmos", emoji: "🍲", art: "dish6.png",
    req: { moonroe: 1, pearlroot: 1, wormgold: 1 }, baseLikes: 90, price: 140,
    lore: "Nimbus's grandmother's recipe. The Kettle remembers it.", difficulty: 5 },
  { id: "platingFinisher", name: "Plating Finisher", emoji: "✨", art: "dish_plating.png",
    req: {}, baseLikes: 0, price: 0, lore: "The final flourish.", difficulty: 5 },
];

/* ---------- Worms ---------- */
DATA.wormTraits = {
  shimmer:  { name: "Shimmerback",  effect: "+15% Forklore likes",  likesBonus: .15 },
  gourmet:  { name: "Gourmand Grub", effect: "+1 luxury ingredient/day", ingredient: "wormgold" },
  oracle:   { name: "Oracle Worm",   effect: "Reveals map nodes at night" },
  philosopher: { name: "Philosopher Worm", effect: "+2 max HP each dawn" },
};
DATA.wormRarities = [
  { id: "common", name: "Common", color: "#95e06c", weight: 55 },
  { id: "rare", name: "Rare", color: "#4ecdc4", weight: 30 },
  { id: "epic", name: "Epic", color: "#b39ddb", weight: 12 },
  { id: "legendary", name: "Legendary", color: "#ffc857", weight: 3 },
];

/* ---------- Shelter upgrades ---------- */
DATA.upgrades = [
  { id: "kitchen", name: "Gourmet Kitchen", icon: "🍳", levels: [ {cost:60},{cost:180},{cost:400} ],
    desc: lv => `Cooking window +${lv*10}%, recipe likes +${lv*15}%` },
  { id: "wormery", name: "Wormery Wings", icon: "🪱", levels: [ {cost:50},{cost:160},{cost:380} ],
    desc: lv => `${lv+1} worm slots; breeding speed +${lv*25}%` },
  { id: "guesthall", name: "Guest Hall", icon: "🏛️", levels: [ {cost:80},{cost:220} ],
    desc: lv => `Bring ${lv+1} allies into battles` },
  { id: "observatory", name: "Observatory", icon: "🔭", levels: [ {cost:100},{cost:260} ],
    desc: lv => `See ${lv+1} extra night nodes; jewel clues revealed` },
  { id: "studio", name: "Forklore Studio", icon: "💡", levels: [ {cost:70},{cost:200} ],
    desc: lv => `Post earnings +${lv*30}%` },
];

/* ---------- Enemies ---------- */
DATA.enemies = {
  grubble:   { name: "Grubble Pack", hp: 16, atk: [3,5], emojiKey: "grubble", loot: { glowsroom: 1 }, money: [12,20], weakTag: "spicy" },
  sporeling: { name: "Angry Sporeling", hp: 22, atk: [4,7], emojiKey: "sporeling", loot: { cloudfruit: 1 }, money: [15,26], weakTag: "savory" },
  magmaw:    { name: "Magmaw Wyrmling", hp: 34, atk: [6,9], emojiKey: "magmaw", loot: { emberpepper: 1, lavasalt: 1 }, money: [26,44], weakTag: "seafood" },
  ashbandit: { name: "Ash Bandit", hp: 30, atk: [5,9], emojiKey: "ashbandit", loot: { cinderfin: 1 }, money: [30,52], weakTag: "sweet" },
  brinefiend:{ name: "Brine Fiend", hp: 42, atk: [7,11], emojiKey: "brine", loot: { abysskelp: 1 }, money: [38,60], weakTag: "earthy" },
  tidehulk:  { name: "Tidehulk", hp: 60, atk: [9,13], emojiKey: "tidehulk", loot: { moonroe: 1 }, money: [55,85], boss: true, weakTag: "spicy" },
  volt:      { name: "Baron Volt", hp: 90, atk: [8,12], emojiKey: "volt", boss: true, final: true, weakTag: "savory" },
};

/* ---------- Tea party rivals → become allies ---------- */
DATA.rivals = [
  { id: "madame_vex", name: "Madame Vex", title: "Duchess of Rust & Roses", homePlanet: "verdanth",
    hp: 24, wit: 5, difficulty: 1, emojiKey: "vex", weakTag: "earthy",
    intro: "You dare approach my garden in travel boots? Very well — we settle this the civilized way. TEA. Delight me to 70 and I shall join your quest!",
    winLine: "Hmph. Your pour is unorthodox... and magnificent. I shall travel with you, if only to supervise.",
    allySkill: { name: "Rose Parry", desc: "Block next enemy hit & counter 4" } },
  { id: "chef_bramble", name: "Chef Bramble", title: "The Exiled Flavor-Pirate", homePlanet: "cinder",
    hp: 32, wit: 6, difficulty: 2, emojiKey: "bramble", weakTag: "spicy",
    intro: "They say my lava-roux is too dangerous for polite society. Prove your palate or eat your words!",
    winLine: "You seasoned DURING my monologue?! Diabolical. I'm in. Where do we eat?",
    allySkill: { name: "Flavor Bomb", desc: "Deal 8 damage + apply -2 enemy attack" } },
  { id: "admiral_nell", name: "Admiral Nell", title: "Last Commander of Pelagia's Deep Watch", homePlanet: "pelagia",
    hp: 44, wit: 7, difficulty: 3, emojiKey: "nell", weakTag: "seafood",
    intro: "The Sapphire lies beneath MY trench, gourmand. Duel me — cups, not cannons. Best etiquette wins.",
    winLine: "Perfect temperature. Perfect timing. The Deep Watch follows you now, Quill.",
    allySkill: { name: "Deep Cover", desc: "Heal 8 & gain 3 block" } },
];

/* ---------- Ally Combos (WS-2) ---------- */
DATA.allyCombos = [
  { id: "vex_bramble_combo", name: "Flaming Rose Supper", allies: ["madame_vex", "chef_bramble"], desc: "Vex and Bramble combine for a fiery, fragrant dish.", baseDmg: 15, multiplier: 1.2, effect: { healPlayer: 5 } },
  { id: "bramble_nell_combo", name: "Volcanic Kelp Stew", allies: ["chef_bramble", "admiral_nell"], desc: "Bramble's heat meets Nell's bounty for a spicy, deep-sea brew.", baseDmg: 18, multiplier: 1.2, effect: { enemyDebuff: -3 } },
  { id: "vex_nell_combo", name: "Deep Forest Truffle", allies: ["madame_vex", "admiral_nell"], desc: "Vex's elegance and Nell's depth create a rich, earthy offering.", baseDmg: 12, multiplier: 1.2, effect: { block: 5 } },
];

/* ---------- Planets ---------- */
DATA.planets = [
  { id: "verdanth", name: "Verdanth", icon: "🌿",
    blurb: "A mossy super-garden where every plant is faintly musical.",
    jewel: "hearthstone", rival: "madame_vex",
    enemies: ["grubble","grubble","sporeling"],
    ingredients: ["starbloom","glowsroom","cloudfruit"] },
  { id: "cinder", name: "Cinder Reach", icon: "🌋",
    blurb: "Volcanic archipelagos. The food is spicy because everything is literally on fire.",
    jewel: "gale", rival: "chef_bramble",
    enemies: ["sporeling","magmaw","ashbandit"],
    ingredients: ["emberpepper","lavasalt","cinderfin"] },
  { id: "pelagia", name: "Pelagia", icon: "🌊",
    blurb: "One world-ocean, lit from below by cities of the Deep Watch.",
    jewel: "abyssal", rival: "admiral_nell",
    enemies: ["ashbandit","brinefiend","tidehulk"],
    ingredients: ["abysskelp","moonroe","pearlroot"] },
];
DATA.jewels = { hearthstone: "🔥 Hearthstone Ruby", gale: "🌪️ Gale Emerald", abyssal: "💎 Abyssal Sapphire" };

/* ---------- Night nodes ---------- */
DATA.nodeTypes = {
  fight:   { icon: "⚔️", label: "Hostile Lifeform" },
  treasure:{ icon: "🎁", label: "Cache" },
  gather:  { icon: "🌱", label: "Ingredient Grove" },
  stranger:{ icon: "❓", label: "Strange Encounter" },
  jewel:   { icon: "💠", label: "Jewel Vault" },
  tea:     { icon: "🍵", label: "Tea Invitation" },
};

/* ---------- Baron Volt phases ---------- */
DATA.thorPhases = [
  { threshold: 1.0, line: "A RESERVATION? For ME? You found all three jewels — now let us see if your TASTE is real!" },
  { threshold: 0.6, line: "Impressive palate, tiny chef. But can you weather THE STORM COURSE?" },
  { threshold: 0.25, line: "Enough! I shall stop holding back my... hospitality!!!" },
];

/* ---------- Story beats ---------- */
DATA.introStory = [
  { speaker: "", text: "Three hundred years ago, the Great Kettle — the cosmic hearth that simmered the First Broth — went cold. They call it the Sundering." },
  { speaker: "Nimbus Quill", text: "Grandmother said the Kettle burned on three jewels: the Hearthstone Ruby, the Abyssal Sapphire, the Gale Emerald. One on each of three worlds." },
  { speaker: "Oracle Worm", text: "(adjusting a tiny monocle) The plan, then: by day, cook gourmet dishes and post them on Forklore for money. By ⚡energy, expedition to each world." },
  { speaker: "Oracle Worm", text: "On each planet: befriend its champion at a TEA PARTY 🍵 — they'll reveal the vault. Open all three vaults, take the jewels... and the storm critic BARON VOLT will come for your jewels — and your table. Any questions? Good. Wear pants." },
];

DATA.getRecipeIngredientTags = (recipeId) => {
  const recipe = DATA.recipes.find(r => r.id === recipeId);
  if (!recipe || !recipe.req) return [];
  const tags = new Set();
  for (const ingId in recipe.req) {
    const ingredient = DATA.ingredients[ingId];
    if (ingredient && ingredient.tags) {
      ingredient.tags.forEach(tag => tags.add(tag));
    }
  }
  return Array.from(tags);
};
