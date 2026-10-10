# How a play works

`index.html` loads classic scripts in dependency order. Each source file uses a block scope and publishes its classes to `window.Pokeballers`; the game and animation classes also export through CommonJS for Node tests. Classic scripts keep double-click playback working without a bundler or server. There are no runtime npm dependencies.

Consider an Inside Zone run:

1. `FootballGame.prepareCall()` commits the CPU call once. `GameApp` reads player choices; scouting reveals a partial formation tell and permits one audible without rerolling the CPU.
2. Each offensive call declares its carrier or receiver and passer; an option decision or a selected target can change the carrier. `Roster` supplies the active players and their fatigue-adjusted ratings. `PlayMatchup` pairs blockers with rushers, the selected receiver with a coverage defender, and the carrier with a tackler. `FootballGame` rolls the resulting bounded probabilities. `FootballGame.snap()` updates possession, down, spot, score, clock, and drive log, returning the yards, duration, outcome, message, and participants. A sack features the passer rather than the intended receiver.
   A close play splits `snap()` in two. After the yards before contact are rolled, `FootballGame.contact()` either continues as above or holds the play: `snap()` returns a pending result with `result.clash` and no `outcome`, and `FootballGame.resolveClash(offenseAction, defenseAction)` finishes it through the same tail. A play with no clash draws the same random numbers in the same order as before the split.
3. `BattleStage` displays the participants returned by the engine. `SpriteArt` supplies the same sprite sources and fallback behavior used elsewhere in the UI; symbols stay visible until each image loads successfully.
4. `BattleMotion.sample()` produces poses, ball position, contact effects, and captions from normalized progress. A stuffed run recoils; a successful run advances past the defender. Passes, interceptions, incomplete passes, sacks, fumbles, and kicks have distinct ball paths.
5. `BattleStage` draws those poses from one `requestAnimationFrame` loop. For a pending clash it stops the play clock at `BattleMotion.CONTACT`, counts the 4-second clash on that same loop, and calls the `clash(action)` callback that `GameApp` supplies; the final result then builds a new `BattleMotion` that continues from contact. `GameApp` displays the elapsed football time through `onProgress`. Once playback finishes, the UI renders the authoritative game state and unlocks the next call after the result banner.

The animation never computes a football result. Changing animation duration therefore changes presentation speed without changing yards or elapsed football time.

## Ownership

| File | Responsibility |
| --- | --- |
| `src/game/playbook.js` | Calls, positions, and salary cap |
| `src/game/moves.js` | `MoveBook`: move families, strike values, secondary effects, PP, stamina cost, ranking, and default movesets |
| `src/game/roster.js` | Position ratings, salaries, cap-aware roster generation, assignments, personnel packages, stamina, substitutions, movesets, conditions, and stat stages |
| `src/game/matchup.js` | Individual contests, bounded probabilities, ability and move modifiers, the actor override, and the actual participants |
| `src/game/league.js` | `League`: the 13-game Gym Challenge circuit, leader rosters, levels, evolutions, stones, the transfer window, and the save format; `SeededRandom` |
| `src/game/football.js` | The clash split (`contact`, `resolveClash`, the CPU and auto clash actions), committed calls, scouting/audibles, ability charges, move activation and PP, field conditions, CPU decisions, play resolution, possession, scoring, and simulated clock management |
| `src/ui/app.js` | Drafting, move picking, independent team budgets, stadium theme selection, play and move selection, status badges, scoreboard, and application lifecycle |
| `src/ui/league.js` | `LeagueView`: the league map, post-game report, Hall of Fame, and evolution scene (drawn on the `BattleStage` clock through `BattleStage.sequence`) |
| `src/ui/play-clock.js` | Call deadlines, pause/resume, and stale timer cancellation |
| `src/ui/diagram.js` | Route and coverage SVGs |
| `src/ui/field.js` | One yardage projection for field markings, ball position, and first-down markers |
| `src/ui/sprites.js` | Sprite URLs, markup, and missing-image handling |
| `src/ui/battle/motion.js` | Pure choreography, move cues, and captions |
| `src/ui/battle/stage.js` | Battle DOM, scheduling, the clash box and countdown, move cue and badge drawing, and playback lifecycle |
| `src/ui/battle/battle.css` | Arena, sprites, and effects styling |

## Team generation and stadiums

`Roster.random()` accepts a credit cap and reserves the minimum cost of filling the remaining depth slots before picking each player. It spreads the available spending across the slots, favors position fit, and prevents duplicate Pokémon. A cap below the cheapest possible complete roster raises an error. `GameApp` derives slider limits from the catalog and keeps separate budgets for each side. Changing a slider preserves the roster; generation replaces only the selected side. Kickoff checks both budgets, unless free play is enabled.

Stadium selection belongs to `GameApp`. It updates the location labels and one body attribute; CSS supplies local scenery, turf, crowd, and lighting colors for Indigo and Silver Stadiums. Venue selection survives redrafting and rematches and does not affect game rules or create an animation clock.

## Calling a play

