// Usage: node scripts/balance.cjs [games]. Plays seeded computer-controlled games with moves on and off and prints scoring.
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { FootballGame } = require('../src/game/football.js');
const { OFFENSE, DEFENSE } = require('../src/game/playbook.js');

class Balance {
  static seeded(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }

  // Both teams call plays at random and fire moves through FootballGame.fireCpuMove, the CPU rule.
  static play(seed, moves) {
    const random = Balance.seeded(seed);
    const game = new FootballGame(
      Roster.random(data, undefined, random),
      Roster.random(data, undefined, random),
      300,
      random,
    );
    game.autoRotate.home = true;
    if (!moves) game.cpuMoveChance = 0;
    let used = 0;
    for (let snaps = 0; !game.over && snaps < 900; snaps++) {
      const book = game.possession === 'home' ? OFFENSE.filter((play) => game.isLegalCall(play)) : DEFENSE;
      game.prepareCall(book[Math.floor(random() * book.length)]);
      const { offense, defense } = game.phase;
      const options = game.possession === 'away' ? game.cpuOptions(offense, defense) : {};
      if (moves) game.fireCpuMove('home', game.possession === 'home' ? game.resolveOffense(offense, options) : defense);
      used += game.snap(offense, defense, options).moves.length;
    }
    return { points: game.score.home + game.score.away, used };
  }

  static run(games, moves) {
    let points = 0;
    let used = 0;
    for (let seed = 1; seed <= games; seed++) {
      const game = Balance.play(seed, moves);
      points += game.points;
      used += game.used;
    }
    return { points: points / games, used: used / games };
  }
}

const games = Number(process.argv[2] ?? 500);
for (const moves of [false, true]) {
  const { points, used } = Balance.run(games, moves);
  console.log(
    `moves ${moves ? 'on ' : 'off'}: ${points.toFixed(2)} points per game (both teams), ${used.toFixed(1)} moves per game, ${games} games`,
  );
}
