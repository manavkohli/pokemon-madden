const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

class AppHarness {
  constructor(window) {
    this.window = window;
    this.document = window.document;
    this.tasks = new Map();
    this.serial = 0;
    this.errors = [];
  }

  static async create() {
    const { Window } = await import('happy-dom');
    const window = new Window({
      url: 'http://localhost/',
      settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
    });
    const harness = new AppHarness(window);
    const html = readFileSync(require.resolve('../index.html'), 'utf8');
    window.document.write(html);
    const context = {
      window,
      document: window.document,
      console: { error: (error) => harness.errors.push(error) },
      matchMedia: () => ({ matches: false }),
      performance: { now: () => 0 },
      Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
      setTimeout: (callback, delay) => {
        const id = ++harness.serial;
        harness.tasks.set(id, { callback, delay });
        return id;
      },
      clearTimeout: (id) => harness.tasks.delete(id),
      requestAnimationFrame: () => ++harness.serial,
      cancelAnimationFrame: () => {},
    };
    const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^\"]*)?"><\/script>/g)].map((match) => match[1]);
    const { createContext } = require('node:vm');
    createContext(context);
    for (const script of scripts) {
      const source = readFileSync(path.join(path.dirname(require.resolve('../index.html')), script), 'utf8');
      const instrumented = source.replace(
        'new GameApp(window.POKEMON_DATA);',
        'window.app = new GameApp(window.POKEMON_DATA);',
      );
      runInNewContext(instrumented, context, { filename: script });
    }
    harness.app = window.app;
    harness.app.battle.play = async (playback) => {
      harness.playback = playback;
      playback.onProgress(1);
      return { cancelled: false };
    };
    harness.element('kickoffButton').click();
    return harness;
  }

  element(id) {
    return this.document.getElementById(id);
  }

  choose(id) {
    const card = this.document.querySelector(`[data-play="${id}"]`);
    assert.ok(card, `${id} is visible`);
    assert.equal(card.disabled, false, `${id} is available`);
    card.click();
  }

  select(id, value) {
    this.element(id).value = value;
    this.element(id).dispatchEvent(new this.window.Event('change', { bubbles: true }));
  }

  finishResult() {
    const result = [...this.tasks.entries()].find(([, job]) => job.delay === 900);
    assert.ok(result, 'a result unlock is scheduled');
    this.tasks.delete(result[0]);
    result[1].callback();
  }

  assertReady(side) {
    const app = this.app;
    assert.equal(app.game.possession, side);
    assert.equal(app.locked, false);
    assert.equal(this.element('snapButton').disabled, false);
    assert.equal(this.element('coachControls').disabled, false);
    assert.equal(app.callClock.active, true);
    assert.ok(app.game.phase);
    assert.ok(this.document.querySelectorAll('[data-play]:not([disabled])').length > 10);
    assert.equal(this.errors.length, 0);
  }

  async close() {
    await this.window.happyDOM.close();
  }
}

for (const decision of ['keep', 'handoff']) {
  test(`Read Option ${decision} → turnover → defensive selection → rival touchdown restores offensive calls`, async () => {
    const harness = await AppHarness.create();
    try {
      const app = harness.app;
      harness.choose('read-option');
      harness.select('readSelect', decision);
      app.game.random = () => 0;
      app.game.down = 4;
      app.game.chooseCpuOffense = () => harness.window.Pokeballers.OFFENSE.find((play) => play.id === 'four-verticals');
      await app.requestSnap();
      assert.equal(app.game.possession, 'away');
      harness.finishResult();
      harness.assertReady('away');
      harness.choose('blitz');
      assert.equal(app.callOptions.read, 'keep', 'defensive selection cannot write an offensive option decision');
      app.game.spot = 99;
      const rolls = [0.99, 0.99, 0.99, 0.99, 0, 0.5, 0.5];
      app.game.random = () => rolls.shift() ?? 0.5;
      await app.requestSnap();
      assert.equal(app.game.score.away, 7);
      assert.equal(app.game.possession, 'home');
      harness.finishResult();
      harness.assertReady('home');
      assert.equal(harness.element('callKicker').textContent, 'YOUR OFFENSE');
      assert.equal(harness.element('snapButton').textContent, 'SNAP ▶');
      harness.choose('inside-zone');
      assert.equal(app.game.phase.offense.id, 'inside-zone');
      await app.requestSnap();
      assert.ok(harness.playback.result.participants.carrier);
    } finally {
      await harness.close();
    }
  });
}

