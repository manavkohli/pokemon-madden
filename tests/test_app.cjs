const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');
const { setImmediate: nextTick } = require('node:timers/promises');
const { Roster } = require('../src/game/roster.js');
const { LeagueSim } = require('../scripts/league-balance.cjs');

class AppHarness {
  constructor(window) {
    this.window = window;
    this.document = window.document;
    this.tasks = new Map();
    this.serial = 0;
    this.errors = [];
  }

  // `storage` is the Map behind localStorage; `blocked` makes every access throw like a browser that blocks site data.
  static async create({ kickoff = true, storage = new Map(), blocked = false } = {}) {
    const { Window } = await import('happy-dom');
    const window = new Window({
      url: 'http://localhost/',
      settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
    });
    const store = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    };
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        if (blocked) throw new window.DOMException('Access is denied', 'SecurityError');
        return store;
      },
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
      if (playback.result.outcome === undefined) await playback.clash(playback.result.clash.auto);
      playback.onProgress(1);
      return { cancelled: false };
    };
    harness.app.battle.sequence = async ({ draw }) => {
      draw(0, false);
      draw(1, false);
      return { cancelled: false };
    };
    if (kickoff) harness.element('kickoffButton').click();
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

  visible(id) {
    return !this.element(id).classList.contains('hidden');
  }

  action(name) {
    const button = this.document.querySelector(`[data-action="${name}"]`);
    assert.ok(button, `${name} is on screen`);
    button.click();
  }

  // Plays the circuit game with the CPU on both sides, forces the score, and opens the report.
  async finishCircuitGame(win = true) {
    const game = this.app.game;
    new LeagueSim(1).play(game);
    game.score.home = game.score.away + (win ? 7 : -7);
    await this.app.showFinal();
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
    assert.equal(harness.document.querySelector('[data-move]').getAttribute('aria-pressed'), 'true');
    await app.requestSnap();
    assert.ok(harness.playback.result.moves.some((record) => record.side === 'home'));
    assert.equal(app.game.pp.home.size, 1);
  } finally {
    await harness.close();
  }
});

test('the draft detail panel lists learnable moves, swaps picks, and handles Magikarp and Ditto', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    const show = (name, slot) => {
      const mon = app.pokemon.find((entry) => entry.name === name);
      app.home.assign(slot, mon);
      app.selectedPokemon = mon;
      app.renderDetail();
      return mon;
    };
    const chosen = () => [...harness.document.querySelectorAll('[data-pick][aria-pressed="true"]')];
    const pikachu = show('Pikachu', 0);
    assert.equal(chosen().length, 4);
    assert.ok(harness.document.querySelectorAll('[data-pick]').length > 4);
    assert.ok(
      [...harness.document.querySelectorAll('[data-pick]:not([aria-pressed="true"])')].every((b) => b.disabled),
    );
    chosen()[0].click();
    assert.equal(app.home.moveset(pikachu).length, 3);
    harness.document.querySelector('[data-pick]:not([aria-pressed="true"])').click();
    assert.equal(app.home.moveset(pikachu).length, 4);
    show('Magikarp', 1);
    assert.equal(harness.document.querySelectorAll('[data-pick]').length, 2);
    assert.equal(chosen().length, 2);
    show('Ditto', 2);
    assert.match(harness.element('playerDetail').textContent, /No moves/);
    app.selectedPokemon = app.pokemon.find((entry) => entry.name === 'Mew');
    app.renderDetail();
    assert.ok([...harness.document.querySelectorAll('[data-pick]')].every((button) => button.disabled));
  } finally {
    await harness.close();
  }
});

