{
  const { PASS_KINDS } = typeof module !== 'undefined' ? require('../../game/playbook.js') : window.Pokeballers;
  const { MoveBook } = typeof module !== 'undefined' ? require('../../game/moves.js') : window.Pokeballers;

  // All movement uses this play clock so pause, skip, and reduced motion share one timeline.
  class BattleMotion {
    static DURATION = 3400;
    static REDUCED_DURATION = 1100;
    static CONTACT = 0.56;
    static CUE_START = 0.22;
    static CUE_END = 0.5;
    // A shield holds through contact and a one-hit flash lands on it.
    static CUE_WINDOWS = { protect: [0.22, 0.79], ohko: [0.5, 0.68] };
    static SHAPES = {
      heal: { kind: 'sparkle', at: 'user', label: '✦ ✦ ✦', rise: -12 },
      protect: { kind: 'bubble', at: 'user' },
      ohko: { kind: 'flash', at: 'target' },
      switch: { kind: 'aura', at: 'target', label: 'OUT' },
    };
    static FIELD_LAYERS = {
      'rain-dance': 'rain',
      'sunny-day': 'sun',
      sandstorm: 'sand',
      haze: 'haze',
      spikes: 'spikes',
    };

    constructor(offense, result, featured) {
      this.offense = offense;
      this.result = result;
      this.featured = featured;
      this.kicking = ['kick', 'punt'].includes(offense.kind);
      this.sacked = result.outcome === 'sack' || (result.outcome === 'safety' && offense.kind !== 'run');
      this.passing = PASS_KINDS.includes(offense.kind) && !this.sacked;
      this.stopped = ['stuff', 'stop', 'sack', 'safety'].includes(result.outcome);
      this.missed = result.outcome === 'incomplete' || (result.outcome === 'turnover-downs' && result.yards === 0);
      this.picked = result.outcome === 'interception';
      this.fumbled = result.outcome === 'fumble';
      this.scoring = ['touchdown', 'field-goal-good'].includes(result.outcome);
      this.move = result.moves?.[0] ?? null;
    }

    get moveType() {
      return this.move ? MoveBook.get(this.move.move).type : '';
    }

    static interval(time, start, end) {
      return Math.max(0, Math.min(1, (time - start) / (end - start)));
    }

    static ease(value) {
      return value * value * (3 - 2 * value);
    }

    static mix(start, end, amount) {
      return start + (end - start) * amount;
    }

    get impact() {
      const labels = {
        stuff: 'STUFFED!',
        stop: 'TACKLE!',
        sack: 'SACK!',
        safety: 'SAFETY!',
        incomplete: 'INCOMPLETE',
        interception: 'PICK!',
        fumble: 'FUMBLE!',
        touchdown: 'TOUCHDOWN!',
        'first-down': 'FIRST DOWN!',
        gain: `+${this.result.yards} YDS`,
        'turnover-downs': 'ON DOWNS',
        punt: 'PUNT!',
        'field-goal-good': 'IT’S GOOD!',
        'field-goal-miss': 'NO GOOD',
        spike: 'CLOCK STOPPED',
        kneel: 'TAKE A KNEE',
        'clock-expired': 'TIME EXPIRES',
      };
      return labels[this.result.outcome];
    }

    moveCaption(progress) {
      if (!this.move || progress < BattleMotion.CUE_START) return null;
      const { actor, target, hit, effectiveness } = this.move;
      const name = MoveBook.get(this.move.move).display_name;
      const detail = `${this.featured.lead.name} vs ${this.featured.stopper.name}`;
      if (progress < BattleMotion.CONTACT) return { round: 'MOVE', title: `${actor.name} used ${name}!`, detail };
      const note = MoveBook.callout(effectiveness, target.name) || this.move.notes[0] || this.impact;
      const title = hit ? note : `${name} missed!`;
      return { round: 'MOVE', title, detail };
    }

    // The move's user and target keep their featured slots; an unfeatured one falls back to its side's lead slot.
    cue(progress, actors) {
      if (!this.move) return null;
      const family = MoveBook.family(this.move.move);
      const [start, end] = BattleMotion.CUE_WINDOWS[family] ?? [BattleMotion.CUE_START, BattleMotion.CUE_END];
      if (progress < start || progress >= end) return null;
      const base = {
        type: MoveBook.get(this.move.move).type,
        t: BattleMotion.ease(BattleMotion.interval(progress, start, end)),
        missed: !this.move.hit,
      };
      const spots = this.spots(actors);
      if (family === 'strike') return this.strikeCue(base, spots);
      return this.move.hit ? { ...base, ...this.effectCue(family, spots) } : null;
    }

    spots(actors) {
      const { actor, target, offense } = this.move;
      const slots = Object.values(this.featured).map((mon) => mon.id);
      const find = (mon, fallback) => (slots.includes(mon.id) ? slots.indexOf(mon.id) : fallback);
      const at = (mover) => ({ x: mover.x, y: mover.y - 8 });
      return {
        user: at(actors[find(actor, offense ? 0 : 2)]),
        target: at(actors[find(target, offense ? 2 : 0)]),
        centre: { x: 50, y: 50 },
      };
    }

    strikeCue(base, spots) {
      const special = MoveBook.get(this.move.move).damage_class === 'special';
      const veer = { x: spots.target.x + 12, y: -20 };
      return { ...base, kind: special ? 'beam' : 'lunge', from: spots.user, to: this.move.hit ? spots.target : veer };
    }

    // Ailments settle on the opponent, stat changes rise over the user or fall over the opponent, heals rise from the user.
    shape(family) {
      const name = this.move.move;
      if (family === 'ailment') {
        const ailment = MoveBook.effects(name)[0].ailment;
        return { kind: 'aura', at: 'target', label: MoveBook.BADGES[ailment] ?? ailment.toUpperCase() };
      }
      if (family === 'stat') {
        return MoveBook.statEffect(name).self
          ? { kind: 'arrows', at: 'user', label: '▲▲▲', rise: -12 }
          : { kind: 'arrows', at: 'target', label: '▼▼▼', rise: 12 };
      }
      if (family === 'field')
        return { kind: 'field', at: 'centre', layer: BattleMotion.FIELD_LAYERS[name] ?? 'screen' };
      return BattleMotion.SHAPES[family];
    }

    effectCue(family, spots) {
      const shape = this.shape(family);
      const spot = spots[shape.at];
      return {
        kind: shape.kind,
        label: shape.label,
        layer: shape.layer,
        from: spot,
        to: { x: spot.x, y: spot.y + (shape.rise ?? 0) },
      };
    }

    caption(progress) {
      if (progress >= 0.79)
        return {
          round: 'RESULT',
          title: this.result.message,
          detail: `${this.offense.name} · ${this.featured.lead.name}`,
        };
      const move = this.moveCaption(progress);
      if (move) return move;
      if (progress >= BattleMotion.CONTACT)
        return {
          round: 'THE PLAY',
          title: this.impact,
          detail: `${this.featured.lead.name} vs ${this.featured.stopper.name}`,
        };
      const title = this.kicking ? 'UP AND AWAY!' : this.passing ? 'BALL IN THE AIR!' : 'HIT THE GAP!';
      return {
        round: progress < 0.18 ? 'SNAP!' : 'LIVE',
        title: progress < 0.18 ? this.offense.name : title,
        detail: `${this.featured.lead.name} faces ${this.featured.stopper.name}`,
      };
    }

    sample(progress, reduced = false) {
      const action = BattleMotion.ease(BattleMotion.interval(progress, 0.18, 0.56));
      // Hold the contact pose briefly before recoil or the breakaway.
      const follow = BattleMotion.ease(BattleMotion.interval(progress, 0.63, 0.85));
      const enter = BattleMotion.ease(BattleMotion.interval(progress, 0, 0.14));
      const impact = BattleMotion.interval(progress, 0.56, 0.74);
      const lead = this.lead(action, follow);
      const stopper = this.stopper(action, follow);
      const actors = [lead, this.support(action), stopper, { x: 87 - action * 8, y: 48, angle: 0 }];
      const poseTime = progress >= 0.56 && progress < 0.63 ? 0.56 : progress;
      actors.forEach((actor, index) => {
        const mon = Object.values(this.featured)[index];
        const breath = Math.sin(poseTime * 14 + mon.id);
        const stride = Math.sin(poseTime * 52 + index);
        actor.opacity = enter;
        actor.bob = reduced ? 0 : breath * (1 + mon.base_stats.speed / 65) + stride * action * (1 - follow) * 2;
        actor.scaleX = reduced ? 1 : 1 + breath * 0.025;
        actor.scaleY = reduced ? 1 : 1 - breath * 0.035;
        if (reduced)
          Object.assign(actor, { x: [28, 12, 72, 88][index], y: [72, 47, 63, 44][index], angle: 0, opacity: 1 });
      });
      if (['spike', 'kneel', 'clock-expired'].includes(this.result.outcome)) {
        actors.forEach((actor, index) =>
          Object.assign(actor, {
            x: [28, 12, 72, 88][index],
            angle: !reduced && index === 0 && this.result.outcome === 'kneel' ? -15 * follow : 0,
          }),
        );
      }
      const cue = reduced ? null : this.cue(progress, actors);
      const shake = !reduced && progress >= 0.56 && progress < 0.63 ? Math.sin(impact * 58) * (1 - impact) * 5 : 0;
      return {
        actors,
        ball: this.ball(progress, action, follow, lead, stopper),
        shake,
        cue,
        impact,
        progress,
        caption: this.caption(progress),
      };
    }

    lead(action, follow) {
      if (this.kicking) return { x: 28 + action * 3, y: 72, angle: -12 * Math.sin(action * Math.PI) };
      const recoil = this.stopped || this.picked || this.missed || this.fumbled;
      return {
        x: 28 + action * 26 + follow * (recoil ? -7 : 27),
        y: 72 - action * 8 + follow * (this.stopped ? 5 : -4),
        angle: this.stopped ? -23 * follow : -7 * Math.sin(action * Math.PI),
      };
    }

    stopper(action, follow) {
      if (this.kicking) return { x: 75, y: 62, angle: 0 };
      return {
        x: 72 - action * 15 - (this.picked ? follow * 30 : -follow * 3),
        y: 63 - (this.picked ? follow * 6 : 0),
        angle: this.stopped ? follow * 9 : follow * -10,
      };
    }

    support(action) {
      return {
        x: 12 + action * (this.passing ? 0 : 10),
        y: 47 + action * (this.passing ? 19 : 0),
        angle: this.passing ? -8 * Math.sin(action * Math.PI) : 0,
      };
    }

    kickedBall(progress, action) {
      return {
        x: 31 + action * 58,
        y: 63 - Math.sin(action * Math.PI) * 43 - action * 27,
        spin: action * 900,
        visible: progress >= 0.18 && progress < 0.74,
      };
    }

    passBall(progress, action) {
      return {
        x: 14 + action * (this.picked ? 43 : 40),
        y: 54 - Math.sin(action * Math.PI) * (this.offense.kind === 'deep' ? 33 : 23) - action * 5,
        spin: action * 720,
        visible: progress >= 0.2,
      };
    }

    deadBall(progress, action) {
      if (this.result.outcome === 'clock-expired') return { x: 31, y: 60, spin: 0, visible: false };
      if (this.result.outcome === 'spike') return { x: 31, y: 58 + action * 22, spin: 0, visible: progress >= 0.18 };
    }

    ball(progress, action, follow, lead, stopper) {
      if (['spike', 'clock-expired'].includes(this.result.outcome)) return this.deadBall(progress, action);
      if (this.kicking) return this.kickedBall(progress, action);
      if (this.sacked) return { x: lead.x + 3, y: lead.y - 14, spin: 0, visible: progress >= 0.18 };
      if (this.passing && progress < 0.56) return this.passBall(progress, action);
      if (this.missed)
        return { x: 59 + follow * 8, y: 50 + follow * 33, spin: 720 + follow * 270, visible: progress >= 0.2 };
      if (this.picked) return { x: stopper.x - 3, y: stopper.y - 14, spin: 0, visible: true };
      if (this.fumbled)
        return {
          x: 55 + follow * 9,
          y: 52 + follow * 24 - Math.abs(Math.sin(follow * Math.PI * 3)) * 8,
          spin: follow * 850,
          visible: progress >= 0.2,
        };
      return { x: lead.x + 3, y: lead.y - 14, spin: 0, visible: progress >= 0.2 };
    }
  }

  if (typeof module !== 'undefined') module.exports = { BattleMotion };
  else Object.assign(window.Pokeballers, { BattleMotion });
}
