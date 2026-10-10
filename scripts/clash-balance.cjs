// Usage: node scripts/clash-balance.cjs [games] [band] [winYards] [breakaway] [heavyFumble] [stripFumble]. Plays seeded games with clashes off and on and prints the clash rate and scoring.
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { FootballGame } = require('../src/game/football.js');
const { OFFENSE, DEFENSE, PASS_KINDS } = require('../src/game/playbook.js');
const { seeded } = require('../tests/helpers.cjs');

class ClashBalance {
  // Both teams call plays at random; the home side takes its auto action in every clash and the CPU picks the other.
  static play(seed, clashes) {
    const random = seeded(seed);
    const game = new FootballGame(
      Roster.random(data, undefined, { random }),
      Roster.random(data, undefined, { random }),
      300,
      random,
    );
    game.autoRotate.home = true;
    game.clashes = clashes;
    const tally = { plays: 0, scrimmage: 0, clashes: 0, fumbles: 0, outcomes: {}, cells: {} };
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
      if (clash) {
        const cell = `${result.clash.offense}/${result.clash.defense}`;
        tally.outcomes[result.clash.outcome] = (tally.outcomes[result.clash.outcome] ?? 0) + 1;
        tally.cells[cell] = (tally.cells[cell] ?? 0) + 1;
      }
    }
    return { ...tally, points: game.score.home + game.score.away };
  }

  static run(games, clashes) {
    const total = { plays: 0, scrimmage: 0, clashes: 0, fumbles: 0, points: 0, outcomes: {}, cells: {} };
    for (let seed = 1; seed <= games; seed++) {
      const game = ClashBalance.play(seed, clashes);
      for (const key of ['plays', 'scrimmage', 'clashes', 'fumbles', 'points']) total[key] += game[key];
      for (const key of ['outcomes', 'cells'])
        for (const [name, count] of Object.entries(game[key])) total[key][name] = (total[key][name] ?? 0) + count;
    }
    return total;
  }
}

const games = Number(process.argv[2] ?? 500);
const [, , , band, win, breakaway, heavy, strip] = process.argv.map(Number);
if (Number.isFinite(band)) FootballGame.CLASH_BAND = band;
if (Number.isFinite(win)) FootballGame.CLASH_WIN_YARDS = win;
if (Number.isFinite(breakaway)) FootballGame.BREAKAWAY_CHANCE = breakaway;
if (Number.isFinite(heavy)) FootballGame.CLASH_FUMBLE = { heavy, strip };
const totals = {};
for (const clashes of [false, true]) {
  const total = ClashBalance.run(games, clashes);
  totals[clashes] = total;
  const rate = ((100 * total.clashes) / total.scrimmage).toFixed(1);
  console.log(
    `clashes ${clashes ? 'on ' : 'off'}: ${(total.points / games).toFixed(2)} points per game, ${(total.plays / games).toFixed(1)} plays per game, ${(total.fumbles / games).toFixed(2)} fumbles per game` +
      (clashes
        ? `, clash rate ${rate}% of ${(total.scrimmage / games).toFixed(1)} scrimmage plays (band ${FootballGame.CLASH_BAND}), ${(total.clashes / games).toFixed(1)} clashes per game`
        : ''),
  );
  if (clashes) {
    const share = (counts) =>
      Object.entries(counts)
        .map(([name, count]) => `${name} ${((100 * count) / total.clashes).toFixed(1)}%`)
        .join(', ');
    console.log(`clash outcomes: ${share(total.outcomes)}`);
    console.log(`clash cells (carrier/tackler): ${share(total.cells)}`);
  }
}

// Gate: with the human side on its auto action and the CPU on its memory rule, clashes keep scoring within 8% of a game without clashes and fumbles at or below 0.9 per game.
const drift = totals[true].points / totals[false].points - 1;
const fumbles = totals[true].fumbles / games;
const rate = (100 * totals[true].clashes) / totals[true].scrimmage;
const failures = [
  [Math.abs(drift) > 0.08, `points drift ${(100 * drift).toFixed(1)}% exceeds 8%`],
  [fumbles > 0.9, `${fumbles.toFixed(2)} fumbles per game exceeds 0.9`],
  [rate < 20 || rate > 30, `clash rate ${rate.toFixed(1)}% leaves 20-30%`],
].filter(([failed]) => failed);
console.log(failures.length ? `GATE FAILED: ${failures.map(([, text]) => text).join('; ')}` : `gate passed: points drift ${(100 * drift).toFixed(1)}%, ${fumbles.toFixed(2)} fumbles per game`);
if (failures.length) process.exitCode = 1;