test('a pending move or ability can be replaced or cancelled before the snap and costs nothing', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    const game = app.game;
    const moves = () => [...harness.document.querySelectorAll('[data-move]')];
    moves()[0].click();
    const first = game.phase.moves.home;
    assert.ok(first);
    assert.equal(moves()[0].disabled, false);
    assert.equal(moves()[0].getAttribute('aria-pressed'), 'true');
    const other = moves().find(
      (button) => button.dataset.move !== first.move || Number(button.dataset.actor) !== first.actor.id,
    );
    other.click();
    assert.equal(game.phase.moves.home.move, other.dataset.move);
    assert.equal(game.phase.moves.home.actor.id, Number(other.dataset.actor));
    moves()
      .find((button) => button.getAttribute('aria-pressed') === 'true')
      .click();
    assert.equal(game.phase.moves.home, undefined);
    assert.equal(game.pp.home.size, 0);
    assert.equal(game.rosters.home.energy(first.actor), 100);
    game.rosters.home.player('RB').types = ['Electric'];
    game.rosters.home.player('OL').types = ['Steel'];
    app.renderGame();
    const abilities = () => [...harness.document.querySelectorAll('[data-ability]')];
    abilities()
      .find((button) => button.dataset.ability === 'burst')
      .click();
    assert.equal(game.phase.abilities.home.id, 'burst');
    abilities()
      .find((button) => button.dataset.ability === 'shield')
      .click();
    assert.equal(game.phase.abilities.home.id, 'shield');
    abilities()
      .find((button) => button.dataset.ability === 'shield')
      .click();
    assert.equal(game.phase.abilities.home, undefined);
    assert.equal(game.charges.home, 2);
    assert.equal(game.rosters.home.energy(game.rosters.home.player('RB')), 100);
  } finally {
    await harness.close();
  }
});

test('a trapped substitution shows its message instead of throwing', async () => {
  const harness = await AppHarness.create();
  try {
    const app = harness.app;
    app.game.rosters.home.afflict(app.game.rosters.home.player('RB'), 'trap');
    harness.select('subRole', 'RB');
    harness.element('subButton').click();
    assert.match(harness.element('coachNotice').textContent, /trapped/);
    assert.deepEqual(harness.errors, []);
  } finally {
    await harness.close();
  }
});

class ClashHarness {
  // A third-down run always reaches contact, so the snap returns a pending clash.
  static async start() {
    const harness = await AppHarness.create();
    harness.choose('inside-zone');
    harness.app.game.down = 3;
    harness.app.game.random = () => 0.5;
    return harness;
  }
}

test('a clash pick reaches the engine with the CPU pick and the final result fills the banner', async () => {
  const harness = await ClashHarness.start();
  try {
    const app = harness.app;
    app.battle.play = async (playback) => {
      harness.playback = playback;
      harness.final = await playback.clash('truck');
      playback.onProgress(1);
      return { cancelled: false };
    };
    await app.requestSnap();
    assert.equal(harness.playback.result.clash.role, 'offense');
    assert.equal(harness.playback.result.outcome, undefined, 'the stage receives the held play');
    assert.equal(harness.final.clash.offense, 'truck');
    assert.ok(['wrap', 'hit', 'strip'].includes(harness.final.clash.defense));
    assert.equal(app.game.pending, null);
    assert.deepEqual([...app.game.clashMemory.offense], ['truck']);
    assert.ok(harness.element('resultBanner').textContent.includes(harness.final.message));
    assert.match(harness.element('playLog').textContent, /after contact/);
    harness.finishResult();
    harness.assertReady(app.game.possession);
  } finally {
    await harness.close();
  }
});

test('the quarter clock holds its pre-snap value until the clash resolves, then runs to the final seconds', async () => {
  const harness = await ClashHarness.start();
  try {
    const app = harness.app;
    const label = () => harness.element('clockLabel').textContent;
    const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const before = app.game.seconds;
    const seen = [];
    app.battle.play = async (playback) => {
      playback.onProgress(0.3);
      seen.push(label());
      playback.onProgress(0.56);
      seen.push(label());
      const final = await playback.clash('truck');
      playback.onProgress(0.56);
      seen.push(label());
      playback.onProgress(0.78);
      seen.push(label());
      playback.onProgress(1);
      seen.push(label());
      harness.final = final;
      return { cancelled: false };
    };
    await app.requestSnap();
    const half = Math.max(0, before - Math.round(harness.final.seconds * 0.5));
    assert.deepEqual(seen, [
      clock(before),
      clock(before),
      clock(before),
      clock(half),
      clock(Math.max(0, before - harness.final.seconds)),
    ]);
  } finally {
    await harness.close();
  }
});

