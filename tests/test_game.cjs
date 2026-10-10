const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { PlayMatchup } = require('../src/game/matchup.js');
const { FootballGame: Football } = require('../src/game/football.js');

// Most suites assert pre-contact outcomes, so their games skip the clash step.
class FootballGame extends Football {
  constructor(...args) {
    super(...args);
    this.clashes = false;
  }
}
const { OFFENSE, DEFENSE, POSITIONS, SALARY_CAP } = require('../src/game/playbook.js');

class RosterChecks {
  constructor(seed) {
    this.seed = seed;
  }

  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 2 ** 32;
  }

  static run() {
    const salaries = data.map((mon) => Roster.salary(mon)).sort((a, b) => a - b);
    const minimum = salaries.slice(0, 31).reduce((sum, salary) => sum + salary, 0);
    const maximum = salaries.slice(-31).reduce((sum, salary) => sum + salary, 0);
    assert.deepEqual(Roster.salaryRange(data), { min: minimum, max: maximum });
    assert.throws(() => Roster.random(data, minimum - 1), RangeError);
    assert.throws(() => Roster.random(data, NaN), RangeError);
    const drafts = new Set();
    let cheapSpending = 0;
    let highSpending = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const cap of [minimum, 9500, 12000, 18000, SALARY_CAP, 27000, Infinity]) {
        const rolls = new RosterChecks(seed);
        const roster = Roster.random(data, cap, () => rolls.random());
        assert.equal(roster.players.length, POSITIONS.length);
        assert.equal(new Set(roster.players.map((mon) => mon.id)).size, POSITIONS.length);
        assert.ok(roster.salary <= cap, `${cap}: generated salary ${roster.salary}`);
        for (const position of POSITIONS) assert.ok(roster.player(position.code, position.depth - 1));
        if (cap === minimum) assert.equal(roster.salary, minimum);
        if (cap === 12000) cheapSpending += roster.salary;
        if (cap === SALARY_CAP) {
          highSpending += roster.salary;
          drafts.add(roster.players.map((mon) => mon.id).join(','));
        }
      }
    }
    assert.equal(drafts.size, 20, 'generation produces different teams');
    assert.ok(highSpending > cheapSpending, 'higher budgets allow more expensive teams');
  }
}

class ParticipantChecks {
  static stronger(roster, role, depth) {
    const player = roster.player(role, depth);
    const stronger = new Roster(data, []);
    stronger.players = roster.players.map((mon) =>
      mon.id === player.id
        ? {
            ...mon,
            base_stats: { ...Object.fromEntries(Object.keys(mon.base_stats).map((stat) => [stat, 150])), total: 900 },
          }
        : mon,
    );
    return stronger;
  }

  static run(roster, rival) {
    for (const [id, role, depth] of [
      ['qb-sneak', 'QB', 0],
      ['qb-scramble', 'QB', 0],
      ['jet-sweep', 'WR', 0],
      ['reverse', 'WR', 0],
      ['te-seam', 'TE', 0],
      ['screen-pass', 'RB', 0],
      ['wheel-route', 'RB', 1],
    ]) {
      const play = OFFENSE.find((call) => call.id === id);
      const roll = () => 0.5;
      const normal = new FootballGame(roster, rival, 300, roll);
      const improved = new FootballGame(this.stronger(roster, role, depth), rival, 300, roll);
      const coverage = DEFENSE.find((call) => call.id === 'cover-3');
      const baseline = new PlayMatchup(normal.rosters.home, normal.rosters.away, play, coverage);
      const upgraded = new PlayMatchup(improved.rosters.home, improved.rosters.away, play, coverage);
      assert.ok(upgraded.yardBonus > baseline.yardBonus, `${id} uses its carrier's rating`);
      const defense = DEFENSE.find((call) => call.id === 'run-stuff');
      assert.ok(improved.snap(play, defense).yards > normal.snap(play, defense).yards, id);
    }
    const doublePass = OFFENSE.find((play) => play.id === 'double-pass');
    const normal = new FootballGame(roster, rival, 300, () => 0.5);
    const improved = new FootballGame(this.stronger(roster, 'QB', 1), rival, 300, () => 0.5);
    const baseline = new PlayMatchup(normal.rosters.home, normal.rosters.away, doublePass, DEFENSE[0]);
    const upgraded = new PlayMatchup(improved.rosters.home, improved.rosters.away, doublePass, DEFENSE[0]);
    assert.ok(upgraded.chances(0).completion > baseline.chances(0).completion, 'second QB throws');

    for (const play of OFFENSE) {
      const game = new FootballGame(roster, rival, 300, () => 0.5);
      if (play.group === 'special') game.down = 4;
      const result = game.snap(play, DEFENSE[0]);
      const offenseIds = roster.lineup('offense', play).map((slot) => slot.mon.id);
      const defenseIds = rival.lineup('defense', DEFENSE[0]).map((slot) => slot.mon.id);
      assert.ok(offenseIds.includes(result.participants.carrier.id), play.id);
      assert.ok(offenseIds.includes(result.participants.support.id), play.id);
      assert.ok(defenseIds.includes(result.participants.defender.id), play.id);
      assert.ok(defenseIds.includes(result.participants.help.id), play.id);
    }
    const reverse = OFFENSE.find((play) => play.id === 'reverse');
    const rolls = [0.99, 0.5, 0];
    const fumble = new FootballGame(roster, rival, 300, () => rolls.shift()).snap(reverse, DEFENSE[0]);
    assert.equal(reverse.group, 'trick');
    assert.equal(reverse.kind, 'run');
    assert.equal(fumble.outcome, 'fumble', 'reverse uses run turnovers');
  }
}

