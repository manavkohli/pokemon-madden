# Pokéballers

Open `index.html` in a browser to play. No server or install is required. Internet access adds Pokémon sprites; the game falls back to type icons when sprites are unavailable.

Build an 11-Pokémon team from the first 251 Pokédex entries. Click a position, inspect candidates in the right sidebar, and assign one. Randomize both teams or disable the 13,000-credit cap for testing. Choose a quarter length before kickoff.

During a game, click an offensive or defensive call to see its route or coverage diagram, matchup notes, and fit for the current down. The CPU reveals its call at the snap. The clock advances only when a play resolves; Pause stops a snap in progress. Each team has 11 Pokémon on the field.

CPU calls use down, distance, field position, score, clock, roster strengths, and recent opposing calls. Fourth-down decisions and long-yardage coverage follow simplified football principles from the [NFL Next Gen Stats Decision Guide](https://www.nfl.com/news/introducing-the-next-gen-stats-decision-guide-a-new-analytics-tool-for-fourth-do) and [NFL third-down defense overview](https://www.nfl.com/news/breaking-down-the-money-down-for-nfl-defenses-09000d5d810e76f3). This is an arcade heuristic, not an NFL analytics model.

The catalog contains base stats from [Pokémon Database's National Pokédex table](https://pokemondb.net/pokedex/all). Refresh it with `python3 scrape_pokedex.py`, which writes both `pokemon_gen1_2.json` and the browser-ready `pokemon_gen1_2.js`. Position ratings, salaries, and football outcomes are game rules, not official Pokémon data.

Run the targeted checks with `node tests/test_game.cjs`.
