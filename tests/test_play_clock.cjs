const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { PlayClock } = require('../src/ui/play-clock.js');

class ClockChecks {
  constructor() {
    this.time = 0;
    this.jobs = new Map();
    this.serial = 0;
    this.ticks = [];
    this.expirations = 0;
    this.clock = new PlayClock({
      now: () => this.time,
      schedule: (callback, delay) => {
        const id = ++this.serial;
        this.jobs.set(id, { callback, due: this.time + delay });
        return id;
      },
      cancel: (id) => this.jobs.delete(id),
      onTick: (seconds) => this.ticks.push(seconds),
      onExpire: () => this.expirations++,
    });
  }

  advance(milliseconds) {
    const end = this.time + milliseconds;
    let next;
    while ((next = [...this.jobs.entries()].sort((a, b) => a[1].due - b[1].due)[0]) && next[1].due <= end) {
      this.time = next[1].due;
      this.jobs.delete(next[0]);
      next[1].callback();
    }
    this.time = end;
  }

  static pauseAndExpire() {
    const check = new ClockChecks();
    check.clock.start(40);
    assert.equal(check.ticks.at(-1), 40);
    check.advance(12375);
    check.clock.setPaused(true);
    assert.equal(check.ticks.at(-1), 28);
    check.advance(60000);
    assert.equal(check.expirations, 0);
    assert.equal(check.ticks.at(-1), 28);
    check.clock.setPaused(false);
    check.advance(27624);
    assert.equal(check.expirations, 0);
    check.advance(1);
    assert.equal(check.expirations, 1);
    assert.equal(check.ticks.at(-1), 0);
    assert.equal(check.clock.active, false);
    check.advance(60000);
    assert.equal(check.expirations, 1);
  }

  static cancelAndRestart() {
    const check = new ClockChecks();
    check.clock.start(25);
    const stale = [...check.jobs.values()][0].callback;
    check.advance(24000);
    check.clock.stop();
    stale();
    check.advance(10000);
    assert.equal(check.expirations, 0);
    check.clock.start(40);
    stale();
    check.advance(39000);
    check.clock.start(25);
    check.advance(1000);
    assert.equal(check.expirations, 0);
    assert.equal(check.ticks.at(-1), 24);
    check.advance(24000);
    assert.equal(check.expirations, 1);
  }

  static throttledTab() {
    const check = new ClockChecks();
    check.clock.start(25);
    const [id, job] = [...check.jobs.entries()][0];
    check.jobs.delete(id);
    check.time = 30000;
    job.callback();
    assert.equal(check.expirations, 1);
    assert.equal(check.ticks.at(-1), 0);
    assert.equal(check.jobs.size, 0);
  }

  static browserTimerBinding() {
    const clockModule = { exports: {} };
    const source = readFileSync(require.resolve('../src/ui/play-clock.js'), 'utf8');
    let scheduled = 0;
    runInNewContext(source, {
      module: clockModule,
      performance: { now: () => 0 },
      setTimeout(callback, delay) {
        assert.equal(this, undefined, 'native browser timers cannot be called with the PlayClock as receiver');
        assert.equal(typeof callback, 'function');
        assert.equal(delay, 250);
        return ++scheduled;
      },
      clearTimeout() {
        assert.equal(this, undefined);
      },
    });
    const clock = new clockModule.exports.PlayClock({ onTick: () => {}, onExpire: () => {} });
    clock.start(25);
    assert.equal(scheduled, 1);
    clock.stop();
  }
}

ClockChecks.pauseAndExpire();
ClockChecks.cancelAndRestart();
ClockChecks.throttledTab();
ClockChecks.browserTimerBinding();
console.log('Play clock checks passed');
