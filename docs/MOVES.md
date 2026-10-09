# ERD: Pokémon move sets on plays

**Date:** 2026-10-09 · **Status:** Built · **Scope:** move data in `scrape_pokedex.py`, a new `MoveBook` in `src/game/`, movesets and conditions on `Roster`, move activation on `FootballGame`, move modifiers in `PlayMatchup`, move cues in `BattleMotion`/`BattleStage`, and the draft and pre-snap panels in `GameApp`.

## Goal

Every Pokémon carries up to four moves from its Gen 2 (Crystal) learnset, chosen by the coach at the draft. Before each snap, a coach fires one move from a player in the active unit. The move changes that player's contest on the play, its secondary effect rolls automatically, and lasting effects (paralysis, a raised stat, rain) carry into later snaps. Each move plays a type-colored cue in the battle animation. Moves sit beside the three type abilities (Electric Burst, Steel Shield, Psychic Read) as a separate slot with a separate budget.

## Evidence

| Fact | Source |
| --- | --- |
| The roster data carries only `id`, `name`, `types`, and `base_stats`. No moves exist in the game. | `pokemon_gen1_2.json`, scraped from pokemondb.net/pokedex/all |
| PokeAPI serves all 251 Gen 2 moves with structured mechanics: `power`, `accuracy`, `pp`, `priority`, `damage_class`, `effect_chance`, `stat_changes`, and `meta` (`category`, `ailment`, `ailment_chance`, `flinch_chance`, `drain`, `healing`, `crit_rate`, `min_hits`/`max_hits`). | `pokeapi.co/api/v2/move/1..251`, pulled 2026-10-09 |
| Move categories across the 251 moves: damage 98, damage-ailment 34, unique 31, net-good-stats 26, ailment 19, damage-lower 13, heal 6, field-effect 5, damage-heal 5, damage-raise 4, whole-field-effect 4, ohko 3, force-switch 2, swagger 1. | same pull |
| Crystal learnsets (level-up, TM/HM, tutor, egg) hold 1–65 moves per Pokémon, median 36. | `pokeapi.co/api/v2/pokemon/1..251`, `version_group = crystal` |
| Under the family rules below, 217 of 251 moves map to a football effect. After that filter, the median Pokémon has 29 learnable moves. Nine Pokémon have fewer than four: Caterpie, Weedle, Metapod, Kakuna, Magikarp, Unown, Wobbuffet, Ditto (0), Smeargle (0). | same pull |
| 17 damage moves have no fixed power (Seismic Toss, Flail, Return, Counter, Low Kick, and others). | same pull |
| PokeAPI records the Gen 2–4 type chart through `past_damage_relations` (Steel resists Ghost and Dark before Gen 5). | `pokeapi.co/api/v2/type/steel` |
| `PlayMatchup` reduces every play to three contest margins (`protection`, `separation`, `tackle`) that set the odds and the yard bonus. Abilities add flat values to those margins. | `src/game/matchup.js` |
| Abilities: two charges per half per team, one ability per call, 10 stamina, available only to a typed player in the right role. The CPU fires one on 35% of calls. | `src/game/football.js` (`ABILITIES`, `activateAbility`, `activateCpuAbility`) |
| `Roster.penalty()` turns low stamina into a rating penalty, and `Roster.rotate()` subs out a penalized starter. | `src/game/roster.js` |
| The battle draws four actors and one generic particle burst at contact on the single `BattleStage` clock. | `src/ui/battle/motion.js`, `stage.js` |

## Hard invariants

- `FootballGame` resolves every move effect at the snap. The animation displays the resolved effect and never computes one.
- Every move roll (accuracy, secondary effect, critical hit, multi-hit count) uses the game's injected `random`. A seeded test reproduces a move exactly.
- `src/game/` stays free of the DOM. Move data reaches the browser through the generated `pokemon_gen1_2.js` and reaches Node through `pokemon_gen1_2.json`; `scrape_pokedex.py` writes both in one run.
- One owner per rule. `MoveBook` derives a move's family and magnitude. `Roster` owns each player's moveset and conditions. `FootballGame` owns PP, activation, and field conditions. `PlayMatchup` applies the modifiers.
- A team fires at most one move per call, in addition to at most one ability. Moves never spend ability charges.
- No single move changes a contest margin by more than 30 points. The strongest ability adds 18.
- Pause, skip, cancellation, and reduced motion behave for move cues exactly as for the rest of the play, because move cues draw on the `BattleStage` clock.

