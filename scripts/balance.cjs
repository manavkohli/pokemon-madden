// Usage: node scripts/balance.cjs [games]. Plays seeded computer-controlled games with moves on and off and prints scoring.
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { FootballGame } = require('../src/game/football.js');
const { MoveBook } = require('../src/game/moves.js');
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
    const families = {};
    for (let snaps = 0; !game.over && snaps < 900; snaps++) {
      const book = game.possession === 'home' ? OFFENSE.filter((play) => game.isLegalCall(play)) : DEFENSE;
      game.prepareCall(book[Math.floor(random() * book.length)]);
      const { offense, defense } = game.phase;
      const options = game.possession === 'away' ? game.cpuOptions(offense, defense) : {};
      if (moves) game.fireCpuMove('home', game.possession === 'home' ? game.resolveOffense(offense, options) : defense);
      const played = game.snap(offense, defense, options);
      for (const record of (played.clash ? game.autoResolveClash() : played).moves) {
        used += 1;
        const family = MoveBook.family(record.move);
        families[family] = (families[family] ?? 0) + 1;
      }
    }
    return { points: game.score.home + game.score.away, used, families };
  }

  static run(games, moves) {
    let points = 0;
    let used = 0;
    const families = {};
    for (let seed = 1; seed <= games; seed++) {
      const game = Balance.play(seed, moves);
      points += game.points;
      used += game.used;
      for (const [family, count] of Object.entries(game.families)) families[family] = (families[family] ?? 0) + count;
    }
    return { points: points / games, used: used / games, families };
  }
}

const games = Number(process.argv[2] ?? 500);
for (const moves of [false, true]) {
  const { points, used, families } = Balance.run(games, moves);
  console.log(
    `moves ${moves ? 'on ' : 'off'}: ${points.toFixed(2)} points per game (both teams), ${used.toFixed(1)} moves per game, ${games} games`,
  );
  if (moves) console.log(`moves by family: ${JSON.stringify(families)}`);
}
