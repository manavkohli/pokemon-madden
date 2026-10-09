const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster, FootballGame, OFFENSE, DEFENSE, POSITIONS } = require('../game.js');
const { BattleStage } = require('../battle.js');

assert.equal(data.length, 251);
assert.ok(OFFENSE.length >= 35);
assert.ok(DEFENSE.length >= 25);
assert.deepEqual(data.map(mon => mon.id), Array.from({ length: 251 }, (_, i) => i + 1));
for (const mon of data) {
  const { total, ...stats } = mon.base_stats;
  assert.equal(total, Object.values(stats).reduce((sum, value) => sum + value, 0), mon.name);
  assert.ok(mon.types.length >= 1, mon.name);
}

const ids = Array.from({ length: POSITIONS.length }, (_, i) => i + 1);
const home = new Roster(data, ids);
const away = Roster.random(data);
assert.equal(POSITIONS.length, 31);
assert.equal(new Set(away.players.map(mon => mon.id)).size, 31);
assert.ok(away.salary <= 26000);
assert.ok(Roster.rating(data[24], 'QB') > 0);
home.assign(0, data[1]);
assert.equal(home.players[0].id, 2);
assert.equal(home.players[1].id, 1);

for (const [id, role, count] of [['inside-zone','WR',3],['power-run','TE',2],['four-verticals','WR',4],['double-pass','QB',2]]) {
  const lineup = home.lineup('offense', OFFENSE.find(play => play.id === id));
  assert.equal(lineup.length, 11);
  assert.equal(lineup.filter(slot => slot.role === role).length, count);
  assert.equal(new Set(lineup.map(slot => slot.mon.id)).size, 11);
}
assert.equal(home.lineup('defense', DEFENSE.find(play => play.id === 'dime')).filter(slot => slot.role === 'CB').length, 4);

const battle = Object.create(BattleStage.prototype);
const runCast = battle.featured(home, away, OFFENSE.find(play => play.id === 'inside-zone'), DEFENSE.find(play => play.id === 'run-stuff'));
assert.equal(runCast.lead.id, home.player('RB').id);
assert.equal(runCast.stopper.id, away.player('LB').id);
const passCast = battle.featured(home, away, OFFENSE.find(play => play.id === 'te-seam'), DEFENSE.find(play => play.id === 'cover-2'));
assert.equal(passCast.lead.id, home.player('TE').id);
assert.equal(passCast.stopper.id, away.player('CB').id);

const insideZone = OFFENSE.find(play => play.id === 'inside-zone');
const dime = DEFENSE.find(play => play.id === 'dime');
const stuffedGame = new FootballGame(home, away, 300, () => 0);
const stuffed = stuffedGame.snap(insideZone, dime);
assert.equal(stuffed.outcome, 'stuff');
assert.equal(stuffedGame.seconds, 277);
assert.equal(battle.featured(home, away, insideZone, dime, stuffed).stopper.id, stuffed.defender.id);

const rolls = [.99, 0];
const pickedGame = new FootballGame(home, away, 300, () => rolls.shift() ?? .5);
const screen = OFFENSE.find(play => play.id === 'screen-pass');
const zoneBlitz = DEFENSE.find(play => play.id === 'zone-blitz');
const picked = pickedGame.snap(screen, zoneBlitz);
assert.equal(picked.outcome, 'interception');
assert.equal(battle.featured(home, away, screen, zoneBlitz, picked).stopper.id, picked.defender.id);

const game = new FootballGame(home, away, 300, () => 0);
game.spot = 98;
const touchdown = game.snap(OFFENSE.find(play => play.id === 'deep-shot'), DEFENSE.find(play => play.id === 'run-stuff'));
assert.match(touchdown.message, /TOUCHDOWN/);
assert.equal(game.score.home, 7);
assert.equal(game.possession, 'away');
assert.equal(game.spot, 25);

const turnover = new FootballGame(home, away, 300, () => .99);
turnover.down = 4;
const failedFourth = turnover.snap(OFFENSE.find(play => play.id === 'hail-mary'), DEFENSE.find(play => play.id === 'cover-4'));
assert.equal(turnover.possession, 'away');
assert.equal(turnover.down, 1);
assert.match(failedFourth.message, /TURNOVER ON DOWNS/);

const quarter = new FootballGame(home, away, 300, () => 0);
quarter.seconds = 1;
quarter.snap(OFFENSE.find(play => play.id === 'inside-zone'), DEFENSE.find(play => play.id === 'cover-3'));
assert.equal(quarter.quarter, 2);
assert.equal(quarter.seconds, 300);

const halftime = new FootballGame(home, away, 300, () => .5);
halftime.quarter = 2;
halftime.seconds = 1;
halftime.possession = 'away';
halftime.snap(OFFENSE.find(play => play.id === 'inside-zone'), DEFENSE.find(play => play.id === 'cover-3'));
assert.equal(halftime.quarter, 3);
assert.equal(halftime.possession, 'away');
assert.equal(halftime.spot, 25);

const overtime = new FootballGame(home, away, 300, () => 0);
overtime.quarter = 5;
overtime.spot = 98;
overtime.snap(OFFENSE.find(play => play.id === 'deep-shot'), DEFENSE.find(play => play.id === 'run-stuff'));
assert.equal(overtime.over, true);

const fourthDown = new FootballGame(home, away, 300, () => .5);
fourthDown.possession = 'away';
fourthDown.down = 4;
fourthDown.toGo = 10;
fourthDown.spot = 30;
assert.equal(fourthDown.chooseCpuOffense().id, 'punt');
fourthDown.spot = 70;
assert.equal(fourthDown.chooseCpuOffense().id, 'field-goal');

const scout = new FootballGame(home, away, 300, () => .5);
scout.history = Array.from({ length: 6 }, () => ({ side: 'home', id: 'inside-zone', kind: 'run' }));
assert.ok(scout.chooseCpuDefense().strengths.includes('run'));

const strongFront = new FootballGame(home, away, 300, () => .5);
const weakFront = new FootballGame(home, away, 300, () => .5);
assert.ok(strongFront.snap(OFFENSE.find(play => play.id === 'inside-zone'), DEFENSE.find(play => play.id === 'run-stuff')).yards < weakFront.snap(OFFENSE.find(play => play.id === 'inside-zone'), DEFENSE.find(play => play.id === 'cover-4')).yards);

const freshCall = new FootballGame(home, away, 300, () => .5);
const repeatedCall = new FootballGame(home, away, 300, () => .5);
repeatedCall.history = Array.from({ length: 2 }, () => ({ side: 'home', id: 'quick-slant', kind: 'short' }));
const slant = OFFENSE.find(play => play.id === 'quick-slant');
const cover = DEFENSE.find(play => play.id === 'cover-3');
assert.ok(repeatedCall.snap(slant, cover).yards < freshCall.snap(slant, cover).yards);

console.log('Game data and turn rules passed.');
