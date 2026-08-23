/* ============ Combat battle + tea party (v2) ============ */
"use strict";
const Battle = (() => {
  let B = null;

  function start(enemyKey, onWin, onFlee) {
    const e = DATA.enemies[enemyKey];
    window.__battleKind = "fight";
    window.__battleThor = !!e.final;
    B = {
      enemyKey, ehp: e.hp, emax: e.hp, displayEhp: e.hp, // WS-2: Rolling HP - displayEhp init
      block: 0, charge: false, chargeEnemy: false, enemyDebuff: 0,
      over: false, onWin, onFlee, intent: rollIntent(e), alliesUsed: {},
      isThor: !!e.final, phaseIdx: 0,
    };
    State.displayHp = State.hp; // WS-2: Rolling HP - displayHp init for player
    $("battle-log").innerHTML = "";
    log(`⚔️ ${e.name} blocks your path!`);
    showScreen("screen-battle");
    // art: image if generated, canvas fallback (grubble/magmaw/tidehulk have painted art; others fall back to canvas)
    setArt($("enemy-canvas"), "assets/" + e.emojiKey + ".png", e.emojiKey);
    setArt($("player-battle-canvas"), "assets/nimbus.png", "nimbus");
    renderAlliesBar();
    updateBattleUI();
    animateHpBars(); // WS-2: Start HP animation
    playerTurn();
  }

  function setArt(canvas, imgPath, fallbackKey) {
    const img = new Image();
    img.onload = () => { canvas.style.display = "none"; let el = canvas.parentElement.querySelector(".art-img"); 
      if (!el) { el = document.createElement("img"); el.className = "art-img"; canvas.parentElement.appendChild(el); }
      el.src = imgPath; };
    img.onerror = () => { canvas.style.display = ""; const el = canvas.parentElement.querySelector(".art-img"); el && el.remove(); Art.drawCharacter(canvas, fallbackKey); };
    img.src = imgPath;
  }

  function rollIntent(e) {
    const r = Math.random();
    if (r < .65) return { kind: "attack", dmg: rand(e.atk[0], e.atk[1]) };
    if (r < .82) return { kind: "heavy", dmg: Math.round(rand(e.atk[0], e.atk[1]) * 1.7) };
    return { kind: "charge" };
  }
  function intentText() {
    if (B.intent.kind === "attack") return `🗡️ Intends to hit for ~${B.intent.dmg}`;
    if (B.intent.kind === "heavy") return `💥 Winds up a BIG hit (~${B.intent.dmg})`;
    return "🔮 Charging power...";
  }
  function maxAllies() { return 1 + upgradeLv("guesthall"); }

  // WS-2: combos usable only when BOTH partner allies are currently recruited
  // (and not already spent this battle). Missing helper crashed every battle.
  function getActiveAllyCombos() {
    const active = new Set(State.allies.slice(0, maxAllies()));
    return (DATA.allyCombos || []).filter(c => c.allies.every(id => active.has(id)));
  }

  function renderAlliesBar() {
    const bar = $("battle-allies"); bar.innerHTML = "";
    State.allies.slice(0, maxAllies()).forEach(id => {
      const rival = DATA.rivals.find(r => r.id === id);
      const chip = document.createElement("button");
      chip.className = "ally-chip " + (B.alliesUsed[id] ? "used" : "ready");
      chip.innerHTML = `<img src="assets/${rival.id}.png" class="ally-face" onerror="this.remove()"> 🤝 <b>${rival.name}</b>: ${rival.allySkill.name}<br><small>${rival.allySkill.desc}</small>`;
      chip.onclick = () => useAlly(rival);
      bar.appendChild(chip);
    });
  }

  function useAlly(rival) {
    if (B.over || B.alliesUsed[rival.id]) return;
    B.alliesUsed[rival.id] = true;
    AudioSys.good();
    switch (rival.id) {
      case "madame_vex": B.block += 99; blog(`🌹 ${rival.name}: Rose Parry! Next hit blocked & countered.`); break;
      case "chef_bramble": dealEnemy(8); B.enemyDebuff -= 2; blog(`🔥 Chef Bramble's Flavor Bomb! 8 dmg, foe weakened.`); break;
      case "admiral_nell": healPlayer(8); B.block += 3; blog(`🌊 Admiral Nell: Deep Cover. +8 HP, +3 block.`); break;
    }
    renderAlliesBar(); updateBattleUI();
  }

  // WS-2: Execute an ally combo
  function executeAllyCombo(combo) {
    if (B.over) return;

    // Check if any of the allies for this combo are already used
    const anyAllyUsed = combo.allies.some(allyId => B.alliesUsed[allyId]);
    if (anyAllyUsed) {
      blog(`🚫 Cannot use ${combo.name}: one or more allies already used this turn.`);
      return;
    }

    // Mark combo allies as used for the turn
    combo.allies.forEach(allyId => { B.alliesUsed[allyId] = true; });

    let dmg = Math.round(combo.baseDmg * combo.multiplier);
    blog(`✨ ${combo.name}! You deal <b>${dmg}</b> damage.`);
    dealEnemy(dmg);

    // Apply additional effects
    if (combo.effect) {
      if (combo.effect.healPlayer) { healPlayer(combo.effect.healPlayer); blog(`❤️ You heal for ${combo.effect.healPlayer} HP!`); }
      if (combo.effect.enemyDebuff) { B.enemyDebuff += combo.effect.enemyDebuff; blog(`📉 Enemy attack reduced by ${Math.abs(combo.effect.enemyDebuff)}!`); }
      if (combo.effect.block) { B.block += combo.effect.block; blog(`🛡️ You gain ${combo.effect.block} block!`); }
    }
    AudioSys.good(); Chip.combo(); // Assuming Chip.combo() exists
    endPlayerAction();
  }

  function blog(m) { log(m, "battle-log"); }
  function healPlayer(n) {
    State.hp = clamp(State.hp + n, 0, State.maxHp);
    State.displayHp = State.hp; // Update display HP instantly on heal for now, will animate later
    AudioSys.heal();
  }
  function dealEnemy(n) {
    B.ehp -= n;
    B.displayEhp = B.ehp; // Update display HP instantly on damage for now, will animate later
    const holder = $("enemy-canvas").parentElement;
    holder.classList.remove("flash-dmg"); void holder.offsetWidth; holder.classList.add("flash-dmg");
    AudioSys.hit(); Chip.hitStinger();
    floatDmg(n, holder);
  }
  // floating damage numbers over a battle unit
  function floatDmg(n, holder) {
    if (!holder) return;
    const s = document.createElement("div"); s.className = "dmg-float"; s.textContent = "-" + n;
    holder.style.position = holder.style.position || "relative";
    s.style.left = (35 + Math.random()*30) + "%"; s.style.top = "10%";
    holder.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }

  function updateBattleUI() {
    const e = DATA.enemies[B.enemyKey];
    $("enemy-name").textContent = e.name;
    $("enemy-hp").style.width = clamp(B.displayEhp / B.emax * 100, 0, 100) + "%"; // WS-2: Use displayEhp
    $("enemy-hp-text").textContent = `${Math.max(0, Math.round(B.displayEhp))}/${B.emax}`;
    $("enemy-intent").textContent = B.over ? "" : intentText();
    $("player-hp").style.width = clamp(State.displayHp / State.maxHp * 100, 0, 100) + "%"; // WS-2: Use displayHp
    $("player-hp-text").textContent = `${Math.max(0, Math.round(State.displayHp))}/${State.maxHp}`;
    $("player-buffs").textContent =
      (B.block ? (B.block > 50 ? "🛡️ parry ready " : `🛡️${B.block} `) : "") +
      (B.charge ? "⚡charged " : "") + (B.enemyDebuff ? `foe atk ${B.enemyDebuff}` : "");
  }

  function playerTurn() {
    if (B.over) return;
    const actions = $("battle-actions"); actions.innerHTML = "";

    const weaknessMultiplier = getPlayerDishWeaknessMultiplier();
    mkBtn(actions, "⚔️ Strike", "btn-primary", () => {
      let dmg = rand(4, 7) + (B.charge ? 6 : 0);
      dmg = Math.round(dmg * weaknessMultiplier); // Apply weakness multiplier
      if (B.charge) { blog(`⚡ RELEASE! Star-charged strike for <b>${dmg}</b>! (x${weaknessMultiplier} Weakness!)`); Chip.thunder(); }
      else blog(`⚔️ You strike for <b>${dmg}</b>! (x${weaknessMultiplier} Weakness!)`);
      dealEnemy(dmg);
      endPlayerAction();
    });
    mkBtn(actions, "⚡ Charge Shot", "", () => {
      B.charge = true; blog(`⚡ You channel starlight into your spatula...`);
      endPlayerAction();
    }, B.charge);

    // WS-2: Ally Combos
    getActiveAllyCombos().forEach(combo => {
      // Check if allies required for this combo are already used this turn
      const isUsed = combo.allies.some(allyId => B.alliesUsed[allyId]);
      mkBtn(actions, `✨ ${combo.name} (${combo.allies.map(id => DATA.rivals.find(r => r.id === id).emojiKey).join('')})`, "btn-purple", () => {
        executeAllyCombo(combo);
      }, isUsed);
    });

    Object.entries(State.dishes).forEach(([id, n]) => {
      if (n <= 0) return;
      const r = DATA.recipes.find(x => x.id === id);
      const q = State.flags["q_" + id] || 3;
      const healAmt = 3 + q * 3;
      mkBtn(actions, `${r.emoji} Serve (+${healAmt}❤️)`, "btn-teal", () => {
        State.dishes[id]--; if (State.dishes[id] <= 0) delete State.dishes[id];
        healPlayer(healAmt); blog(`${r.emoji} ${r.name} — restore <b>${healAmt}</b> HP. The enemy hesitates, moved.`);
        endPlayerAction();
      });
    });
    if (!DATA.enemies[B.enemyKey].boss)
      mkBtn(actions, "🏃 Retreat", "", () => {
        blog("🏃 You slip away.");
        B.over = true;
        if (chance(.5)) { const loss = rand(3, 8); State.hp = Math.max(1, State.hp - loss); blog(`Took ${loss} escaping.`); }
        updateHUD();
        if (B.onFlee) B.onFlee(); else Hub.open();
      });
  }

  function mkBtn(parent, label, cls, fn, disabled) {
    const b = document.createElement("button");
    b.className = "btn " + cls; b.textContent = label; b.disabled = !!disabled; b.onclick = fn;
    parent.appendChild(b);
  }

  function endPlayerAction() {
    updateBattleUI();
    if (B.ehp <= 0) return winBattle();
    setTimeout(enemyTurn, 650);
  }

  function enemyTurn() {
    if (B.over) return;
    const e = DATA.enemies[B.enemyKey];
    const intent = B.intent;
    if (intent.kind === "charge") {
      B.chargeEnemy = true;
      blog(`🔮 The ${e.name} gathers terrible energy...`);
    } else {
      let dmg = intent.dmg + (B.chargeEnemy ? 8 : 0) + (B.enemyDebuff || 0);
      B.chargeEnemy = false;
      if (B.block > 50) {
        blog(`🌹 Madame Vex's Rose Parry blocks it and counters for 4!`);
        dealEnemy(4); B.block = 0;
      } else {
        dmg = Math.max(1, dmg - B.block);
        B.block = Math.max(0, B.block - intent.dmg);
        State.hp = Math.max(0, State.hp - dmg);
        blog(`💢 ${e.name} hits you for <b>${dmg}</b>.`);
        const holder = $("player-battle-canvas").parentElement;
        holder.classList.add("shake"); setTimeout(() => holder.classList.remove("shake"), 450);
      }
      if (intent.kind === "heavy") Chip.thunder();
    }
    B.intent = rollIntent(e);
    updateBattleUI();

    if (B.isThor) {
      const frac = B.ehp / B.emax;
      const idx = frac <= .25 ? 2 : frac <= .6 ? 1 : 0;
      if (idx > B.phaseIdx) {
        B.phaseIdx = idx;
        Story.show("⚡", [{ speaker: "BARON VOLT", text: DATA.thorPhases[idx].line }], () => { playerTurn(); });
        updateHUD();
        if (State.hp <= 0) loseBattle();
        return;
      }
    }
    updateHUD();
    if (State.hp <= 0) return loseBattle();
    playerTurn();
  }

  function winBattle() {
    B.over = true;
    const e = DATA.enemies[B.enemyKey];
    const money = rand(e.money[0], e.money[1]) + (isNight() ? rand(5, 15) : 0);
    State.money += money;
    let lootTxt = "";
    if (e.loot) Object.entries(e.loot).forEach(([ing, n]) => { addInv(ing, n); lootTxt += `, +${DATA.ingredients[ing].emoji}×${n}`; });
    Chip.victoryFanfare();
    blog(`🏆 ${e.name} defeated! +💰${money}${lootTxt}`);

    if (e.final) {
      setTimeout(() => Story.show("👑", [
        { speaker: "", text: "Baron Volt sinks into his chair. His cravat wilts like a defeated soufflé." },
        { speaker: "BARON VOLT", text: "Well fought... chef. The jewels were never mine to keep. The Kettle sings again — and honestly? Your ceviche SLAPS." },
        { speaker: "Nimbus Quill", text: "Come to the reopening. Black tie. Bring the cape — we'll find it something to match." },
        { speaker: "", text: "✨ THE GREAT KETTLE IS RELIT. Across three worlds, food tastes like food again. Forklore crashes from the traffic. Your worms are declared national treasures. ✨" },
        { speaker: "THE END", text: "Nimbus Quill, last of the Vessari Gourmand Nomads — first of the new feast. Thanks for playing STARLIGHT SUPPER." },
      ], () => { toast("👑 YOU WIN!", "gold"); Hub.open(); }), 700);
      return;
    }
    // after a field win, return control to whoever started the fight
    setTimeout(() => {
      updateHUD();
      if (B.onWin) B.onWin();
      else Hub.open();
    }, 900);
  }

  function loseBattle() {
    B.over = true;
    Chip.defeatSting();

    if (B.enemyKey === "volt") {
      // WS-2: Tiered defeat vs Volt
      let lostJewel = null;
      if (State.jewels.length > 0) {
        const randomIndex = Math.floor(Math.random() * State.jewels.length);
        lostJewel = State.jewels.splice(randomIndex, 1)[0]; // Remove a random jewel
      }
      const jewelText = lostJewel ? `You lost the ${DATA.jewels[lostJewel]}! You must re-win it.` : "Your jewels remain untouched, for now...";

      setTimeout(() => Story.show("😬", [
        { speaker: "BARON VOLT", text: "Hmph. A mere setback, culinary cadet. Your efforts are... adorable. The galaxy shall hear of this." },
        { speaker: "", text: `You wake at your shelter, tasting defeat. Baron Volt has posted a mocking Forklore thread. ${jewelText}` },
      ], () => {
        State.hp = Math.max(1, Math.round(State.maxHp * .5)); // Still some HP loss
        State.money = Math.round(State.money * .7); // Still some money loss
        State.planet = null;
        window.__battleThor = false;
        updateHUD(); Hub.open();
      }), 600);

    } else { // Generic lose battle for other enemies
      setTimeout(() => Story.show("💀", [
        { speaker: "", text: "Everything goes starry. You wake at your shelter, worm-monitored and bandaged. Half your money paid the medical worms." },
      ], () => {
        State.hp = Math.max(1, Math.round(State.maxHp * .5));
        State.money = Math.round(State.money * .7);
        State.planet = null;
        window.__battleThor = false;
        updateHUD(); Hub.open();
      }), 600);
    }
  }

  // WS-2: Rolling HP Animation Loop
  function animateHpBars() {
    if (!B || B.over) { // Stop animating if battle is over or not active
      window.cancelAnimationFrame(B.hpAnimFrame);
      B.hpAnimFrame = null;
      return;
    }

    const speed = 0.08;
    if (window.__battleKind === "fight") {
      B.displayEhp += (B.ehp - B.displayEhp) * speed;
      State.displayHp += (State.hp - State.displayHp) * speed;
      if (Math.abs(B.ehp - B.displayEhp) < 0.1) B.displayEhp = B.ehp; // Snap to target
      if (Math.abs(State.hp - State.displayHp) < 0.1) State.displayHp = State.hp; // Snap to target
    } else if (window.__battleKind === "tea") {
      T.displayDelight += (T.delight - T.displayDelight) * speed;
      if (Math.abs(T.delight - T.displayDelight) < 0.1) T.displayDelight = T.delight; // Snap to target
    }

    // Only update UI if there's a significant difference or it's snapped to target
    if (B.displayEhp !== B.ehp || State.displayHp !== State.hp) {
      updateBattleUI(); // This function will be modified to use displayHps
    }

    B.hpAnimFrame = window.requestAnimationFrame(animateHpBars);
  }

  // WS-2: Rival Palate Weaknesses - Check player's dishes for a weakness match
  function getPlayerDishWeaknessMultiplier() {
    const enemy = DATA.enemies[B.enemyKey];
    if (!enemy || !enemy.weakTag) return 1.0;

    for (const dishId in State.dishes) {
      if (State.dishes[dishId] > 0) { // If player has at least one of this dish
        const recipeTags = DATA.getRecipeIngredientTags(dishId);
        if (recipeTags.includes(enemy.weakTag)) {
          return 1.5;
        }
      }
    }
    return 1.0;
  }

  return { start };
})();

