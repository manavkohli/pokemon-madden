# Plan: League engine and Gym Challenge (GAMEPLAY-IDEAS tracks 1–3)

**Status:** Ready to build · **Design:** [`docs/GAMEPLAY-IDEAS.md`](../GAMEPLAY-IDEAS.md), Feature 1

`League` is a new DOM-free class that owns a 13-game circuit: the leader list, the player's persistent roster, levels, evolutions, stones, and the transfer window. `FootballGame` stays one game; it gains a per-player box score that `League` reads after the final whistle, and a CPU play style that `League` sets per leader. `GameApp` owns the screens and the single `localStorage` save.

## Why

A circuit is a lifecycle across games, and `FootballGame` is one game. Putting levels or badges on `FootballGame` would give it a second job and make every exhibition carry campaign state. The box score belongs to the engine because only the engine knows who gained the yards; experience belongs to `League` because only the circuit gives it meaning. Evolution swaps a catalog entry, so every per-player map that keys on `mon.id` (stamina, conditions, stages, movesets, levels) must move to the new id in one `Roster` method, or state leaks between species.

## What is actually changing

- **Data (track 1).** `scrape_pokedex.py` adds each catalog species' evolution: `{ into, trigger, min_level, item }` where `trigger` is one of `level-up`, `use-item`, `trade`, `friendship` (PokeAPI `level-up` with `min_happiness` maps to `friendship`). Targets above id 251 are dropped. The catalog's types become Gen 2 types: when PokeAPI `pokemon.past_types` has an entry for a generation after generation-ii, use the types of the earliest such entry. Clefairy becomes Normal; no Pokémon keeps Fairy.
- **Box score.** `FootballGame.stats` maps `mon.id` → `{ yards, touchdowns, tackles, sacks, interceptions, moveHits }`, updated in `finishSnap` from `result.participants`, the outcome, and `result.moves`. The carrier owns yards and touchdowns, the defender owns tackles, sacks, and interceptions.
- **CPU style.** `FootballGame.cpuStyle` (`'run' | 'pass' | 'pressure' | 'balanced'`, default `'balanced'`) adds a fixed bonus to the matching call group in the CPU call scores (`run` → run group on offense; `pass` → pass group; `pressure` → trick group on offense and pressure calls on defense).
- **Roster.** `Roster.random` accepts fixed players for the leader core. `Roster.evolve(mon, into)` replaces the player in place and moves every per-player map entry to the new id. Movesets keep every known move the new species learns, and `MoveBook.defaultMoveset` fills the freed slots.
- **League.** `src/game/league.js`: `League.start(catalog, roster, random)`, `leaderRoster(index)`, `game()` (builds the next `FootballGame` with the leader roster, cap, and style), `record(game)` (win or loss, badge, stone, levels, evolutions, games played, MVP), `evolve(monId, stone)`, `transfer(outId, inId)`, `toJSON()` / `League.fromJSON(catalog, json)`.
- **Screens.** `src/ui/league.js` (`LeagueView`): the mode switch on the start screen, the league map, the post-game report with the evolution sequence on the `BattleStage` clock, the transfer window on the existing draft screen, and the Hall of Fame. `GameApp` saves after each game.

## How it will be built

1. **Constants.** `League.LEADERS` lists the 13 entries `{ name, type, style, cap, stone }` in circuit order. The caps run from 14,000 to 27,000 credits in even steps of 1,083, rounded to 500. Stones: Misty Water, Lt. Surge Thunder, Erika Leaf, Sabrina Moon, Blaine Fire. Styles: Brock and Giovanni `run`, Misty and Lt. Surge `pass`, Koga and Agatha `pressure`, all others `balanced`. The Champion has no type.
2. **Leader core.** Rank every catalog Pokémon of the leader's type by its best `Roster.rating` over positions. Take up to 12 Pokémon, best first, while the core's salary stays within 60% of the cap. Assign each one to its best open slot (`POSITIONS` order, best rating first). Pass the core to `Roster.random` as fixed slots; it fills the rest under the remaining cap with its existing reserve rule. The leader roster is seeded from `League`'s `random`, so a retry faces the same team.
3. **Levels.** A drafted Pokémon starts at its stage floor: a species with no `evolves_from` starts at 5; a species that evolves from another starts at the previous step's `min_level` (or 20 for a non-level step); a final form with no further evolution starts at 40. Gains after each game: `floor(yards / 10) + 3 × touchdowns + tackles + 2 × (sacks + interceptions) + moveHits`, plus 2 for every player on the winning team. Levels cap at 100.
4. **Evolution order.** After `record(game)`: level evolutions fire for every player at or above `min_level`; trade evolutions fire for the game MVP (the winning team's player with the highest gain); friendship evolutions fire at 5 games played. Stones go into `League.stones` and fire only through `evolve(monId, stone)`. An evolution whose target species is already on the roster waits and reports "already on your team". Each evolution returns an event `{ from, into, reason }` for the post-game screen.
5. **Transfers.** `transfer(outId, inId)` swaps a roster player for a catalog Pokémon that is not on the roster, at most 3 per window. A transfer throws `RangeError` only when payroll after it is above the player's cap (13,000 plus 1,000 per badge, `League.playerCap`) and the transfer raises payroll; evolution may push payroll over the cap. Leader caps belong to leader rosters. The starting draft and `Roster.random` for the player use `League.startingPool` (Pokémon with an evolution left); transfers may bring in any Pokémon. Giovanni awards the Sun Stone. The window resets after each game. A transferred-in player starts at its stage floor.
6. **Save.** `toJSON()` stores the stage index, badges, stones, per-player `{ id, level, games, moves }` in roster order, the transfers left, and the seed state of `random`. `fromJSON` rebuilds the same `League`; the saved `random` state makes the next leader roster and game identical. `GameApp` stores it under one key, `pokeballers.league.v1`, in `try/catch`.
7. **Exhibition is unchanged.** The start screen gets a **Mode** switch (Exhibition / Gym Challenge). Exhibition keeps today's two-cap draft.

## Gates

- `tests/test_pokedex.py`: Bulbasaur → Ivysaur at 16; Pikachu → Raichu with the Thunder Stone; Kadabra → Alakazam by trade; Golbat → Crobat by friendship; no target above 251; no Fairy type; Clefairy is Normal.
- `tests/test_league.cjs` (new, wired into `npm test`): every leader roster is legal under its cap; Agatha's roster holds all 4 Ghost types; `Roster.evolve` moves stamina, conditions, stages, and moveset to the new id; a duplicate target waits; a saved and reloaded league plays the next game with the same result; a fourth transfer throws; `FootballGame.stats` sums to the drive log's yards.
- `scripts/league-balance.cjs`: 200 seeded circuits, CPU coaching both sides, a 13,000-credit starting roster. It prints the share of starters that evolve at least once (target 40–70%) and the win rate per leader (target: about 80% at Brock, falling to about 35% at the Champion). Tune the gain formula and the cap steps to hit the targets, and put the final numbers in the commit body.
- Playwright (headless Chrome via the scratchpad install): start a circuit, beat Brock with a seeded win, see the report with one evolution, make one transfer, reload the page, and see the saved league. Screenshots at 1280px and 390px go under `docs/screenshots/png/league-*.png`.

## Risks

- The 13 Fairy-to-Gen-2 type changes alter some exhibition matchups and the balance baseline. The commit body reports the new 500-game numbers.
- The trainer portraits are new original art; each is an inline SVG in the existing `assets/` style, with no franchise art.
