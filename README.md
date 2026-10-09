# Pokéballers

A Pokémon football fan game with Red-inspired menus, a Game Boy palette, and stadium themes from Kanto and Johto.

Open `index.html` in a browser to play. No server or install is required. Internet access adds Pokémon sprites; the game falls back to local symbols when sprites are unavailable.

## Screenshots

Team builder with separate credit caps and stadium selection.

![Team builder with independent credit cap sliders, stadium selection, and a Pokémon player profile](docs/screenshots/draft.jpg)

Indigo Stadium playbook and route diagram.

![Indigo Stadium with the scoreboard, field, playbook, route diagram, and rival trainer](docs/screenshots/playbook.jpg)

A live play in Silver Stadium.

![Live QB Sneak in Silver Stadium, with blue turf and stadium lights](docs/screenshots/battle.jpg)

[PNG screenshots and artwork for sharing](docs/screenshots/png/).

## Playing

1. Click a roster slot, choose a Pokémon, and assign it from the player profile. On phones, swipe through the roster slots.
2. Set each team's credit cap (9,500–27,000 credits in 500-credit steps), then generate one team or shuffle both. Changing a cap preserves the current picks. Both teams must be within budget to kick off; free play removes both caps. The default is 26,000 credits per team.
3. Choose a stadium and quarter length, then kick off.
4. Select a play to inspect its routes, coverage, and personnel. Press **Snap** (or **Lock in** on defense) to run it immediately, or let the play clock reach zero. The CPU reveals its call at the snap.

Each team has 31 Pokémon; each play fields 11. Personnel packages include two tight ends, four wide receivers, two backs, and two quarterbacks. Generated teams contain no duplicate Pokémon.

Offense and defense get the same play clock: 40 seconds normally, 25 at kickoff and after a possession or quarter change, following the [NFL play-clock rule](https://static.www.nfl.com/image/upload/fl_attachment/league/tqivdkzt9mu6wdgsh1ku.pdf#page=20). At zero, your selected call runs automatically; if you have not picked one, the game picks a random legal call from the current playbook.

**Pause** freezes the remaining call time and playback. **Skip** finishes playback. The scoreboard labels the score and quarter time separately. Quarter time advances during plays and stops between them. Reduced motion uses fixed poses and shorter captions.

The stadium themes are based on [Indigo Stadium in Kanto](https://bulbapedia.bulbagarden.net/wiki/Indigo_Plateau_Conference) and [Silver Stadium in Johto](https://bulbapedia.bulbagarden.net/wiki/Silver_Conference) from the animated series. Each has its own scenery, field colors, and lighting. Venue selection does not change football rules.

CPU calls account for down, distance, field position, score, clock, roster ratings, and recent plays. The [NFL fourth-down decision guide](https://www.nfl.com/news/introducing-the-next-gen-stats-decision-guide-a-new-analytics-tool-for-fourth-do) and [third-down defense overview](https://www.nfl.com/news/breaking-down-the-money-down-for-nfl-defenses-09000d5d810e76f3) informed these simplified rules.

## Development

Refresh the Pokémon Database catalog with `python3 scrape_pokedex.py`. Commit both `pokemon_gen1_2.json` and `pokemon_gen1_2.js`. Salaries, position ratings, and football outcomes are game rules.

Use Node.js 24 or newer for the development tools:

```sh
npm ci
npm run lint
npm run format:check
npm test
python3 -m unittest discover -s tests -p 'test_pokedex.py'
```

No build step is needed. For a local preview, run `python3 -m http.server 8000 --bind 127.0.0.1` and visit `http://127.0.0.1:8000`.

Football rules and roster logic live in `src/game/`; drafting, diagrams, sprites, and animation live in `src/ui/`. See the [architecture walkthrough](docs/ARCHITECTURE.md) for ownership and the browser checklist, and [CONTRIBUTING.md](CONTRIBUTING.md) for checks and contribution guidance.

## Credits and inspiration

Special thanks to **Anshu Chimala** and [**Pocket Aces**](https://github.com/achimala/pocket-aces) for the animation inspiration, especially [PipSprite](https://github.com/achimala/pocket-aces/blob/main/src/ui/components/PipSprite.tsx) and [BattleScene](https://github.com/achimala/pocket-aces/blob/main/src/ui/components/BattleScene.tsx). Pokéballers uses its own code and artwork.

Pokémon sprites are loaded from the [PokeAPI sprites repository](https://github.com/PokeAPI/sprites). Base stats come from [Pokémon Database](https://pokemondb.net/pokedex/all). The trainer and stadium SVGs in `assets/` are original artwork. Fonts: DM Mono and Press Start 2P from [Google Fonts](https://fonts.google.com/), with local fallbacks.

## License

Original project code is available under the [MIT license](LICENSE). This is an unofficial Pokémon fan project, unaffiliated with Nintendo, Game Freak, or The Pokémon Company. Pokémon names, characters, and sprites, including those shown in the screenshots, remain the property of their respective rights holders and are not licensed by this repository's MIT license. See the sprite source's [licensing notice](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt). Third-party data and fonts retain their own terms.
