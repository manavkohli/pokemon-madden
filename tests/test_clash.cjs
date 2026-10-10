const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const fixture = require('./fixtures/seeded-game.json');
const { Roster } = require('../src/game/roster.js');
const { FootballGame } = require('../src/game/football.js');
const { OFFENSE, DEFENSE, POSITIONS } = require('../src/game/playbook.js');

const STATS = { hp: 80, attack: 80, defense: 80, special_attack: 80, special_defense: 80, speed: 80, total: 480 };

class Clash {
  static offense(id = 'inside-zone') {
    return OFFENSE.find((play) => play.id === id);
  }

  static defense(id = 'cover-3') {
    return DEFENSE.find((play) => play.id === id);
  }

  // Two teams of identical 80-stat players: every margin is zero, so a run that reaches contact is close.
  static game(random = () => 0.5) {
    const teams = [0, 100].map((offset) => {
      const roster = new Roster(
        data,
        POSITIONS.map((_, index) => index + 1 + offset),
      );
      roster.players = roster.players.map((mon) => ({
        ...mon,
        types: ['Normal'],
        moves: ['fissure', 'protect'],
        base_stats: { ...STATS },
      }));
      return roster;
    });
    return new FootballGame(...teams, 300, random);
  }

  // The rolls stay at one value until the test changes it, so each draw in a play is predictable.
  static rigged(value = 0.5) {
    const state = { value, queue: [] };
    state.random = () => (state.queue.length ? state.queue.shift() : state.value);
    return state;
  }

  static pending(rig = Clash.rigged(), play = Clash.offense(), defense = Clash.defense()) {
    const game = Clash.game(rig.random);
    const result = game.snap(play, defense);
    assert.ok(result.clash, 'the play reaches a clash');
    return { game, result, rig };
  }

  static expected(game, carrierAction, tacklerAction) {
    const { matchup } = game.pending;
    const [offense, defense] = [
      FootballGame.CLASH.actions.offense.find((action) => action.id === carrierAction),
      FootballGame.CLASH.actions.defense.find((action) => action.id === tacklerAction),
    ];
    const edge =
      game.rosters.home.skill(matchup.carrier, offense.stat) -
      game.rosters.away.skill(matchup.tackler.mon, defense.stat);
    return Math.max(2, Math.round(FootballGame.CLASH_WIN_YARDS + 0.3 * edge));
  }

  static trace(clashes) {
    let seed = 40;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const game = new FootballGame(
      Roster.random(data, undefined, random),
      Roster.random(data, undefined, random),
      300,
      random,
    );
    game.autoRotate.home = true;
    game.clashes = clashes;
    const snaps = [];
    for (let index = 0; index < 40 && !game.over; index++) {
      const book = game.possession === 'home' ? OFFENSE.filter((play) => game.isLegalCall(play)) : DEFENSE;
      game.prepareCall(book[Math.floor(random() * book.length)]);
      const { offense, defense } = game.phase;
      const options = game.possession === 'away' ? game.cpuOptions(offense, defense) : {};
      game.fireCpuMove('home', game.possession === 'home' ? game.resolveOffense(offense, options) : defense);
      const result = game.snap(offense, defense, options);
      if (result.clash) {
        snaps.push('clash');
        break;
      }
      snaps.push({
        yards: result.yards,
        seconds: result.seconds,
        runoff: result.runoff,
        outcome: result.outcome,
        message: result.message,
        moves: result.moves.length,
        score: [game.score.home, game.score.away],
        spot: game.spot,
        down: game.down,
        toGo: game.toGo,
      });
    }
    return snaps;
  }
}

describe('A seeded game is unchanged by the clash step', () => {
  test('with clashes off, all 40 snaps match the pre-change fixture', () => {
    assert.deepEqual(Clash.trace(false), fixture);
  });

  test('with clashes on, every snap before the first clash matches the fixture', () => {
    const snaps = Clash.trace(true);
    const first = snaps.indexOf('clash');
    assert.ok(first > 0, 'the game reaches a clash after at least one plain snap');
    assert.deepEqual(snaps.slice(0, first), fixture.slice(0, first));
  });
});

