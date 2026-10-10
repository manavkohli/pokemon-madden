const { test } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { MoveBook } = require('../src/game/moves.js');
const { League, SeededRandom } = require('../src/game/league.js');
const { FootballGame } = require('../src/game/football.js');
const { POSITIONS, DEAD_KINDS } = require('../src/game/playbook.js');
const { LeagueSim } = require('../scripts/league-balance.cjs');

const named = (name) => data.find((mon) => mon.name === name);

class Fixture {
  static league(seed = 1, cap = League.DRAFT_CAP) {
    const random = new SeededRandom(seed);
    return League.start(
      data,
      Roster.random(data, cap, () => random.next(), new Map(), League.startingPool(data)),
      () => random.next(),
    );
  }

  // A finished game that only carries what League.record reads.
  static finished(stats, win = true) {
    return { over: true, score: { home: win ? 14 : 3, away: win ? 3 : 14 }, stats: { home: stats, away: {} } };
  }

  // Swaps the named Pokémon off the roster for the cheapest ones that are not on it.
  static bench(league, ...names) {
    for (const name of names) {
      const index = league.roster.players.findIndex((mon) => mon.name === name);
      if (index < 0) continue;
      const cheap = data
        .filter((mon) => !league.roster.players.includes(mon))
        .sort((a, b) => Roster.salary(a) - Roster.salary(b))[0];
      league.roster.assign(index, cheap);
      league.levels.set(cheap.id, league.floor(cheap));
      league.games.set(cheap.id, 0);
    }
  }

  static put(league, ...mons) {
    mons.forEach((mon, index) => {
      league.roster.assign(index, mon);
      league.levels.set(mon.id, league.floor(mon));
      league.games.set(mon.id, 0);
    });
    league.levels.forEach((_, id) => {
      if (!league.roster.players.some((mon) => mon.id === id)) league.levels.delete(id);
    });
  }
}

test('every leader roster is legal under its cap and repeats on a retry', () => {
  const league = Fixture.league();
  League.LEADERS.forEach((leader, index) => {
    const roster = league.leaderRoster(index);
    assert.equal(roster.players.length, POSITIONS.length);
    assert.equal(new Set(roster.players.map((mon) => mon.id)).size, POSITIONS.length);
    assert.ok(roster.salary <= leader.cap, `${leader.name}: ${roster.salary} over ${leader.cap}`);
    assert.deepEqual(
      league.leaderRoster(index).players.map((mon) => mon.id),
      roster.players.map((mon) => mon.id),
    );
  });
});

test('the cap table funds a legal roster for every leader', () => {
  const caps = League.LEADERS.map((leader) => leader.cap);
  assert.equal(caps.length, 13);
  assert.ok(caps.every((cap) => cap >= Roster.salaryRange(data).min));
});

test("Agatha's roster holds all four Ghost types and Brock's holds Rock stars", () => {
  const league = Fixture.league();
  const ghosts = data.filter((mon) => mon.types.includes('Ghost'));
  assert.equal(ghosts.length, 4);
  const agatha = league.leaderRoster(League.LEADERS.findIndex((leader) => leader.name === 'Agatha'));
  for (const ghost of ghosts) assert.ok(agatha.players.includes(ghost), `${ghost.name} plays for Agatha`);
  const brock = league.leaderRoster(0);
  assert.ok(brock.players.filter((mon) => mon.types.includes('Rock')).length >= 3);
});

test('the seeded generator resumes from its saved state', () => {
  const first = new SeededRandom(7);
  first.next();
  const second = new SeededRandom(first.state);
  assert.deepEqual([first.next(), first.next()], [second.next(), second.next()]);
});

test('Roster.random keeps fixed players in their slots and stays under the cap', () => {
  const random = new SeededRandom(3);
  const fixed = new Map([
    [0, named('Mewtwo')],
    [30, named('Lugia')],
  ]);
  const roster = Roster.random(data, 22000, () => random.next(), fixed);
  assert.equal(roster.players[0].name, 'Mewtwo');
  assert.equal(roster.players[30].name, 'Lugia');
  assert.equal(new Set(roster.players.map((mon) => mon.id)).size, POSITIONS.length);
  assert.ok(roster.salary <= 22000);
});

