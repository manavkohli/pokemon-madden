# ERD: Gym Challenge and Contact Clash

**Date:** 2026-10-09 · **Status:** Contact Clash (Feature 2) built with `CLASH_BAND` = 2 (27.6% of scrimmage plays, 500 games; points per game 28.69 off, 30.14 on; fumbles 0.55 off, 0.78 on); Gym Challenge (Feature 1) built · **Scope:** a new DOM-free `League` class in `src/game/`, evolution data in `scrape_pokedex.py`, a two-step snap in `FootballGame`, a contact pause in `BattleMotion`/`BattleStage`, and new league and clash screens in `GameApp`.

## Goal

Two features turn a single exhibition game into a game with stakes before the snap and after it. **Gym Challenge** is a 13-game Kanto campaign: your drafted roster gains experience, evolves, and carries forward from gym to gym against type-themed leaders. **Contact Clash** makes the battle scene interactive: on close plays the animation stops at contact, and both coaches pick a carrier or defender action that decides the yards after contact.

## Evidence

| Fact | Source |
| --- | --- |
| Every game is a standalone exhibition. Nothing persists between games; no code reads or writes browser storage. | `src/ui/app.js` (no `localStorage` use anywhere in `src/`) |
| The catalog has 251 Pokémon. Type counts: Water 50, Flying 38, Poison 37, Normal 37, Grass 24, Ground 24, Psychic 24, Fire 22, Bug 22, Rock 18, Electric 17, Fighting 11, Ice 10, Steel 6, Dark 6, Ghost 4, Dragon 4. A team holds 31 players, so no type fills a full roster alone. | `pokemon_gen1_2.json` |
| PokeAPI serves evolution chains with a trigger and a level: Bulbasaur → Ivysaur at `min_level` 16 by `level-up`. Each species links to its chain (`pokemon-species/25` → `evolution-chain/10`, `evolves_from_species` Pichu). | `pokeapi.co/api/v2/evolution-chain/1`, pulled 2026-10-09 |
| The engine resolves the whole play in one `snap()` call, and the animation only displays it. Contact happens at progress 0.56. | `src/game/football.js` (`snap`), `src/ui/battle/motion.js` (`CONTACT`) |
| The tackle contest already exists as a number (`tackle` margin) and already sets yards after contact and fumble odds. | `src/game/matchup.js` |
| The trainer and stadium SVGs in `assets/` are original artwork. | `README.md` credits |

## Hard invariants

- `FootballGame` and `League` resolve every outcome. The animation and the UI never compute a result.
- All randomness in a game, a clash, and a league uses the injected `random`, so a seeded test reproduces a full circuit.
- `src/game/` stays free of the DOM and of storage. `GameApp` owns the save file.
- The game plays fully with no save: a blocked or empty `localStorage` starts a fresh circuit, and every read and write sits in `try/catch`.
- A clash never changes a result that was decided before contact: a sack, stuff, incompletion, interception, or pre-contact fumble resolves exactly as today.
- Pause, skip, cancellation, and reduced motion stay coherent through the clash pause, because the clash pause lives on the `BattleStage` clock.

## Feature 1: Gym Challenge

### The circuit

The circuit is 13 games in a fixed order: Brock (Rock), Misty (Water), Lt. Surge (Electric), Erika (Grass), Koga (Poison), Sabrina (Psychic), Blaine (Fire), Giovanni (Ground), then the Elite Four (Lorelei Ice, Bruno Fighting, Agatha Ghost, Lance Dragon) and the Champion (your rival, no type). A win earns the badge and opens the next game. A loss lets you retry the same leader with no penalty except the lost experience bonus. Winning the Champion game ends the circuit and shows the Hall of Fame: your 31 players at their final evolutions.

### Leader rosters

A leader's roster starts from a type core: up to 12 Pokémon of the leader's type, the highest-rated at their best positions, within 60% of the leader's credit cap. The existing `Roster.random()` rule fills the remaining slots with the rest of the cap. The core keeps the identity (Agatha's 4 Ghost types are her stars) and the fill keeps a full, legal 31-player team. Each leader's cap comes from the balance simulation (Tuned values), so early gyms are winnable with a starter roster.

Each leader has a play style: Brock and Giovanni favor runs, Misty and Lt. Surge favor passes, Koga and Agatha favor blitzes and trick plays, and the rest stay balanced. The style adds a fixed bonus to its group in the CPU call score, so the CPU still reacts to down, distance, and clock.

### Your roster across the circuit

You draft once at the start, under 13,000 credits. Your roster carries forward: players, movesets, and levels.

