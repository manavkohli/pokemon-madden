const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { FootballGame } = require('../src/game/football.js');
const { PlayMatchup } = require('../src/game/matchup.js');
const { OFFENSE, DEFENSE, POSITIONS } = require('../src/game/playbook.js');
const { BattleMotion } = require('../src/ui/battle/motion.js');

class Mechanics {
  static offense(id = 'inside-zone') {
    return OFFENSE.find((play) => play.id === id);
  }
  static defense(id = 'cover-3') {
    return DEFENSE.find((play) => play.id === id);
  }

  static game(random = () => 0.5) {
    const teams = [0, 100].map((offset) => {
      const roster = new Roster(
        data,
        POSITIONS.map((_, index) => index + 1 + offset),
      );
      roster.players = roster.players.map((mon) => ({
        ...mon,
        types: ['Normal'],
        base_stats: { hp: 80, attack: 80, defense: 80, special_attack: 80, special_defense: 80, speed: 80, total: 480 },
      }));
      return roster;
    });
    return new FootballGame(...teams, 300, random);
  }

  static improve(roster, role, depth, value) {
    const mon = roster.player(role, depth);
    mon.base_stats = Object.fromEntries(
      Object.keys(mon.base_stats).map((stat) => [stat, stat === 'total' ? value * 6 : value]),
    );
  }

  static contest(game, play = this.offense(), defense = this.defense(), options = {}) {
    return new PlayMatchup(
      game.rosters[game.possession],
      game.rosters[game.opponent()],
      game.resolveOffense(play, options),
      defense,
      options.lane || 'middle',
    );
  }

  static abilityTeam(game) {
    game.rosters.home.player('QB').types = ['Psychic'];
    game.rosters.home.player('RB').types = ['Electric'];
    game.rosters.home.player('OL').types = ['Steel'];
    game.rosters.away.player('DL').types = ['Electric', 'Steel'];
  }

  static random(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }

  static play(game, play = this.offense(), defense = this.defense(), options = {}) {
    return game.snap(play, defense, options);
  }

  static assertState(game, result, side) {
    assert.ok(Number.isFinite(result.yards));
    assert.ok(Number.isFinite(result.seconds) && result.seconds >= 0);
    assert.ok(game.seconds >= 0 && game.seconds <= game.quarterSeconds);
    assert.ok(game.spot >= 1 && game.spot <= 99);
    assert.ok(game.down >= 1 && game.down <= 4);
    assert.ok(game.toGo >= 1 && game.toGo <= 99);
    const attack = game.rosters[side].lineup('offense', result.offense);
    assert.ok(attack.some((slot) => slot.mon.id === result.participants.carrier.id));
    for (const team of Object.values(game.rosters)) {
      assert.equal(new Set(team.players.map((mon) => mon.id)).size, POSITIONS.length);
      for (const mon of team.players) assert.ok(team.energy(mon) >= 0 && team.energy(mon) <= 100);
    }
  }
}