test('a player touchdown switches to defense and the next call remains selectable', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    harness.choose('quick-slant');
    app.game.spot = 99;
    const rolls = [0.99, 0.99, 0.99, 0.99, 0, 0.5, 0.5];
    app.game.random = () => rolls.shift() ?? 0.5;
    await app.requestSnap();
    assert.equal(app.game.score.home, 7);
    harness.finishResult();
    harness.assertReady('away');
    harness.choose('cover-4');
    assert.equal(app.game.phase.defense.id, 'cover-4');
  } finally {
    await harness.close();
  }
});

test('scout and filter controls preserve the committed CPU call and enforce one audible', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    const defense = app.game.phase.defense;
    harness.choose('inside-zone');
    harness.element('scoutButton').click();
    harness.choose('quick-slant');
    assert.equal(app.game.phase.audibled, true);
    harness.select('playbookSelect', 'run');
    assert.equal(app.game.phase.defense, defense);
    assert.equal(app.game.phase.offense.id, 'quick-slant');
    assert.equal(harness.document.querySelector('[data-play="inside-zone"]').disabled, true);
    harness.select('playbookSelect', 'pass');
    assert.equal(harness.document.querySelector('[data-play="quick-slant"]').disabled, false);
    assert.equal(harness.document.querySelector('[data-play="screen-pass"]').disabled, true);
    await app.requestSnap();
    assert.equal(harness.playback.offense.id, 'quick-slant');
  } finally {
    await harness.close();
  }
});

test('clock, target, option, substitution and ability controls execute their engine actions', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    const team = app.game.rosters.home;
    team.player('RB').types = ['Electric'];
    harness.choose('rpo-slant');
    harness.select('readSelect', 'run');
    harness.select('laneSelect', 'left');
    harness.select('tempoSelect', 'hurry');
    app.game.clockRunning = true;
    app.renderGame();
    harness.element('timeoutButton').click();
    assert.equal(app.game.timeouts.home, 2);
    assert.equal(app.game.clockRunning, false);
    harness.document.querySelector('[data-ability="burst"]').click();
    assert.equal(app.game.phase.abilities.home.id, 'burst');
    assert.equal(app.game.charges.home, 2);
    const tired = team.player('RB');
    harness.select('subRole', 'RB');
    harness.element('subButton').click();
    assert.equal(team.player('RB', 1).id, tired.id);
    assert.equal(team.energy(tired), 100);
    harness.choose('quick-slant');
    harness.select('targetSelect', 'WR:1');
    assert.deepEqual(Array.from(app.callOptions.target), ['WR', 1]);
    app.game.random = () => 0.5;
    await app.requestSnap();
    assert.equal(harness.playback.offense.carrier[1], 1);
    assert.equal(harness.playback.result.runoff, 0);
  } finally {
    await harness.close();
  }
});

test('special teams filter cannot strand the playbook after fourth-down possession changes', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    app.game.down = 4;
    app.renderGame();
    harness.select('playbookSelect', 'special');
    harness.choose('punt');
    await app.requestSnap();
    harness.finishResult();
    harness.assertReady('away');
    app.game.down = 4;
    app.game.phase.offense = harness.window.Pokeballers.OFFENSE.find((play) => play.id === 'punt');
    await app.requestSnap();
    harness.finishResult();
    harness.assertReady('home');
    assert.equal(harness.element('playbookSelect').value, 'all');
    harness.choose('inside-zone');
  } finally {
    await harness.close();
  }
});

test('rematching starts with clean stamina, charges, selections and timers', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    const ids = app.home.players.map((mon) => mon.id);
    app.game.rosters.home.spend(app.game.rosters.home.player('QB'), 80);
    app.game.charges.home = 0;
    app.game.timeouts.home = 0;
    harness.choose('quick-slant');
    await app.requestSnap();
    const stale = [...harness.tasks.values()].find((job) => job.delay === 900).callback;
    app.start();
    const replacement = app.game;
    stale();
    assert.equal(app.game, replacement);
    assert.equal(app.game.charges.home, 2);
    assert.equal(app.game.timeouts.home, 3);
    assert.equal(app.game.rosters.home.energy(app.game.rosters.home.player('QB')), 100);
    assert.deepEqual(
      Array.from(app.game.rosters.home.players, (mon) => mon.id),
      Array.from(ids),
    );
    harness.assertReady('home');
  } finally {
    await harness.close();
  }
});