describe('The action table', () => {
  const outcomes = {
    juke: { wrap: 'lose', hit: 'big', strip: 'win' },
    truck: { wrap: 'win', hit: 'heavy', strip: 'win' },
    cover: { wrap: 'even', hit: 'even', strip: 'safe' },
  };
  const fumbles = {
    juke: { wrap: 0, hit: 0, strip: FootballGame.CLASH_FUMBLE.strip },
    truck: { wrap: 0, hit: FootballGame.CLASH_FUMBLE.heavy, strip: FootballGame.CLASH_FUMBLE.strip },
    cover: { wrap: 0, hit: 0, strip: null },
  };

  for (const carrier of Object.keys(outcomes)) {
    for (const tackler of Object.keys(outcomes[carrier])) {
      test(`${carrier} against ${tackler} is ${outcomes[carrier][tackler]}`, () => {
        const { game, rig } = Clash.pending();
        const before = game.pending.yards;
        const win = Clash.expected(game, carrier, tackler);
        const delta = { win, big: win * 2, lose: -2, heavy: -4, safe: 2, even: 0 }[outcomes[carrier][tackler]];
        const odds = game.pending.odds.fumble;
        const extra = fumbles[carrier][tackler];
        const fumbled = (value) => {
          const copy = Clash.pending();
          copy.rig.value = value;
          return copy.game.resolveClash(carrier, tackler).outcome === 'fumble';
        };
        assert.equal(fumbled(0), extra !== null, 'a roll of zero fumbles unless the cell is safe');
        if (extra !== null) {
          assert.equal(fumbled(odds + extra - 1e-9), true, 'a roll just under the adjusted odds fumbles');
          assert.equal(fumbled(odds + extra + 1e-9), false, 'a roll just over the adjusted odds holds the ball');
        }
        rig.value = 0.5;
        const result = game.resolveClash(carrier, tackler);
        assert.equal(result.clash.outcome, outcomes[carrier][tackler]);
        assert.equal(result.clash.fumble, extra);
        assert.equal(result.clash.yards, delta);
        assert.equal(result.yards, before + delta);
        assert.equal(game.spot, 25 + before + delta);
        assert.equal(game.pending, null);
      });
    }
  }

  test('a big win can break away for a touchdown', () => {
    const { game, rig } = Clash.pending();
    rig.queue = [0.5, FootballGame.BREAKAWAY_CHANCE - 0.001];
    const result = game.resolveClash('juke', 'hit');
    assert.equal(result.outcome, 'touchdown');
    assert.equal(result.clash.breakaway, true);
    assert.equal(game.score.home, 7);
    const miss = Clash.pending();
    assert.equal(miss.game.resolveClash('juke', 'hit').clash.breakaway, false);
  });

  test('the carrier edge grows the win yards', () => {
    const { game } = Clash.pending();
    game.pending.matchup.carrier.base_stats.speed = 120;
    const win = Clash.expected(game, 'juke', 'strip');
    assert.ok(win > 4);
    assert.equal(game.resolveClash('juke', 'strip').clash.yards, win);
  });

  test('paralysis halves the Juke yards', () => {
    const { game } = Clash.pending();
    const { carrier } = game.pending.matchup;
    game.rosters.home.afflict(carrier, 'paralysis');
    const win = Clash.expected(game, 'juke', 'strip');
    assert.equal(game.resolveClash('juke', 'strip').clash.yards, Math.round(win / 2));
  });

  test('a defensive Protect holds the gain to five yards after the clash', () => {
    const game = Clash.game();
    game.prepareCall(Clash.offense());
    const guard = game.rosters.away.player('LB');
    game.rosters.away.setMoveset(guard, ['protect']);
    game.activateMove('away', guard.id, 'protect', game.phase.defense);
    assert.ok(game.snap(game.phase.offense, game.phase.defense).clash);
    assert.ok(game.resolveClash('juke', 'hit').yards <= FootballGame.PROTECT_YARDS);
  });
});