test('Roster.evolve moves stamina, conditions, stages, and moves to the new id', () => {
  const roster = Roster.random(data, 13000, () => 0.5);
  const charmander = named('Charmander');
  roster.assign(0, charmander);
  roster.setMoveset(charmander, ['ember', 'scratch', 'growl']);
  roster.spend(charmander, 30);
  roster.afflict(charmander, 'burn');
  roster.shift(charmander, 'attack', 1);
  roster.evolve(charmander, 5);
  const charmeleon = named('Charmeleon');
  assert.equal(roster.players[0], charmeleon);
  assert.equal(roster.energy(charmeleon), 70);
  assert.equal(roster.energy(charmander), 100);
  assert.ok(roster.has(charmeleon, 'burn'));
  assert.equal(roster.stage(charmeleon, 'attack'), 1);
  const moves = roster.moveset(charmeleon);
  assert.ok(moves.length <= MoveBook.MOVESET_SIZE);
  assert.ok(moves.every((name) => MoveBook.learnable(charmeleon).includes(name)));
  for (const known of ['ember', 'scratch', 'growl']) assert.ok(moves.includes(known), `${known} is kept`);
  assert.ok(!roster.movesets.has(charmander.id));
  assert.throws(() => roster.evolve(charmander, 5), RangeError);
});

const gain = (impact) => Math.round(impact * League.IMPACT_SCALE) + League.WIN_BONUS;

test('level gains follow the box score and a win adds a bonus level for everyone', () => {
  assert.equal(
    League.impact({ yards: 125, touchdowns: 2, tackles: 3, sacks: 1, interceptions: 1, moveHits: 2 }),
    12 + 6 + 3 + 4 + 2,
  );
  assert.equal(League.impact({ yards: -14 }), 0);
  assert.equal(League.impact(), 0);
  const league = Fixture.league();
  const mon = league.roster.players[5];
  const before = league.level(mon);
  const report = league.record(Fixture.finished({ [mon.id]: { yards: 30, touchdowns: 1 } }));
  assert.equal(league.level(mon), before + gain(3 + 3));
  assert.equal(report.mvp, mon);
  const other = league.roster.players[6];
  assert.equal(
    report.gains.find((entry) => entry.mon === other).to - report.gains.find((entry) => entry.mon === other).from,
    League.WIN_BONUS,
  );
});

test('a win earns the badge and stone and opens the next leader; a loss changes nothing', () => {
  const league = Fixture.league();
  league.record(Fixture.finished({}, false));
  assert.equal(league.stage, 0);
  assert.deepEqual(league.badges, []);
  league.record(Fixture.finished({}));
  assert.equal(league.stage, 1);
  assert.deepEqual(league.badges, ['Brock']);
  const report = league.record(Fixture.finished({}));
  assert.equal(report.stone, 'water-stone');
  assert.equal(league.stones['water-stone'], 1);
  assert.equal(league.stage, 2);
});

test('level, trade, and friendship evolutions fire when their condition is met', () => {
  const league = Fixture.league();
  Fixture.put(league, named('Bulbasaur'), named('Kadabra'), named('Machoke'), named('Golbat'));
  league.games.set(named('Golbat').id, 4);
  const stats = {
    [named('Bulbasaur').id]: { yards: 300, touchdowns: 4 },
    [named('Kadabra').id]: { yards: 500, touchdowns: 6 },
  };
  const report = league.record(Fixture.finished(stats));
  const reasons = Object.fromEntries(report.events.map((event) => [event.from.name, event.reason]));
  assert.equal(reasons.Bulbasaur, 'level-up');
  assert.equal(reasons.Kadabra, 'trade');
  assert.equal(reasons.Golbat, 'friendship');
  assert.equal(reasons.Machoke, undefined);
  assert.equal(league.roster.players[0].name, 'Ivysaur');
  assert.equal(league.roster.players[1].name, 'Alakazam');
  assert.equal(league.roster.players[3].name, 'Crobat');
  assert.equal(league.level(named('Ivysaur')), 5 + gain(30 + 12));
});

test('a trade evolution needs the MVP and a loss has no MVP', () => {
  const league = Fixture.league();
  Fixture.put(league, named('Kadabra'));
  const report = league.record(Fixture.finished({ [league.roster.players[1].id]: { yards: 80 } }));
  assert.equal(
    report.events.find((event) => event.from.name === 'Kadabra'),
    undefined,
  );
  const loss = league.record(Fixture.finished({ [named('Kadabra').id]: { yards: 300 } }, false));
  assert.equal(loss.mvp, null);
  assert.equal(league.roster.players[0].name, 'Kadabra');
});

test('an evolution whose target is already on the roster waits', () => {
  const league = Fixture.league();
  Fixture.put(league, named('Bulbasaur'), named('Ivysaur'));
  league.levels.set(named('Bulbasaur').id, 30);
  const report = league.record(Fixture.finished({}));
  const event = report.events.find((entry) => entry.from.name === 'Bulbasaur');
  assert.equal(event.waiting, true);
  assert.equal(event.reason, 'already on your team');
  assert.equal(league.roster.players[0].name, 'Bulbasaur');
});