test('an animation error during a clash resolves it and restores the controls', async () => {
  const harness = await ClashHarness.start();
  try {
    const app = harness.app;
    app.battle.play = async () => {
      throw new Error('drawing failed');
    };
    await app.requestSnap();
    assert.equal(app.game.pending, null);
    assert.equal(app.locked, false);
    assert.equal(harness.element('coachControls').disabled, false);
    assert.match(harness.element('callHint').textContent, /drawing failed/);
  } finally {
    await harness.close();
  }
});

test('a Gym Challenge circuit plays a game, saves, makes transfers, and resumes after a reload', async () => {
  const storage = new Map();
  const harness = await AppHarness.create({ kickoff: false, storage });
  try {
    const app = harness.app;
    harness.element('modeLeague').click();
    assert.equal(harness.document.body.dataset.mode, 'draft');
    assert.match(harness.element('kickoffButton').textContent, /Start circuit/);
    assert.equal(harness.visible('circuitTicket'), true);
    harness.element('kickoffButton').click();
    assert.equal(harness.visible('leagueScreen'), true);
    assert.equal(JSON.parse(storage.get('pokeballers.league.v1')).stage, 0);
    harness.action('challenge');
    assert.equal(harness.visible('gameScreen'), true);
    assert.equal(harness.element('rivalName').textContent, 'Brock');
    assert.equal(app.game.cpuStyle, 'run');
    await harness.finishCircuitGame();
    assert.equal(harness.visible('reportScreen'), true);
    assert.equal(harness.element('reportTitle').textContent, 'Victory!');
    assert.equal(JSON.parse(storage.get('pokeballers.league.v1')).stage, 1);
    harness.action('continue');
    assert.match(harness.element('leagueKicker').textContent, /GAME 2 OF 13/);
    harness.action('window');
    assert.equal(harness.document.body.dataset.mode, 'window');
    assert.match(harness.element('kickoffButton').textContent, /Back to map/);
    const cheapest = [...app.pokemon]
      .filter((mon) => !app.home.players.includes(mon))
      .sort((a, b) => Roster.salary(a) - Roster.salary(b));
    for (const [index, mon] of cheapest.slice(0, 4).entries()) {
      app.selectedSlot = index + 10;
      app.selectedPokemon = mon;
      app.renderDetail();
      harness.element('assignButton').click();
    }
    assert.equal(app.league.transfersLeft, 0);
    assert.match(harness.element('draftMessage').textContent, /No transfers left/);
    assert.equal(harness.element('draftMessage').classList.contains('error'), true);
    harness.element('kickoffButton').click();
    assert.equal(harness.visible('leagueScreen'), true);
    const saved = JSON.parse(storage.get('pokeballers.league.v1'));
    assert.equal(saved.transfersLeft, 0);
    assert.deepEqual(saved.badges, ['Brock']);
    const reloaded = await AppHarness.create({ kickoff: false, storage });
    try {
      assert.equal(reloaded.visible('leagueScreen'), true);
      assert.match(reloaded.element('leagueKicker').textContent, /GAME 2 OF 13/);
      const ids = (league) => JSON.stringify(league.roster.players.map((mon) => mon.id));
      assert.equal(ids(reloaded.app.league), ids(app.league));
      assert.deepEqual(reloaded.errors, []);
    } finally {
      await reloaded.close();
    }
    harness.action('newCircuit');
    assert.equal(harness.element('confirmOverlay').open, true);
    harness.element('confirmDelete').click();
    assert.equal(storage.has('pokeballers.league.v1'), false);
    assert.equal(harness.document.body.dataset.mode, 'draft');
    assert.deepEqual(harness.errors, []);
  } finally {
    await harness.close();
  }
});