assert.equal(data.length, 251);
RosterChecks.run();
assert.ok(OFFENSE.length >= 35);
assert.ok(DEFENSE.length >= 25);
assert.deepEqual(
  data.map((mon) => mon.id),
  Array.from({ length: 251 }, (_, i) => i + 1),
);
for (const mon of data) {
  const { total, ...stats } = mon.base_stats;
  assert.equal(
    total,
    Object.values(stats).reduce((sum, value) => sum + value, 0),
    mon.name,
  );
  assert.ok(mon.types.length >= 1, mon.name);
}

const ids = Array.from({ length: POSITIONS.length }, (_, i) => i + 1);
const home = new Roster(data, ids);
const away = Roster.random(data);
assert.equal(POSITIONS.length, 31);
assert.equal(new Set(away.players.map((mon) => mon.id)).size, 31);
assert.ok(away.salary <= 26000);
assert.ok(Roster.rating(data[24], 'QB') > 0);
home.assign(0, data[1]);
assert.equal(home.players[0].id, 2);
assert.equal(home.players[1].id, 1);

for (const [id, role, count] of [
  ['inside-zone', 'WR', 3],
  ['power-run', 'TE', 2],
  ['four-verticals', 'WR', 4],
  ['double-pass', 'QB', 2],
]) {
  const lineup = home.lineup(
    'offense',
    OFFENSE.find((play) => play.id === id),
  );
  assert.equal(lineup.length, 11);
  assert.equal(lineup.filter((slot) => slot.role === role).length, count);
  assert.equal(new Set(lineup.map((slot) => slot.mon.id)).size, 11);
}
assert.equal(
  home
    .lineup(
      'defense',
      DEFENSE.find((play) => play.id === 'dime'),
    )
    .filter((slot) => slot.role === 'CB').length,
  4,
);

const insideZone = OFFENSE.find((play) => play.id === 'inside-zone');
const dime = DEFENSE.find((play) => play.id === 'dime');
const stuffedGame = new FootballGame(home, away, 300, () => 0);
assert.equal(stuffedGame.playClockSeconds, 25);
const stuffed = stuffedGame.snap(insideZone, dime);
assert.equal(stuffed.outcome, 'stuff');
assert.equal(stuffedGame.seconds, 294);
assert.equal(stuffedGame.playClockSeconds, 40);
stuffedGame.possession = 'away';
stuffedGame.snap(insideZone, dime);
assert.equal(stuffedGame.playClockSeconds, 40, 'defense has the same normal deadline as offense');

const rolls = [0.99, 0];
const pickedGame = new FootballGame(home, away, 300, () => rolls.shift() ?? 0.5);
const screen = OFFENSE.find((play) => play.id === 'screen-pass');
const zoneBlitz = DEFENSE.find((play) => play.id === 'zone-blitz');
const picked = pickedGame.snap(screen, zoneBlitz);
assert.equal(picked.outcome, 'interception');
assert.equal(pickedGame.playClockSeconds, 25);

const conversionRolls = [0.99, 0.99, 0, 0.5, 0.5];
const conversion = new FootballGame(home, away, 300, () => conversionRolls.shift() ?? 0.5);
conversion.toGo = 1;
const converted = conversion.snap(
  OFFENSE.find((play) => play.id === 'deep-shot'),
  DEFENSE.find((play) => play.id === 'run-stuff'),
);
assert.match(converted.message, /FIRST DOWN/);
assert.equal(conversion.playClockSeconds, 40, 'a first down does not shorten the deadline');

