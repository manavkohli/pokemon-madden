# Pokéballers

Open `index.html` in a browser to play. No server or install is required. Internet access adds Pokémon sprites; the game falls back to local symbols when sprites are unavailable.

Build a 31-Pokémon depth chart from the first 251 Pokédex entries. Click a slot, inspect candidates in the right sidebar, and assign one. Randomize both teams or disable the 26,000-credit cap for testing. Choose a quarter length before kickoff. Each call fields 11 Pokémon from the chart; packages include two tight ends, four wide receivers, two backs, and two quarterbacks.

During a game, click an offensive or defensive call to see its route or coverage diagram, matchup notes, and personnel. The CPU reveals its call at the snap. A short battle scene features the ball carrier or target and the defender most likely to make the play. Skip advances directly to the result; Pause freezes the scene. The quarter clock deducts play time as the battle animates and does not run between turns.

The battle arena uses large pixel sprites with procedural breathing and bobbing, pass and kick arcs, contact holds, tackle recoil, loose-ball motion, and scoring bursts. One animation clock keeps pause and skip consistent. The browser's reduced-motion preference enables fixed poses and shorter caption-based playback. No rendering library or runtime install is required.

CPU calls use down, distance, field position, score, clock, roster strengths, and recent opposing calls. Fourth-down decisions and long-yardage coverage follow simplified football principles from the [NFL Next Gen Stats Decision Guide](https://www.nfl.com/news/introducing-the-next-gen-stats-decision-guide-a-new-analytics-tool-for-fourth-do) and [NFL third-down defense overview](https://www.nfl.com/news/breaking-down-the-money-down-for-nfl-defenses-09000d5d810e76f3). This is an arcade heuristic, not an NFL analytics model.

The catalog contains base stats from [Pokémon Database's National Pokédex table](https://pokemondb.net/pokedex/all). Refresh it with `python3 scrape_pokedex.py`, which writes both `pokemon_gen1_2.json` and the browser-ready `pokemon_gen1_2.js`. Position ratings, salaries, and football outcomes are game rules, not official Pokémon data.

## Development

Use Node.js 24 or newer for the development tools:

```sh
npm ci
npm run lint
npm run format:check
npm test
```

No build step is needed. Any static host can serve the repository. For a local preview, run `python3 -m http.server 8000 --bind 127.0.0.1` and visit `http://127.0.0.1:8000`.

Football rules and roster logic live in `src/game/`; drafting, diagrams, sprites, and animation live in `src/ui/`. See the [architecture walkthrough](docs/ARCHITECTURE.md) for a play from snap to result, and [CONTRIBUTING.md](CONTRIBUTING.md) for checks and contribution guidance.

## Credits and inspiration

Special thanks to **Anshu Chimala** and [**Pocket Aces**](https://github.com/achimala/pocket-aces), the open source creature-collecting poker roguelike that inspired this game's animation direction. Its [PipSprite](https://github.com/achimala/pocket-aces/blob/main/src/ui/components/PipSprite.tsx) and [BattleScene](https://github.com/achimala/pocket-aces/blob/main/src/ui/components/BattleScene.tsx) demonstrate how procedural breathing, bobbing, grounded sprites, lunges, recoil, and expressive impact timing bring static pixel art to life. Pokéballers applies those ideas through its own football choreography and animation clock. No Pocket Aces source code, generated art, or fonts are bundled here. Pocket Aces credits its code under MIT and its art under CC BY 4.0; see its [licensing notes](https://github.com/achimala/pocket-aces#license).

Pokémon sprites are loaded from the [PokeAPI sprites repository](https://github.com/PokeAPI/sprites). Base stats come from [Pokémon Database](https://pokemondb.net/pokedex/all). The interface requests Nunito, DM Mono, and Press Start 2P through [Google Fonts](https://fonts.google.com/), with local font fallbacks when offline.

## License

Original project code is available under the [MIT license](LICENSE). This is an unofficial Pokémon fan project, unaffiliated with Nintendo, Game Freak, or The Pokémon Company. Pokémon names, characters, and sprites remain the property of their respective rights holders and are not licensed by this repository's MIT license. Third-party data and fonts retain their own terms.
