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
| `src/game/roster.js` | Position ratings, salaries, assignments, and personnel packages |
| `src/game/football.js` | CPU decisions, play resolution, possession, scoring, and clock |
| `src/ui/app.js` | Drafting, play selection, scoreboard, and application lifecycle |
| `src/ui/diagram.js` | Route and coverage SVGs |
| `src/ui/field.js` | One yardage projection for field markings, ball position, and first-down markers |
| `src/ui/sprites.js` | Sprite URLs, markup, and missing-image handling |
| `src/ui/battle/motion.js` | Pure choreography and captions |
| `src/ui/battle/stage.js` | Battle DOM, scheduling, and playback lifecycle |
| `src/ui/battle/battle.css` | Arena, sprites, and effects styling |

## Playback guarantees

Pause freezes both poses and progress callbacks. Stadium lighting uses the same sampled progress in `BattleStage.render()`, with fixed lighting for reduced motion. Resume starts from the held position. Skip completes progress exactly once and releases the scheduler. Cancellation resolves the old playback without completing its clock; a token prevents an already queued frame from touching a replacement play. Returning to drafting or starting a rematch also clears the pending result timer.

The OS/browser `prefers-reduced-motion` setting is read when each play begins. Reduced playback uses fixed poses, a shorter readable timeline, and captions without projectiles, shake, or particles. Missing sprite images reveal a local symbol; no image failure changes the game result. Drawing errors reject playback, and the application displays an error while retaining the resolved result in the drive log.

Pause and final results use native modal dialogs so keyboard focus stays inside and background controls are inert. Escape resumes a paused game. The final dialog stays open until the player chooses a rematch or redraft.

## Browser checklist

Use `python3 -m http.server 8000 --bind 127.0.0.1` for a local preview, or open `index.html` directly. Check desktop and a 390px phone viewport:

- Draft a player, change filters, kick off, and select both run and pass calls.
- Watch contact, ball flight, and the result. Confirm the clock finishes at the engine's resolved time and the next call unlocks.
- Pause during a play, verify the clock and poses hold, then resume. Skip another play.
- Return to drafting during playback and kick off again; the prior play must not update the new game.
- Enable reduced motion and confirm fixed poses with captions. Disable networking and confirm missing sprites have visible fallbacks and play still resolves.
- Check fourth-down kicks/punts, a turnover, and the final whistle when changing football rules.