const touchdownRolls = [0.99, 0.99, 0, 0.5, 0.5];
const game = new FootballGame(home, away, 300, () => touchdownRolls.shift() ?? 0.5);
game.spot = 98;
const touchdown = game.snap(
  OFFENSE.find((play) => play.id === 'deep-shot'),
  DEFENSE.find((play) => play.id === 'run-stuff'),
);
assert.match(touchdown.message, /TOUCHDOWN/);
assert.equal(game.score.home, 7);
assert.equal(game.possession, 'away');
assert.equal(game.spot, 25);
assert.equal(game.playClockSeconds, 25);

const turnover = new FootballGame(home, away, 300, () => 0.99);
turnover.down = 4;
const failedFourth = turnover.snap(
  OFFENSE.find((play) => play.id === 'hail-mary'),
  DEFENSE.find((play) => play.id === 'cover-4'),
);
assert.equal(turnover.possession, 'away');
assert.equal(turnover.down, 1);
assert.match(failedFourth.message, /TURNOVER ON DOWNS/);
assert.equal(turnover.playClockSeconds, 25);

const quarter = new FootballGame(home, away, 300, () => 0);
quarter.seconds = 1;
quarter.snap(
  OFFENSE.find((play) => play.id === 'inside-zone'),
  DEFENSE.find((play) => play.id === 'cover-3'),
);
assert.equal(quarter.quarter, 2);
assert.equal(quarter.seconds, 300);
assert.equal(quarter.playClockSeconds, 25);

const halftime = new FootballGame(home, away, 300, () => 0.5);
halftime.quarter = 2;
halftime.seconds = 1;
halftime.possession = 'away';
halftime.snap(
  OFFENSE.find((play) => play.id === 'inside-zone'),
  DEFENSE.find((play) => play.id === 'cover-3'),
);
assert.equal(halftime.quarter, 3);
assert.equal(halftime.possession, 'away');
assert.equal(halftime.spot, 25);

const overtimeRolls = [0.99, 0.99, 0, 0.5, 0.5];
const overtime = new FootballGame(home, away, 300, () => overtimeRolls.shift() ?? 0.5);
overtime.quarter = 5;
overtime.spot = 98;
overtime.snap(
  OFFENSE.find((play) => play.id === 'deep-shot'),
  DEFENSE.find((play) => play.id === 'run-stuff'),
);
assert.equal(overtime.over, true);

const fourthDown = new FootballGame(home, away, 300, () => 0.5);
fourthDown.possession = 'away';
fourthDown.down = 4;
fourthDown.toGo = 10;
fourthDown.spot = 30;
assert.equal(fourthDown.chooseCpuOffense().id, 'punt');
fourthDown.spot = 70;
assert.equal(fourthDown.chooseCpuOffense().id, 'field-goal');

const scout = new FootballGame(home, away, 300, () => 0.5);
scout.history = Array.from({ length: 6 }, () => ({ side: 'home', id: 'inside-zone', kind: 'run' }));
assert.ok(scout.chooseCpuDefense().strengths.includes('run'));

const strongFront = new FootballGame(home, away, 300, () => 0.5);
const weakFront = new FootballGame(home, away, 300, () => 0.5);
assert.ok(
  strongFront.snap(
    OFFENSE.find((play) => play.id === 'inside-zone'),
    DEFENSE.find((play) => play.id === 'run-stuff'),
  ).yards <
    weakFront.snap(
      OFFENSE.find((play) => play.id === 'inside-zone'),
      DEFENSE.find((play) => play.id === 'cover-4'),
    ).yards,
);

const freshCall = new FootballGame(home, away, 300, () => 0.5);
const repeatedCall = new FootballGame(home, away, 300, () => 0.5);
repeatedCall.history = Array.from({ length: 2 }, () => ({ side: 'home', id: 'quick-slant', kind: 'short' }));
const slant = OFFENSE.find((play) => play.id === 'quick-slant');
const cover = DEFENSE.find((play) => play.id === 'cover-3');
assert.ok(repeatedCall.snap(slant, cover).yards < freshCall.snap(slant, cover).yards);

ParticipantChecks.run(
  home,
  new Roster(
    data,
    ids.map((id) => id + 100),
  ),
);
console.log('Game data, participants, and turn rules passed.');
