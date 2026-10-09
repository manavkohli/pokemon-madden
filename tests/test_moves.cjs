const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pokemon: data, moves } = require('../pokemon_gen1_2.json');
const { MoveBook } = require('../src/game/moves.js');
const { Roster } = require('../src/game/roster.js');
const { FootballGame } = require('../src/game/football.js');
const { PlayMatchup } = require('../src/game/matchup.js');
const { BattleMotion } = require('../src/ui/battle/motion.js');
const { OFFENSE, DEFENSE, POSITIONS } = require('../src/game/playbook.js');

class Moves {
  static offense(id = 'inside-zone') {
    return OFFENSE.find((play) => play.id === id);
  }

  static defense(id = 'cover-3') {
    return DEFENSE.find((play) => play.id === id);
  }

  // Two Normal-type teams of equal stats whose players all know the same four moves.
  static game(random = () => 0.5) {
    const teams = [0, 100].map((offset) => {
      const roster = new Roster(
        data,
        POSITIONS.map((_, index) => index + 1 + offset),
      );
      roster.players = roster.players.map((mon) => ({
        ...mon,
        types: ['Normal'],
        moves: [
          'thunderbolt',
          'thunder',
          'tackle',
          'surf',
          'thunder-wave',
          'agility',
          'recover',
          'growl',
          'toxic',
          'leech-seed',
          'confuse-ray',
          'sleep-powder',
          'double-team',
        ],
        base_stats: { hp: 80, attack: 80, defense: 80, special_attack: 80, special_defense: 80, speed: 80, total: 480 },
      }));
      return roster;
    });
    return new FootballGame(...teams, 300, random);
  }

  static learn(game, side, mon, names) {
    game.rosters[side].setMoveset(mon, names);
  }

  static pick(game, side, mon, move, play) {
    const roster = game.rosters[side];
    if (!roster.moveset(mon).includes(move)) roster.setMoveset(mon, [...roster.moveset(mon).slice(0, 3), move]);
    game.prepareCall(side === game.possession ? play : Moves.offense());
    return game.activateMove(side, mon.id, move, play);
  }

  static mon(name) {
    return data.find((mon) => mon.name === name);
  }

  static roster() {
    return new Roster(
      data,
      POSITIONS.map((_, index) => index + 1),
    );
  }
}

