{
  class PlayClock {
    constructor({
      onTick,
      onExpire,
      now = () => performance.now(),
      schedule = (callback, delay) => setTimeout(callback, delay),
      cancel = (timer) => clearTimeout(timer),
    }) {
      Object.assign(this, { onTick, onExpire, now, schedule, cancel });
      this.active = false;
      this.paused = false;
      this.token = 0;
    }

    start(seconds) {
      this.stop();
      this.remaining = seconds * 1000;
      this.previous = this.now();
      this.active = true;
      this.paused = false;
      this.tick(this.token);
    }

    consumeTime() {
      const now = this.now();
      this.remaining = Math.max(0, this.remaining - (now - this.previous));
      this.previous = now;
    }

    tick(token) {
      if (token !== this.token || !this.active || this.paused) return;
      this.consumeTime();
      this.onTick(Math.ceil(this.remaining / 1000));
      if (this.remaining === 0) {
        this.stop();
        this.onExpire();
        return;
      }
      this.timer = this.schedule(() => this.tick(token), Math.min(250, this.remaining));
    }

    setPaused(paused) {
      if (!this.active || this.paused === paused) return;
      this.cancel(this.timer);
      this.token += 1;
      this.paused = paused;
      if (paused) {
        this.consumeTime();
        this.onTick(Math.ceil(this.remaining / 1000));
      } else {
        this.previous = this.now();
        this.tick(this.token);
      }
    }

    stop() {
      this.cancel(this.timer);
      this.token += 1;
      this.active = false;
      this.paused = false;
    }
  }

  if (typeof module !== 'undefined') module.exports = { PlayClock };
  else Object.assign((window.Pokeballers ||= {}), { PlayClock });
}