describe('Individual football contests', () => {
  test('one weak blocker creates pressure and is the blocker shown on a sack', () => {
    const game = Mechanics.game(() => 0);
    const play = Mechanics.offense('quick-slant');
    const defense = Mechanics.defense('blitz');
    const before = Mechanics.contest(game, play, defense).chances(0).sack;
    Mechanics.improve(game.rosters.home, 'OL', 4, 20);
    const matchup = Mechanics.contest(game, play, defense);
    assert.ok(matchup.chances(0).sack > before);
    assert.equal(matchup.blocker.id, game.rosters.home.player('OL', 4).id);
    const result = Mechanics.play(game, play, defense);
    assert.equal(result.outcome, 'sack');
    assert.equal(result.participants.support.id, matchup.blocker.id);
    assert.equal(result.participants.defender.id, matchup.rusher.id);
    assert.equal(result.participants.carrier.id, game.rosters.home.player('QB').id);
  });

  test('targeting a weak corner changes completion odds without improving the other matchup', () => {
    const game = Mechanics.game();
    const play = Mechanics.offense('quick-slant');
    const first = Mechanics.contest(game, play).chances(0).completion;
    const second = Mechanics.contest(game, play, Mechanics.defense(), { target: ['WR', 1] }).chances(0).completion;
    Mechanics.improve(game.rosters.away, 'CB', 1, 20);
    assert.equal(Mechanics.contest(game, play).chances(0).completion, first);
    const matchup = Mechanics.contest(game, play, Mechanics.defense(), { target: ['WR', 1] });
    assert.ok(matchup.chances(0).completion > second);
    const result = Mechanics.play(game, play, Mechanics.defense(), { target: ['WR', 1] });
    assert.equal(result.participants.carrier.id, game.rosters.home.player('WR', 1).id);
    assert.equal(result.participants.defender.id, game.rosters.away.player('CB', 1).id);
  });

  test('quarterback quality affects accuracy and the second QB throws Double Pass', () => {
    const game = Mechanics.game();
    const play = Mechanics.offense('double-pass');
    const before = Mechanics.contest(game, play).chances(0).completion;
    Mechanics.improve(game.rosters.home, 'QB', 0, 150);
    assert.equal(Mechanics.contest(game, play).chances(0).completion, before);
    Mechanics.improve(game.rosters.home, 'QB', 1, 150);
    assert.ok(Mechanics.contest(game, play).chances(0).completion > before);
  });

  test('run lane selects its blocker and larger fronts increase resistance', () => {
    const game = Mechanics.game();
    Mechanics.improve(game.rosters.home, 'OL', 0, 20);
    const left = Mechanics.contest(game, Mechanics.offense(), Mechanics.defense(), { lane: 'left' });
    const right = Mechanics.contest(game, Mechanics.offense(), Mechanics.defense(), { lane: 'right' });
    assert.ok(left.protection < right.protection);
    assert.ok(left.chances(0).stuff > right.chances(0).stuff);
    assert.equal(left.blocker.id, game.rosters.home.player('OL').id);
    assert.ok(
      Mechanics.contest(game, Mechanics.offense(), Mechanics.defense('run-stuff')).protection <
        Mechanics.contest(game).protection,
    );
  });

  test('better tackling reduces gain and increases fumble risk', () => {
    const game = Mechanics.game();
    const before = Mechanics.contest(game);
    Mechanics.improve(game.rosters.away, 'LB', 2, 150);
    const after = Mechanics.contest(game);
    assert.ok(after.yardBonus < before.yardBonus);
    assert.ok(after.chances(0).fumble > before.chances(0).fumble);
  });

  test('a sack is decided before a pass can be intercepted or completed', () => {
    const game = Mechanics.game(() => 0);
    const result = Mechanics.play(game, Mechanics.offense('deep-shot'));
    assert.equal(result.outcome, 'sack');
    assert.ok(result.yards < 0);
    assert.equal(game.possession, 'home');
  });

  test('interceptions and fumbles use the actual defender and change possession', () => {
    const rolls = [0.99, 0];
    const passGame = Mechanics.game(() => rolls.shift());
    const picked = Mechanics.play(passGame, Mechanics.offense('quick-slant'));
    assert.equal(picked.outcome, 'interception');
    assert.equal(passGame.possession, 'away');
    assert.equal(picked.participants.defender.id, passGame.rosters.away.player('CB').id);
    const fumbleRolls = [0.99, 0.5, 0];
    const runGame = Mechanics.game(() => fumbleRolls.shift());
    const fumble = Mechanics.play(runGame);
    assert.equal(fumble.outcome, 'fumble');
    assert.equal(runGame.possession, 'away');
  });
});

