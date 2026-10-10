const { FootballGame } = require('../src/game/football.js');

// Suites that assert pre-contact outcomes use this game, which skips the clash step.
class NoClashGame extends FootballGame {
  constructor(...args) {
    super(...args);
    this.clashes = false;
  }
}

class Helpers {
  // A small linear congruential generator, so a seed reproduces a whole game.
  static seeded(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }
}

module.exports = { NoClashGame, seeded: Helpers.seeded };