`FootballGame` supplies the same call limit for either possession: 25 seconds at kickoff or following a drive/quarter change, otherwise 40. `PlayClock` measures elapsed time with a monotonic clock; delayed browser callbacks cannot extend the deadline. It schedules logical deadlines with `setTimeout` and does not animate the stadium.

`GameApp` starts a fresh deadline when the next call unlocks after the result banner. Selecting a call does not reset it. At expiry, the selected call snaps; without an explicit selection, a random legal call from the current playbook snaps. Manual snaps stop the deadline. Pause preserves fractional remaining time, and resume continues it. Redrafting and rematches cancel the old timer; generation tokens reject stale callbacks. The quarter clock remains an engine rule: browsing uses no game time. At the snap, a running clock incurs simulated runoff (normal 15 seconds, hurry-up 3, chew-clock 30); the live play then consumes its own duration. A spike snaps immediately, consumes one second and a down, and stops the clock. Kneeling loses one yard, consumes two live seconds, and leaves the clock running. Sideline finishes surrender two yards and stop the clock; incompletions, possession changes, scoring, and period boundaries also stop it. If runoff consumes the remaining period, no play resolves or tires players. Three timeouts per side per half stop runoff and recover six stamina without rerolling committed calls or resetting audible limits. CPU tempo and timeouts use the same rules.

## Matchups and coaching

`PlayMatchup` selects the weakest blocker/rusher protection contest on a pass, or the chosen left/middle/right lane on a run. Extra rushers increase pressure; supporting backs and tight ends help protect. Receiver depth selects the corresponding corner, while backs and tight ends meet linebackers. QB quality, receiver separation, and deep safety help affect completion and interception odds. Protection governs sacks and stuffed runs; the carrier/tackler contest affects yardage and fumble risk. Sack participants include the real passer, blocker, and rusher. Results carry the resolved offense and a contest explanation so the animation and log use the same participants.

`prepareCall()` is idempotent within a call. Coaches can select freely until scouting; after that the engine permits one changed call. Formation tells are disguised 20% of the time and never reveal the exact coverage. On defense, scouting reveals offensive personnel. Psychic Read exposes the exact committed rival call. Changing filters, calling a timeout, or substituting players cannot regenerate the CPU call. Read Option resolves a QB keep or RB handoff; RPO resolves a run or a pass. Passing targets must belong to the active package.

Each match owns fresh copies of the drafted rosters. Stamina is keyed by Pokémon identity, so swapping depth slots cannot restore stamina and rematches cannot inherit substitutions. Active players spend three stamina per play, with three extra for deep routes or pressure and four extra for each featured carrier, passer, or defender. Bench players recover nine. Below 70 stamina, ratings lose 0.4 points per missing stamina, rounded. Possession changes recover six, quarter breaks fifteen, and halftime fully restores stamina. Automatic rotation compares tired starters with unused players of the same role and only swaps in a better effective rating. Both lineups retain eleven unique players.

Each side has two shared ability charges per half and can activate one ability per call for ten stamina, provided its actor has at least twenty. Activation records the choice on the call; the charge and the stamina are paid at the snap, after the clock check, so an expired period costs nothing. Electric Burst gives its offensive carrier twelve separation/escape points or gives a defensive front twelve pressure points. Steel Shield adds eighteen protection points through an active blocker or eighteen tackle resistance through an active defender. Psychic Read requires an active Psychic QB on offense or a Psychic coverage player on defense. Physical bonuses require the actor to remain on the field; Burst cannot transfer to a substituted carrier. The CPU spends its own charges under the same eligibility rules. Halftime restores charges and timeouts.

## How a move works

Every Pokémon carries up to four Crystal-learnset moves (`pokemon_gen1_2.json` holds the PokeAPI catalog and the Gen 2 type chart; `scrape_pokedex.py` writes it). `MoveBook` maps each move to one family: strike, ailment, stat, heal, field, protect, one-hit, or force-switch. `Roster` stores the coach's four picks and falls back to a default moveset of the strongest STAB strike, the strongest other strike, the best status move, and the next best move.

Before the snap a coach picks one actor and one move from the MOVES list; the CPU picks its best-ranked move on 40% of calls. `activateMove` only records the pick on the phase. Inside `FootballGame.snap()`, after the clock check, the engine drops any pick whose actor lost its role, pays ability charges, move PP, and stamina, then rolls accuracy, critical hit, and secondary effect with the injected `random`. A miss still pays.

`PlayMatchup` gives the actor its role's contest (blocker, rusher, carrier, passer, marker, or tackler), adds a strike's value to that margin (STAB, type chart, skill, weather, screens, capped at 30), and returns one record per move in `result.moves`. After the snap's countdown, `FootballGame` applies effects: ailments and stat stages on `Roster`, heals, field conditions, weather, Protect caps, one-hit results, and force-switch. The drive log, status badges, and move cues all read `result.moves` and `result.statuses`.

