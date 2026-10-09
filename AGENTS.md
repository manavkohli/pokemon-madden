# Pokéballers

Read `docs/ARCHITECTURE.md` before changing gameplay or animation ownership.

- Keep `src/game/` independent of the DOM and of `src/ui/`.
- Preserve direct `index.html` playback. Browser scripts use `window.Pokeballers` in dependency order; Node tests consume the same classes through CommonJS.
- `BattleMotion` owns choreography. `BattleStage` owns the DOM and the only animation clock. Add effects to that clock so pause, skip, cancellation, and reduced motion remain coherent.
- Keep sprite URLs and failure handling in `SpriteArt`. Third-party assets and franchise names are outside the code's MIT license.
- Methods belong on the class that owns their state. Keep method complexity at or below 10; do not add a second owner for a game rule.
- Run `npm run lint`, `npm run format:check`, and the tests covering the changed concern. Visually check animation changes at desktop and phone widths using `docs/ARCHITECTURE.md`'s browser checklist.
- Keep generated roster JSON and browser data synchronized through `scrape_pokedex.py`.
