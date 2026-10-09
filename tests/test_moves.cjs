const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pokemon: data, moves } = require('../pokemon_gen1_2.json');
const { MoveBook } = require('../src/game/moves.js');
const { Roster } = require('../src/game/roster.js');
const { POSITIONS } = require('../src/game/playbook.js');

class Moves {
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