test('stones evolve the chosen player and are spent', () => {
  const league = Fixture.league();
  Fixture.put(league, named('Pikachu'), named('Eevee'));
  Fixture.bench(league, 'Raichu', 'Flareon');
  assert.throws(() => league.evolve(named('Pikachu').id, 'thunder-stone'), RangeError);
  league.stones = { 'thunder-stone': 1, 'fire-stone': 1 };
  assert.throws(() => league.evolve(named('Pikachu').id, 'fire-stone'), RangeError);
  const event = league.evolve(named('Pikachu').id, 'thunder-stone');
  assert.equal(event.into.name, 'Raichu');
  assert.equal(league.stones['thunder-stone'], 0);
  assert.throws(() => league.evolve(named('Raichu').id, 'thunder-stone'), RangeError);
  assert.equal(league.evolve(named('Eevee').id, 'fire-stone').into.name, 'Flareon');
});

test('stage floors follow the evolution chain', () => {
  const league = Fixture.league();
  assert.equal(league.floor(named('Bulbasaur')), 5);
  assert.equal(league.floor(named('Ivysaur')), 16);
  assert.equal(league.floor(named('Venusaur')), 40);
  assert.equal(league.floor(named('Pikachu')), 20);
  assert.equal(league.floor(named("Farfetch'd")), 5);
});

test('a fourth transfer throws and a transfer cannot lift the roster over the cap', () => {
  const league = Fixture.league();
  Fixture.put(
    league,
    ...[
      'Mewtwo',
      'Mew',
      'Lugia',
      'Ho-oh',
      'Articuno',
      'Zapdos',
      'Moltres',
      'Entei',
      'Raikou',
      'Suicune',
      'Tyranitar',
      'Snorlax',
    ].map(named),
  );
  const onRoster = new Set(league.roster.players);
  const cheap = data.filter((mon) => !onRoster.has(mon)).sort((a, b) => Roster.salary(a) - Roster.salary(b));
  const expensive = [...league.roster.players].sort((a, b) => Roster.salary(b) - Roster.salary(a));
  assert.equal(league.playerCap, 13000);
  const cheapest = [...league.roster.players].sort((a, b) => Roster.salary(a) - Roster.salary(b))[0];
  assert.throws(() => league.transfer(cheapest.id, named('Celebi').id), RangeError);
  for (let index = 0; index < League.TRANSFERS; index++) league.transfer(expensive[index].id, cheap[index].id);
  assert.equal(league.transfersLeft, 0);
  assert.throws(() => league.transfer(expensive[3].id, cheap[3].id), RangeError);
  assert.equal(league.level(cheap[0]), league.floor(cheap[0]));
  league.record(Fixture.finished({}));
  assert.equal(league.transfersLeft, League.TRANSFERS);
});

test('a saved and reloaded league plays the next game with the same result', () => {
  const league = Fixture.league(4);
  league.roster.setMoveset(league.roster.players[0], MoveBook.learnable(league.roster.players[0]).slice(0, 2));
  const first = new LeagueSim(1).play(league.game());
  league.record(first);
  const saved = JSON.parse(JSON.stringify(league.toJSON()));
  const reloaded = League.fromJSON(data, saved);
  assert.deepEqual(reloaded.toJSON(), league.toJSON());
  const original = new LeagueSim(2).play(league.game());
  const copy = new LeagueSim(2).play(reloaded.game());
  assert.deepEqual(copy.score, original.score);
  assert.deepEqual(copy.log, original.log);
  assert.deepEqual(copy.stats, original.stats);
  assert.throws(() => League.fromJSON(data, { ...saved, version: 99 }), RangeError);
});

test('the box score sums to the yards in the drive log', () => {
  const league = Fixture.league(2);
  const game = league.game();
  const yards = [];
  const snap = game.snap.bind(game);
  const settle = (result) => {
    if (!DEAD_KINDS.includes(result.offense.kind) && result.outcome !== 'clock-expired') yards.push(result.yards);
    return result;
  };
  game.snap = (...args) => {
    const result = snap(...args);
    return result.clash ? result : settle(result);
  };
  const clash = game.autoResolveClash.bind(game);
  game.autoResolveClash = () => settle(clash());
  new LeagueSim(3).play(game);
  const boxed = ['home', 'away']
    .flatMap((side) => Object.values(game.stats[side]))
    .reduce((sum, box) => sum + box.yards, 0);
  assert.ok(yards.length > 20);
  assert.equal(
    boxed,
    yards.reduce((sum, value) => sum + value, 0),
  );
  const totals = (key) =>
    ['home', 'away'].flatMap((side) => Object.values(game.stats[side])).reduce((sum, box) => sum + box[key], 0);
  assert.ok(totals('tackles') > 0);
});