/* ================= TEA PARTY ================= */
const TeaParty = (() => {
  let T = null;

  function start(rivalId, onDone) {
    window.__battleKind = "tea"; window.__battleThor = false;
    const rv = DATA.rivals.find(r => r.id === rivalId);
    // already an ally? friendly visit, no duel
    if (State.allies.includes(rivalId)) {
      Story.show("🤝", [
        { speaker: rv.name, text: pick(["Back for a spot of tea between adventures? Sit, sit!", "My favorite table-crasher! The kettle is still warm.", "You again! Excellent. I made too many scones anyway."]) },
      ], () => { updateHUD(); (onDone || (() => Hub.open()))(true); });
      return;
    }
    T = { rv, delight: 20, target: 70, displayDelight: 20, fauxPas: 0, over: false, onDone, round: 1 }; // WS-2: Rolling HP - displayDelight init
    Story.show("🍵", [
      { speaker: "", text: `An engraved invitation materializes: "You are cordially DUEL-challenged."` },
      { speaker: rv.name, text: rv.intro },
    ], begin);
  }

  function begin() {
    $("enemy-name").textContent = T.rv.name;
    $("enemy-hp").style.background = "linear-gradient(90deg,#4ecdc4,#95e06c)";
    $("enemy-intent").textContent = "☕ Tea duel — fill DELIGHT to 70! 4 mistakes = lose";
    setRivalArt();
    $("battle-allies").innerHTML = "";
    log(`🍵 Tea party vs ${T.rv.name}!`, "battle-log");
    showScreen("screen-battle");
    renderActions(); updateUI();
    animateHpBars(); // WS-2: Start animation for Tea Party
  }

  function setRivalArt() {
    const canvas = $("enemy-canvas");
    const img = new Image();
    img.onload = () => { canvas.style.display = "none"; let el = canvas.parentElement.querySelector(".art-img");
      if (!el) { el = document.createElement("img"); el.className = "art-img"; canvas.parentElement.appendChild(el); }
      el.src = "assets/" + T.rv.id + ".png"; };
    img.onerror = () => { canvas.style.display = ""; Art.drawCharacter(canvas, T.rv.emojiKey); };
    img.src = "assets/" + T.rv.id + ".png";
    const pc = $("player-battle-canvas");
    const pi = new Image();
    pi.onload = () => { pc.style.display = "none"; let el = pc.parentElement.querySelector(".art-img");
      if (!el) { el = document.createElement("img"); el.className = "art-img"; pc.parentElement.appendChild(el); }
      el.src = "assets/nimbus.png"; };
    pi.onerror = () => { pc.style.display = ""; Art.drawCharacter(pc, "nimbus"); };
    pi.src = "assets/nimbus.png";
  }

  function updateUI() {
    $("enemy-hp").style.width = clamp(T.displayDelight / T.target * 100, 0, 100) + "%"; // WS-2: Use displayDelight
    $("enemy-hp-text").textContent = `Delight ${Math.round(T.displayDelight)}/${T.target}`;
    $("enemy-intent").textContent = `Faux Pas: ${"💥".repeat(T.fauxPas) || "none"} · Round ${T.round}`;
    $("player-hp").style.width = clamp(State.hp / State.maxHp * 100, 0, 100) + "%";
    $("player-hp-text").textContent = `${State.hp}/${State.maxHp}`;
    $("player-buffs").textContent = "";
  }

  function renderActions() {
    const actions = $("battle-actions"); actions.innerHTML = "";
    [
      { label: "🫖 Perfect Pour — safe, good", risk: .10, gain: [14, 22], flavor: "You pour an arc of amber perfection. Silence. Then awe." },
      { label: "💐 Compliment Their Spread — very safe, small", risk: .04, gain: [9, 15], flavor: "\"The clotted cream is... transcendent.\" They try not to smile. They fail." },
      { label: "🗣️ Spicy Gossip — risky, BIG", risk: .22, gain: [20, 32], flavor: "One devastating rumor about the Galactic Food Council. Teacups RATTLE." },
      { label: "🧘 Pinky Pivot Maneuver — risky, big", risk: .16, gain: [16, 26], flavor: "The forbidden sipping technique, executed flawlessly." },
    ].forEach(m => {
      const b = document.createElement("button"); b.className = "btn btn-primary"; b.textContent = m.label;
      b.onclick = () => doMove(m); actions.appendChild(b);
    });
  }

  function getRandomDishTag() {
    const tags = ["sweet", "spicy", "savory", "seafood", "earthy"]; // All possible dish tags
    return pick(tags);
  }

  function doMove(m) {
    if (T.over) return;
    if (chance(m.risk)) {
      T.fauxPas++;
      T.delight = Math.max(0, T.delight - rand(4, 8));
      T.displayDelight = T.delight; // Update display instantly for now
      AudioSys.bad(); Chip.fauxPas();
      log(`💥 FAUX PAS (${T.fauxPas}/4)! ${pick(["Your pinky betrays you.", "You slurp audibly. A pin drops.", "Wrong spoon. THE WRONG SPOON.", "You called it 'chai'. It was not chai."])}`, "battle-log");
      $("player-battle-canvas").parentElement.classList.add("shake");
      setTimeout(() => $("player-battle-canvas").parentElement.classList.remove("shake"), 450);
    } else {
      let g = rand(m.gain[0], m.gain[1]);
      // WS-2: Rival palate weaknesses (simplified for Tea Party)
      const servedTag = getRandomDishTag();
      if (T.rv.weakTag && servedTag === T.rv.weakTag) {
        g = Math.round(g * 1.5);
        log(`☕ +${g} Delight (WEAKNESS HIT!) (${T.delight}/${T.target})! ${m.flavor}`, "battle-log");
      } else {
        log(`☕ +${g} Delight (${T.delight}/${T.target})! ${m.flavor}`, "battle-log");
      }
      T.delight = Math.min(T.target, T.delight + g);
      T.displayDelight = T.delight; // Update display instantly for now
      AudioSys.good(); Chip.delightBurst(Math.floor(T.delight / 20));
    }
    T.round++; updateUI();
    if (T.delight >= T.target) return win();
    if (T.fauxPas >= 4) return lose();
    if (chance(.2)) {
      State.hp = Math.max(1, State.hp - rand(1, 2));
      log(`${T.rv.name} executes a withering sip-judgment.`, "battle-log");
      updateUI();
    }
  }

  function win() {
    T.over = true;
    const rv = T.rv;
    if (!State.allies.includes(rv.id)) State.allies.push(rv.id);
    Chip.victoryFanfare();
    log(`🏆 ${rv.name} joins your cause!`, "battle-log");
    Story.show("🤝", [
      { speaker: rv.name, text: rv.winLine },
      { speaker: "", text: `🎉 ALLY JOINED: ${rv.name}, ${rv.title}. Skill: ${rv.allySkill.name} (${rv.allySkill.desc}).` },
    ], () => { updateHUD(); (T.onDone || (() => Hub.open()))(true); });
  }

  function lose() {
    T.over = true;
    AudioSys.bad(); Chip.fauxPas();
    Story.show("😬", [
      { speaker: T.rv.name, text: "...We shall speak again when you have learned which fork cries." },
      { speaker: "", text: "You are politely escorted off the premises. Find them again for a REMATCH!" },
    ], () => { updateHUD(); (T.onDone || (() => Hub.open()))(false); });
  }

  return { start };
})();
