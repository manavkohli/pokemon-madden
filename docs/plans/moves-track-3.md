# Plan: Strikes on the field (MOVES track 3)

**Status:** Ready to build · **Design:** [`docs/MOVES.md`](../MOVES.md)

Track 3 lets a coach and the CPU fire one strike move per call. `FootballGame` validates the move, spends PP and stamina, and pre-rolls every random value; `PlayMatchup` puts the actor into its role's contest and adds the strike value to that contest's margin; the result carries a move record that the drive log and the battle cue read. This is the track that changes the phase shape, contest selection, and the battle participants together, so the seams are fixed here.

## Why

The offense never knows the defensive call before the snap, and the defense never knows the offense's. A move tied to whichever player the engine happens to pair would fizzle at random, so the actor takes its role's contest instead. Rolls happen in `FootballGame` because it owns the injected `random`; `PlayMatchup` stays a pure function of its inputs plus the pre-rolled values, which keeps seeded tests exact. PP lives on `FootballGame`, not `Roster`, because PP is a per-game budget while a moveset belongs to the player across games.

## What is actually changing

- `FootballGame` gains `pp` (`{ home: Map, away: Map }`, key `${monId}:${moveName}`, filled lazily with `ceil(pp / 5)`), `availableMoves(side, play)`, `activateMove(side, actorId, moveName, play)`, and `activateCpuMove(offense, defense, options)`.
- `phase` gains `moves: {}`. `activateMove` validates the pick and records `{ side, actor, move }` there without spending anything. It throws `One move per team per call` on a second activation, mirroring `activateAbility`.
- Spending happens inside `FootballGame.snap()`, after validation and after the runoff and expiry check, in this order: the CPU activates its ability and its move; a recorded move whose actor no longer holds a legal role (a changed target, a substitution) is dropped with a log line and costs nothing; ability charges and ability stamina are spent; PP and move stamina are spent; accuracy and critical rolls happen. A miss still pays. A period that expires before the snap pays nothing. Abilities follow the same rule, so the pre-snap panel shows a pending choice and the snap commits it.
- `scrimmage()` pre-rolls, for each recorded move in a fixed order (offense first, then defense): `hit = random() * 100 < accuracy` (null accuracy always hits), `crit = random() < 0.25` only when `meta.crit_rate > 0`, and passes `{ attack, defend }` move entries with those rolls into `PlayMatchup`.
- `PlayMatchup` takes a `moves` argument beside `abilities`. After the default contest selection it applies the actor override, then adds the strike value.
- `result.moves` is an array of `{ side, actor, target, move, hit, effectiveness, value }`. `finishSnap` writes the log line. `BattleMotion` reads the array for the cue and the callout.

## How it will be built

1. **Eligibility.** Offense: the play's carrier, the passer on pass kinds, and every OL or TE in the active unit. Defense: every player in the active unit. Each needs 20 stamina and PP left; `kick`, `punt`, `spike`, and `kneel` have no moves.
2. **Actor override in `selectContests()`.** Offense: an OL/TE actor replaces the blocker of the selected pair (recompute that pair's margin); a carrier or passer actor needs no change. Defense: a DL actor replaces the rusher of the selected pair; an LB, CB, or S actor becomes the marker on a pass kind and the tackler on a run. The override runs before `protection`, `separation`, and `tackle` are computed so the replaced player's rating counts.
3. **Margins.** Offense carrier: `separation` on passes, `tackle` on runs. Passer: `separation`. Blocker: `protection`. Defense rusher: `protection -= value`. Marker: `separation -= value`. Tackler: `tackle -= value`.
4. **Target.** The paired opponent: carrier vs marker (pass) or tackler (run), passer vs marker, blocker vs rusher. Effectiveness is the product of the type chart over the target's types.
5. **Value** (`MoveBook.strike`): `power × 0.15 × (1.5 if STAB) × effectiveness × skill / 70`, where skill is `Roster.skill(actor, 'attack')` for physical and `'special_attack'` for special. Multi-hit uses `power × average(min_hits, max_hits)` rounded down to whole hits (2–5 averages to 3). Priority adds 8 before the cap. A crit doubles the value. Round, cap at 30. Effectiveness 0 makes the value 0, priority included.
6. **Stamina side effects.** Recoil (`meta.drain < 0`) costs the actor `round(value / 4)` more stamina. Drain (`meta.drain > 0`) returns `round(value / 2)`.
7. **CPU.** `activateCpuMove` runs where `activateCpuAbility` runs in `GameApp`. On 40% of calls (one `random()` draw) it fires the eligible move with the best `MoveBook.rank`.
8. **Log line.** `Pikachu used Thunderbolt! It's super effective!` / `… It's not very effective…` / `… It doesn't affect Golem…` / `Pikachu's Thunder missed!`.
9. **Battle.** `BattleMotion` exposes `cue(progress)` for 0.22–0.50: `{ kind: 'beam' | 'lunge', type, from, to, t, missed }`. The cue starts at the actor's featured slot when the actor is featured, otherwise at that side's lead slot (offense index 0, defense index 2). `BattleStage` draws one cue node on its clock and sets `data-type` for the CSS color. From 0.56 the round label reads `MOVE` and the callout carries the effectiveness text. Reduced motion hides the cue node and keeps the caption.
10. **Pre-snap panel.** A MOVES list under POKÉMON ABILITIES: one button per eligible actor-move pair, `Thunderbolt · Pikachu · ELECTRIC 90 · 2/3 PP`.

## Gates

- `tests/test_moves.cjs`: an Electric strike into a Ground target leaves every margin unchanged; a hit and a miss each spend one PP and the stamina cost; a defensive CB actor becomes the marker on a pass call; a second activation throws; the value never exceeds 30.
- A seeded 500-game CPU-against-CPU script prints average points per game with and without moves. Both numbers go in the commit body.
- Browser checklist from `docs/ARCHITECTURE.md` at desktop and 390px, with screenshots of a super-effective hit and a miss.

## Risks

- `participants()` shows the passer as support on passes, so an OL actor on a pass is not on stage. The cue then starts at the offense lead slot; the log line still names the actor.
- `Roster.copy()` must carry movesets, or the game's copied rosters lose the draft picks.