describe('MoveBook families and magnitudes', () => {
  test('every rule-mapped move has a family and the rest stay out of the picker', () => {
    const mapped = Object.keys(moves).filter((name) => MoveBook.family(name));
    assert.equal(mapped.length, 218);
    assert.equal(MoveBook.family('splash'), null);
    assert.equal(MoveBook.family('metronome'), null);
    assert.equal(MoveBook.family('thunder-wave'), 'ailment');
    assert.equal(MoveBook.family('swagger'), 'ailment');
    assert.equal(MoveBook.family('protect'), 'protect');
    assert.equal(MoveBook.family('fissure'), 'ohko');
    assert.equal(MoveBook.family('roar'), 'switch');
    assert.equal(MoveBook.family('agility'), 'stat');
    assert.equal(MoveBook.family('rain-dance'), 'field');
    assert.equal(MoveBook.family('recover'), 'heal');
  });

  test('every damage move is a strike and an unmodeled secondary is dropped', () => {
    const damage = Object.values(moves).filter((move) => move.meta.category.startsWith('damage'));
    assert.equal(damage.length, 154);
    assert.ok(damage.every((move) => MoveBook.family(move.name) === 'strike'));
    assert.equal(MoveBook.family('tri-attack'), 'strike');
    assert.equal(MoveBook.secondary('tri-attack'), null);
    assert.deepEqual(MoveBook.secondary('thunderbolt'), { kind: 'ailment', ailment: 'paralysis', chance: 10 });
    assert.equal(MoveBook.secondary('thunder-wave'), null);
  });

  test('the median Pokémon has 29 learnable moves and nine have fewer than four', () => {
    const counts = data.map((mon) => MoveBook.learnable(mon).length).sort((a, b) => a - b);
    assert.equal(counts[125], 29);
    const few = data.filter((mon) => MoveBook.learnable(mon).length < 4).map((mon) => mon.name);
    assert.deepEqual(few.sort(), [
      'Caterpie',
      'Ditto',
      'Kakuna',
      'Magikarp',
      'Metapod',
      'Smeargle',
      'Unown',
      'Weedle',
      'Wobbuffet',
    ]);
    assert.equal(MoveBook.learnable(Moves.mon('Ditto')).length, 0);
  });

  test('uses and stamina cost follow the move', () => {
    assert.equal(MoveBook.uses('tackle'), 7);
    assert.equal(MoveBook.uses('thunderbolt'), 3);
    assert.equal(MoveBook.uses('hydro-pump'), 1);
    assert.equal(MoveBook.cost('thunderbolt'), 11);
    assert.equal(MoveBook.cost('agility'), 6);
  });

  test('a strike is zero into immunity, capped at 30, and scaled by STAB', () => {
    const pikachu = Moves.mon('Pikachu');
    const electric = { ...pikachu, base_stats: { ...pikachu.base_stats, special_attack: 100 } };
    const skill = new Roster(data, []).skill(electric, 'special_attack');
    const water = Moves.mon('Squirtle');
    const ground = Moves.mon('Diglett');
    const strike = (name, actor, target, power = skill) =>
      MoveBook.strike(name, { actor, skill: power, effectiveness: MoveBook.effectiveness(name, target) });
    assert.equal(MoveBook.effectiveness('thunderbolt', ground), 0);
    assert.equal(strike('thunderbolt', electric, ground), 0);
    assert.equal(strike('quick-attack', electric, Moves.mon('Gastly')), 0);
    assert.equal(MoveBook.effectiveness('thunderbolt', water), 2);
    assert.equal(strike('thunderbolt', electric, water), 30);
    assert.ok(MoveBook.strike('thunderbolt', { actor: electric, skill: 70, effectiveness: 1 }) > 0);
    assert.ok(
      MoveBook.strike('thunderbolt', { actor: electric, skill: 70, effectiveness: 1 }) >
        MoveBook.strike('thunderbolt', { actor: water, skill: 70, effectiveness: 1 }),
    );
  });

  test('priority and a critical hit add to a strike value before the cap', () => {
    const rattata = Moves.mon('Rattata');
    const base = MoveBook.strike('quick-attack', { actor: rattata, skill: 70, effectiveness: 1 });
    const crit = MoveBook.strike('quick-attack', { actor: rattata, skill: 70, effectiveness: 1, crit: true });
    assert.ok(base >= 8);
    assert.equal(crit, Math.min(30, base * 2));
  });
});

describe('Roster movesets', () => {
  test('every player carries a default moveset of learnable moves, led by an Electric strike for Pikachu', () => {
    for (const mon of data) {
      const moveset = MoveBook.defaultMoveset(mon);
      assert.ok(moveset.length <= 4);
      assert.ok(moveset.every((name) => MoveBook.learnable(mon).includes(name)));
    }
    const first = MoveBook.defaultMoveset(Moves.mon('Pikachu'))[0];
    assert.equal(MoveBook.family(first), 'strike');
    assert.equal(moves[first].type, 'Electric');
    assert.deepEqual(MoveBook.defaultMoveset(Moves.mon('Ditto')), []);
  });

  test('a roster copy keeps its picks and a replaced player loses them', () => {
    const roster = Moves.roster();
    const mon = roster.players[0];
    const pick = MoveBook.learnable(mon).slice(0, 2);
    roster.setMoveset(mon, pick);
    assert.deepEqual(roster.copy().moveset(mon), pick);
    roster.assign(
      0,
      data.find((other) => !roster.players.includes(other)),
    );
    assert.deepEqual(roster.moveset(mon), MoveBook.defaultMoveset(mon));
  });
});