test('a lost circuit game offers a rematch and a Pikachu stone evolution replays the scene', async () => {
  const harness = await AppHarness.create({ kickoff: false });
  try {
    const app = harness.app;
    harness.element('modeLeague').click();
    harness.element('kickoffButton').click();
    const raichu = app.league.roster.players.indexOf(app.pokemon[25]);
    if (raichu >= 0) app.league.roster.assign(raichu, app.pokemon[18]);
    app.league.stones['thunder-stone'] = 1;
    app.league.roster.assign(0, app.pokemon[24]);
    app.league.levels.set(25, 20);
    app.league.games.set(25, 0);
    harness.action('challenge');
    await harness.finishCircuitGame(false);
    assert.equal(harness.element('reportTitle').textContent, 'Defeat');
    assert.equal(app.league.stage, 0);
    assert.ok(harness.document.querySelector('[data-action="challenge"]'));
    harness.document.querySelector('[data-action="stone"]').click();
    await nextTick();
    assert.equal(app.league.roster.players[0].name, 'Raichu');
    assert.equal(app.league.stones['thunder-stone'], 0);
    assert.match(harness.element('reportBody').textContent, /Pikachu evolved into Raichu/);
    assert.deepEqual(harness.errors, []);
  } finally {
    await harness.close();
  }
});

test('blocked localStorage starts and plays a circuit with no error and shows one notice', async () => {
  const harness = await AppHarness.create({ kickoff: false, blocked: true });
  try {
    harness.element('modeLeague').click();
    assert.equal(harness.visible('draftScreen'), true);
    harness.element('kickoffButton').click();
    assert.equal(harness.visible('leagueScreen'), true);
    assert.equal(harness.visible('saveNotice'), true);
    harness.action('challenge');
    await harness.finishCircuitGame();
    assert.equal(harness.visible('reportScreen'), true);
    harness.action('continue');
    assert.match(harness.element('leagueKicker').textContent, /GAME 2 OF 13/);
    harness.action('challenge');
    assert.equal(harness.element('rivalName').textContent, 'Misty');
    assert.deepEqual(harness.errors, []);
  } finally {
    await harness.close();
  }
});

test('exhibition still plays from a fresh page and the mode switch returns to it', async () => {
  const harness = await AppHarness.create({ kickoff: false });
  try {
    harness.element('modeLeague').click();
    harness.element('modeExhibition').click();
    assert.equal(harness.document.body.dataset.mode, 'exhibition');
    assert.match(harness.element('kickoffButton').textContent, /Kick off/);
    harness.element('kickoffButton').click();
    assert.equal(harness.visible('gameScreen'), true);
    assert.equal(harness.element('rivalName').textContent, 'The Cerulean Ace');
    harness.choose('inside-zone');
    await harness.app.requestSnap();
    assert.ok(harness.playback.result.participants.carrier);
    assert.deepEqual(harness.errors, []);
  } finally {
    await harness.close();
  }
});

const circuitHarness = async (options = {}) => {
  const harness = await AppHarness.create({ kickoff: false, ...options });
  harness.element('modeLeague').click();
  harness.element('kickoffButton').click();
  return harness;
};

test('the transfer window has no generate control and the drafts keep theirs', async () => {
  const harness = await AppHarness.create({ kickoff: false });
  try {
    assert.equal(harness.visible('generateHome'), true);
    assert.equal(harness.visible('randomizeButton'), true);
    harness.element('modeLeague').click();
    assert.equal(harness.visible('generateHome'), true);
    assert.equal(harness.visible('randomizeButton'), false);
    harness.element('kickoffButton').click();
    harness.action('window');
    assert.equal(harness.visible('generateHome'), false);
    assert.equal(harness.visible('randomizeButton'), false);
  } finally {
    await harness.close();
  }
});

