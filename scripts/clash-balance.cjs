// Usage: node scripts/clash-balance.cjs [games] [band]. Plays seeded games with clashes off and on and prints the clash rate and scoring.
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { FootballGame } = require('../src/game/football.js');
const { OFFENSE, DEFENSE, PASS_KINDS } = require('../src/game/playbook.js');

class ClashBalance {
  static seeded(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }

  // Both teams call plays at random and take the auto action in every clash.
  static play(seed) {
    const random = ClashBalance.seeded(seed);
    const game = new FootballGame(
      Roster.random(data, undefined, random),
      Roster.random(data, undefined, random),
      300,
      random,
    );
    game.autoRotate.home = true;
    const tally = { plays: 0, scrimmage: 0, clashes: 0, fumbles: 0, outcomes: {} };
    for (let snaps = 0; !game.over && snaps < 900; snaps++) {
      const book = game.possession === 'home' ? OFFENSE.filter((play) => game.isLegalCall(play)) : DEFENSE;
      game.prepareCall(book[Math.floor(random() * book.length)]);
      const { offense, defense } = game.phase;
      const options = game.possession === 'away' ? game.cpuOptions(offense, defense) : {};
      let result = game.snap(offense, defense, options);
      const clash = Boolean(result.clash);
      if (clash) result = game.autoResolveClash();
      tally.plays += 1;
      if (offense.kind === 'run' || PASS_KINDS.includes(offense.kind)) tally.scrimmage += 1;
      if (clash) tally.clashes += 1;
      if (result.outcome === 'fumble') tally.fumbles += 1;
      if (clash) tally.outcomes[result.clash.outcome] = (tally.outcomes[result.clash.outcome] ?? 0) + 1;
    }
    return { ...tally, points: game.score.home + game.score.away };
  }

  static run(games) {
    const total = { plays: 0, scrimmage: 0, clashes: 0, fumbles: 0, points: 0, outcomes: {} };
    for (let seed = 1; seed <= games; seed++) {
      const game = ClashBalance.play(seed);
      for (const key of ['plays', 'scrimmage', 'clashes', 'fumbles', 'points']) total[key] += game[key];
      for (const [name, count] of Object.entries(game.outcomes)) total.outcomes[name] = (total.outcomes[name] ?? 0) + count;
    }
    return total;
  }
}

const games = Number(process.argv[2] ?? 500);
if (process.argv[3] !== undefined) FootballGame.CLASH_BAND = Number(process.argv[3]);
for (const clashes of [false, true]) {
  FootballGame.CLASHES = clashes;
  const total = ClashBalance.run(games);
  const rate = ((100 * total.clashes) / total.scrimmage).toFixed(1);
  console.log(
    `clashes ${clashes ? 'on ' : 'off'}: ${(total.points / games).toFixed(2)} points per game, ${(total.plays / games).toFixed(1)} plays per game, ${(total.fumbles / games).toFixed(2)} fumbles per game` +
      (clashes
        ? `, clash rate ${rate}% of ${(total.scrimmage / games).toFixed(1)} scrimmage plays (band ${FootballGame.CLASH_BAND}), ${(total.clashes / games).toFixed(1)} clashes per game`
        : ''),
  );
  if (clashes) console.log(`clash outcomes: ${JSON.stringify(total.outcomes)}`);
}
