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

  // Both teams call plays at random and fire moves as the CPU does: 40% of calls, best-ranked eligible move.
  static play(seed, moves) {
    const random = Balance.seeded(seed);
    const game = new FootballGame(
      Roster.random(data, undefined, random),
      Roster.random(data, undefined, random),
      300,
      random,
    );
    game.autoRotate.home = true;
    let used = 0;
    for (let snaps = 0; !game.over && snaps < 900; snaps++) {
      const book = game.possession === 'home' ? OFFENSE.filter((play) => game.isLegalCall(play)) : DEFENSE;
      game.prepareCall(book[Math.floor(random() * book.length)]);
      const { offense, defense } = game.phase;
      const options = game.possession === 'away' ? game.cpuOptions(offense, defense) : {};
      if (moves && random() < FootballGame.CPU_MOVE_CHANCE) Balance.fireHome(game, options);
      used += game.snap(offense, defense, options).moves.length;
    }
    return { points: game.score.home + game.score.away, used };
  }

  static fireHome(game, options) {
    const play = game.possession === 'home' ? game.resolveOffense(game.phase.offense, options) : game.phase.defense;
    const best = game
      .availableMoves('home', play)
      .sort((a, b) => MoveBook.rank(b.move, b.actor) - MoveBook.rank(a.move, a.actor))[0];
    if (best) game.activateMove('home', best.actor.id, best.move, play);
  }

  static run(games, moves) {
    const chance = FootballGame.CPU_MOVE_CHANCE;
    if (!moves) FootballGame.CPU_MOVE_CHANCE = 0;
    let points = 0;
    let used = 0;
    for (let seed = 1; seed <= games; seed++) {
      const game = Balance.play(seed, moves);
      points += game.points;
      used += game.used;
    }
    FootballGame.CPU_MOVE_CHANCE = chance;
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