test('a generated exhibition team survives a trip through the circuit draft', async () => {
  const harness = await AppHarness.create({ kickoff: false });
  try {
    const app = harness.app;
    harness.element('generateHome').click();
    const generated = app.home;
    assert.equal(app.homes.exhibition, generated);
    harness.element('modeLeague').click();
    harness.element('generateHome').click();
    const circuit = app.home;
    assert.notEqual(circuit, generated);
    harness.element('modeExhibition').click();
    assert.equal(app.home, generated);
    harness.element('modeLeague').click();
    assert.equal(app.home, circuit);
  } finally {
    await harness.close();
  }
});

test('conceding a circuit game records a loss, saves, and opens the report', async () => {
  const storage = new Map();
  const harness = await circuitHarness({ storage });
  try {
    const app = harness.app;
    harness.action('challenge');
    harness.choose('inside-zone');
    await app.requestSnap();
    harness.element('editTeamButton').click();
    assert.equal(harness.visible('reportScreen'), true);
    assert.equal(harness.element('reportTitle').textContent, 'Defeat');
    assert.equal(app.league.stage, 0);
    assert.equal(app.league.transfersLeft, 3);
    const saved = JSON.parse(storage.get('pokeballers.league.v1'));
    assert.ok(saved.players.every((player) => player.games === 1));
    assert.deepEqual(harness.errors, []);
  } finally {
    await harness.close();
  }
});

test('every transfer-window edit saves at once: a slot move and a moveset change', async () => {
  const storage = new Map();
  const harness = await circuitHarness({ storage });
  try {
    const app = harness.app;
    harness.action('window');
    const mover = app.home.players[5];
    app.selectedSlot = 0;
    app.selectedPokemon = mover;
    app.renderDetail();
    harness.element('assignButton').click();
    const saved = () => JSON.parse(storage.get('pokeballers.league.v1'));
    assert.equal(saved().players[0].id, mover.id);
    const learner = app.home.players[0];
    app.selectedPokemon = learner;
    app.renderDetail();
    const pick = harness.document.querySelector('[data-pick]:not([disabled])');
    pick.click();
    assert.equal(JSON.stringify(saved().players[0].moves), JSON.stringify(app.home.moveset(learner)));
    const reloaded = await AppHarness.create({ kickoff: false, storage });
    try {
      assert.equal(reloaded.app.league.roster.players[0].id, mover.id);
      assert.equal(
        JSON.stringify(reloaded.app.league.roster.moveset(learner)),
        JSON.stringify(app.home.moveset(learner)),
      );
    } finally {
      await reloaded.close();
    }
  } finally {
    await harness.close();
  }
});

test('a report row follows a chain evolution and the team lists every evolution path', async () => {
  const harness = await circuitHarness();
  try {
    const app = harness.app;
    const league = app.league;
    const named = (name) => app.pokemon.find((mon) => mon.name === name);
    for (const [index, name] of ['Charmander', 'Eevee', 'Slowpoke'].entries()) league.roster.assign(index, named(name));
    for (const name of ['Charmeleon', 'Charizard']) {
      const at = league.roster.players.indexOf(named(name));
      if (at >= 0) league.roster.assign(at, app.pokemon[18]);
    }
    league.levels.set(named('Charmander').id, 5);
    const report = league.record({
      over: true,
      score: { home: 7, away: 0 },
      stats: { home: { [named('Charmander').id]: { yards: 900 } }, away: {} },
    });
    const chain = report.events.filter((event) => event.from.name.startsWith('Char')).map((event) => event.into.name);
    assert.equal(chain.join(), 'Charmeleon,Charizard');
    app.leagueView.report = report;
    app.leagueView.renderReport(league);
    assert.match(harness.element('reportBody').textContent, /Charmander → Charizard/);
    const eevee = app.leagueView.evolveNote(league, named('Eevee'));
    for (const path of [
      'Water Stone → Vaporeon',
      'Thunder Stone → Jolteon',
      'Fire Stone → Flareon',
      '5 games → Espeon',
      '5 games → Umbreon',
    ])
      assert.ok(eevee.includes(path), path);
    assert.equal(app.leagueView.evolveNote(league, named('Slowpoke')), 'Lv 37 → Slowbro; game MVP → Slowking');
  } finally {
    await harness.close();
  }
});