describe('Strikes on the field', () => {
  test('an Electric strike into a Ground opponent changes no margin', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    rb.types = ['Electric'];
    for (const mon of game.rosters.away.players) mon.types = ['Ground'];
    const args = [game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense(), 'middle', {}];
    const base = new PlayMatchup(...args);
    const strike = new PlayMatchup(...args, { attack: { side: 'home', actor: rb, move: 'thunderbolt', hit: true } });
    assert.equal(strike.moveRecords[0].effectiveness, 0);
    assert.deepEqual(
      [strike.protection, strike.separation, strike.tackle],
      [base.protection, base.separation, base.tackle],
    );
  });

  test('a hit adds the strike value to the actor contest and a miss adds nothing', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    const args = [game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense(), 'middle', {}];
    const base = new PlayMatchup(...args);
    const entry = { side: 'home', actor: rb, move: 'tackle', crit: false };
    const hit = new PlayMatchup(...args, { attack: { ...entry, hit: true } });
    const miss = new PlayMatchup(...args, { attack: { ...entry, hit: false } });
    assert.ok(hit.tackle > base.tackle);
    assert.equal(miss.tackle, base.tackle);
    assert.equal(hit.moveRecords[0].value, Math.round(hit.tackle - base.tackle));
  });

  test('a hit and a miss each spend one PP and the stamina cost', () => {
    for (const [move, random, hit] of [
      ['thunderbolt', () => 0.5, true],
      ['thunder', () => 0.99, false],
    ]) {
      const game = Moves.game(random);
      const rb = game.rosters.home.player('RB');
      Moves.pick(game, 'home', rb, move, Moves.offense());
      assert.equal(game.ppLeft('home', rb, move), MoveBook.uses(move));
      const result = game.snap(game.phase.offense, game.phase.defense);
      assert.equal(result.moves[0].hit, hit);
      assert.equal(game.ppLeft('home', rb, move), MoveBook.uses(move) - 1);
      assert.equal(game.rosters.home.energy(rb), 100 - MoveBook.cost(move) - 7);
      assert.match(
        game.log.find((line) => line.includes(rb.name)),
        hit ? /used Thunderbolt!/ : /Thunder missed!/,
      );
    }
  });

  test('a defensive CB actor becomes the marker on a pass call', () => {
    const game = Moves.game();
    const cb = game.rosters.away.player('CB', 1);
    const args = [game.rosters.home, game.rosters.away, Moves.offense('quick-slant'), Moves.defense(), 'middle', {}];
    const base = new PlayMatchup(...args);
    assert.notEqual(base.marker.mon.id, cb.id);
    const matchup = new PlayMatchup(...args, { defend: { side: 'away', actor: cb, move: 'tackle', hit: true } });
    assert.equal(matchup.marker.mon.id, cb.id);
    assert.equal(matchup.tackler.mon.id, cb.id);
    assert.equal(matchup.moveRecords[0].target.id, matchup.carrier.id);
    assert.ok(matchup.separation < base.separation);
  });

  test('a DL actor becomes the rusher and an LB actor the run tackler', () => {
    const game = Moves.game();
    const dl = game.rosters.away.player('DL', 3);
    const lb = game.rosters.away.player('LB', 2);
    const pass = [game.rosters.home, game.rosters.away, Moves.offense('quick-slant'), Moves.defense(), 'middle', {}];
    const rush = new PlayMatchup(...pass, { defend: { side: 'away', actor: dl, move: 'tackle', hit: true } });
    assert.equal(rush.rusher.id, dl.id);
    assert.ok(rush.protection < new PlayMatchup(...pass).protection);
    const run = [game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense(), 'middle', {}];
    const stop = new PlayMatchup(...run, { defend: { side: 'away', actor: lb, move: 'tackle', hit: true } });
    assert.equal(stop.tackler.mon.id, lb.id);
  });

  test('an OL actor becomes the featured blocker', () => {
    const game = Moves.game();
    const ol = game.rosters.home.player('OL', 4);
    const args = [game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense(), 'middle', {}];
    const matchup = new PlayMatchup(...args, { attack: { side: 'home', actor: ol, move: 'tackle', hit: true } });
    assert.equal(matchup.blocker.id, ol.id);
    assert.equal(matchup.moveRecords[0].target.id, matchup.rusher.id);
  });

  test('a team fires one move per call, and both teams may fire', () => {
    const game = Moves.game();
    const home = game.rosters.home;
    Moves.pick(game, 'home', home.player('RB'), 'tackle', Moves.offense());
    assert.throws(() => game.activateMove('home', home.player('RB').id, 'surf', Moves.offense()), /One move per team/);
    game.activateMove('away', game.rosters.away.player('DL').id, 'tackle', game.phase.defense);
    const result = game.snap(game.phase.offense, game.phase.defense);
    assert.deepEqual(
      result.moves.map((record) => record.offense),
      [true, false],
    );
  });

  test('a move needs stamina, PP, a committed call, and a role in the unit', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    game.prepareCall(Moves.offense());
    assert.throws(() => game.activateMove('home', rb.id, 'tackle', Moves.offense('quick-slant')), /committed call/);
    const bench = game.rosters.home.player('WR', 3).id;
    assert.throws(() => game.activateMove('home', bench, 'tackle', Moves.offense()), /unavailable/);
    game.rosters.home.spend(rb, 85);
    assert.throws(() => game.activateMove('home', rb.id, 'tackle', Moves.offense()), /unavailable/);
    game.rosters.home.restore(rb, 85);
    game.pp.home.set(`${rb.id}:tackle`, 0);
    const left = game.availableMoves('home', Moves.offense());
    assert.equal(
      left.some((entry) => entry.move === 'tackle' && entry.actor === rb),
      false,
    );
    for (const kind of ['kick', 'punt', 'spike', 'kneel']) {
      assert.deepEqual(game.availableMoves('home', { ...Moves.offense(), kind }), []);
    }
  });

  test('a move whose actor leaves the unit fizzles without cost', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    Moves.pick(game, 'home', rb, 'tackle', Moves.offense());
    game.substitute('RB', 0, 1);
    const result = game.snap(game.phase.offense, game.phase.defense);
    assert.deepEqual(result.moves, []);
    assert.equal(game.ppLeft('home', rb, 'tackle'), MoveBook.uses('tackle'));
    assert.ok(game.log.some((line) => line.includes('could not use Tackle')));
  });

  test('an expired period pays no PP or stamina', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    game.clockRunning = true;
    game.seconds = 10;
    Moves.pick(game, 'home', rb, 'tackle', Moves.offense());
    assert.equal(game.snap(game.phase.offense, game.phase.defense).outcome, 'clock-expired');
    assert.equal(game.ppLeft('home', rb, 'tackle'), MoveBook.uses('tackle'));
    assert.equal(game.rosters.home.energy(rb), 100);
  });

  test('the CPU fires its best-ranked eligible move on 40% of calls', () => {
    const fires = Moves.game(() => 0);
    fires.possession = 'away';
    fires.prepareCall(Moves.defense());
    fires.activateCpuMove(fires.phase.offense, fires.phase.defense, {});
    const { actor, move } = fires.phase.moves.away;
    const ranks = fires
      .availableMoves('away', fires.resolveOffense(fires.phase.offense, {}))
      .map((entry) => MoveBook.rank(entry.move, entry.actor));
    assert.equal(MoveBook.rank(move, actor), Math.max(...ranks));
    const quiet = Moves.game(() => 0.5);
    quiet.possession = 'away';
    quiet.prepareCall(Moves.defense());
    quiet.activateCpuMove(quiet.phase.offense, quiet.phase.defense, {});
    assert.deepEqual(quiet.phase.moves, {});
  });

  test('a strike never adds more than 30 points to any contest', () => {
    const strikes = Object.keys(moves).filter((name) => MoveBook.family(name) === 'strike');
    for (const name of strikes) {
      for (const mon of data) {
        const value = MoveBook.strike(name, { actor: mon, skill: 99, effectiveness: 4, crit: true });
        assert.ok(value >= 0 && value <= 30, `${name} ${mon.name} ${value}`);
      }
    }
  });

  test('a seeded game with default movesets finishes and reproduces exactly', () => {
    const run = () => {
      let seed = 7;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      const home = Roster.random(data, undefined, random);
      const away = Roster.random(data, undefined, random);
      const game = new FootballGame(home, away, 120, random);
      let used = 0;
      for (let snaps = 0; !game.over && snaps < 600; snaps++) {
        const book = game.possession === 'home' ? OFFENSE.filter((play) => game.isLegalCall(play)) : DEFENSE;
        game.prepareCall(book[Math.floor(random() * book.length)]);
        const options = game.possession === 'away' ? game.cpuOptions(game.phase.offense, game.phase.defense) : {};
        used += game.snap(game.phase.offense, game.phase.defense, options).moves.length;
      }
      return [game.score.home, game.score.away, used];
    };
    assert.deepEqual(run(), run());
    assert.ok(run()[2] > 0);
  });
});