- **Levels.** Every drafted player starts at the lowest level of its evolution stage (a base form at 5, a middle form at the level it evolved, a final form at 40). After each game, each player gains levels from its impact: 1 level per 10 yards gained, 3 per touchdown, 1 per tackle, 2 per sack or interception, and 1 per move hit, scaled by 0.4 and rounded, plus 1 for every player on the winning team. Impact comes from the drive log and `result.participants`, which the engine already records.
- **Evolution.** A player evolves when its level reaches the PokeAPI `min_level`. Badges award evolution stones: Misty the Water Stone, Lt. Surge the Thunder Stone, Erika the Leaf Stone, Blaine the Fire Stone, Sabrina the Moon Stone. A stone evolves one player of your choice on the post-game screen. Trade evolutions (Kadabra, Machoke, Graveler, Haunter, and others) evolve when that player is the game MVP. Friendship evolutions (Pichu, Cleffa, Igglybuff, Togepi, Golbat, Chansey) evolve after 5 games played. Eevee takes the stone you give it.
- **What an evolution changes.** The player takes the evolved species' base stats, types, sprite, and learnset. It keeps every known move that the new species still learns; the freed slots fill by the default-moveset rule. Its salary rises to the new species' salary.
- **The transfer window.** Between games you swap up to 3 players with the free-agent pool, and the full roster must fit the next game's cap. Evolution raises salaries, so a strong evolved core forces you to trade depth for stars. That decision is the strategy layer of the circuit.

### Ownership and save

`League` (new, `src/game/league.js`) owns the circuit: the leader list, badges, levels, experience, evolutions, stones, and the transfer-window rule. `FootballGame` stays a single game and receives the two rosters. `League.toJSON()` and `League.fromJSON()` produce the save; `GameApp` writes it to `localStorage` after every game and reads it at load. One save slot exists, with a **New circuit** button that confirms before it deletes the save.

The scraper adds each Gen 1–2 species' evolution: the target species, trigger, `min_level`, and item. Evolutions into Gen 3+ species are dropped, so the data holds only the 251 catalog Pokémon.

### Screens

- **League map:** the badge case, the next leader card with an original trainer portrait in the existing art style, the leader's type and style, and **Challenge**.
- **Post-game report:** per-player experience bars, level-ups, and the evolution sequence ("What? Pikachu is evolving!") drawn on the `BattleStage` clock and skippable.
- **Transfer window:** the existing draft screen with a 3-swap counter and the next leader's cap.

### Tuned values

Source: `node scripts/league-balance.cjs 200 0` with clashes on, CPU coaching both sides, the human side on its auto clash action, a 13,000-credit starting roster drafted from the evolvable pool, no transfers, 12 tries per leader. The player's payroll cap is 13,000 plus 1,000 per badge. Gain formula: box-score impact scaled by `IMPACT_SCALE` 0.4 and rounded, plus `WIN_BONUS` 1.

| Leader | Cap | Style | Target win % | Win % per game | First-try win % |
| --- | --- | --- | --- | --- | --- |
| Brock | 9,800 | run | 80 | 81 | 84 |
| Misty | 9,600 | pass | 76 | 77 | 80 |
| Lt. Surge | 9,500 | pass | 73 | 77 | 78 |
| Erika | 10,075 | run | 69 | 63 | 62 |
| Koga | 9,800 | pressure | 65 | 67 | 72 |
| Sabrina | 9,900 | balanced | 61 | 57 | 63 |
| Blaine | 12,300 | balanced | 58 | 54 | 58 |
| Giovanni | 13,900 | run | 54 | 51 | 53 |
| Lorelei | 13,000 | balanced | 50 | 48 | 57 |
| Bruno | 15,500 | balanced | 46 | 44 | 48 |
| Agatha | 14,200 | pressure | 43 | 37 | 37 |
| Lance | 15,800 | balanced | 39 | 35 | 43 |
| Rival | 17,100 | balanced | 35 | 35 | 44 |

Every leader sits within 6 points of its linear target. Erika's win rate jumps from 87% to 51% between caps of 10,072 and 10,075 (one star leaves her core), so her style is `run` to land at 63%. 93% of circuits finish. 64% of the 31 starting players evolve at least once (68% of the 22 starters). With 3 upgrade transfers per window, win rates reach 85% at Brock and 96-100% from Misty on, so transfers decide the circuit.

## Feature 2: Contact Clash

### When a clash happens

A clash happens on a run or a completed pass that reaches contact with a close tackle contest: the tackle margin is within ±2 points (`FootballGame.CLASH_BAND`, tuned in track 5). Third and fourth down conversion attempts that reach contact always clash. Every other play resolves exactly as today. The target rate is one clash in four scrimmage plays; track 5's simulation measures the rate and sets the margin band to hit it.

### The two-step snap

`FootballGame.snap()` resolves the play up to contact. On a clash, it returns the result with `clash: { carrier, tackler, edge }` and holds the pending play. `FootballGame.resolveClash(offenseAction, defenseAction)` finishes it: it applies the clash yards, then runs the rest of the existing pipeline (move effects, `moveBall`, the clock, `finishSnap`). The game rejects any other call while a clash is pending. A play with no clash takes the same single-step path as today, so the engine has one resolution pipeline that pauses at one point.

### The actions

The carrier picks one of three actions and the tackler picks one of three:

| Carrier ↓ / Tackler → | Wrap Up | Big Hit | Strip |
| --- | --- | --- | --- |
| **Juke** (speed) | tackler wins | carrier wins big | carrier wins |
| **Truck** (attack) | carrier wins | tackler wins big | carrier wins |
| **Cover Up** (HP) | even | even | tackler loses, no fumble |

- **Carrier wins:** extra yards equal to `max(2, round(0.3 × (carrier skill − tackler skill)))`, where each skill is `Roster.skill` in the stat its action names (Juke speed, Truck attack, Cover Up HP; Wrap Up defense, Big Hit attack, Strip speed); **wins big:** double that, and a 1% chance that the carrier breaks away for a touchdown.
- **Tackler wins:** the play loses 2 yards after contact; **wins big:** loses 4, and Big Hit adds 3 points of fumble odds.
- **Strip** against Juke or Truck adds 4 points of fumble odds; against Cover Up it changes nothing and costs the tackler 2 yards of position.
- **Even:** the yards stand as resolved before contact.

Cover Up is the safe action, so a lead late in the game has a clear choice. Paralysis halves Juke's yards, and a confused player's action is replaced at random one time in three, so moves feed the clash.

### The CPU

The CPU picks by stats and memory. It weights each action by the stat that action uses, then shifts weight toward the counter of your most frequent action in your last 5 clashes. A coach who always jukes gets wrapped up.

### Battle presentation

At progress 0.56 the stage holds the contact pose and shows a battle-menu box with three action buttons, keyboard keys 1–3, and a 4-second countdown on the stage clock. With no pick at zero, your player takes the action that its highest relevant stat favors. Pause stops the countdown. Skip before contact jumps to the clash, and skip during the clash does nothing until both actions are in. Both picks then reveal together ("JUKE vs BIG HIT!"), and the animation plays the resolved outcome. Reduced motion keeps the box and the countdown text and drops the hold-pose shake.

## Implementation Tracks

### 1. Evolution data

- **Outcome:** the data files carry each species' evolution target, trigger, level, and item.
- **Contract:** the Ownership and save section; scraper writes JSON and JS together. The roster's types become Gen 2 types from PokeAPI `past_types`, so the 13 Pokémon that the catalog lists as Fairy (Clefairy, Snubbull, and others) take their Gen 2 types and match the Gen 2 type chart.
- **Dependencies:** none.
- **Acceptance:** `tests/test_pokedex.py` asserts that Bulbasaur evolves at 16, Pikachu evolves with the Thunder Stone, Kadabra evolves by trade, and Golbat evolves by friendship; it also asserts that no evolution target has an id above 251, that no Pokémon has the Fairy type, and that Clefairy is Normal.
- **Separate plan:** not required.

### 2. League engine

- **Outcome:** a seeded test plays a full 13-game circuit CPU-against-CPU through `League`, with levels, evolutions, stones, and transfers.
- **Contract:** the circuit, leader rosters, and roster rules above; `toJSON`/`fromJSON` round-trip.
- **Dependencies:** track 1.
- **Acceptance:** tests assert that every leader roster is legal under its cap, that Agatha's roster holds all 4 Ghost types, and that a saved and reloaded league plays the next game identically. A 200-circuit simulation reports the share of starters that evolve at least once (target: 40–70%) and the win rate per gym for a 20,000-credit roster (target: falls from about 80% at Brock to about 35% at the Champion). The numbers go in the commit body.
- **Separate plan:** required. This track adds a durable save format and the cross-game roster lifecycle.

### 3. League screens and save

- **Outcome:** a player starts a circuit, plays it across browser sessions, and finishes in the Hall of Fame.
- **Contract:** the Screens section; the storage invariant.
- **Dependencies:** track 2.
- **Acceptance:** an app test with blocked `localStorage` starts and plays a circuit with no error. Human review: the league map, the post-game report with one evolution, and the transfer window at 1280px and 390px, as headless-Chrome screenshots.
- **Separate plan:** not required.

### 4. Two-step snap

- **Outcome:** the engine pauses close plays at contact and resolves them with `resolveClash`. The UI auto-picks both actions, so play looks the same as today.
- **Contract:** the two-step snap and the action table; the invariant that pre-contact outcomes never change.
- **Dependencies:** none.
- **Acceptance:** seeded tests assert that every cell of the action table produces its stated yards and fumble change; that a sack or incompletion never clashes; that a second snap during a pending clash throws; and that a play with no clash gives the same result as today with the same seed.
- **Separate plan:** required. This track changes the snap contract that the stage, the app, and every test use.

### 5. Clash on stage

- **Outcome:** coaches pick clash actions in the battle scene against the CPU's memory-based picks.
- **Contract:** the CPU and battle presentation sections.
- **Dependencies:** track 4.
- **Acceptance:** battle tests assert that pause freezes the countdown and that skip jumps to the clash and then waits. A 500-game simulation reports the clash rate (target: 20–30% of scrimmage plays) and points per game with clashes on and off; both go in the commit body. Human review: a clash at 1280px and 390px and with reduced motion, as screenshots, plus one game played by hand.
- **Separate plan:** not required.
