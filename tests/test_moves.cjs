const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pokemon: data, moves } = require('../pokemon_gen1_2.json');
const { MoveBook } = require('../src/game/moves.js');
const { Roster } = require('../src/game/roster.js');
const { FootballGame: Football } = require('../src/game/football.js');

// Most suites assert pre-contact outcomes, so their games skip the clash step.
class FootballGame extends Football {
  constructor(...args) {
    super(...args);
    this.clashes = false;
  }
}
const { PlayMatchup } = require('../src/game/matchup.js');
const { BattleMotion } = require('../src/ui/battle/motion.js');
const { OFFENSE, DEFENSE, POSITIONS } = require('../src/game/playbook.js');

class Moves {
  // A Roar on the first tight end in one-tight-end personnel sends it to TE depth 2.
  static roared() {
    const match = Moves.game();
    const home = match.rosters.home;
    const te1 = home.player('TE', 0);
    home.sendToBench(te1, 'offense', Moves.offense());
    return { match, home, te1 };
  }

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
          'safeguard',
          'rain-dance',
          'sunny-day',
          'sandstorm',
          'spikes',
          'reflect',
          'light-screen',
          'mist',
          'haze',
          'protect',
          'fissure',
          'roar',
          'flamethrower',
          'water-gun',
          'swords-dance',
          'sand-attack',
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

  // Puts the move in the player's moveset and activates it on the call already committed.
  static use(game, side, mon, move) {
    const roster = game.rosters[side];
    if (!roster.moveset(mon).includes(move)) roster.setMoveset(mon, [...roster.moveset(mon).slice(0, 3), move]);
    return game.activateMove(side, mon.id, move, side === game.possession ? game.phase.offense : game.phase.defense);
  }

  static pick(game, side, mon, move, play = Moves.offense()) {
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

  test('default slots 3 and 4 follow the highest base stat and never share a family', () => {
    const families = (name) => MoveBook.defaultMoveset(Moves.mon(name)).map((move) => MoveBook.family(move));
    assert.ok(families('Chansey').includes('heal'));
    assert.ok(families('Jolteon').includes('stat'));
    assert.ok(families('Electrode').includes('stat'));
    assert.deepEqual(MoveBook.defaultMoveset(Moves.mon('Magikarp')), ['flail', 'tackle']);
    for (const mon of data) {
      const kinds = MoveBook.defaultMoveset(mon)
        .map((move) => MoveBook.family(move))
        .filter((family) => family !== 'strike');
      const available = new Set(
        MoveBook.learnable(mon)
          .filter((move) => !MoveBook.SELF_FAINT.includes(move))
          .map((move) => MoveBook.family(move))
          .filter((family) => family !== 'strike'),
      );
      assert.equal(new Set(kinds).size, kinds.length, mon.name);
      assert.equal(
        kinds.length >= Math.min(2, available.size) || MoveBook.defaultMoveset(mon).length < 4,
        true,
        mon.name,
      );
    }
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
      Moves.pick(game, 'home', rb, move);
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
    Moves.pick(game, 'home', home.player('RB'), 'tackle');
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
    Moves.pick(game, 'home', rb, 'tackle');
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
    Moves.pick(game, 'home', rb, 'tackle');
    assert.equal(game.snap(game.phase.offense, game.phase.defense).outcome, 'clock-expired');
    assert.equal(game.ppLeft('home', rb, 'tackle'), MoveBook.uses('tackle'));
    assert.equal(game.rosters.home.energy(rb), 100);
  });

  test('the CPU fires its best-ranked eligible move on 40% of calls', () => {
    const fires = Moves.game(() => 0);
    fires.possession = 'away';
    fires.prepareCall(Moves.defense());
    fires.activateCpuMove(fires.phase.offense, fires.phase.defense);
    const { actor, move } = fires.phase.moves.away;
    const ranks = fires
      .availableMoves('away', fires.resolveOffense(fires.phase.offense, {}))
      .map((entry) => MoveBook.rank(entry.move, entry.actor));
    assert.equal(MoveBook.rank(move, actor), Math.max(...ranks));
    const quiet = Moves.game(() => 0.5);
    quiet.possession = 'away';
    quiet.prepareCall(Moves.defense());
    quiet.activateCpuMove(quiet.phase.offense, quiet.phase.defense);
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
    roster.rotate('offense');
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
    roster.rotate('offense');
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
    assert.deepEqual([...stumbles], [`offense:${rb.id}`]);
    const args = [game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense(), 'middle', {}, {}];
    assert.equal(new PlayMatchup(...args, stumbles).tackle, new PlayMatchup(...args).tackle - 15);
    assert.equal(Moves.game(() => 0.5).rollConfusion(Moves.offense(), Moves.defense()).size, 0);
  });

  test('Thunder Wave paralyzes the opposing player after the snap and logs it', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    Moves.learn(game, 'home', rb, ['thunder-wave']);
    Moves.pick(game, 'home', rb, 'thunder-wave');
    const result = game.snap(game.phase.offense, game.phase.defense);
    const target = result.moves[0].target;
    assert.equal(game.rosters.away.has(target, 'paralysis'), true);
    assert.ok(game.log.some((line) => line.includes(`${target.name} is paralyzed.`)));
    assert.deepEqual(result.statuses.before.defender, []);
  });