describe('Roster move validation', () => {
  test('a roster rejects an unlearnable move, a fifth move, and a repeat', () => {
    const roster = Moves.roster();
    const mon = Moves.mon('Pikachu');
    roster.assign(0, mon);
    const learnable = MoveBook.learnable(mon);
    assert.throws(() => roster.setMoveset(mon, ['hydro-pump']), /cannot learn/);
    assert.throws(() => roster.setMoveset(mon, learnable.slice(0, 5)), /at most four/);
    assert.throws(() => roster.setMoveset(mon, [learnable[0], learnable[0]]), /repeat/);
    roster.setMoveset(mon, learnable.slice(0, 4));
    assert.deepEqual(roster.moveset(mon), learnable.slice(0, 4));
  });
});

describe('Conditions, stat stages, and heals', () => {
  test('paralysis lasts four of the team snaps, bench included, and a second major ailment is refused', () => {
    const [home, away] = [Moves.game().rosters.home, Moves.game().rosters.away];
    const bench = home.player('RB', 1);
    assert.equal(home.afflict(bench, 'paralysis'), true);
    assert.equal(home.afflict(bench, 'burn'), false);
    assert.equal(home.has(bench, 'paralysis'), true);
    assert.equal(home.has(bench, 'burn'), false);
    assert.equal(home.afflict(bench, 'confusion'), true);
    for (let snap = 1; snap <= 4; snap++) {
      assert.equal(home.has(bench, 'paralysis'), true, `snap ${snap}`);
      home.tick(away);
    }
    assert.equal(home.has(bench, 'paralysis'), false);
    assert.equal(home.has(bench, 'confusion'), false);
  });

  test('sleep costs 40 rating, paralysis cuts speed skill by a quarter, and auto-rotation benches a sleeper', () => {
    const game = Moves.game();
    const roster = game.rosters.home;
    const starter = roster.player('RB');
    const backup = roster.player('RB', 1);
    const rating = roster.effectiveRating(starter, 'RB');
    const speed = roster.skill(starter, 'speed');
    roster.afflict(starter, 'paralysis');
    assert.ok(Math.abs(roster.skill(starter, 'speed') - speed * 0.75) < 1);
    const sleeper = roster.player('RB', 0);
    roster.conditions.clear();
    roster.afflict(sleeper, 'sleep');
    assert.equal(roster.effectiveRating(sleeper, 'RB'), rating - 40);
    roster.rotate('offense', Moves.offense());
    assert.equal(roster.player('RB').id, backup.id);
  });

  test('burn and poison drain stamina, Toxic drains more, and Leech Seed feeds the opposing user', () => {
    const game = Moves.game();
    const [home, away] = [game.rosters.home, game.rosters.away];
    const [burned, poisoned, toxic, seeded] = ['QB', 'RB', 'WR', 'TE'].map((role) => home.player(role));
    const seeder = away.player('DL');
    home.afflict(burned, 'burn');
    home.afflict(poisoned, 'poison');
    home.afflict(toxic, 'poison', { severe: true });
    home.afflict(seeded, 'leech-seed', { source: seeder });
    away.spend(seeder, 50);
    home.tick(away);
    assert.deepEqual(
      [burned, poisoned, toxic, seeded].map((mon) => home.energy(mon)),
      [97, 95, 92, 96],
    );
    assert.equal(away.energy(seeder), 54);
    assert.equal(home.skill(burned, 'attack') < new Roster(data, []).skill(burned, 'attack'), true);
  });

  test('a trapped player cannot be substituted out', () => {
    const roster = Moves.game().rosters.home;
    roster.afflict(roster.player('RB'), 'trap');
    assert.throws(() => roster.substitute('RB', 0, 1), /trapped/);
    roster.rotate('offense', Moves.offense());
    assert.equal(roster.player('RB').id, roster.players[POSITIONS.findIndex((slot) => slot.code === 'RB')].id);
  });

  test('stat stages cap at plus or minus two and expire after three team snaps', () => {
    const [home, away] = [Moves.game().rosters.home, Moves.game().rosters.away];
    const mon = home.player('WR');
    for (let index = 0; index < 4; index++) home.shift(mon, 'speed', 1);
    assert.equal(home.stage(mon, 'speed'), 2);
    for (let index = 0; index < 6; index++) home.shift(mon, 'speed', -1);
    assert.equal(home.stage(mon, 'speed'), -2);
    for (let snap = 0; snap < 3; snap++) home.tick(away);
    assert.equal(home.stage(mon, 'speed'), 0);
  });

  test('a stage moves its contest by six points and accuracy stages move completion odds', () => {
    const game = Moves.game();
    const pass = [game.rosters.home, game.rosters.away, Moves.offense('quick-slant'), Moves.defense(), 'middle', {}];
    const base = new PlayMatchup(...pass);
    game.rosters.home.shift(base.carrier, 'speed', 2);
    assert.equal(new PlayMatchup(...pass).separation, base.separation + 12);
    game.rosters.home.shift(base.passer, 'accuracy', -2);
    const slowed = new PlayMatchup(...pass);
    assert.equal(slowed.accuracyShift, -0.08);
    assert.ok(Math.abs(slowed.chances(0).completion - (base.chances(0).completion + 12 * 0.004 - 0.08)) < 1e-9);
    game.rosters.away.shift(base.marker.mon, 'speed', 2);
    assert.equal(new PlayMatchup(...pass).separation, base.separation);
  });

  test('a confused player stumbles for 15 points when the roll lands', () => {
    const game = Moves.game(() => 0);
    const rb = game.rosters.home.player('RB');
    game.rosters.home.afflict(rb, 'confusion');
    const stumbles = game.rollConfusion(Moves.offense(), Moves.defense());
    assert.deepEqual([...stumbles], [rb.id]);
    const args = [game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense(), 'middle', {}, {}];
    assert.equal(new PlayMatchup(...args, stumbles).tackle, new PlayMatchup(...args).tackle - 15);
    assert.equal(Moves.game(() => 0.5).rollConfusion(Moves.offense(), Moves.defense()).size, 0);
  });

  test('Thunder Wave paralyzes the opposing player after the snap and logs it', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    Moves.learn(game, 'home', rb, ['thunder-wave']);
    Moves.pick(game, 'home', rb, 'thunder-wave', Moves.offense());
    const result = game.snap(game.phase.offense, game.phase.defense);
    const target = result.moves[0].target;
    assert.equal(game.rosters.away.has(target, 'paralysis'), true);
    assert.ok(game.log.some((line) => line.includes(`${target.name} is paralyzed.`)));
    assert.deepEqual(result.statuses.before.defender, []);
  });

  test('Thunder Wave fails against an already afflicted target and into a Ground type', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    rb.types = ['Electric'];
    Moves.learn(game, 'home', rb, ['thunder-wave']);
    const probe = new PlayMatchup(game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense());
    game.rosters.away.afflict(probe.tackler.mon, 'burn');
    Moves.pick(game, 'home', rb, 'thunder-wave', Moves.offense());
    const result = game.snap(game.phase.offense, game.phase.defense);
    assert.equal(game.rosters.away.has(result.moves[0].target, 'paralysis'), false);
    assert.ok(game.log.some((line) => line.includes('But it failed!')));
    const ground = Moves.game();
    const runner = ground.rosters.home.player('RB');
    runner.types = ['Electric'];
    for (const mon of ground.rosters.away.players) mon.types = ['Ground'];
    Moves.learn(ground, 'home', runner, ['thunder-wave']);
    Moves.pick(ground, 'home', runner, 'thunder-wave', Moves.offense());
    const immune = ground.snap(ground.phase.offense, ground.phase.defense);
    assert.equal(ground.rosters.away.has(immune.moves[0].target, 'paralysis'), false);
  });

  test('a strike secondary rolls at twice its chance and Agility and Recover change the user', () => {
    const lucky = Moves.game(() => 0);
    const rb = lucky.rosters.home.player('RB');
    Moves.learn(lucky, 'home', rb, ['thunderbolt']);
    Moves.pick(lucky, 'home', rb, 'thunderbolt', Moves.offense());
    const hit = lucky.snap(lucky.phase.offense, lucky.phase.defense);
    assert.equal(lucky.rosters.away.has(hit.moves[0].target, 'paralysis'), true);
    const unlucky = Moves.game(() => 0.5);
    const runner = unlucky.rosters.home.player('RB');
    Moves.learn(unlucky, 'home', runner, ['thunderbolt']);
    Moves.pick(unlucky, 'home', runner, 'thunderbolt', Moves.offense());
    const miss = unlucky.snap(unlucky.phase.offense, unlucky.phase.defense);
    assert.equal(unlucky.rosters.away.has(miss.moves[0].target, 'paralysis'), false);
    const boost = Moves.game();
    const wr = boost.rosters.home.player('RB');
    Moves.learn(boost, 'home', wr, ['agility', 'recover']);
    Moves.pick(boost, 'home', wr, 'agility', Moves.offense());
    boost.snap(boost.phase.offense, boost.phase.defense);
    assert.equal(boost.rosters.home.stage(wr, 'speed'), 2);
    boost.rosters.home.spend(wr, 60);
    boost.prepareCall(Moves.offense());
    boost.activateMove('home', wr.id, 'recover', Moves.offense());
    const before = boost.rosters.home.energy(wr);
    boost.snap(boost.phase.offense, boost.phase.defense);
    assert.ok(boost.rosters.home.energy(wr) > before + 30);
  });
});

