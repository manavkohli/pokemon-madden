# How a play works

`index.html` loads classic scripts in dependency order. Each source file uses a block scope and publishes its classes to `window.Pokeballers`; the game and animation classes also export through CommonJS for Node tests. Classic scripts keep double-click playback working without a bundler or server. There are no runtime npm dependencies.

Consider an Inside Zone run:

1. `GameApp` reads the selected call and asks `FootballGame` for the CPU's coverage.
2. Each offensive call declares its carrier or receiver and passer. `Roster` selects those players, and `FootballGame` uses their ratings when resolving the play. `FootballGame.snap()` updates possession, down, spot, score, clock, and drive log, returning the yards, duration, outcome, message, and participants. A sack features the passer rather than the intended receiver.
3. `BattleStage` displays the participants returned by the engine. `SpriteArt` supplies the same sprite sources and fallback behavior used elsewhere in the UI; symbols stay visible until each image loads successfully.
4. `BattleMotion.sample()` produces poses, ball position, contact effects, and captions from normalized progress. A stuffed run recoils; a successful run advances past the defender. Passes, interceptions, incomplete passes, sacks, fumbles, and kicks have distinct ball paths.
5. `BattleStage` draws those poses from one `requestAnimationFrame` loop. `GameApp` displays the elapsed football time through `onProgress`. Once playback finishes, the UI renders the authoritative game state and unlocks the next call after the result banner.

The animation never computes a football result. Changing animation duration therefore changes presentation speed without changing yards or elapsed football time.

## Ownership

| File | Responsibility |
| --- | --- |
| `src/game/playbook.js` | Calls, positions, and salary cap |
| `src/game/roster.js` | Position ratings, salaries, cap-aware roster generation, assignments, and personnel packages |
| `src/game/football.js` | CPU decisions, play resolution, possession, scoring, and clock |
| `src/ui/app.js` | Drafting, independent team budgets, stadium theme selection, play selection, scoreboard, and application lifecycle |
| `src/ui/play-clock.js` | Call deadlines, pause/resume, and stale timer cancellation |
| `src/ui/diagram.js` | Route and coverage SVGs |
| `src/ui/field.js` | One yardage projection for field markings, ball position, and first-down markers |
| `src/ui/sprites.js` | Sprite URLs, markup, and missing-image handling |
| `src/ui/battle/motion.js` | Pure choreography and captions |
| `src/ui/battle/stage.js` | Battle DOM, scheduling, and playback lifecycle |
| `src/ui/battle/battle.css` | Arena, sprites, and effects styling |

## Team generation and stadiums

`Roster.random()` accepts a credit cap and reserves the minimum cost of filling the remaining depth slots before picking each player. It spreads the available spending across the slots, favors position fit, and prevents duplicate Pokémon. A cap below the cheapest possible complete roster raises an error. `GameApp` derives slider limits from the catalog and keeps separate budgets for each side. Changing a slider preserves the roster; generation replaces only the selected side. Kickoff checks both budgets, unless free play is enabled.

Stadium selection belongs to `GameApp`. It updates the location labels and one body attribute; CSS supplies local scenery, turf, crowd, and lighting colors for Indigo and Silver Stadiums. Venue selection survives redrafting and rematches and does not affect game rules or create an animation clock.

## Calling a play

`FootballGame` supplies the same call limit for either possession: 25 seconds at kickoff or following a drive/quarter change, otherwise 40. `PlayClock` measures elapsed time with a monotonic clock; delayed browser callbacks cannot extend the deadline. It schedules logical deadlines with `setTimeout` and does not animate the stadium.

`GameApp` starts a fresh deadline when the next call unlocks after the result banner. Selecting a call does not reset it. At expiry, the selected call snaps; without an explicit selection, a random legal call from the current playbook snaps. Manual snaps stop the deadline. Pause preserves fractional remaining time, and resume continues it. Redrafting and rematches cancel the old timer; generation tokens reject stale callbacks. The quarter clock remains an engine rule and advances only during resolved plays.

## Playback guarantees

Pause freezes both poses and progress callbacks. Stadium lighting uses the same sampled progress in `BattleStage.render()`, with fixed lighting for reduced motion. Resume starts from the held position. Skip completes progress exactly once and releases the scheduler. Cancellation resolves the old playback without completing its clock; a token prevents an already queued frame from touching a replacement play. Returning to drafting or starting a rematch also clears the pending result timer.

The OS/browser `prefers-reduced-motion` setting is read when each play begins. Reduced playback uses fixed poses, a shorter readable timeline, and captions without projectiles, shake, or particles. Missing sprite images reveal a local symbol; no image failure changes the game result. Drawing errors reject playback, and the application displays an error while retaining the resolved result in the drive log.

Pause and final results use native modal dialogs so keyboard focus stays inside and background controls are inert. Escape resumes a paused game. The final dialog stays open until the player chooses a rematch or redraft.

## Browser checklist

Use `python3 -m http.server 8000 --bind 127.0.0.1` for a local preview, or open `index.html` directly. Check desktop and a 390px phone viewport:

- Draft a player, change filters, kick off, and select both run and pass calls.
- Watch contact, ball flight, and the result. Confirm the clock finishes at the engine's resolved time and the next call unlocks.
- Pause while choosing a call and confirm the remaining play-clock seconds hold, then resume without a reset. Check automatic snapping with and without a selected call on both sides.
- Pause during a play, verify the quarter clock and poses hold, then resume. Skip another play.
- Return to drafting during playback and kick off again; the prior play must not update the new game.
- Enable reduced motion and confirm fixed poses with captions. Disable networking and confirm missing sprites have visible fallbacks and play still resolves.
- Check fourth-down kicks/punts, a turnover, and the final whistle when changing football rules.