test('a scoring result held by pause opens the next call exactly once on resume', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    harness.choose('quick-slant');
    app.game.spot = 99;
    const rolls = [0.99, 0.99, 0.99, 0.99, 0, 0.5, 0.5];
    app.game.random = () => rolls.shift() ?? 0.5;
    await app.requestSnap();
    app.pause();
    harness.finishResult();
    assert.equal(app.locked, true);
    assert.ok(app.pendingSnap);
    assert.equal(app.game.phase, null);
    app.resume();
    harness.assertReady('away');
    const phase = app.game.phase;
    app.resume();
    assert.equal(app.game.phase, phase);
  } finally {
    await harness.close();
  }
});

test('a rejected old animation cannot cancel or mutate a rematch', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    let reject;
    app.battle.play = () =>
      new Promise((_, fail) => {
        reject = fail;
      });
    const old = app.requestSnap();
    app.openDraft();
    app.start();
    const replacement = app.game;
    const phase = replacement.phase;
    const deadline = app.callClock.token;
    reject(new Error('old animation failed'));
    await old;
    assert.equal(app.game, replacement);
    assert.equal(app.game.phase, phase);
    assert.equal(app.locked, false);
    assert.equal(app.callClock.token, deadline);
    assert.equal(app.callClock.active, true);
    assert.equal(harness.element('callHint').textContent.includes('failed'), false);
    assert.equal(harness.errors.length, 1, 'the stale failure remains logged');
  } finally {
    await harness.close();
  }
});

test('automatic rotation updates the field and the next carrier before snapping', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    const roster = app.game.rosters.home;
    const backup = roster.player('RB', 1);
    roster.spend(roster.player('RB'), 100);
    harness.element('autoRotate').checked = true;
    harness.element('autoRotate').dispatchEvent(new harness.window.Event('change'));
    assert.equal(roster.player('RB').id, backup.id);
    assert.ok(harness.element('fieldPlayers').innerHTML.includes(`${backup.name} · RB1`));
    assert.ok(harness.element('unitStatus').textContent.includes(backup.name));
  } finally {
    await harness.close();
  }
});

for (const quarter of [1, 2, 3]) {
  test(`runoff ending Q${quarter} opens legal calls for the next period`, async () => {
    const harness = await AppHarness.create();
    try {
      const app = harness.app;
      harness.choose('kneel');
      app.game.quarter = quarter;
      app.game.seconds = 2;
      app.game.clockRunning = true;
      await app.requestSnap();
      assert.equal(harness.playback.result.outcome, 'clock-expired');
      harness.finishResult();
      harness.assertReady(quarter === 2 ? 'away' : 'home');
      assert.equal(app.game.quarter, quarter + 1);
      assert.equal(app.game.playClockSeconds, 25);
    } finally {
      await harness.close();
    }
  });
}

test('an animation error after a rival touchdown retains the result and restores offensive controls', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    harness.choose('read-option');
    app.game.down = 4;
    app.game.random = () => 0;
    app.game.chooseCpuOffense = () => harness.window.Pokeballers.OFFENSE.find((play) => play.id === 'four-verticals');
    await app.requestSnap();
    harness.finishResult();
    harness.choose('blitz');
    app.game.spot = 99;
    const rolls = [0.99, 0.99, 0.99, 0.99, 0, 0.5, 0.5];
    app.game.random = () => rolls.shift() ?? 0.5;
    app.battle.play = async () => {
      throw new Error('drawing failed');
    };
    await app.requestSnap();
    assert.equal(app.game.score.away, 7);
    assert.equal(app.game.possession, 'home');
    assert.equal(app.locked, false);
    assert.equal(app.callClock.active, true);
    assert.equal(harness.element('coachControls').disabled, false);
    assert.match(harness.element('callHint').textContent, /drawing failed/);
    assert.match(harness.element('playLog').textContent, /TOUCHDOWN/);
    harness.choose('inside-zone');
    assert.equal(app.game.phase.offense.id, 'inside-zone');
  } finally {
    await harness.close();
  }
});

test('a MOVES button records a strike that the snap spends and reports', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    harness.document.querySelector('[data-move]').click();
    assert.ok(app.game.phase.moves.home);
    assert.equal(harness.document.querySelector('[data-move]').disabled, true);
    await app.requestSnap();
    assert.ok(harness.playback.result.moves.some((record) => record.side === 'home'));
    assert.equal(app.game.pp.home.size, 1);
  } finally {
    await harness.close();
  }
});