describe('Move cues', () => {
  test('the cue plays between 0.22 and 0.5, veers off on a miss, and the caption names the move', () => {
    for (const [move, random, missed] of [
      ['thunderbolt', () => 0.5, false],
      ['thunder', () => 0.99, true],
    ]) {
      const game = Moves.game(random);
      Moves.pick(game, 'home', game.rosters.home.player('RB'), move, Moves.offense());
      const result = game.snap(game.phase.offense, game.phase.defense);
      const { carrier, support, defender, help } = result.participants;
      const motion = new BattleMotion(Moves.offense(), result, { lead: carrier, support, stopper: defender, help });
      assert.equal(motion.sample(0.1).cue, null);
      assert.equal(motion.sample(0.52).cue, null);
      const cue = motion.sample(0.4).cue;
      assert.equal(cue.kind, 'beam');
      assert.equal(cue.type, 'Electric');
      assert.equal(cue.missed, missed);
      assert.equal(cue.to.y < 0, missed);
      assert.equal(motion.sample(0.4, true).cue, null);
      assert.equal(motion.sample(0.3).caption.round, 'MOVE');
      assert.match(motion.sample(0.6).caption.title, missed ? /missed!/ : /^(?!.*missed)/);
      assert.equal(motion.moveType, 'Electric');
    }
  });

  test('status, stat, and heal moves draw aura, arrows, and sparkle cues', () => {
    for (const [move, kind, label] of [
      ['thunder-wave', 'aura', 'PAR'],
      ['growl', 'arrows', '▼▼▼'],
      ['agility', 'arrows', '▲▲▲'],
      ['recover', 'sparkle', '✦ ✦ ✦'],
    ]) {
      const game = Moves.game();
      const rb = game.rosters.home.player('RB');
      Moves.learn(game, 'home', rb, [move]);
      Moves.pick(game, 'home', rb, move, Moves.offense());
      const result = game.snap(game.phase.offense, game.phase.defense);
      const { carrier, support, defender, help } = result.participants;
      const motion = new BattleMotion(Moves.offense(), result, { lead: carrier, support, stopper: defender, help });
      const cue = motion.sample(0.4).cue;
      assert.equal(cue.kind, kind, move);
      assert.equal(cue.label, label, move);
    }
  });

  test('a lunge cue starts at the actor and a play without moves has no cue', () => {
    const game = Moves.game();
    Moves.pick(game, 'home', game.rosters.home.player('RB'), 'tackle', Moves.offense());
    const result = game.snap(game.phase.offense, game.phase.defense);
    const { carrier, support, defender, help } = result.participants;
    const featured = { lead: carrier, support, stopper: defender, help };
    assert.equal(new BattleMotion(Moves.offense(), result, featured).sample(0.3).cue.kind, 'lunge');
    assert.equal(new BattleMotion(Moves.offense(), { ...result, moves: [] }, featured).sample(0.3).cue, null);
  });
});
