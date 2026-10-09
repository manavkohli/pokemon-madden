const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { OFFENSE, DEFENSE, POSITIONS } = require('../src/game/playbook.js');
const { BattleStage } = require('../src/ui/battle/stage.js');
const { BattleMotion } = require('../src/ui/battle/motion.js');
const { SpriteArt } = require('../src/ui/sprites.js');
const { FootballGame } = require('../src/game/football.js');

class Element {
  constructor() {
    this.nodes = new Map();
    this.classes = new Set();
    this.style = { setProperty: (name, value) => (this.style[name] = value) };
    this.children = [];
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force) => (force ? this.classes.add(name) : this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
  }

  set innerHTML(value) {
    this.html = value;
    this.children = Array.from({ length: value.split('<i>').length - 1 }, () => new Element());
  }

  get innerHTML() {
    return this.html;
  }

  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector);
  }

  addEventListener() {}
  setAttribute() {}
}

class FrameClock {
  constructor() {
    this.time = 0;
    this.next = 0;
    this.frames = new Map();
    global.requestAnimationFrame = (callback) => {
      const id = this.next++;
      this.frames.set(id, callback);
      return id;
    };
    global.cancelAnimationFrame = (id) => this.frames.delete(id);
  }

  advance(count = 1) {
    for (let index = 0; index < count; index++) {
      this.time += 50;
      const frames = [...this.frames.values()];
      this.frames.clear();
      frames.forEach((callback) => callback(this.time));
    }
  }
}

class BattleChecks {
  static context() {
    const roster = new Roster(
      data,
      Array.from({ length: POSITIONS.length }, (_, i) => i + 1),
    );
    const offense = OFFENSE.find((play) => play.id === 'inside-zone');
    const defense = DEFENSE.find((play) => play.id === 'run-stuff');
    return {
      attack: roster,
      defend: roster,
      offense,
      defense,
      result: new FootballGame(roster, roster, 300, () => 0).snap(offense, defense),
    };
  }

  static motion(stage, context) {
    const featured = stage.featured(context.result);
    const chosenDefender = data[66];
    assert.equal(
      stage.featured({ ...context.result, participants: { ...context.result.participants, defender: chosenDefender } })
        .stopper,
      chosenDefender,
    );
    const stopped = new BattleMotion(context.offense, context.result, featured);
    const gain = new BattleMotion(context.offense, { yards: 12, outcome: 'first-down' }, featured);
    assert.ok(stopped.sample(0.85).actors[0].x < stopped.sample(0.56).actors[0].x, 'tackle recoils');
    assert.ok(gain.sample(0.85).actors[0].x > gain.sample(0.56).actors[0].x, 'successful run escapes');
    const pass = OFFENSE.find((play) => play.id === 'deep-shot');
    const picked = new BattleMotion(pass, { outcome: 'interception', yards: 0 }, featured);
    const incomplete = new BattleMotion(pass, { outcome: 'incomplete', yards: 0 }, featured);
    assert.ok(picked.sample(0.85).actors[2].x < picked.sample(0.56).actors[2].x, 'interceptor returns');
    assert.equal(picked.sample(0.85).ball.x, picked.sample(0.85).actors[2].x - 3, 'interceptor owns ball');
    assert.ok(incomplete.sample(0.85).ball.y > incomplete.sample(0.56).ball.y, 'incomplete pass hits ground');
    const sack = new BattleMotion(pass, { outcome: 'sack', yards: -5 }, featured);
    assert.equal(sack.sample(0.4).ball.spin, 0, 'sack never launches a pass');
    const kick = new BattleMotion(
      OFFENSE.find((play) => play.id === 'field-goal'),
      { outcome: 'field-goal-good' },
      featured,
    );
    assert.ok(kick.sample(0.5).ball.x > 75, 'kick travels to goal');
    assert.equal(kick.scoring, true);
    assert.equal(gain.sample(0.65, true).shake, 0);
    assert.deepEqual(gain.sample(0.2, true).actors, gain.sample(0.8, true).actors, 'reduced motion holds poses');
    for (const play of OFFENSE) {
      const result = new FootballGame(context.attack, context.defend, 300, () => 0.5).snap(play, context.defense);
      const cast = stage.featured(result);
      assert.equal(cast.lead, result.participants.carrier, play.id);
      assert.equal(cast.support, result.participants.support, play.id);
      assert.equal(new Set([cast.lead.id, cast.support.id]).size, 2, play.id);
      assert.equal(new Set([cast.stopper.id, cast.help.id]).size, 2, play.id);
    }
    const sackRolls = [0.99, 0.99, 0, 0];
    const sackResult = new FootballGame(context.attack, context.defend, 300, () => sackRolls.shift()).snap(
      pass,
      context.defense,
    );
    assert.equal(sackResult.outcome, 'sack');
    const sackCast = stage.featured(sackResult);
    assert.equal(sackCast.lead.id, context.attack.player('QB').id);
    assert.match(SpriteArt.fighter({ ...data[0], name: '<img onerror="oops">' }, true), /&lt;img/);
    const missing = { matches: (selector) => selector === 'img[data-sprite]' };
    SpriteArt.handleError({ target: missing });
    assert.equal(missing.hidden, true);
    const loaded = new Element();
    loaded.matches = (selector) => selector === 'img[data-sprite]';
    assert.equal(loaded.classList.contains('sprite-loaded'), false, 'pending sprite keeps fallback');
    SpriteArt.handleLoad({ target: loaded });
    assert.equal(loaded.classList.contains('sprite-loaded'), true);
    SpriteArt.handleError({ target: loaded });
    assert.equal(loaded.hidden, true, 'failed sprite reveals fallback even after a prior load');
  }