describe('Committed calls, scouting, and options', () => {
  test('scouting and repeated preparation do not reroll the CPU or consume game time', () => {
    let rolls = 0;
    const game = Mechanics.game(() => {
      rolls++;
      return 0.5;
    });
    const phase = game.prepareCall(Mechanics.offense());
    const count = rolls;
    assert.equal(game.prepareCall(Mechanics.offense('deep-shot')), phase);
    game.revealTell();
    game.revealTell();
    assert.equal(rolls, count);
    assert.equal(game.seconds, 300);
    assert.match(game.tell(), /Coverage may be disguised/);
  });

  test('one audible after scouting is enforced by the engine', () => {
    const game = Mechanics.game();
    game.prepareCall(Mechanics.offense());
    game.choosePlayerCall(Mechanics.offense('quick-slant'));
    const committed = game.phase.defense;
    game.revealTell();
    game.choosePlayerCall(Mechanics.offense('screen-pass'));
    assert.equal(game.phase.audibled, true);
    assert.equal(game.phase.defense, committed);
    assert.throws(() => game.choosePlayerCall(Mechanics.offense('deep-shot')), /one audible/);
    assert.throws(() => game.snap(Mechanics.offense(), committed), /committed/);
    assert.equal(game.down, 1);
  });

  test('defensive audibles preserve the CPU offense and reveal personnel only', () => {
    const game = Mechanics.game();
    game.possession = 'away';
    game.prepareCall(Mechanics.defense());
    const offense = game.phase.offense;
    assert.match(game.revealTell(), /Rival personnel/);
    game.choosePlayerCall(Mechanics.defense('blitz'));
    assert.equal(game.phase.offense, offense);
    assert.throws(() => game.choosePlayerCall(Mechanics.defense('dime')), /one audible/);
  });

  test('a formation can be disguised without changing the committed coverage', () => {
    const game = Mechanics.game(() => 0);
    const phase = game.prepareCall(Mechanics.offense());
    assert.equal(phase.tell, 'Crowded box');
    assert.equal(game.revealTell(), 'Crowded box. Coverage may be disguised.');
    assert.equal(game.phase.defense.id, phase.defense.id);
  });

  test('Read Option really changes the carrier and RPO can run or throw', () => {
    const keep = Mechanics.play(Mechanics.game(), Mechanics.offense('read-option'), Mechanics.defense(), {
      read: 'keep',
    });
    const handoff = Mechanics.play(Mechanics.game(), Mechanics.offense('read-option'), Mechanics.defense(), {
      read: 'handoff',
    });
    assert.equal(keep.offense.carrier[0], 'QB');
    assert.equal(handoff.offense.carrier[0], 'RB');
    assert.notEqual(keep.participants.carrier.id, handoff.participants.carrier.id);
    const run = Mechanics.play(Mechanics.game(), Mechanics.offense('rpo-slant'), Mechanics.defense(), { read: 'run' });
    const pass = Mechanics.play(Mechanics.game(), Mechanics.offense('rpo-slant'), Mechanics.defense(), {
      read: 'pass',
    });
    assert.equal(run.offense.kind, 'run');
    assert.equal(run.offense.carrier[0], 'RB');
    assert.equal(pass.offense.kind, 'short');
  });

  test('an invalid target, option decision, lane, or tempo cannot mutate the game', () => {
    for (const options of [{ target: ['WR', 3] }, { target: ['QB', 0] }, { lane: 'sideways' }, { tempo: 'slow' }]) {
      const game = Mechanics.game();
      game.clockRunning = true;
      assert.throws(() => Mechanics.play(game, Mechanics.offense('quick-slant'), Mechanics.defense(), options));
      assert.equal(game.seconds, 300);
      assert.equal(game.down, 1);
    }
    const game = Mechanics.game();
    assert.throws(() => Mechanics.play(game, Mechanics.offense('rpo-slant'), Mechanics.defense(), { read: 'keep' }));
    assert.throws(() => Mechanics.play(game, Mechanics.offense('read-option'), Mechanics.defense(), { read: 'pass' }));
  });
});

