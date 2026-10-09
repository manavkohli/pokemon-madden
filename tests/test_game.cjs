const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster, FootballGame, OFFENSE, DEFENSE } = require('../game.js');

assert.equal(data.length, 251);
assert.ok(OFFENSE.length >= 25);
assert.ok(DEFENSE.length >= 18);
assert.deepEqual(data.map(mon => mon.id), Array.from({ length: 251 }, (_, i) => i + 1));
for (const mon of data) {
  const { total, ...stats } = mon.base_stats;
  assert.equal(total, Object.values(stats).reduce((sum, value) => sum + value, 0), mon.name);
  assert.ok(mon.types.length >= 1, mon.name);
}

const ids = [25, 143, 59, 94, 149, 76, 248, 65, 68, 212, 197];
const home = new Roster(data, ids);
const away = Roster.random(data);
assert.equal(new Set(away.players.map(mon => mon.id)).size, 11);
assert.ok(away.salary <= 13000);
assert.ok(Roster.rating(data[24], 'QB') > 0);
home.assign(0, data[142]);
assert.equal(home.players[0].id, 143);
assert.equal(home.players[1].id, 25);

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

console.log('Game data and turn rules passed.');