`BattleMotion` samples a cue (Beam, Lunge, Aura, Arrows, Sparkle, Bubble, Field, or Flash) between 0.22 and 0.5 of the play and colors it by move type; `BattleStage` draws it on its single clock. Active weather stays drawn on later plays through `data-weather` on the field and the battle stage. Reduced motion hides the cue and overlay animation and keeps the type tint and captions.

`node scripts/clash-balance.cjs 500` plays seeded games with clashes off and on, the human side on its auto action and the CPU on its memory rule, and prints the clash rate, the cell distribution, and points and fumbles per game, and fails when clash scoring drifts more than 8% or fumbles exceed 0.9 per game. `node scripts/balance.cjs 500` plays seeded computer-controlled games with moves off and on and prints average points per game; it is a tuning tool, not a test.

## How a circuit works

`League.start()` copies your drafted roster and draws a circuit seed. `League.game()` builds a `FootballGame` against the next leader: the leader roster comes from the seed and the leader index, so a rematch faces the same team, and the game uses the league's own saved `SeededRandom`. `FootballGame.stats` is a per-side box score keyed by Pokémon id; `League.record()` turns it into levels, awards the badge and stone on a win, and fires level, trade (game MVP), and friendship evolutions through `Roster.evolve`, which moves stamina, conditions, stages, and the moveset to the new id. A target already on the roster waits. `League.transfer()` swaps a player with the free-agent pool, at most three per window, and refuses a swap that raises payroll above the player's cap (13,000 plus 1,000 per badge; evolution may exceed it). Leader caps apply only to leader rosters. The circuit draft draws from `League.startingPool`: Pokémon with an evolution left.

`GameApp` owns the screens' lifecycle and the save: it writes `League.toJSON()` to `localStorage` under `pokeballers.league.v1` after every game, stone, and transfer, inside `try/catch`. A failed read starts a fresh circuit and a failed write shows a notice. `LeagueView` draws the screens; the evolution sequence runs on the single `BattleStage` clock, so pause, skip, cancellation, and reduced motion apply to it.

## Playback guarantees

Pause freezes both poses and progress callbacks. A Contact Clash holds the play at contact: pause freezes its countdown, skip before contact jumps to the clash, skip during the clash does nothing until both actions are in, and the countdown picks the human's auto action at zero. Returning to drafting or starting a rematch discards the game, so a clash pending on it needs nothing; an animation error resolves the pending clash with auto actions (`autoResolveClash`) before the next call. Stadium lighting uses the same sampled progress in `BattleStage.render()`, with fixed lighting for reduced motion. Resume starts from the held position. Skip completes progress exactly once and releases the scheduler. Cancellation resolves the old playback without completing its clock; a token prevents an already queued frame from touching a replacement play. Returning to drafting or starting a rematch also clears the pending result timer.

The OS/browser `prefers-reduced-motion` setting is read when each play begins. Reduced playback uses fixed poses, a shorter readable timeline, and captions without projectiles, shake, or particles. Missing sprite images reveal a local symbol; no image failure changes the game result. Drawing errors reject playback, and the application displays an error while retaining the resolved result in the drive log.

Pause and final results use native modal dialogs so keyboard focus stays inside and background controls are inert. Escape resumes a paused game. The final dialog stays open until the player chooses a rematch or redraft.

## Browser checklist

Use `python3 -m http.server 8000 --bind 127.0.0.1` for a local preview, or open `index.html` directly. Check desktop and a 390px phone viewport:

- Draft a player, change filters, kick off, and select both run and pass calls.
- Watch contact, ball flight, and the result. Confirm the clock finishes at the engine's resolved time and the next call unlocks.
- Pause while choosing a call and confirm the remaining play-clock seconds hold, then resume without a reset. Check automatic snapping with and without a selected call on both sides.
- Pause during a play, verify the quarter clock and poses hold, then resume. Skip another play.
- Play until a Contact Clash appears. Pick one action by click and one by key 1 to 3, let one count down, and pause during one to confirm the countdown holds. Check the box at 390px and with reduced motion.
- Return to drafting during playback and kick off again; the prior play must not update the new game.
- Enable reduced motion and confirm fixed poses with captions. Disable networking and confirm missing sprites have visible fallbacks and play still resolves.
- Check fourth-down kicks/punts, a turnover, and the final whistle when changing football rules.

## Verification

`node --test tests/test_clash.cjs` covers the action table, the no-clash fixture (`tests/fixtures/seeded-game.json`), the CPU memory, and confusion; `tests/test_battle.cjs` covers the clash hold. `node tests/test_moves.cjs` covers move families, strike values, movesets, conditions, field conditions, and move cues. `npm run test:mechanics` runs deterministic contests, scouting/audibles, abilities, stamina, clock boundaries, and 25 seeded complete games, plus DOM integration tests that load the real classic scripts and drive the actual controls. The UI regressions include Read Option → turnover → defensive call → rival touchdown, both scoring directions, special-team filters, pause at the result banner, animation failures, stale rematch callbacks, and halftime transitions. `happy-dom` is a development-only DOM environment; the browser runtime has no npm dependency. Existing battle and play-clock checks still cover the one-clock playback lifecycle.