  static async run() {
    const clock = new FrameClock();
    const root = new Element();
    const stage = new BattleStage(root);
    const context = this.context();
    this.motion(stage, context);
    const ticks = [];
    const playing = stage.play({ ...context, onProgress: (progress) => ticks.push(progress) });
    clock.advance(15);
    assert.ok(stage.leadNode.innerHTML.includes(context.attack.player('RB').name));
    const frozen = JSON.stringify(stage.leadNode.style);
    const lights = root.style['--light-sweep'];
    assert.notEqual(lights, '0deg', 'stadium lights move with playback');
    const progress = ticks.at(-1);
    stage.setPaused(true);
    clock.advance(30);
    assert.equal(JSON.stringify(stage.leadNode.style), frozen);
    assert.equal(root.style['--light-sweep'], lights, 'pause holds stadium lighting');
    assert.equal(ticks.at(-1), progress, 'pause freezes clock and drawing');
    stage.skip();
    assert.equal(root.classList.contains('hidden'), false, 'skip respects pause');
    stage.setPaused(false);
    clock.advance(80);
    assert.deepEqual(await playing, { cancelled: false });
    assert.equal(ticks.filter((value) => value === 1).length, 1);
    assert.equal(clock.frames.size, 0);
    const skipped = stage.play({ ...context, onProgress: (progress) => ticks.push(progress) });
    stage.skip();
    assert.deepEqual(await skipped, { cancelled: false });
    assert.equal(ticks.at(-1), 1, 'skip finishes play clock');
    const cancelled = stage.play(context);
    const stale = [...clock.frames.values()][0];
    const replacement = stage.play(context);
    assert.deepEqual(await cancelled, { cancelled: true });
    stale(clock.time + 50);
    assert.equal(root.classList.contains('hidden'), false, 'old frame cannot close replacement');
    stage.cancel();
    assert.deepEqual(await replacement, { cancelled: true });
    assert.equal(clock.frames.size, 0);
    const failed = stage.play({
      ...context,
      onProgress: () => {
        throw new Error('progress failed');
      },
    });
    const rejection = assert.rejects(failed, /progress failed/);
    clock.advance();
    await rejection;
    assert.equal(clock.frames.size, 0, 'failed drawing releases scheduler');
    assert.equal(root.classList.contains('hidden'), true);
    stage.motionPreference = { matches: true };
    const reduced = stage.play(context);
    clock.advance(24);
    await reduced;
    assert.equal(stage.ballNode.style.opacity, '0');
    assert.equal(stage.effectsNode.style.opacity, 0);
    assert.equal(root.style['--light-sweep'], '0deg', 'reduced motion holds stadium lighting');
    console.log('Battle motion, casting, pause, skip, cancellation, reduced motion, and error propagation passed.');
  }
}

BattleChecks.run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
