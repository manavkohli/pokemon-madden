# Plan: Contact Clash (GAMEPLAY-IDEAS tracks 4–5)

**Status:** Ready to build · **Design:** [`docs/GAMEPLAY-IDEAS.md`](../GAMEPLAY-IDEAS.md), Feature 2

`FootballGame.snap()` splits at one point: after `gain()` computes the yards to contact, a close play stops and returns a pending result with a `clash`. `FootballGame.resolveClash(offense, defense)` applies the action table and runs the rest of the existing pipeline. `BattleStage` plays the pre-contact motion, holds at contact on its own clock with a three-button box, and continues with the final result once both actions are in.

## Why

The clash decides yards after contact, so the engine must stop before it rolls the fumble and moves the ball. Every result decided before contact (a stuff, a sack, an interception, an incompletion, a one-hit move) already returns before `gain()`, so the split point leaves them untouched. A no-clash play draws no extra random numbers, so every existing seeded test keeps its result. The stage holds at contact because the pre-contact motion does not depend on the outcome: `BattleMotion` reads the outcome only from the follow-through after 0.63.

## What is actually changing

- `FootballGame.CLASH_BAND = 8`: a run or completed pass with `|matchup.tackle| ≤ CLASH_BAND`, or any third or fourth down play that reaches contact, clashes.
- `resolveRun` and `resolvePass` call one method, `contact(offense, matchup, odds, yards, seconds)`, at the point where they now roll the fumble or move the ball. With no clash it does exactly what the code does today. With a clash it stores `this.pending = { offense, defense, options, prior, runoff, matchup, odds, yards, seconds }` and returns `{ clash: { carrier, tackler, edge } }`.
- `snap()` returns the pending result early: `result.clash`, `result.participants`, `result.moves`, and `result.offense`, but no `outcome` and no clock change. `finishSnap` does not run yet.
- `resolveClash(offenseAction, defenseAction)` throws unless a clash is pending, applies the table, rolls the fumble with the adjusted odds, then the breakaway, calls `moveBall`, and runs the same tail as `snap()` (`result.moves`, `weather`, `offense`, `runoff`, `finishSnap`). It returns the complete result. `snap()` and `prepareCall()` throw while a clash is pending.
- `FootballGame.cpuClashAction(role)` picks the CPU's action: weights by the stat each action uses (`Roster.skill`), then adds 0.5 weight to the counter of the human's most frequent action in `this.clashMemory[role]` (the last 5 picks). The draw uses `random`.
- Confusion replaces a confused player's action with a random one, one time in three; paralysis halves Juke's yards. Both read the existing `Roster` conditions.
- `BattleStage.play()` accepts `clash: (choice) => Promise<result>`. At progress `CONTACT` with a pending clash, it holds the pose, shows `#battleClash` (three buttons and keys 1–3), and counts 4 seconds on its clock. Pause stops the count; skip before contact jumps to `CONTACT`; skip during the clash does nothing. At zero it picks the auto action. It then calls `clash(action)`, builds a new `BattleMotion` from the final result, and continues from `CONTACT`.
- `GameApp` passes the clash callback (it calls `game.resolveClash` with the human's action and the CPU's action) and renders the result banner after the final result.

## How it will be built

1. **Action table.** Carrier actions `juke` (speed), `truck` (attack), `cover` (hp). Tackler actions `wrap` (defense), `hit` (attack), `strip` (speed). A static `FootballGame.CLASH` map holds each pair's outcome: `win`, `big`, `lose`, `heavy` (tackler wins big), `even`, or `safe` (cover against strip). `edge = Roster.skill(carrier, stat) − Roster.skill(tackler, stat)` for the two chosen stats.
2. **Yards.** `win`: `+max(2, round(4 + 0.3 × edge))`. `big`: double that, and a 20% chance (`random`) to break away: the yards become the distance to the end zone. `lose`: −2. `heavy`: −4 and +0.05 fumble odds. `strip` against `juke` or `truck`: +0.08 fumble odds on top of the cell. `safe`: the tackler loses 2 yards of position (+2), and the fumble roll is skipped. `even`: no change. Defensive Protect still caps the gain at 5 yards after the clash.
3. **Auto action.** The human's default action is the one whose stat is highest for that player; ties go in table order.
4. **Result.** The complete result carries `clash: { offense, defense, outcome, yards }`. `BattleMotion` shows "JUKE vs BIG HIT!" as the contact callout and adds the clash line to the drive log ("Pikachu jukes past Machamp: +8").
5. **Rate tuning.** `scripts/clash-balance.cjs` plays 500 seeded games with both sides on auto actions and prints the clash rate and points per game with clashes on and off. Tune `CLASH_BAND` until the rate sits in 20–30%, and record the final band and numbers in the commit body.

## Gates

- `tests/test_clash.cjs` (new, wired into `npm test`): each of the 9 table cells gives its stated yards and fumble change with a fixed `random`; a sack, stuff, interception, incompletion, and one-hit move never clash; `snap()` and `prepareCall()` throw during a pending clash; a no-clash play gives the same result as before this change under the same seed (snapshot one seeded 40-snap game before the change and compare); the CPU counters a human who picked `juke` 5 times; a confused carrier's action changes on the right roll.
- `tests/test_battle.cjs`: the stage holds at `CONTACT` during a clash, pause freezes the countdown, skip before contact jumps to the clash, skip during the clash does nothing, and the countdown picks the auto action at zero.
- Playwright (headless Chrome via the scratchpad install): play until a clash, pick each action by click and by key, and let one count down. Screenshots at 1280px, 390px, and reduced motion go under `docs/screenshots/png/clash-*.png`.

## Risks

- A long hold at contact makes plays slower. The 4-second limit and the 20–30% rate keep a game near its current length; the simulation reports the share of plays that hold.
- The CPU memory is per game, so a new game resets it.