test('a leader style lifts its call group on offense and pressure calls on defense', () => {
  const share = (style, side) => {
    const random = new SeededRandom(11);
    const game = new FootballGame(Roster.random(data, 20000), Roster.random(data, 20000), 300, () => random.next());
    game.cpuStyle = style;
    let hits = 0;
    for (let index = 0; index < 300; index++) {
      if (side === 'offense')
        hits += game.chooseCpuOffense().group === { run: 'run', pass: 'pass', pressure: 'trick' }[style] ? 1 : 0;
      else
        hits += ['blitz', 'zone-blitz', 'fire-zone', 'cover-0', 'run-blitz'].includes(game.chooseCpuDefense().id)
          ? 1
          : 0;
    }
    return hits;
  };
  assert.ok(share('run', 'offense') > share('balanced', 'offense'));
  assert.ok(share('pass', 'offense') > share('balanced', 'offense'));
  assert.ok(share('pressure', 'offense') > share('balanced', 'offense'));
  assert.ok(share('pressure', 'defense') > share('balanced', 'defense'));
});

test('a seeded CPU-against-CPU circuit finishes all 13 games', () => {
  const result = new LeagueSim(7, League.TRANSFERS).circuit();
  assert.equal(result.complete, true);
  assert.equal(result.gyms.length, 13);
  assert.ok(result.gyms.every((gym) => gym.won));
});

test('the circuit draft pool holds only Pokémon with an evolution left and fills every position', () => {
  const pool = League.startingPool(data);
  assert.ok(pool.length > 100 && pool.every((mon) => mon.evolutions.length > 0));
  assert.ok(!pool.includes(named('Dragonite')) && !pool.includes(named('Ditto')));
  for (let seed = 1; seed <= 50; seed++) {
    const random = new SeededRandom(seed);
    const roster = Roster.random(data, League.DRAFT_CAP, () => random.next(), new Map(), pool);
    assert.equal(roster.players.length, POSITIONS.length);
    assert.equal(new Set(roster.players.map((mon) => mon.id)).size, POSITIONS.length);
    assert.ok(roster.salary <= League.DRAFT_CAP && roster.players.every((mon) => pool.includes(mon)));
  }
  const outside = Roster.random(data, League.DRAFT_CAP, () => 0.5);
  assert.throws(() => League.start(data, outside), RangeError);
});

test('the player cap grows by 1,000 per badge and only blocks transfers that raise payroll', () => {
  const league = Fixture.league();
  assert.equal(league.playerCap, 13000);
  league.record(Fixture.finished({}));
  assert.equal(league.playerCap, 14000);
  Fixture.put(
    league,
    ...[
      'Mewtwo',
      'Mew',
      'Lugia',
      'Ho-oh',
      'Articuno',
      'Zapdos',
      'Moltres',
      'Entei',
      'Raikou',
      'Suicune',
      'Tyranitar',
      'Snorlax',
    ].map(named),
  );
  assert.ok(league.roster.salary > league.playerCap, 'evolution-sized payroll may exceed the cap');
  const cheapest = [...league.roster.players].sort((a, b) => Roster.salary(a) - Roster.salary(b))[0];
  assert.throws(() => league.transfer(cheapest.id, named('Celebi').id), RangeError);
  league.transfer(named('Mewtwo').id, 129);
});

test('Giovanni awards the Sun Stone and it evolves Gloom into Bellossom', () => {
  const league = Fixture.league();
  league.stage = League.LEADERS.findIndex((leader) => leader.name === 'Giovanni');
  Fixture.put(league, named('Gloom'));
  Fixture.bench(league, 'Bellossom', 'Vileplume');
  const report = league.record(Fixture.finished({}));
  assert.equal(report.stone, 'sun-stone');
  assert.equal(league.evolve(named('Gloom').id, 'sun-stone').into.name, 'Bellossom');
});

test("a clash play's yards and tackle reach the box score", () => {
  const league = Fixture.league(5);
  const game = league.game();
  const view = LeagueSim.mirror(game);
  const total = (key) =>
    ['home', 'away'].flatMap((side) => Object.values(game.stats[side])).reduce((sum, box) => sum + box[key], 0);
  let checked = 0;
  for (let snaps = 0; !game.over && snaps < 900 && checked < 5; snaps++) {
    const home = game.possession === 'home';
    game.prepareCall(home ? view.chooseCpuOffense() : view.chooseCpuDefense());
    const { offense, defense } = game.phase;
    const options = (home ? view : game).cpuOptions(offense, defense);
    if (!game.snap(offense, defense, options).clash) continue;
    const yardsBefore = total('yards');
    const tacklesBefore = total('tackles');
    const final = game.autoResolveClash();
    assert.equal(total('yards') - yardsBefore, final.yards);
    assert.equal(total('tackles') - tacklesBefore, FootballGame.TACKLE_OUTCOMES.includes(final.outcome) ? 1 : 0);
    checked += 1;
  }
  assert.ok(checked > 0, 'the game reached at least one clash');
});