## Data: PokeAPI Crystal learnsets and raw mechanics

`scrape_pokedex.py` adds PokeAPI as the move source and keeps pokemondb.net for stats. PokeAPI is the only source with structured mechanics; pokemondb move pages describe effects in prose.

- Each Pokémon gains `moves`: the move ids it learns in the `crystal` version group by any method.
- The data file gains a `moves` catalog of the 251 Gen 2 moves with the raw PokeAPI fields listed under Evidence, and a `types` chart built from the Gen 2 damage relations.
- The scraper stores raw fields only. `MoveBook` derives families in JavaScript, so tests cover the derivation and the browser and Node read the same rule.
- A move with no fixed power uses power 60. `damage_class` comes from PokeAPI as published.

## Movesets: the coach picks four at the draft

`Roster` stores a moveset per player: up to four move ids from that player's learnable moves. Learnable moves are the learnset filtered to moves with a family. A Pokémon with fewer learnable moves carries all of them; Ditto and Smeargle carry none, and their draft card states "No moves".

Every new player receives a default moveset, so `Roster.random()` teams and the CPU are complete without input. The default takes, in order: the strongest same-type (STAB) strike, the strongest strike of a different type, the best status or stat move, and the next-strongest remaining move. The draft detail panel lists every learnable move with its type, family, power, accuracy, and uses per game, and the coach swaps any of the four. Movesets survive a rematch and reset only when the player leaves the roster.

## Activation, PP, and accuracy

A coach fires a move after committing the call, in the same pre-snap panel as abilities. A move is eligible when its player is in the active unit, has at least 20 stamina, and has PP left.

- **PP per game** is `ceil(pp / 5)` for each player's move: Tackle 7 uses, Thunderbolt 3, Hydro Pump 1. PP is per player, so a deep bench of Electric types holds more Thunderbolts.
- **Stamina cost** is 6 for a non-damage move and `6 + round(power / 20)` for a strike (Thunderbolt 11, Hyper Beam 13).
- **The actor takes its role's contest.** On offense, a carrier actor fights the coverage or tackle contest, a passer actor fights completion, and an OL or TE actor becomes the featured blocker. On defense, a DL actor becomes the rusher, and an LB, CB, or S actor becomes the marker on a pass and the tackler on a run. The offense does not know the defensive call before the snap, so this rule guarantees that a fired move always lands, and the move's user always appears in the battle.
- **Accuracy** rolls at the snap. A miss spends the PP and the stamina and changes nothing ("Pikachu's Thunder missed!").
- **Secondary effects** roll automatically when the move hits, at twice the PokeAPI chance, capped at 100%. A game holds about 70 snaps, so a raw 10% paralysis chance on three uses would almost never appear.
- **The CPU** fires a move on 40% of eligible calls and picks its eligible move with the highest default-moveset rank. The rival's move stays hidden until the snap.
- **The drive log** records the move: "Pikachu used Thunderbolt! It's super effective! Starmie is paralyzed."

## Effect families

`MoveBook` assigns each move one family from its PokeAPI `meta.category`, `priority`, `ailment`, and `stat_changes`. The opponent in every rule below is the player paired against the actor in its contest.

