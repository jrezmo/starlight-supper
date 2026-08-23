# WS-8: Live-Action Kitchen Service — Design Spec

**Status:** SPEC — ready to hand to a worker once WS-11 lands. Part of MERGED-GAME-PLAN.md (v2).
**Goal:** Answer the playtest's core complaint (Jeanne: "physically work at the restaurant, serve
customers in real time") with a Dave-the-Diver-style service floor in our art style.

---

## 1. Screen & Scene

New screen `screen-service`, new file `js/service.js` (~600–900 lines expected), entry button on the
hub ("🍳 Open for Service") available during DAY phase only. Canvas-rendered side-view scene:

```
┌──────────────────────────────────────────────┐
│  [day/fame header]      [shift timer ring]   │
│  entrance    tables(2-6)        counter/pass │
│   🚪  🧍→  🪑🧍   🪑🧍   ┌──────────────┐     │
│                              │ pass (dishes)│     │
│         Nimbus walk zone →   └──────────────┘     │
│              kitchen door (prep pickup)          │
└──────────────────────────────────────────────┘
```

- **Layout:** fixed logical resolution 960×540, scaled to viewport (existing pattern).
- **Walk zones:** floor strip for Nimbus + customers; counter strip behind the pass for helpers.
- **Rendering:** reuse `art.js` sprite approach; Nimbus uses player sprite w/ palette from State.cosmetics (WS-10 hooks later).

## 2. Entities & State Machine

**Customer:** `spawning → entering → seated_thinking → ordered(waiting, patience ring) → eating → leaving`
- Spawn interval scales DOWN with day count + follower count (fame = more traffic). Cap concurrent
  customers by unlocked tables (start 2 tables, +1 per shelter guest-hall level).
- Order = dish icon bubble referencing a recipe the player can cook today (sampled from cooked-today dishes first).
- **Patience:** 20s base ± difficulty; drains as a visible ring. Empty patience → leaves, satisfaction 0,
  mild Forklore review penalty.

**Dish on the pass:** each cooking session that day deposits its finished dish here (quality stored).
Carrying: Nimbus picks up (tap/press near pass) → carries one dish → deliver to matching customer.
Wrong-dish delivery: customer rejects (small patience hit) — teaches attention.

**Nimbus:** `idle → walking → carrying → delivering`. Speed constant; carrying slightly slower.

## 3. Shift Loop

1. Pre-shift panel shows: dishes prepped today (quality bars), tables open, ally staff on duty. "Open Doors" starts.
2. Shift length: **90 seconds** (timer ring top-right). Dusk warning banner at end ties into existing day cycle.
3. End-of-shift tally overlay: per-customer satisfaction breakdown → converts to likes + money
   (formula below) → posts a Forklore digest entry. Returns to hub; day advances via normal flow.

**Payout formula:** `likes = Σ(dish.baseLikes × quality × speedBonus × demandMult)` where
`quality` = cooking result (0.6–1.5 from existing minigame), `speedBonus` = 1 + 0.3×(patience remaining %),
`demandMult` = WS-3 demand triad when it lands (1.0 until then). Money ≈ likes ÷ 4. This REPLACES
the current instant post payout on days you open for service (posting remains for days you don't).

## 4. Ally Helpers (recruited rivals staff stations)

| Ally | Station | Effect |
|---|---|---|
| Madame Vex | Hostess | Customers seat 40% faster; +10% base patience |
| Chef Bramble | Kitchen | Auto-delivers one cooked dish to the pass every 15s |
| Admiral Nell | Runner | Delivers any pass dish to a waiting customer every 12s |

Helpers are passive timers with visible sprites — no AI pathing needed. Each visibly changes shift outcomes (verification criterion).

## 5. Escalation Curve

- Day 1 service: 2 tables, single-course orders.
- Guest hall lv2+: 3rd table. After first recruit: multi-course orders (2 dishes per customer, sequenced).
- Late game: bussing — dirty plates must be dragged to wash bin before table re-seats (adds a second carry loop).

## 6. Controls (parity required)

- Keyboard: arrows/WASD move, E/Space interact (pickup/deliver contextual).
- Touch: virtual stick (reuse existing touch-stick component), tap target to interact.
- No pointer-lock or hover-dependent UI.

## 7. Failure & Tone

No fail state. Unhappy customers leave mild reviews ("Cold tart, colder stare.") on the Forklore log;
great runs feed the Star Chef streak (WS-1, already shipped). Cozy pressure, never punishment.

## 8. Implementation Notes / Pitfalls

- Single rAF loop scoped to the service screen; must pause when menu overlay opens and fully stop on exit (no leaked intervals — audit on review).
- All timings in delta-time, not frame counts (mobile Safari throttling).
- Save data: nothing persists mid-shift; if page closes mid-shift, treat as "closed early" (no payout, no penalty) on reload.
- Keep customer sprites simple (palette-swapped blob-folk à la existing enemy canvas art).
- Audio: reuse chip.js cues (order chime, delivery ding, leaving sigh); respect mute setting.
- Cache-bust ?v= bump on all touched files in index.html.

## 9. Done When (acceptance)

1. Full playable 90s shift start→tally at stable framerate on mobile Safari + desktop Chrome.
2. Dish quality demonstrably changes payout (two shifts, different qualities, compare tally numbers).
3. At least one recruited ally visibly changes shift flow.
4. Wrong-dish rejection works; empty-patience departure works; both logged to Forklore digest.
5. Save/reload around a shift leaves state consistent; no console errors either path.