  test('Thunder Wave fails against an already afflicted target and ignores the type chart', () => {
    const game = Moves.game();
    const rb = game.rosters.home.player('RB');
    rb.types = ['Electric'];
    Moves.learn(game, 'home', rb, ['thunder-wave']);
    const probe = new PlayMatchup(game.rosters.home, game.rosters.away, Moves.offense(), Moves.defense());
    game.rosters.away.afflict(probe.tackler.mon, 'burn');
    Moves.pick(game, 'home', rb, 'thunder-wave');
    const result = game.snap(game.phase.offense, game.phase.defense);
    assert.equal(game.rosters.away.has(result.moves[0].target, 'paralysis'), false);
    assert.ok(game.log.some((line) => line.includes('But it failed!')));
    const ground = Moves.game();
    const runner = ground.rosters.home.player('RB');
    for (const mon of ground.rosters.away.players) mon.types = ['Ground'];
    Moves.learn(ground, 'home', runner, ['thunder-wave']);
    Moves.pick(ground, 'home', runner, 'thunder-wave');
    const landed = ground.snap(ground.phase.offense, ground.phase.defense);
    assert.equal(ground.rosters.away.has(landed.moves[0].target, 'paralysis'), true);
  });

  test('a strike secondary rolls at twice its chance and Agility and Recover change the user', () => {
    const lucky = Moves.game(() => 0);
    const rb = lucky.rosters.home.player('RB');
    Moves.learn(lucky, 'home', rb, ['thunderbolt']);
    Moves.pick(lucky, 'home', rb, 'thunderbolt');
    const hit = lucky.snap(lucky.phase.offense, lucky.phase.defense);
    assert.equal(lucky.rosters.away.has(hit.moves[0].target, 'paralysis'), true);
    const unlucky = Moves.game(() => 0.5);
    const runner = unlucky.rosters.home.player('RB');
    Moves.learn(unlucky, 'home', runner, ['thunderbolt']);
    Moves.pick(unlucky, 'home', runner, 'thunderbolt');
    const miss = unlucky.snap(unlucky.phase.offense, unlucky.phase.defense);
    assert.equal(unlucky.rosters.away.has(miss.moves[0].target, 'paralysis'), false);
    const boost = Moves.game();
    const wr = boost.rosters.home.player('RB');
    Moves.learn(boost, 'home', wr, ['agility', 'recover']);
    Moves.pick(boost, 'home', wr, 'agility');
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

describe('Field conditions, Protect, one-hit, and force-switch moves', () => {
  const game = (random) => Moves.game(random);

  const fire = (match, side, mon, move) => {
    if (!match.phase) match.prepareCall(Moves.offense());
    return Moves.use(match, side, mon, move);
  };

  test('Safeguard set by the defense blocks Thunder Wave on the next snap', () => {
    const match = game();
    const dl = match.rosters.away.player('DL');
    fire(match, 'away', dl, 'safeguard');
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(match.field.away.safeguard, 5);
    const rb = match.rosters.home.player('RB');
    fire(match, 'home', rb, 'thunder-wave');
    const result = match.snap(match.phase.offense, match.phase.defense);
    assert.equal(match.rosters.away.has(result.moves[0].target, 'paralysis'), false);
    assert.ok(match.log.some((line) => line.includes('protected by Safeguard')));
    assert.equal(match.field.away.safeguard, 4);
  });

  test('Rain Dance halves a Fire strike, boosts Water, and raises fumble odds by a point', () => {
    const match = game();
    const rb = match.rosters.home.player('RB');
    const args = [match.rosters.home, match.rosters.away, Moves.offense(), Moves.defense(), 'middle', {}];
    const strike = (move, weather) =>
      new PlayMatchup(...args, { attack: { side: 'home', actor: rb, move, hit: true } }, new Set(), { weather });
    const dry = strike('flamethrower', null).moveRecords[0].value;
    const rain = strike('flamethrower', 'rain-dance').moveRecords[0].value;
    assert.ok(dry > 0 && Math.abs(rain * 2 - dry) <= 1);
    assert.ok(strike('water-gun', 'rain-dance').moveRecords[0].value > strike('water-gun', null).moveRecords[0].value);
    assert.ok(strike('flamethrower', 'sunny-day').moveRecords[0].value > dry);
    const odds = (weather) => new PlayMatchup(...args, {}, new Set(), { weather }).chances(0).fumble;
    assert.ok(Math.abs(odds('rain-dance') - odds(null) - 0.01) < 1e-9);
  });

  test('weather replaces weather, counts down, and a sandstorm drains non-Rock units', () => {
    const match = game();
    const rb = match.rosters.home.player('RB');
    fire(match, 'home', rb, 'rain-dance');
    match.snap(match.phase.offense, match.phase.defense);
    assert.deepEqual(match.field.weather, { kind: 'rain-dance', snaps: 5 });
    fire(match, 'home', rb, 'sandstorm');
    match.rosters.home.player('OL').types = ['Rock'];
    match.snap(match.phase.offense, match.phase.defense);
    assert.deepEqual(match.field.weather, { kind: 'sandstorm', snaps: 5 });
    match.prepareCall(Moves.offense());
    const rock = match.rosters.home.player('OL');
    const other = match.rosters.home.player('OL', 1);
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(match.rosters.home.energy(other), match.rosters.home.energy(rock) - 3);
    assert.equal(match.field.weather.snaps, 4);
    for (let index = 0; index < 4; index++) match.countDownField();
    assert.equal(match.field.weather, null);
  });

  test('screens give the defense ten margin against runs and passes', () => {
    const match = game();
    const args = (play) => [match.rosters.home, match.rosters.away, play, Moves.defense(), 'middle', {}, {}, new Set()];
    const field = { defend: { reflect: 5, 'light-screen': 5 } };
    const run = Moves.offense();
    const pass = Moves.offense('quick-slant');
    assert.equal(new PlayMatchup(...args(run), field).tackle, new PlayMatchup(...args(run)).tackle - 10);
    assert.equal(new PlayMatchup(...args(pass), field).separation, new PlayMatchup(...args(pass)).separation - 10);
    const rb = match.rosters.home.player('RB');
    const strike = (screens) =>
      new PlayMatchup(
        ...args(run).slice(0, 5),
        {},
        { attack: { side: 'home', actor: rb, move: 'tackle', hit: true } },
        new Set(),
        {
          defend: screens,
        },
      ).moveRecords[0].value;
    assert.equal(strike({ reflect: 5 }), Math.max(0, strike({}) - 10));
  });

  test('Mist blocks stat drops, Haze clears stages, and Spikes charge each substitute', () => {
    const match = game();
    const [home, away] = [match.rosters.home, match.rosters.away];
    const rb = home.player('RB');
    match.field.away.mist = 5;
    fire(match, 'home', rb, 'growl');
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(away.stage(match.log.length ? away.player('DL') : rb, 'attack'), 0);
    assert.ok(match.log.some((line) => line.includes('protected by Mist')));
    home.shift(rb, 'speed', 2);
    away.shift(away.player('CB'), 'speed', -2);
    match.field.away.mist = 0;
    fire(match, 'home', rb, 'haze');
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(home.stage(rb, 'speed'), 0);
    assert.equal(away.stage(away.player('CB'), 'speed'), 0);
    fire(match, 'home', rb, 'spikes');
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(match.field.away.spikes, true);
    match.quarter = 2;
    match.startQuarter();
    assert.equal(match.field.away.spikes, undefined);
  });

  test('defensive Protect holds a long run to 5 yards and a long touchdown run stops short', () => {
    const big = { ...Moves.offense(), base: 30, spread: 0 };
    const open = game();
    assert.ok(open.snap(big, Moves.defense()).yards > 5);
    const match = game();
    match.prepareCall(big);
    Moves.use(match, 'away', match.rosters.away.player('DL'), 'protect');
    assert.equal(match.snap(match.phase.offense, match.phase.defense).yards, 5);
    const goal = game();
    goal.spot = 90;
    goal.prepareCall(big);
    Moves.use(goal, 'away', goal.rosters.away.player('DL'), 'protect');
    const result = goal.snap(goal.phase.offense, goal.phase.defense);
    assert.equal(result.outcome === 'touchdown', false);
    assert.equal(goal.spot, 95);
  });

  test('offensive Protect turns a sack into an incompletion', () => {
    const plain = game(() => 0);
    assert.equal(plain.snap(Moves.offense('quick-slant'), Moves.defense()).outcome, 'sack');
    const match = game(() => 0);
    const qb = match.rosters.home.player('QB');
    match.prepareCall(Moves.offense('quick-slant'));
    Moves.use(match, 'home', qb, 'protect');
    const result = match.snap(match.phase.offense, match.phase.defense);
    assert.equal(result.outcome, 'incomplete');
  });

  test('a Fissure hit is a breakaway touchdown on offense and a turnover on defense', () => {
    const offense = game(() => 0.2);
    offense.prepareCall(Moves.offense());
    Moves.use(offense, 'home', offense.rosters.home.player('RB'), 'fissure');
    const score = offense.snap(offense.phase.offense, offense.phase.defense);
    assert.equal(score.outcome, 'touchdown');
    assert.equal(offense.score.home, 7);
    for (const [play, outcome] of [
      [Moves.offense(), 'fumble'],
      [Moves.offense('quick-slant'), 'interception'],
    ]) {
      const defense = game(() => 0.2);
      defense.prepareCall(play);
      Moves.use(defense, 'away', defense.rosters.away.player('DL'), 'fissure');
      const result = defense.snap(defense.phase.offense, defense.phase.defense);
      assert.equal(result.outcome, outcome);
      assert.equal(defense.possession, 'away');
    }
  });

  test('a Fissure hit against a Flying carrier changes nothing', () => {
    const match = game(() => 0.2);
    match.rosters.home.player('RB').types = ['Flying'];
    match.prepareCall(Moves.offense());
    Moves.use(match, 'away', match.rosters.away.player('LB'), 'fissure');
    const base = new PlayMatchup(match.rosters.home, match.rosters.away, Moves.offense(), match.phase.defense);
    const result = match.snap(match.phase.offense, match.phase.defense);
    assert.equal(result.moves[0].hit, true);
    assert.equal(result.moves[0].effectiveness, 0);
    assert.notEqual(result.outcome, 'fumble');
    assert.equal(match.possession, 'home');
    assert.deepEqual(
      [result.matchup.protection, result.matchup.separation, result.matchup.tackle],
      [base.protection, base.separation, base.tackle],
    );
  });

  test('Roar sends the opponent to the bench for two snaps and a backup takes the place', () => {
    const match = game();
    const rb = match.rosters.home.player('RB');
    fire(match, 'home', rb, 'roar');
    const result = match.snap(match.phase.offense, match.phase.defense);
    const target = result.moves[0].target;
    const away = match.rosters.away;
    assert.equal(away.has(target, 'benched'), true);
    assert.equal(
      away.lineup('defense', Moves.defense()).some((slot) => slot.mon.id === target.id),
      false,
    );
    for (let snap = 0; snap < 2; snap++) {
      match.prepareCall(Moves.offense());
      match.snap(match.phase.offense, match.phase.defense);
    }
    assert.equal(away.has(target, 'benched'), false);
  });
});

describe('Review fixes', () => {
  test('Roar on the carrier benches him: the backup carries and the starter recovers', () => {
    const match = Moves.game();
    const [home, away] = [match.rosters.home, match.rosters.away];
    const starter = home.player('RB');
    const backup = home.player('RB', 1);
    match.prepareCall(Moves.offense());
    Moves.use(match, 'away', away.player('LB'), 'roar');
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(home.has(starter, 'benched'), true);
    match.prepareCall(Moves.offense());
    const next = new PlayMatchup(home, away, Moves.offense(), match.phase.defense);
    assert.equal(next.carrier.id, backup.id);
    assert.equal(home.participants(Moves.offense()).carrier.id, backup.id);
    home.spend(starter, 40);
    const before = home.energy(starter);
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(home.energy(starter), before + 9);
  });

  test('Protect beats a one-hit KO on both sides', () => {
    const held = Moves.game(() => 0.2);
    held.prepareCall(Moves.offense());
    Moves.use(held, 'home', held.rosters.home.player('RB'), 'fissure');
    Moves.use(held, 'away', held.rosters.away.player('LB'), 'protect');
    const breakaway = held.snap(held.phase.offense, held.phase.defense);
    assert.equal(breakaway.yards, 5);
    assert.notEqual(breakaway.outcome, 'touchdown');
    for (const [play, outcome, role] of [
      [Moves.offense(), 'stop', 'RB'],
      [Moves.offense('quick-slant'), 'incomplete', 'QB'],
    ]) {
      const safe = Moves.game(() => 0.2);
      safe.prepareCall(play);
      Moves.use(safe, 'away', safe.rosters.away.player('LB'), 'fissure');
      Moves.use(safe, 'home', safe.rosters.home.player(role), 'protect');
      const result = safe.snap(safe.phase.offense, safe.phase.defense);
      assert.equal(result.outcome, outcome);
      assert.equal(safe.possession, 'home');
    }
  });

  test('only the confused side stumbles when one species plays on both teams', () => {
    const match = Moves.game(() => 0);
    const [home, away] = [match.rosters.home, match.rosters.away];
    const rb = home.player('RB');
    const tackler = new PlayMatchup(home, away, Moves.offense(), Moves.defense()).tackler.mon;
    away.players[away.players.indexOf(tackler)] = rb;
    home.afflict(rb, 'confusion');
    const stumbles = match.rollConfusion(Moves.offense(), Moves.defense());
    assert.deepEqual([...stumbles], [`offense:${rb.id}`]);
    const args = [home, away, Moves.offense(), Moves.defense(), 'middle', {}, {}];
    assert.equal(new PlayMatchup(...args, stumbles).tackle, new PlayMatchup(...args).tackle - 15);
  });

  test('Spikes charge only the player who enters the unit', () => {
    const match = Moves.game();
    const home = match.rosters.home;
    match.setSpikes('home', true);
    match.prepareCall(Moves.offense());
    const starter = home.player('RB');
    const backup = home.player('RB', 1);
    match.substitute('RB', 1, 0);
    assert.equal(home.player('RB').id, backup.id);
    assert.equal(home.energy(backup), 90);
    assert.equal(home.energy(starter), 100);
    const [first, second] = [home.player('WR'), home.player('WR', 1)];
    match.substitute('WR', 0, 1);
    assert.deepEqual([home.energy(first), home.energy(second)], [100, 100]);
  });

  test('type effectiveness applies only to strikes and one-hit moves', () => {
    const confuse = Moves.game();
    const rb = confuse.rosters.home.player('RB');
    Moves.pick(confuse, 'home', rb, 'confuse-ray');
    const first = confuse.snap(confuse.phase.offense, confuse.phase.defense);
    assert.equal(confuse.rosters.away.has(first.moves[0].target, 'confusion'), true);
    assert.equal(first.moves[0].effectiveness, 1);
    const dance = Moves.game();
    for (const mon of dance.rosters.away.players) mon.types = ['Ghost'];
    const runner = dance.rosters.home.player('RB');
    Moves.pick(dance, 'home', runner, 'swords-dance');
    dance.snap(dance.phase.offense, dance.phase.defense);
    assert.equal(
      dance.log.some((line) => line.includes("doesn't affect")),
      false,
    );
    assert.equal(dance.rosters.home.stage(runner, 'attack'), 2);
  });

  test('a Sand-Attack on the pass carrier lowers completion by four points on the next pass', () => {
    const match = Moves.game();
    const [home, away] = [match.rosters.home, match.rosters.away];
    const pass = Moves.offense('quick-slant');
    match.prepareCall(pass);
    const before = new PlayMatchup(home, away, pass, match.phase.defense).chances(0).completion;
    Moves.use(match, 'away', away.player('CB'), 'sand-attack');
    match.snap(match.phase.offense, match.phase.defense);
    match.prepareCall(pass);
    const after = new PlayMatchup(home, away, pass, match.phase.defense).chances(0).completion;
    assert.ok(Math.abs(before - after - 0.04) < 1e-9);
  });

  test('an offensive move user who is not featured takes the support slot', () => {
    const match = Moves.game();
    const ol = match.rosters.home.player('OL', 2);
    Moves.pick(match, 'home', ol, 'tackle', Moves.offense('quick-slant'));
    const result = match.snap(match.phase.offense, match.phase.defense);
    assert.equal(result.outcome === 'incomplete', false);
    assert.equal(result.participants.support, ol);
  });

  test('both cues play in sequence and the contact callout joins both effectiveness lines', () => {
    const match = Moves.game();
    for (const mon of match.rosters.away.players) mon.types = ['Water'];
    match.rosters.home.player('RB').types = ['Fire'];
    match.prepareCall(Moves.offense());
    Moves.use(match, 'home', match.rosters.home.player('RB'), 'thunderbolt');
    Moves.use(match, 'away', match.rosters.away.player('LB'), 'surf');
    const result = match.snap(match.phase.offense, match.phase.defense);
    const { carrier, support, defender, help } = result.participants;
    const motion = new BattleMotion(Moves.offense(), result, { lead: carrier, support, stopper: defender, help });
    assert.equal(motion.sample(0.3).cue.type, 'Electric');
    assert.equal(motion.sample(0.45).cue.type, 'Water');
    assert.match(motion.sample(0.3).caption.title, /used Thunderbolt/);
    assert.match(motion.sample(0.45).caption.title, /used Surf/);
    assert.match(motion.sample(0.6).caption.title, /super effective.*super effective/);
  });

  test('a species on both teams draws each cue on its own side', () => {
    const mon = Moves.mon('Pikachu');
    const other = Moves.mon('Squirtle');
    const featured = { lead: mon, support: other, stopper: mon, help: other };
    const record = (offense) => ({
      side: offense ? 'home' : 'away',
      offense,
      actor: mon,
      target: other,
      move: 'tackle',
      hit: true,
      effectiveness: 1,
      value: 5,
      notes: [],
    });
    for (const offense of [true, false]) {
      const motion = new BattleMotion(
        Moves.offense(),
        { outcome: 'gain', yards: 3, moves: [record(offense)] },
        featured,
      );
      const state = motion.sample(0.3);
      assert.equal(state.cue.from.x, state.actors[offense ? 0 : 2].x);
    }
  });
});

describe('Second review fixes', () => {
  test('Psychic Read is paid at activation and cannot be cancelled', () => {
    const match = Moves.game();
    const qb = match.rosters.home.player('QB');
    qb.types = ['Psychic'];
    match.prepareCall(Moves.offense());
    match.activateAbility('home', 'read', Moves.offense());
    assert.equal(match.charges.home, 1);
    assert.equal(match.rosters.home.energy(qb), 90);
    assert.throws(() => match.cancelAbility('home'), /already paid/);
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(match.charges.home, 1);
  });

  test('an audible or a lost role drops a pending ability at no cost', () => {
    const audible = Moves.game();
    audible.rosters.home.player('RB').types = ['Electric'];
    audible.prepareCall(Moves.offense());
    audible.activateAbility('home', 'burst', Moves.offense());
    audible.choosePlayerCall(Moves.offense('quick-slant'));
    assert.equal(audible.phase.abilities.home, undefined);
    audible.snap(audible.phase.offense, audible.phase.defense);
    assert.equal(audible.charges.home, 2);
    const swapped = Moves.game();
    const rb = swapped.rosters.home.player('RB');
    rb.types = ['Electric'];
    swapped.prepareCall(Moves.offense());
    swapped.activateAbility('home', 'burst', Moves.offense());
    swapped.substitute('RB', 0, 1);
    swapped.snap(swapped.phase.offense, swapped.phase.defense);
    assert.equal(swapped.charges.home, 2);
    assert.equal(swapped.rosters.home.energy(rb) >= 100 - 3, true);
    assert.ok(swapped.log.some((line) => line.includes('could not use Electric Burst')));
  });

  test('a stuff that Protect erased still keeps the clock running on a sideline finish', () => {
    const match = Moves.game(() => 0);
    match.prepareCall(Moves.offense());
    Moves.use(match, 'home', match.rosters.home.player('RB'), 'protect');
    const result = match.snap(match.phase.offense, match.phase.defense, { sideline: true });
    assert.equal(result.outcome, 'stop');
    assert.equal(result.outOfBounds, undefined);
    assert.equal(match.clockRunning, true);
  });

  test('a paralyzed starter at full stamina rotates out for a better healthy backup', () => {
    const roster = Moves.game().rosters.home;
    const [starter, backup] = [roster.player('WR'), roster.player('WR', 3)];
    backup.base_stats = { ...backup.base_stats, speed: 200, attack: 200, special_attack: 200 };
    roster.afflict(starter, 'paralysis');
    assert.equal(roster.penalty(starter), 0);
    roster.rotate('offense', Moves.offense());
    assert.equal(roster.player('WR').id, backup.id);
  });

  test('a tight end who carries the ball is not also the blocker', () => {
    const match = Moves.game();
    const te = match.rosters.home.player('TE');
    const play = { ...Moves.offense('quick-slant'), carrier: ['TE', 0] };
    const args = [match.rosters.home, match.rosters.away, play, Moves.defense(), 'middle', {}];
    const matchup = new PlayMatchup(...args, { attack: { side: 'home', actor: te, move: 'tackle', hit: true } });
    assert.notEqual(matchup.blocker.id, te.id);
    assert.equal(matchup.moveRecords[0].target.id, matchup.marker.mon.id);
  });

  test('moves carry Crystal values and a typeless move takes no type effectiveness', () => {
    assert.equal(MoveBook.get('tackle').power, 35);
    assert.equal(MoveBook.get('thunder').power, 120);
    assert.equal(MoveBook.get('curse').type, 'Unknown');
    assert.equal(MoveBook.effectiveness('curse', Moves.mon('Gastly')), 1);
  });

  test('the CPU draws a family, skips active fields and needless heals, and fires the best move of it', () => {
    const quiet = Moves.game();
    quiet.possession = 'away';
    quiet.prepareCall(Moves.defense());
    const away = quiet.rosters.away;
    const rb = away.player('RB');
    const options = [
      { actor: rb, move: 'recover' },
      { actor: rb, move: 'rain-dance' },
      { actor: rb, move: 'safeguard' },
    ];
    assert.equal(quiet.cpuWants('away', options[0]), false);
    away.spend(rb, 50);
    assert.equal(quiet.cpuWants('away', options[0]), true);
    quiet.field.weather = { kind: 'rain-dance', snaps: 3 };
    quiet.field.away.safeguard = 2;
    assert.equal(quiet.cpuWants('away', options[1]), false);
    assert.equal(quiet.cpuWants('away', options[2]), false);
    const families = new Set();
    for (const roll of [0.01, 0.5, 0.7, 0.9]) {
      let calls = 0;
      const match = Moves.game(() => (calls++ === 0 ? 0 : roll));
      match.possession = 'away';
      match.prepareCall(Moves.defense());
      for (const mon of match.rosters.away.players)
        match.rosters.away.setMoveset(mon, ['thunderbolt', 'thunder-wave', 'agility', 'protect']);
      calls = 0;
      match.fireCpuMove('away', match.resolveOffense(match.phase.offense, {}));
      families.add(MoveBook.family(match.phase.moves.away.move));
    }
    assert.ok(families.has('strike') && families.size > 1);
  });
});

describe('Third review fixes', () => {
  const play = () => ({ ...Moves.offense('quick-slant'), carrier: ['TE', 0] });

  test('Roar swaps the target with a rested backup in the depth chart and the swap stays after the condition ends', () => {
    const match = Moves.game();
    const home = match.rosters.home;
    const [te1, te2] = [home.player('TE', 0), home.player('TE', 1)];
    assert.equal(home.sendToBench(te1, 'offense', play()), true);
    assert.equal(home.player('TE', 0).id, te2.id);
    assert.equal(home.player('TE', 1).id, te1.id);
    assert.equal(home.has(te1, 'benched'), true);
    home.tick(match.rosters.away);
    home.tick(match.rosters.away);
    assert.equal(home.has(te1, 'benched'), false);
    assert.equal(home.player('TE', 0).id, te2.id);
  });

  test('a Roared quarterback does not kick the next field goal', () => {
    const home = Moves.game().rosters.home;
    const [qb1, qb2] = [home.player('QB', 0), home.player('QB', 1)];
    assert.equal(home.sendToBench(qb1, 'offense', Moves.offense()), true);
    assert.equal(home.player('QB').id, qb2.id);
    assert.equal(home.participants(Moves.offense()).passer.id, qb2.id);
  });

  test('a second Roar on the replacement benches it too', () => {
    const home = Moves.game().rosters.home;
    const [te1, te2, te3] = [0, 1, 2].map((depth) => home.player('TE', depth));
    assert.equal(home.sendToBench(te1, 'offense', play()), true);
    assert.equal(home.sendToBench(te2, 'offense', play()), true);
    assert.equal(home.has(te2, 'benched'), true);
    assert.equal(home.player('TE', 0).id, te3.id);
  });

  test('Roar with no eligible backup changes nothing', () => {
    const home = Moves.game().rosters.home;
    const te = home.player('TE', 0);
    for (const mon of [1, 2].map((depth) => home.player('TE', depth))) home.afflict(mon, 'trap');
    const order = home.players.map((mon) => mon.id);
    assert.equal(home.sendToBench(te, 'offense', play()), false);
    assert.deepEqual(
      home.players.map((mon) => mon.id),
      order,
    );
    assert.equal(home.has(te, 'benched'), false);
  });

  test('a manual swap that brings a benched player back throws', () => {
    const match = Moves.game();
    const home = match.rosters.home;
    const te1 = home.player('TE', 0);
    home.sendToBench(te1, 'offense', play());
    assert.throws(() => home.substitute('TE', 0, 1), RangeError);
    match.prepareCall(Moves.offense());
    assert.throws(() => match.substitute('TE', 0, 1), /benched/);
    assert.equal(home.player('TE', 1).id, te1.id);
  });

  test('an expired benched condition changes nobody charged for Sandstorm that snap', () => {
    const match = Moves.game();
    const home = match.rosters.home;
    const [te1, te2] = [home.player('TE', 0), home.player('TE', 1)];
    home.sendToBench(te1, 'offense', Moves.offense());
    home.conditions.get(te1.id).benched.snaps = 1;
    match.field.weather = { kind: 'sandstorm', snaps: 5 };
    match.prepareCall(Moves.offense());
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(home.has(te1, 'benched'), false);
    assert.equal(home.energy(te1) > 100 - 3, true);
    assert.equal(home.energy(te2) <= 100 - 3, true);
  });

  test('Spikes charge only the entrant on rotation, a manual swap, and Roar', () => {
    const rotated = Moves.game();
    rotated.setSpikes('home', true);
    const roster = rotated.rosters.home;
    const [te1, te2, te3] = [0, 1, 2].map((depth) => roster.player('TE', depth));
    te3.base_stats = { ...te3.base_stats, hp: 200, attack: 200, defense: 200, special_attack: 200 };
    roster.spend(te1, 40);
    rotated.rotateUnit('home', 'offense', play());
    assert.equal(roster.energy(te3), 90);
    assert.equal(roster.energy(te2), 100);
    assert.equal(roster.energy(te1), 60);
    const manual = Moves.game();
    manual.setSpikes('home', true);
    manual.prepareCall(Moves.offense());
    const [rb1, rb2] = [manual.rosters.home.player('RB', 0), manual.rosters.home.player('RB', 1)];
    manual.substitute('RB', 0, 1);
    assert.equal(manual.rosters.home.energy(rb2), 90);
    assert.equal(manual.rosters.home.energy(rb1), 100);
    const roared = Moves.game();
    roared.setSpikes('home', true);
    const [wr1, wr4] = [roared.rosters.home.player('WR', 0), roared.rosters.home.player('WR', 3)];
    roared.changeUnit('home', 'offense', Moves.offense(), () =>
      roared.rosters.home.sendToBench(wr1, 'offense', Moves.offense()),
    );
    assert.equal(roared.rosters.home.energy(wr1), 100);
    assert.equal(roared.rosters.home.energy(wr4), 90);
  });

  test('a call with no Spikes builds no extra lineup', () => {
    const match = Moves.game();
    const roster = match.rosters.home;
    const lineup = roster.lineup.bind(roster);
    let calls = 0;
    roster.lineup = (...args) => {
      calls++;
      return lineup(...args);
    };
    match.changeUnit('home', 'offense', play(), () => {});
    assert.equal(calls, 0);
  });

  test('moves against a punt drop at no cost, including the CPU rival', () => {
    const match = Moves.game(() => 0);
    match.possession = 'away';
    match.down = 4;
    match.prepareCall(Moves.defense());
    match.phase.offense = Moves.offense('punt');
    const dl = match.rosters.home.player('DL');
    Moves.use(match, 'home', dl, 'tackle');
    const charges = { ...match.charges };
    const result = match.snap(match.phase.offense, match.phase.defense);
    assert.deepEqual(result.moves, []);
    assert.equal(match.log.includes(`${dl.name} could not use Tackle.`), true);
    assert.equal(match.ppLeft('home', dl, 'tackle'), MoveBook.uses('tackle'));
    assert.deepEqual(match.charges, charges);
    assert.deepEqual(match.phase, null);
  });

  test('the CPU never fires Haze when no stat stage is in force', () => {
    const match = Moves.game();
    const rb = match.rosters.away.player('RB');
    assert.equal(match.cpuWants('away', { actor: rb, move: 'haze' }), false);
    match.rosters.home.shift(match.rosters.home.player('RB'), 'attack', 1);
    assert.equal(match.cpuWants('away', { actor: rb, move: 'haze' }), true);
  });

  test('Sandstorm drains only the players who played', () => {
    const match = Moves.game();
    const home = match.rosters.home;
    const [te1, te2] = [0, 1].map((depth) => home.player('TE', depth));
    home.sendToBench(te1, 'offense', Moves.offense());
    match.field.weather = { kind: 'sandstorm', snaps: 5 };
    match.prepareCall(Moves.offense());
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(home.energy(te1), 100);
    assert.ok(home.energy(te2) <= 100 - 3);
  });

  test('Explosion is left out of default movesets, can be picked, and leaves the user at zero stamina', () => {
    for (const name of ['Electrode', 'Voltorb', 'Golem', 'Gengar', 'Forretress']) {
      assert.equal(
        MoveBook.defaultMoveset(Moves.mon(name)).some((move) => MoveBook.SELF_FAINT.includes(move)),
        false,
      );
    }
    const match = Moves.game();
    const rb = match.rosters.home.player('RB');
    rb.moves.push('explosion');
    Moves.pick(match, 'home', rb, 'explosion');
    match.snap(match.phase.offense, match.phase.defense);
    assert.equal(match.rosters.home.energy(rb), 0);
    assert.ok(match.rosters.home.penalty(rb) > 0);
  });

  test('offensive Protect and a defensive Thunderbolt draw the shield and the beam together', () => {
    const match = Moves.game();
    match.prepareCall(Moves.offense());
    Moves.use(match, 'home', match.rosters.home.player('RB'), 'protect');
    Moves.use(match, 'away', match.rosters.away.player('LB'), 'thunderbolt');
    const result = match.snap(match.phase.offense, match.phase.defense);
    const { carrier, support, defender, help } = result.participants;
    const motion = new BattleMotion(Moves.offense(), result, { lead: carrier, support, stopper: defender, help });
    const state = motion.sample(0.45);
    assert.equal(state.cue.kind, 'beam');
    assert.ok(state.bubble);
    assert.equal(motion.sample(0.7).bubble !== null, true);
    assert.equal(motion.sample(0.85).bubble, null);
    assert.equal(motion.sample(0.45, true).bubble, null);
    assert.equal(motion.sample(0.3).cue, null);
  });

  test('an expired snap still reports the active weather and trap has a badge', () => {
    const match = Moves.game();
    match.field.weather = { kind: 'rain-dance', snaps: 3 };
    match.clockRunning = true;
    match.seconds = 10;
    match.prepareCall(Moves.offense());
    assert.equal(match.snap(match.phase.offense, match.phase.defense).weather, 'rain-dance');
    const rb = match.rosters.home.player('RB');
    match.rosters.home.afflict(rb, 'trap');
    assert.deepEqual(match.rosters.home.badges(rb), ['TRP']);
  });
});

describe('Move cues', () => {
  test('the cue plays between 0.22 and 0.5, veers off on a miss, and the caption names the move', () => {
    for (const [move, random, missed] of [
      ['thunderbolt', () => 0.5, false],
      ['thunder', () => 0.99, true],
    ]) {
      const game = Moves.game(random);
      Moves.pick(game, 'home', game.rosters.home.player('RB'), move);
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
      ['rain-dance', 'field', undefined],
      ['fissure', 'flash', undefined],
      ['roar', 'aura', 'OUT'],
    ]) {
      const game = Moves.game(move === 'fissure' ? () => 0.2 : undefined);
      const rb = game.rosters.home.player('RB');
      Moves.learn(game, 'home', rb, [move]);
      Moves.pick(game, 'home', rb, move);
      const result = game.snap(game.phase.offense, game.phase.defense);
      const { carrier, support, defender, help } = result.participants;
      const motion = new BattleMotion(Moves.offense(), result, { lead: carrier, support, stopper: defender, help });
      const cue = motion.sample(move === 'fissure' ? 0.55 : 0.4).cue;
      assert.equal(cue.kind, kind, move);
      assert.equal(cue.label, label, move);
    }
  });

  test('a lunge cue starts at the actor and a play without moves has no cue', () => {
    const game = Moves.game();
    Moves.pick(game, 'home', game.rosters.home.player('RB'), 'tackle');
    const result = game.snap(game.phase.offense, game.phase.defense);
    const { carrier, support, defender, help } = result.participants;
    const featured = { lead: carrier, support, stopper: defender, help };
    assert.equal(new BattleMotion(Moves.offense(), result, featured).sample(0.3).cue.kind, 'lunge');
    assert.equal(new BattleMotion(Moves.offense(), { ...result, moves: [] }, featured).sample(0.3).cue, null);
  });
});

describe('Fifth review fixes', () => {
  // Inside Zone fields one tight end, Power Run two, QB Sneak all three.
  test('a bigger formation seats a free backup in place of a benched tight end', () => {
    const { home, te1 } = Moves.roared();
    assert.equal(home.player('TE', 1).id, te1.id);
    home.seatBenched('offense', Moves.offense('power-run'));
    const unit = home.lineup('offense', Moves.offense('power-run')).map((slot) => slot.mon.id);
    assert.equal(unit.includes(te1.id), false);
    assert.equal(home.player('TE', 2).id, te1.id);
  });

  test('calling a bigger formation seats a benched player before the snap', () => {
    const { match, te1 } = Moves.roared();
    match.prepareCall(Moves.offense('power-run'));
    const unit = match.rosters.home.lineup('offense', Moves.offense('power-run')).map((slot) => slot.mon.id);
    assert.equal(unit.includes(te1.id), false);
  });

  test('a formation that needs every player at a position fields the benched one', () => {
    const { home, te1 } = Moves.roared();
    home.seatBenched('offense', Moves.offense('qb-sneak'));
    const unit = home.lineup('offense', Moves.offense('qb-sneak')).map((slot) => slot.mon.id);
    assert.equal(unit.includes(te1.id), true);
  });

  test('Roar on a benched player fails without throwing', () => {
    const { home, te1 } = Moves.roared();
    const order = home.players.map((mon) => mon.id);
    assert.equal(home.sendToBench(te1, 'offense', Moves.offense('qb-sneak')), false);
    assert.deepEqual(
      home.players.map((mon) => mon.id),
      order,
    );
  });

  test('a benched player can move down the depth chart', () => {
    const { home, te1 } = Moves.roared();
    home.substitute('TE', 1, 2);
    assert.equal(home.player('TE', 2).id, te1.id);
  });

  test('the CPU fires Haze only when the rival holds more stat stages', () => {
    const match = Moves.game();
    const [own, rival] = [match.rosters.away, match.rosters.home];
    const rb = own.player('RB');
    own.shift(rb, 'attack', 2);
    assert.equal(match.cpuWants('away', { actor: rb, move: 'haze' }), false);
    rival.shift(rival.player('RB'), 'attack', 2);
    rival.shift(rival.player('QB'), 'speed', 1);
    assert.equal(match.cpuWants('away', { actor: rb, move: 'haze' }), true);
  });
});

describe('Sixth review fixes', () => {
  const unit = (roster, id) => roster.lineup('offense', Moves.offense(id)).map((slot) => slot.mon.id);

  test('a benched player who is also trapped stays put and the call still starts', () => {
    const { match, home, te1 } = Moves.roared();
    home.afflict(te1, 'trap');
    assert.doesNotThrow(() => match.prepareCall(Moves.offense('power-run')));
    assert.equal(unit(home, 'power-run').includes(te1.id), true);
  });

  test('an audible to a bigger formation seats a benched player at once', () => {
    const { match, home, te1 } = Moves.roared();
    match.prepareCall(Moves.offense());
    match.choosePlayerCall(Moves.offense('power-run'));
    assert.equal(unit(home, 'power-run').includes(te1.id), false);
  });
});

describe('Seventh review fixes', () => {
  test('a snap with no prepared call still seats a benched player', () => {
    const { match, home, te1 } = Moves.roared();
    match.setSpikes('home', true);
    const spends = [];
    const spend = home.spend.bind(home);
    home.spend = (mon, amount) => spends.push(amount) && spend(mon, amount);
    match.snap(Moves.offense('power-run'), Moves.defense());
    const unit = home.lineup('offense', Moves.offense('power-run')).map((slot) => slot.mon.id);
    assert.equal(unit.includes(te1.id), false);
    assert.equal(spends.includes(FootballGame.SPIKES_COST), false);
  });

  test('seating a benched player on an audible pays no Spikes', () => {
    const { match, home } = Moves.roared();
    match.setSpikes('home', true);
    match.prepareCall(Moves.offense());
    const energy = home.players.map((mon) => home.energy(mon));
    match.choosePlayerCall(Moves.offense('power-run'));
    match.choosePlayerCall(Moves.offense());
    assert.deepEqual(
      home.players.map((mon) => home.energy(mon)),
      energy,
    );
  });
});
