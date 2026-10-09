const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster, OFFENSE, DEFENSE, POSITIONS } = require('../game.js');
const { BattleStage } = require('../battle.js');

class Element {
  constructor() {
    this.classes = new Set();
    this.style = {};
    this.clientWidth = 800;
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name),
      contains: name => this.classes.has(name),
    };
  }

  querySelector() { return new Element(); }
  addEventListener() {}
}

let frameTime = 0;
global.requestAnimationFrame = callback => setTimeout(() => callback(frameTime += 50), 0);
global.cancelAnimationFrame = clearTimeout;

async function check() {
  const root = new Element();
  const stage = new BattleStage(root);
  stage.initialize = async () => false;
  const pokemon = new Roster(data, Array.from({ length: POSITIONS.length }, (_, i) => i + 1));
  const context = {
    attack: pokemon,
    defend: pokemon,
    offense: OFFENSE.find(play => play.id === 'inside-zone'),
    defense: DEFENSE.find(play => play.id === 'run-stuff'),
    result: { yards: -2, message: 'STUFFED!', outcome: 'stuff', seconds: 23 },
  };

  const skipped = stage.play(context);
  assert.ok(stage.leadNode.innerHTML.includes(context.attack.player('RB').name));
  assert.ok(stage.stopperNode.innerHTML.includes(context.defend.player('LB').name));
  assert.match(stage.leadNode.innerHTML, /battle-avatar/);
  stage.drawAction(.65, context.offense, context.result);
  assert.equal(stage.impactNode.textContent, 'TACKLE!');
  assert.ok(stage.impactNode.classList.contains('hit'));
  stage.skip();
  await skipped;
  assert.ok(root.classList.contains('hidden'));

  stage.drawAction(.65, OFFENSE.find(play => play.id === 'screen-pass'), { yards: 0, outcome: 'interception', turnover: true });
  assert.equal(stage.impactNode.textContent, 'PICK!');

  const cancelled = stage.play(context);
  stage.cancel();
  await cancelled;
  assert.ok(root.classList.contains('hidden'));

  const ticks = [];
  const paused = stage.play({ ...context, onProgress: progress => ticks.push(progress) });
  stage.setPaused(true);
  await new Promise(resolve => setTimeout(resolve, 8));
  assert.ok(ticks.length > 1);
  assert.ok(ticks.every(progress => progress === 0));
  stage.setPaused(false);
  await paused;
  assert.equal(ticks.at(-1), 1);
  console.log('Battle casting, outcomes, pause, skip, and cancellation passed.');
}

check().catch(error => { console.error(error); process.exitCode = 1; });