describe('Stamina, depth, and match isolation', () => {
  test('active players tire while benched players recover; fatigue reduces ratings', () => {
    const game = Mechanics.game();
    const roster = game.rosters.home;
    const carrier = roster.player('RB');
    const bench = roster.player('RB', 1);
    roster.spend(bench, 30);
    Mechanics.play(game);
    assert.equal(roster.energy(carrier), 93);
    assert.equal(roster.energy(bench), 79);
    roster.spend(carrier, 45);
    assert.ok(roster.effectiveRating(carrier, 'RB') < Roster.rating(carrier, 'RB'));
    assert.ok(roster.skill(carrier, 'speed') < roster.skill(bench, 'speed'));
  });

  test('swapping players preserves their stamina and changes the next carrier', () => {
    const game = Mechanics.game();
    game.prepareCall(Mechanics.offense());
    const roster = game.rosters.home;
    const tired = roster.player('RB');
    const fresh = roster.player('RB', 1);
    roster.spend(tired, 60);
    game.substitute('RB', 0, 1);
    assert.equal(roster.player('RB').id, fresh.id);
    assert.equal(roster.energy(tired), 40);
    const result = game.snap(game.phase.offense, game.phase.defense);
    assert.equal(result.participants.carrier.id, fresh.id);
    assert.equal(new Set(roster.players.map((mon) => mon.id)).size, 31);
  });

  test('automatic rotation uses a better fresh backup, with exactly eleven unique players', () => {
    const game = Mechanics.game();
    game.autoRotate.home = true;
    const roster = game.rosters.home;
    const fresh = roster.player('RB', 1);
    roster.spend(roster.player('RB'), 70);
    game.prepareCall(Mechanics.offense());
    assert.equal(roster.player('RB').id, fresh.id);
    assert.equal(roster.lineup('offense', Mechanics.offense()).length, 11);
    assert.equal(new Set(roster.lineup('offense', Mechanics.offense()).map((slot) => slot.mon.id)).size, 11);
  });

  test('fatigue and in-game substitutions do not alter drafted rosters or rematches', () => {
    const draft = new Roster(
      data,
      POSITIONS.map((_, index) => index + 1),
    );
    const originalIds = draft.players.map((mon) => mon.id);
    const game = new FootballGame(draft, draft, 300, () => 0.5);
    game.rosters.home.substitute('QB', 0, 1);
    game.rosters.home.spend(game.rosters.home.player('QB'), 100);
    assert.deepEqual(
      draft.players.map((mon) => mon.id),
      originalIds,
    );
    assert.equal(game.rosters.away.energy(game.rosters.away.player('QB')), 100);
    const rematch = new FootballGame(draft, draft, 300);
    assert.deepEqual(
      rematch.rosters.home.players.map((mon) => mon.id),
      originalIds,
    );
    assert.equal(rematch.rosters.home.energy(rematch.rosters.home.player('QB')), 100);
  });

  test('stamina is bounded and invalid swaps leave the roster intact', () => {
    const roster = Mechanics.game().rosters.home;
    const mon = roster.player('RB');
    roster.spend(mon, 1000);
    assert.equal(roster.energy(mon), 0);
    roster.recover(1000);
    assert.equal(roster.energy(mon), 100);
    const ids = roster.players.map((player) => player.id);
    assert.throws(() => roster.substitute('RB', 0, 10), RangeError);
    assert.throws(() => roster.substitute('RB', 0, 0), RangeError);
    assert.deepEqual(
      roster.players.map((player) => player.id),
      ids,
    );
  });
});