| Family | Moves | Football effect |
| --- | --- | --- |
| Strike | all 154 damage-category moves | Adds `power × 0.15` to the actor's contest margin, × 1.5 for STAB, × type effectiveness against the opponent (0, 0.25, 0.5, 1, 2, 4), × the actor's attack skill (physical) or special-attack skill (special) over 70, capped at 30. Priority adds 8. A raised crit rate gives a 25% chance to double the value. Multi-hit moves multiply power by their average hits. Recoil (Take Down, Double-Edge, Submission) costs the actor extra stamina equal to a quarter of the value. Drain moves return half the value as stamina. An unmodeled secondary (Tri Attack) leaves the strike intact. |
| Ailment | Thunder Wave, Sleep Powder, Toxic, Confuse Ray, and the secondary ailment of every strike | Applies a condition to the opponent. |
| Stat | Agility, Swords Dance, Growl, Leer, Sand-Attack, and the stat secondary of every strike | Raises the actor's stat or lowers the opponent's by stages for three of the affected team's snaps. One stage is 6 contest points in the contest that stat feeds; accuracy and evasion stages move completion odds by 4 points. Net stages cap at ±2. |
| Heal | Recover, Soft-Boiled, Milk Drink, Moonlight, Morning Sun, Synthesis | Restores half of the actor's stamina. |
| Field | Reflect, Light Screen, Safeguard, Mist, Haze, Rain Dance, Sunny Day, Sandstorm, Spikes | Sets a field condition (below). |
| Protect | Protect, Detect | On offense, a sack, stuff, fumble, or interception becomes an incomplete pass or no gain. On defense, the play gains at most 5 yards and a longer touchdown run stops at 5. |
| One-hit | Fissure, Horn Drill, Guillotine | 30% accuracy. A hit on offense is a breakaway touchdown; a hit on defense is a turnover (fumble on a run, interception on a pass). Type immunity still applies. |
| Force-switch | Roar, Whirlwind | Sends the opponent to the bench for the next two snaps of their team, replaced by the best rested backup. |

Swagger confuses the opponent and raises its attack two stages. The 34 moves without a family (Transform, Sketch, Metronome, Splash, Substitute, Baton Pass, Attract, Perish Song, and others) never appear in the move picker.

## Conditions: lasting effects on players

`Roster` stores conditions per player beside stamina. A condition counts down on each snap that player's team plays, on the field or on the bench, so a substitution protects the team but does not cure the player. Conditions add to `Roster.penalty()`, so the existing auto-rotation already benches a sleeping or paralyzed starter.

| Condition | Effect | Snaps |
| --- | --- | --- |
| Paralysis | Speed skill −25% | 4 |
| Sleep | Rating −40 | 2 |
| Freeze | Rating −40 | 2 |
| Burn | Attack skill −25%, 3 stamina per snap | 4 |
| Poison | 5 stamina per snap (Toxic: 8) | 5 |
| Confusion | One chance in three per snap that the player's own contest margin drops 15 | 3 |
| Trap | The player cannot leave the unit | 3 |
| Leech Seed | The seeded player loses 4 stamina per snap and the user gains 4 | 5 |

A player holds one of paralysis, sleep, freeze, burn, or poison at a time, as in the games. Confusion, trap, and Leech Seed stack on top. The depth chart, lineup, and battle sprites show a status badge (PAR, SLP, FRZ, BRN, PSN, CNF).

## Field conditions

`FootballGame` stores field conditions and counts them down on every snap.

| Condition | Effect | Snaps |
| --- | --- | --- |
| Reflect | The user's team gains 10 tackle margin against runs and physical strikes | 5 |
| Light Screen | The user's team gains 10 coverage margin against passes and special strikes | 5 |
| Safeguard | The user's team receives no new ailments | 5 |
| Mist | The user's team receives no stat drops | 5 |
| Haze | Clears every stat stage on both teams | instant |
| Rain Dance | Water strikes × 1.5, Fire strikes × 0.5, fumble odds +1 point | 5 |
| Sunny Day | Fire strikes × 1.5, Water strikes × 0.5 | 5 |
| Sandstorm | Every active player not Rock, Ground, or Steel loses 3 stamina per snap | 5 |
| Spikes | Every substitution into the opponent's unit costs the incoming player 10 stamina | rest of the half |

One weather condition is active at a time; new weather replaces the old.

## Animation: eight cue archetypes colored by type

`BattleMotion` gains a move cue in the 0.22–0.50 progress window, before contact at 0.56. The cue comes from the move's family and damage class, colored by the move's type from a 17-color palette. Eight archetypes cover all 217 moves without per-move art:

1. **Beam** (special strike): a projectile from the actor to the opponent. A miss veers off the stage.
2. **Lunge** (physical strike): the actor dashes into the opponent with a type-colored burst.
3. **Aura** (ailment): a colored ring and status icon settle on the opponent.
4. **Arrows** (stat): rising arrows over the actor or falling arrows over the opponent.
5. **Sparkle** (heal): green sparkles rise from the actor.
6. **Bubble** (Protect): a shield forms around the actor and holds through contact.
7. **Field** (screens and weather): a stage-wide layer of rain, sun glare, sand, or a translucent panel. Active weather stays drawn on later plays.
8. **Flash** (one-hit): a white flash at contact.

