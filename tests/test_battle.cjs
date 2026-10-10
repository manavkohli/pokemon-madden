const assert = require('node:assert/strict');
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { OFFENSE, DEFENSE, POSITIONS } = require('../src/game/playbook.js');
const { BattleStage } = require('../src/ui/battle/stage.js');
const { BattleMotion } = require('../src/ui/battle/motion.js');
const { SpriteArt } = require('../src/ui/sprites.js');
const { MoveBook } = require('../src/game/moves.js');
const { NoClashGame: FootballGame } = require('./helpers.cjs');

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

  querySelectorAll(selector) {
    const key = `all:${selector}`;
    if (!this.nodes.has(key)) this.nodes.set(key, [new Element(), new Element(), new Element()]);
    return this.nodes.get(key);
  }

  focus() {
    this.focused = true;
  }

  addEventListener() {}
  setAttribute() {}
  removeAttribute() {}
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
    const sack = new BattleMotion(pass, { outcome: 'sack', sacked: true, yards: -5 }, featured);
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
      const game = new FootballGame(context.attack, context.defend, 300, () => 0.5);
      if (play.group === 'special') game.down = 4;
      const result = game.snap(play, context.defense);
      const cast = stage.featured(result);
      assert.equal(cast.lead, result.participants.carrier, play.id);
      assert.equal(cast.support, result.participants.support, play.id);
      assert.equal(new Set([cast.lead.id, cast.support.id]).size, 2, play.id);
      assert.equal(new Set([cast.stopper.id, cast.help.id]).size, 2, play.id);
    }
    const sackRolls = [0, 0];
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

  // A clash game: every margin is zero, so the first run reaches contact and waits for both picks.
  static pendingClash() {
    const roster = new Roster(
      data,
      Array.from({ length: POSITIONS.length }, (_, i) => i + 1),
    );
    const offense = OFFENSE.find((play) => play.id === 'inside-zone');
    const defense = DEFENSE.find((play) => play.id === 'run-stuff');
    const game = new FootballGame(roster, roster, 300, () => 0.5);
    game.clashes = true;
    const result = game.snap(offense, defense);
    return { game, result, offense, defense };
  }

  static async clash() {
    const clock = new FrameClock();
    const root = new Element();
    const stage = new BattleStage(root);
    const box = root.querySelector('#battleClash');
    const shown = () => !box.classList.contains('hidden');
    const start = (clash) => {
      const setup = this.pendingClash();
      const ticks = [];
      const picks = [];
      const playing = stage.play({
        offense: setup.offense,
        defense: setup.defense,
        result: setup.result,
        clash: (choice) => {
          picks.push(choice);
          return setup.game.resolveClash(choice, 'wrap');
        },
        onProgress: (progress) => ticks.push(progress),
        ...clash,
      });
      return { ...setup, ticks, picks, playing };
    };

    // The stage continues from a clash pick on the next microtask, so a test settles before it advances frames.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    const first = start();
    assert.equal(first.result.outcome, undefined, 'the snap holds the play');
    clock.advance(30);
    assert.equal(shown(), false, 'the box stays closed before contact');
    clock.advance(15);
    const hold = stage.active.hold;
    assert.ok(hold && shown(), 'the stage holds at contact and shows the box');
    const held = first.ticks.at(-1);
    assert.ok(Math.abs(held - BattleMotion.CONTACT) < 0.02, 'the hold sits at the contact progress');
    assert.match(stage.clashButtons[0].innerHTML, /Juke/);
    assert.match(stage.clashButtons[2].innerHTML, /Cover Up/);
    assert.equal(stage.callout.textContent, 'CONTACT!');
    clock.advance(20);
    assert.equal(first.ticks.at(-1), held, 'the play clock stops during the hold');
    assert.ok(hold.remaining < 3200, 'the countdown runs on the stage clock');
    const frozen = hold.remaining;
    stage.setPaused(true);
    clock.advance(40);
    assert.equal(hold.remaining, frozen, 'pause freezes the countdown');
    stage.skip();
    stage.setPaused(false);
    clock.advance(2);
    stage.skip();
    assert.ok(stage.active.hold && shown(), 'skip does nothing during the clash');
    assert.ok(hold.remaining < frozen, 'the countdown resumes after pause');
    clock.advance(70);
    assert.deepEqual(first.picks, [first.result.clash.auto], 'the countdown picks the auto action at zero');
    assert.equal(shown(), false, 'the box closes after the pick');
    await settle();
    clock.advance(3);
    assert.match(stage.callout.textContent, /^[A-Z ]+ vs [A-Z ]+!$/, 'the contact callout names both actions');
    clock.advance(80);
    assert.deepEqual(await first.playing, { cancelled: false });
    assert.equal(first.game.pending, null);
    assert.equal(first.ticks.at(-1), 1);
    assert.equal(clock.frames.size, 0);

    const skipped = start();
    clock.advance(3);
    stage.skip();
    clock.advance(1);
    assert.ok(stage.active.hold && shown(), 'skip before contact jumps to the clash');
    assert.ok(Math.abs(skipped.ticks.at(-1) - BattleMotion.CONTACT) < 0.02);
    stage.onKey({ key: '9', preventDefault() {} });
    assert.equal(skipped.picks.length, 0, 'a key outside 1-3 does nothing');
    let prevented = false;
    stage.onKey({
      key: '2',
      preventDefault: () => (prevented = true),
    });
    assert.equal(prevented, true);
    assert.deepEqual(skipped.picks, ['truck'], 'key 2 picks the second action');
    stage.onKey({ key: '3', preventDefault() {} });
    assert.deepEqual(skipped.picks, ['truck'], 'a second pick is ignored');
    await settle();
    clock.advance(80);
    assert.deepEqual(await skipped.playing, { cancelled: false });
    assert.equal(skipped.game.pending, null);

    const clicked = start();
    clock.advance(3);
    stage.skip();
    clock.advance(1);
    stage.choose(2);
    await settle();
    clock.advance(80);
    await clicked.playing;
    assert.deepEqual(clicked.picks, ['cover'], 'a button picks its own action');

    stage.motionPreference = { matches: true };
    const reduced = start();
    clock.advance(20);
    assert.ok(stage.active.hold && shown(), 'reduced motion keeps the box and the countdown');
    stage.cancel();
    assert.deepEqual(await reduced.playing, { cancelled: true });
    assert.equal(shown(), false, 'cancel closes the box');
    const failing = start({
      clash: () => {
        throw new Error('clash failed');
      },
    });
    const rejection = assert.rejects(failing.playing, /clash failed/);
    clock.advance(60);
    stage.choose(0);
    await settle();
    clock.advance(2);
    await rejection;
    assert.equal(clock.frames.size, 0, 'a failed clash releases the scheduler');
  }

  static captions() {
    const { game } = this.pendingClash();
    const final = game.resolveClash('juke', 'wrap');
    const featured = new BattleStage(new Element()).featured(final);
    const hit = {
      side: 'home',
      offense: true,
      actor: final.participants.carrier,
      target: final.participants.defender,
      move: 'thunderbolt',
      hit: true,
      effectiveness: 2,
      notes: [],
    };
    const hitCaption = new BattleMotion(final.offense, { ...final, moves: [hit] }, featured).caption(0.6);
    assert.equal(hitCaption.title, 'JUKE vs WRAP UP!', 'the clash line leads after contact');
    assert.equal(hitCaption.detail, MoveBook.callout(2, hit.target.name), 'the subline keeps the move effectiveness');
    const missed = new BattleMotion(final.offense, { ...final, moves: [{ ...hit, hit: false }] }, featured).caption(
      0.6,
    );
    assert.equal(missed.title, 'JUKE vs WRAP UP!');
    assert.equal(missed.detail, 'Thunderbolt missed!');
    const plain = new BattleMotion(final.offense, final, featured).caption(0.6);
    assert.match(plain.detail, / vs /, 'with no move the subline names the players');
    const held = new BattleMotion(final.offense, this.pendingClash().result, featured);
    assert.equal(held.caption(0.6).title, 'CONTACT!');
  }

  static async clashInput() {
    const clock = new FrameClock();
    const doc = { activeElement: null, body: new Element(), addEventListener() {} };
    const root = new Element();
    root.ownerDocument = doc;
    const stage = new BattleStage(root);
    const outside = new Element();
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    stage.clashButtons.forEach((button) => (button.focus = () => (doc.activeElement = button)));
    stage.skipNode.focus = () => (doc.activeElement = stage.skipNode);
    const start = (extra) => {
      const setup = this.pendingClash();
      const picks = [];
      const playing = stage.play({
        offense: setup.offense,
        defense: setup.defense,
        result: setup.result,
        clash: (choice) => {
          picks.push(choice);
          return extra?.final?.(setup, choice) ?? setup.game.resolveClash(choice, 'wrap');
        },
      });
      clock.advance(45);
      assert.ok(stage.active.hold, 'the clash is open');
      return { ...setup, picks, playing };
    };
    const press = (key, flags = {}) => {
      let prevented = false;
      stage.onKey({ key, ...flags, preventDefault: () => (prevented = true) });
      return prevented;
    };

    doc.activeElement = outside;
    outside.focus = () => (doc.activeElement = outside);
    const first = start();
    assert.equal(doc.activeElement, stage.clashButtons[0], 'the box takes focus');
    for (const flags of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }])
      assert.equal(press('1', flags), false, 'a modified key is left to the browser');
    assert.equal(press('9'), false, 'a key outside 1-3 is left alone');
    stage.setPaused(true);
    assert.equal(press('1'), false, 'keys do nothing while paused');
    stage.setPaused(false);
    assert.deepEqual(first.picks, []);
    assert.equal(press('1'), true, 'a pick key is consumed');
    assert.deepEqual(first.picks, ['juke']);
    assert.equal(press('2'), false, 'a locked pick leaves later keys alone');
    assert.equal(doc.activeElement, outside, 'focus returns to the control that had it');
    await settle();
    clock.advance(80);
    await first.playing;

    doc.activeElement = outside;
    outside.focus = () => {};
    const second = start();
    stage.choose(0);
    assert.equal(doc.activeElement, stage.skipNode, 'focus falls back to Skip when the control cannot take it');
    await settle();
    clock.advance(80);
    await second.playing;

    outside.focus = () => (doc.activeElement = outside);
    doc.activeElement = outside;
    const swapped = data[66];
    const third = start({
      final: (setup, choice) => ({
        ...setup.game.resolveClash(choice, 'wrap'),
        participants: { ...setup.result.participants, carrier: swapped },
      }),
    });
    stage.choose(0);
    await settle();
    clock.advance(2);
    assert.ok(stage.leadNode.innerHTML.includes(swapped.name), 'new final participants redraw the sprites');
    stage.cancel();
    await third.playing;
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
    const drift = root.style['--drift'];
    assert.notEqual(drift, '0px', 'weather drift follows playback progress');
    const progress = ticks.at(-1);
    stage.setPaused(true);
    clock.advance(30);
    assert.equal(JSON.stringify(stage.leadNode.style), frozen);
    assert.equal(root.style['--light-sweep'], lights, 'pause holds stadium lighting');
    assert.equal(root.style['--drift'], drift, 'pause holds weather drift');
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
    assert.equal(root.style['--drift'], '0px', 'reduced motion holds weather still');
    const frames = [];
    const draw = (progress, isReduced) => frames.push([progress, isReduced]);
    const short = stage.sequence({ duration: 5000, draw });
    clock.advance(24);
    await short;
    assert.equal(frames.at(-1)[1], true, 'a sequence reads reduced motion');
    assert.equal(frames.at(-1)[0], 1, 'reduced motion shortens a sequence');
    stage.motionPreference = { matches: false };
    frames.length = 0;
    const sequence = stage.sequence({ duration: 2000, draw });
    clock.advance(5);
    stage.setPaused(true);
    const held = frames.length;
    clock.advance(10);
    assert.equal(frames.length, held, 'pause holds a sequence');
    stage.setPaused(false);
    stage.skip();
    assert.deepEqual(await sequence, { cancelled: false });
    assert.equal(frames.at(-1)[0], 1, 'skip draws the last frame of a sequence');
    const abandoned = stage.sequence({ duration: 2000, draw });
    stage.cancel();
    assert.deepEqual(await abandoned, { cancelled: true });
    assert.equal(clock.frames.size, 0, 'a cancelled sequence releases the scheduler');
    await this.clash();
    this.captions();
    await this.clashInput();
    console.log(
      'Battle motion, casting, pause, skip, cancellation, reduced motion, error propagation, and the clash hold passed.',
    );
  }
}

BattleChecks.run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