describe('Limited Pokémon abilities', () => {
  test('eligibility depends on the active player type and football role', () => {
    const game = Mechanics.game();
    Mechanics.abilityTeam(game);
    assert.deepEqual(
      game.availableAbilities('home', Mechanics.offense()).map((ability) => ability.id),
      ['burst', 'shield', 'read'],
    );
    assert.equal(
      game.availableAbilities('home', Mechanics.offense('jet-sweep')).some((ability) => ability.id === 'burst'),
      false,
    );
    assert.deepEqual(game.availableAbilities('home', Mechanics.offense('spike')), []);
    game.rosters.home.spend(game.rosters.home.player('RB'), 90);
    assert.equal(
      game.availableAbilities('home', Mechanics.offense()).some((ability) => ability.id === 'burst'),
      false,
    );
  });

  test('the snap spends a shared charge and stamina, with one ability per call', () => {
    const game = Mechanics.game();
    Mechanics.abilityTeam(game);
    game.prepareCall(Mechanics.offense());
    const actor = game.rosters.home.player('RB');
    game.activateAbility('home', 'burst', Mechanics.offense());
    assert.equal(game.charges.home, 2);
    assert.equal(game.rosters.home.energy(actor), 100);
    assert.throws(() => game.activateAbility('home', 'shield', Mechanics.offense()), /One ability/);
    game.snap(game.phase.offense, game.phase.defense);
    assert.equal(game.charges.home, 1);
    assert.ok(game.rosters.home.energy(actor) <= 90);
    game.prepareCall(Mechanics.offense());
    game.activateAbility('home', 'shield', Mechanics.offense());
    game.snap(game.phase.offense, game.phase.defense);
    assert.equal(game.charges.home, 0);
    game.prepareCall(Mechanics.offense());
    assert.throws(() => game.activateAbility('home', 'burst', Mechanics.offense()), /No ability charges/);
  });

  test('Psychic Read reveals the actual committed call and still permits only one audible', () => {
    const game = Mechanics.game();
    Mechanics.abilityTeam(game);
    game.prepareCall(Mechanics.offense());
    const defense = game.phase.defense;
    game.activateAbility('home', 'read', Mechanics.offense());
    assert.equal(game.tell(), `Psychic read: ${defense.name}.`);
    game.choosePlayerCall(Mechanics.offense('quick-slant'));
    assert.throws(() => game.choosePlayerCall(Mechanics.offense('screen-pass')), /one audible/);
    assert.equal(game.phase.defense, defense);
  });

  test('Burst improves its actual carrier; swapping it out prevents a bonus transferring', () => {
    const normal = Mechanics.game();
    const powered = Mechanics.game();
    for (const game of [normal, powered]) {
      Mechanics.abilityTeam(game);
      game.prepareCall(Mechanics.offense());
    }
    powered.activateAbility('home', 'burst', Mechanics.offense());
    const base = normal.snap(normal.phase.offense, normal.phase.defense);
    const boosted = powered.snap(powered.phase.offense, powered.phase.defense);
    assert.ok(boosted.yards > base.yards);
    const swapped = Mechanics.game();
    Mechanics.abilityTeam(swapped);
    swapped.prepareCall(Mechanics.offense());
    swapped.activateAbility('home', 'burst', Mechanics.offense());
    swapped.substitute('RB', 0, 1);
    const noTransfer = swapped.snap(swapped.phase.offense, swapped.phase.defense);
    assert.equal(noTransfer.matchup.tackle, base.matchup.tackle);
  });

  test('Steel improves protection, and both defensive abilities affect contests', () => {
    const game = Mechanics.game();
    Mechanics.abilityTeam(game);
    const offense = Mechanics.offense('quick-slant');
    const defense = Mechanics.defense('blitz');
    const baseline = Mechanics.contest(game, offense, defense);
    const attack = { id: 'shield', actor: game.rosters.home.player('OL') };
    const defend = { id: 'burst', actor: game.rosters.away.player('DL') };
    const shield = new PlayMatchup(game.rosters.home, game.rosters.away, offense, defense, 'middle', { attack });
    const rush = new PlayMatchup(game.rosters.home, game.rosters.away, offense, defense, 'middle', { defend });
    assert.ok(shield.chances(0).sack < baseline.chances(0).sack);
    assert.ok(rush.chances(0).sack > baseline.chances(0).sack);
    const wall = new PlayMatchup(game.rosters.home, game.rosters.away, offense, defense, 'middle', {
      defend: { ...defend, id: 'shield' },
    });
    assert.ok(wall.yardBonus < baseline.yardBonus);
  });

  test('the CPU spends its own charges under the same eligibility and stamina rules', () => {
    const game = Mechanics.game(() => 0);
    Mechanics.abilityTeam(game);
    game.prepareCall(Mechanics.offense());
    const { offense, defense } = game.phase;
    game.snap(offense, defense, {});
    assert.equal(game.charges.away, 1);
    assert.ok(game.log.some((line) => line.includes('activates')));
    assert.ok(game.rosters.away.energy(game.rosters.away.player('DL')) <= 90);
  });

  test('an expired period pays no ability charge or stamina', () => {
    const game = Mechanics.game(() => 0);
    Mechanics.abilityTeam(game);
    game.clockRunning = true;
    game.seconds = 10;
    game.prepareCall(Mechanics.offense());
    game.activateAbility('home', 'burst', Mechanics.offense());
    const result = game.snap(game.phase.offense, game.phase.defense);
    assert.equal(result.outcome, 'clock-expired');
    assert.deepEqual(game.charges, { home: 2, away: 2 });
    assert.equal(game.rosters.home.energy(game.rosters.home.player('RB')), 100);
  });

  test('a fourth-down sack stays a sack, turns the ball over, and features the passer', () => {
    const game = Mechanics.game(() => 0);
    game.down = 4;
    game.toGo = 5;
    const result = Mechanics.play(game, Mechanics.offense('quick-slant'));
    assert.equal(result.outcome, 'sack');
    assert.equal(game.possession, 'away');
    assert.equal(result.participants.carrier.id, game.rosters.home.player('QB').id);
  });
});