At contact the round label reads MOVE and the callout states effectiveness: "It's super effective!", "It's not very effective…", or "It doesn't affect Golem…". Reduced motion drops projectiles, overlays, and arrows, and keeps the captions and a static type tint.

## Implementation Tracks

### 1. Move data

- **Outcome:** the data files carry Crystal learnsets, the 251-move catalog, and the Gen 2 type chart.
- **Contract:** the Data section; JSON and JS written in one scraper run.
- **Dependencies:** none.
- **Acceptance:** `tests/test_pokedex.py` asserts 251 moves; every Pokémon has a `moves` list; Pikachu learns `thunderbolt`; Ditto learns only `transform`; Electric against Ground is 0; Steel takes half damage from Ghost.
- **Separate plan:** not required.

### 2. MoveBook and movesets

- **Outcome:** `MoveBook` derives families and magnitudes; `Roster` holds default movesets for every player. No gameplay change.
- **Contract:** the Effect families table and the default-moveset order.
- **Dependencies:** track 1.
- **Acceptance:** a test asserts 217 learnable moves; Tri Attack is a strike with no secondary; Splash has no family; Pikachu's default moveset starts with an Electric strike; a Thunderbolt from a 100-special-attack Electric player into a Water opponent is capped at 30.
- **Separate plan:** not required.

### 3. Strikes on the field

- **Outcome:** coaches and the CPU fire strike moves pre-snap. PP, accuracy, STAB, type effectiveness, the actor-takes-the-contest rule, the log line, the effectiveness callout, and the Beam and Lunge cues ship together. The game is fully playable with default movesets.
- **Contract:** Activation, PP, and accuracy; the Strike family; the margin cap.
- **Dependencies:** track 2.
- **Acceptance:** seeded tests assert that an Electric strike into a Ground opponent changes no margin; that a hit and a miss each spend one PP and the stamina cost; that a defensive CB actor becomes the marker on a pass call; and that a team cannot fire two moves in one call. A 500-game seeded CPU-against-CPU run reports average points per game with and without moves, and both numbers go in the PR. Human review: the battle at desktop and at 390px through the browser checklist, with screenshots of a super-effective hit and a miss.
- **Separate plan:** required. This track changes the phase shape, `PlayMatchup` contest selection, and the battle participants at once.

### 4. Draft move picker

- **Outcome:** the draft detail panel lists learnable moves and lets the coach set four.
- **Contract:** the Movesets section.
- **Dependencies:** track 2.
- **Acceptance:** a test asserts that `Roster` rejects an unlearnable move and a fifth move. Human review: the picker at desktop and 390px, including Magikarp (2 moves) and Ditto (none).
- **Separate plan:** not required.

### 5. Conditions, stats, and heals

- **Outcome:** ailments, stat stages, heals, and automatic secondaries go live with status badges and the Aura, Arrows, and Sparkle cues.
- **Contract:** the Conditions section; the Ailment, Stat, and Heal families.
- **Dependencies:** track 3.
- **Acceptance:** seeded tests assert that paralysis lasts four of the target team's snaps, also from the bench; that a second major ailment does not replace the first; that auto-rotation benches a sleeping starter; that stat stages cap at ±2. Human review: badges on the depth chart and in the battle at both widths.
- **Separate plan:** not required.

### 6. Field, Protect, one-hit, and force-switch

- **Outcome:** the remaining families ship with the Field, Bubble, and Flash cues and the persistent weather layer.
- **Contract:** the Field conditions section; the Protect, One-hit, and Force-switch families.
- **Dependencies:** track 5.
- **Acceptance:** seeded tests assert that Safeguard blocks Thunder Wave; that Rain Dance halves a Fire strike; that defensive Protect holds a long run to 5 yards; that a Fissure hit against a Flying carrier changes nothing. The 500-game run repeats, with both numbers in the PR. Human review: rain and sand layers at both widths, with reduced motion on and off.
- **Separate plan:** not required.