describe('When a clash happens', () => {
  const never = (name, build) =>
    test(`${name} never clashes`, () => {
      const result = build();
      assert.equal(result.clash, undefined);
      assert.ok(result.outcome);
    });

  never('a sack', () => Clash.game(() => 0).snap(Clash.offense('quick-slant'), Clash.defense()));
  never('a stuff', () => Clash.game(() => 0).snap(Clash.offense(), Clash.defense()));
  never('an incompletion', () => Clash.game(() => 0.99).snap(Clash.offense('quick-slant'), Clash.defense()));
  never('an interception', () => {
    const rig = Clash.rigged(0.99);
    const game = Clash.game(rig.random);
    rig.queue = [0.99, 0];
    return game.snap(Clash.offense('quick-slant'), Clash.defense());
  });
  never('a one-hit move', () => {
    const game = Clash.game(() => 0.2);
    game.prepareCall(Clash.offense());
    const runner = game.rosters.home.player('RB');
    game.rosters.home.setMoveset(runner, ['fissure']);
    game.activateMove('home', runner.id, 'fissure', game.phase.offense);
    return game.snap(game.phase.offense, game.phase.defense);
  });

  test('a lopsided first-down run does not clash and a third-down run does', () => {
    const lopsided = () => {
      const game = Clash.game();
      for (const mon of game.rosters.away.players)
        mon.base_stats = {
          hp: 10,
          attack: 10,
          defense: 10,
          special_attack: 10,
          special_defense: 10,
          speed: 10,
          total: 60,
        };
      return game;
    };
    const first = lopsided();
    assert.equal(first.snap(Clash.offense(), Clash.defense()).clash, undefined);
    const third = lopsided();
    third.down = 3;
    assert.ok(third.snap(Clash.offense(), Clash.defense()).clash);
  });

  test('a pending clash blocks snap and prepareCall until it resolves', () => {
    const { game } = Clash.pending();
    assert.throws(() => game.snap(Clash.offense(), Clash.defense()), /Resolve the clash first/);
    assert.throws(() => game.prepareCall(Clash.offense()), /Resolve the clash first/);
    assert.throws(() => game.resolveClash('juke', 'nope'), /Unknown defense clash action/);
    assert.ok(game.pending, 'a rejected action leaves the clash pending');
    game.resolveClash('juke', 'wrap');
    assert.throws(() => game.resolveClash('juke', 'wrap'), /No clash is pending/);
    assert.doesNotThrow(() => game.prepareCall(Clash.offense()));
  });

  test('the pending result names the actors, the human actions, and the auto pick', () => {
    const { result, game } = Clash.pending();
    assert.equal(result.outcome, undefined);
    assert.equal(result.clash.role, 'offense');
    assert.deepEqual(
      result.clash.actions.map((action) => action.id),
      ['juke', 'truck', 'cover'],
    );
    assert.equal(result.clash.auto, 'juke', 'equal stats go to table order');
    assert.equal(game.score.home + game.score.away, 0);
    assert.equal(game.spot, 25);
  });

  test('the auto action follows the highest stat', () => {
    const { game } = Clash.pending();
    game.pending.matchup.carrier.base_stats.attack = 120;
    assert.equal(game.autoClashAction('offense'), 'truck');
    game.pending.matchup.tackler.mon.base_stats.speed = 120;
    assert.equal(game.autoClashAction('defense'), 'strip');
  });
});

describe('The CPU and confusion', () => {
  test('the CPU counters a human who picked Juke five times', () => {
    const { game } = Clash.pending();
    const share = () => {
      let wraps = 0;
      for (let draw = 0; draw < 100; draw++) {
        game.random = () => (draw + 0.5) / 100;
        if (game.cpuClashAction('defense') === 'wrap') wraps += 1;
      }
      return wraps;
    };
    assert.ok(share() < 40, 'with no memory the CPU spreads its picks');
    for (let pick = 0; pick < 5; pick++) game.rememberClash('home', { offense: 'juke' });
    assert.ok(share() > 50, 'with Juke in memory the CPU wraps up more than half the time');
  });

  test('the memory keeps the last five picks of each human role', () => {
    const { game } = Clash.pending();
    for (const action of ['juke', 'juke', 'truck', 'truck', 'truck', 'cover'])
      game.rememberClash('home', { offense: action });
    game.rememberClash('away', { defense: 'wrap' });
    assert.deepEqual(game.clashMemory.offense, ['juke', 'truck', 'truck', 'truck', 'cover']);
    assert.deepEqual(game.clashMemory.defense, ['wrap'], 'the human defense picks keep their own memory');
    const real = Clash.pending().game;
    real.resolveClash('truck', 'wrap');
    assert.deepEqual(real.clashMemory.offense, ['truck']);
  });

  test('a confused carrier swaps the action on a roll under one third', () => {
    const swap = (rolls) => {
      const { game, rig } = Clash.pending();
      game.rosters.home.afflict(game.pending.matchup.carrier, 'confusion');
      rig.queue = rolls;
      return game.resolveClash('juke', 'wrap').clash.offense;
    };
    assert.equal(swap([0.1, 0.99]), 'cover');
    assert.equal(swap([0.1, 0.5]), 'truck');
    assert.equal(swap([0.5]), 'juke');
  });
});