describe('Football clock and close finishes', () => {
  test('tempo is simulated runoff only when the previous play left the clock running', () => {
    for (const [tempo, runoff] of Object.entries(FootballGame.TEMPOS)) {
      const stopped = Mechanics.game();
      const first = Mechanics.play(stopped, Mechanics.offense(), Mechanics.defense(), { tempo });
      assert.equal(first.runoff, 0);
      const game = Mechanics.game();
      game.clockRunning = true;
      const result = Mechanics.play(game, Mechanics.offense(), Mechanics.defense(), { tempo });
      assert.equal(result.runoff, runoff);
      assert.equal(300 - game.seconds, result.seconds);
      assert.equal(result.seconds, result.playSeconds + runoff);
    }
  });

  test('a timeout stops runoff without changing the phase, audible, or clock seconds', () => {
    const game = Mechanics.game();
    game.clockRunning = true;
    game.prepareCall(Mechanics.offense());
    game.revealTell();
    game.choosePlayerCall(Mechanics.offense('quick-slant'));
    const phase = game.phase;
    game.timeout('home');
    assert.equal(game.seconds, 300);
    assert.equal(game.timeouts.home, 2);
    assert.equal(game.phase, phase);
    assert.equal(game.phase.audibled, true);
    assert.throws(() => game.timeout('home'), /not available/);
    const result = game.snap(game.phase.offense, game.phase.defense, { tempo: 'chew' });
    assert.equal(result.runoff, 0);
  });

  test('sideline finishes give up yards and stop the next runoff', () => {
    const fight = Mechanics.play(Mechanics.game(), Mechanics.offense('quick-slant'));
    const game = Mechanics.game();
    const sideline = Mechanics.play(game, Mechanics.offense('quick-slant'), Mechanics.defense(), { sideline: true });
    assert.equal(sideline.yards, fight.yards - 2);
    assert.equal(sideline.outOfBounds, true);
    assert.equal(game.clockRunning, false);
    assert.equal(Mechanics.play(game).runoff, 0);
  });

  test('spiking spends a down, kneeling loses a yard, and fourth-down spikes turn over', () => {
    const spike = Mechanics.game();
    Mechanics.play(spike, Mechanics.offense('spike'));
    assert.equal(spike.down, 2);
    assert.equal(spike.spot, 25);
    assert.equal(spike.seconds, 299);
    assert.equal(spike.clockRunning, false);
    const kneel = Mechanics.game();
    const result = Mechanics.play(kneel, Mechanics.offense('kneel'));
    assert.equal(result.yards, -1);
    assert.equal(kneel.spot, 24);
    assert.equal(kneel.clockRunning, true);
    spike.down = 4;
    assert.equal(Mechanics.play(spike, Mechanics.offense('spike')).outcome, 'spike');
    assert.equal(spike.possession, 'away');
  });

  test('incompletions stop the clock while sacks keep it running', () => {
    const incomplete = Mechanics.game(() => 0.99);
    assert.equal(Mechanics.play(incomplete, Mechanics.offense('quick-slant')).outcome, 'incomplete');
    assert.equal(incomplete.clockRunning, false);
    const sack = Mechanics.game(() => 0);
    assert.equal(Mechanics.play(sack, Mechanics.offense('quick-slant')).outcome, 'sack');
    assert.equal(sack.clockRunning, true);
  });

  test('runoff expiring a quarter does not resolve a phantom snap or spend stamina', () => {
    const game = Mechanics.game();
    game.seconds = 10;
    game.clockRunning = true;
    const ids = game.rosters.home.players.map((mon) => mon.id);
    const result = Mechanics.play(game, Mechanics.offense(), Mechanics.defense(), { tempo: 'chew' });
    assert.equal(result.outcome, 'clock-expired');
    assert.equal(result.seconds, 10);
    assert.equal(game.history.length, 0);
    assert.equal(game.quarter, 2);
    assert.equal(game.down, 1);
    assert.equal(game.spot, 25);
    assert.equal(game.playClockSeconds, 25);
    assert.deepEqual(
      game.rosters.home.players.map((mon) => mon.id),
      ids,
    );
    assert.ok(game.rosters.home.players.every((mon) => game.rosters.home.energy(mon) === 100));
  });

  test('halftime restores charges, timeouts, stamina and the second-half kickoff', () => {
    const game = Mechanics.game();
    game.quarter = 2;
    game.seconds = 1;
    game.timeouts = { home: 0, away: 0 };
    game.charges = { home: 0, away: 0 };
    game.rosters.home.spend(game.rosters.home.player('RB'), 80);
    const result = Mechanics.play(game);
    assert.equal(result.seconds, 1);
    assert.equal(game.quarter, 3);
    assert.equal(game.possession, 'away');
    assert.equal(game.spot, 25);
    assert.deepEqual(game.timeouts, { home: 3, away: 3 });
    assert.deepEqual(game.charges, { home: 2, away: 2 });
    assert.equal(game.rosters.home.energy(game.rosters.home.player('RB')), 100);
    assert.equal(game.clockRunning, false);
  });

  test('CPU clock decisions use hurry-up when trailing, chew when leading, and timeouts', () => {
    const game = Mechanics.game();
    game.quarter = 4;
    game.seconds = 40;
    game.score.home = 7;
    game.possession = 'away';
    game.clockRunning = true;
    game.prepareCall(Mechanics.defense());
    assert.equal(game.timeouts.away, 2);
    assert.equal(game.clockRunning, false);
    assert.equal(game.cpuOptions(game.phase.offense, game.phase.defense).tempo, 'hurry');
    game.score.away = 14;
    assert.equal(game.cpuOptions(game.phase.offense, game.phase.defense).tempo, 'chew');
    game.seconds = 20;
    game.clockRunning = true;
    game.timeouts.home = 0;
    assert.equal(game.chooseCpuOffense().id, 'kneel');
  });

  test('a lead can survive the final runoff; no actions are legal after the final whistle', () => {
    const game = Mechanics.game();
    game.quarter = 4;
    game.seconds = 15;
    game.score.home = 7;
    game.clockRunning = true;
    const result = Mechanics.play(game, Mechanics.offense('kneel'), Mechanics.defense(), { tempo: 'chew' });
    assert.equal(result.outcome, 'clock-expired');
    assert.equal(game.over, true);
    assert.equal(game.score.home, 7);
    assert.throws(() => Mechanics.play(game), /ended/);
    assert.throws(() => game.prepareCall(Mechanics.offense()), /ended/);
    assert.throws(() => game.timeout('home'), /not available/);
  });

  test('special teams preserve original participants and enforce fourth down', () => {
    const game = Mechanics.game();
    assert.throws(() => Mechanics.play(game, Mechanics.offense('punt')), /fourth down/);
    assert.equal(game.seconds, 300);
    game.down = 4;
    const quarterback = game.rosters.home.player('QB');
    const punt = Mechanics.play(game, Mechanics.offense('punt'));
    assert.equal(game.possession, 'away');
    assert.equal(punt.participants.carrier.id, quarterback.id);
    assert.equal(game.clockRunning, false);
  });
});

describe('Playback and end-to-end invariants', () => {
  test('clock plays have readable captions, no pass flight, and fixed reduced-motion poses', () => {
    for (const id of ['spike', 'kneel']) {
      const result = Mechanics.play(Mechanics.game(), Mechanics.offense(id));
      const { carrier: lead, support, defender: stopper, help } = result.participants;
      const motion = new BattleMotion(result.offense, result, { lead, support, stopper, help });
      assert.ok(motion.impact);
      assert.equal(motion.passing, false);
      assert.deepEqual(motion.sample(0.2, true).actors, motion.sample(0.8, true).actors);
    }
    const game = Mechanics.game();
    game.seconds = 1;
    game.clockRunning = true;
    const result = Mechanics.play(game);
    const { carrier: lead, support, defender: stopper, help } = result.participants;
    const motion = new BattleMotion(result.offense, result, { lead, support, stopper, help });
    assert.equal(motion.sample(0.5).ball.visible, false);
    assert.equal(motion.impact, 'TIME EXPIRES');
  });

  test('seeded complete games preserve bounds, roster identities, and participant membership', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const random = Mechanics.random(seed);
      const game = Mechanics.game(random);
      game.quarterSeconds = 120;
      game.seconds = 120;
      game.autoRotate.home = true;
      let snaps = 0;
      while (!game.over && snaps < 600) {
        const side = game.possession;
        const book = side === 'home' ? OFFENSE.filter((play) => game.isLegalCall(play)) : DEFENSE;
        const playerCall = book[Math.floor(random() * book.length)];
        game.prepareCall(playerCall);
        game.revealTell();
        const { offense, defense } = game.phase;
        const options =
          side === 'away'
            ? game.cpuOptions(offense, defense)
            : {
                tempo: ['normal', 'hurry', 'chew'][snaps % 3],
                lane: ['left', 'middle', 'right'][snaps % 3],
                sideline: snaps % 2 === 0,
              };
        const result = game.snap(offense, defense, options);
        Mechanics.assertState(game, result, side);
        const defensiveIds = new Set(
          game.rosters[game.opponent(side)].lineup('defense', defense).map((slot) => slot.mon.id),
        );
        assert.ok(defensiveIds.has(result.participants.defender.id));
        assert.ok(defensiveIds.has(result.participants.help.id));
        snaps++;
      }
      assert.equal(game.over, true, `seed ${seed} should finish within 600 snaps`);
    }
  });
});

test('a spike snaps immediately even with a running clock and normal tempo', () => {
  const game = Mechanics.game();
  game.seconds = 5;
  game.clockRunning = true;
  const result = Mechanics.play(game, Mechanics.offense('spike'));
  assert.equal(result.outcome, 'spike');
  assert.equal(result.runoff, 0);
  assert.equal(game.seconds, 4);
  assert.equal(game.down, 2);
  assert.equal(game.clockRunning, false);
});

test('an expired tied overtime period resets its deadline and stops the clock', () => {
  const game = Mechanics.game();
  game.quarter = 5;
  game.seconds = 1;
  const result = Mechanics.play(game, Mechanics.offense('kneel'));
  assert.equal(result.seconds, 1);
  assert.equal(game.over, false);
  assert.equal(game.seconds, 300);
  assert.equal(game.clockRunning, false);
  assert.equal(game.playClockSeconds, 25);
});
