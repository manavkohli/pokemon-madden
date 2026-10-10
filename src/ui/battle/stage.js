{
  const { SpriteArt } = typeof module !== 'undefined' ? require('../sprites.js') : window.Pokeballers;
  const { BattleMotion } = typeof module !== 'undefined' ? require('./motion.js') : window.Pokeballers;

  class BattleStage {
    static CLASH_MS = 4000;
    static STAT_LABELS = { speed: 'SPD', attack: 'ATK', defense: 'DEF', hp: 'HP' };

    constructor(element) {
      this.element = element;
      this.actionNode = element.querySelector('#battleAction');
      this.roundLabel = element.querySelector('#battleRound');
      this.matchupLabel = element.querySelector('#battleMatchup');
      this.callout = element.querySelector('#battleCallout');
      this.subline = element.querySelector('#battleSubline');
      this.leadNode = element.querySelector('#battleLead');
      this.supportNode = element.querySelector('#battleSupport');
      this.stopperNode = element.querySelector('#battleStopper');
      this.helpNode = element.querySelector('#battleHelp');
      this.fighters = [this.leadNode, this.supportNode, this.stopperNode, this.helpNode];
      this.ballNode = element.querySelector('#battleBall');
      this.impactNode = element.querySelector('#battleImpact');
      this.effectsNode = element.querySelector('#battleEffects');
      this.cueNode = element.querySelector('#battleCue');
      this.shieldNode = element.querySelector('#battleShield');
      this.progressNode = element.querySelector('#battleProgress');
      this.clashNode = element.querySelector('#battleClash');
      this.clashTitle = element.querySelector('#battleClashTitle');
      this.clashTimer = element.querySelector('#battleClashTimer');
      this.clashButtons = Array.from(element.querySelectorAll('#battleClash button'));
      this.motionPreference =
        typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
      this.paused = false;
      this.token = 0;
      this.active = null;
      element.querySelector('#skipBattle').addEventListener('click', () => this.skip());
      this.clashButtons.forEach((button, index) => button.addEventListener('click', () => this.choose(index)));
      (element.ownerDocument ?? element).addEventListener('keydown', (event) => this.onKey(event));
    }

    featured(result) {
      const { carrier, support, defender, help } = result.participants;
      return { lead: carrier, support, stopper: defender, help };
    }

    play({ offense, defense, result, clash = null, onProgress = () => {} }) {
      this.cancel();
      const featured = this.featured(result);
      const motion = new BattleMotion(offense, result, featured);
      this.element.classList.remove('hidden');
      this.element.classList.toggle('scoring', motion.scoring);
      this.matchupLabel.textContent = `${offense.name}  VS  ${defense.name}`;
      Object.values(featured).forEach((mon, index) => {
        this.fighters[index].innerHTML = `${SpriteArt.fighter(mon, index < 2)}<span class="status-badge"></span>`;
        this.fighters[index].setAttribute('aria-label', mon.name);
      });
      this.bodies = this.fighters.map((node) => node.querySelector('.battle-body'));
      this.badgeNodes = this.fighters.map((node) => node.querySelector('.status-badge'));
      this.statuses = result.statuses ?? null;
      this.badgePhase = null;
      this.clashNode.classList.add('hidden');
      this.shadows = this.fighters.map((node) => node.querySelector('.battle-shadow'));
      this.impactNode.textContent = motion.impact;
      this.element.setAttribute('data-move-type', motion.moveType);
      this.element.setAttribute('data-weather', result.weather ?? '');
      this.effectsNode.innerHTML = Array.from({ length: motion.scoring ? 20 : 10 }, () => '<i></i>').join('');
      this.particles = Array.from(this.effectsNode.children);
      this.reduced = this.motionPreference.matches;
      this.element.classList.toggle('reduced-motion', this.reduced);
      const token = this.token;
      return new Promise((resolve, reject) => {
        this.active = { resolve, reject, onProgress, motion, offense, clash, elapsed: 0, previous: null, hold: null };
        this.render(motion.sample(0, this.reduced));
        this.frame = requestAnimationFrame((now) => this.tick(now, token));
      });
    }

    tick(now, token) {
      if (token !== this.token) return;
      try {
        const active = this.active;
        const step = active.previous !== null && !this.paused ? Math.min(50, now - active.previous) : 0;
        active.previous = now;
        const progress = active.hold ? this.countDown(active, step) : this.advance(active, step);
        if (token !== this.token) return;
        if (progress === 1) this.complete();
        else this.frame = requestAnimationFrame((time) => this.tick(time, token));
      } catch (error) {
        const reject = this.active.reject;
        reject(error);
        this.complete(false);
      }
    }

    get duration() {
      return this.reduced ? BattleMotion.REDUCED_DURATION : BattleMotion.DURATION;
    }

    // A pending clash stops the play clock at contact; the hold counts on the same frame clock.
    advance(active, step) {
      active.elapsed += step;
      let progress = Math.min(1, active.elapsed / this.duration);
      if (active.clash && active.motion.pending && progress >= BattleMotion.CONTACT) {
        active.elapsed = this.duration * BattleMotion.CONTACT;
        progress = BattleMotion.CONTACT;
        this.openClash(active);
      }
      if (!this.paused) {
        this.render(active.motion.sample(progress, this.reduced));
        if (progress < 1) active.onProgress(progress);
      }
      return progress;
    }

    openClash(active) {
      const { carrier, tackler, role, actions, auto } = active.motion.result.clash;
      active.hold = { remaining: BattleStage.CLASH_MS, locked: false, auto };
      this.clashTitle.textContent = `${(role === 'offense' ? carrier : tackler).name}: pick a move`;
      this.clashTimer.textContent = String(BattleStage.CLASH_MS / 1000);
      this.clashButtons.forEach((button, index) => {
        const action = actions[index];
        button.setAttribute('data-action', action.id);
        button.innerHTML = `<kbd>${index + 1}</kbd><strong>${action.name}</strong><small>${BattleStage.STAT_LABELS[action.stat]} ${action.skill}</small>`;
      });
      this.clashNode.classList.remove('hidden');
      this.clashButtons[0].focus();
    }

    countDown(active, step) {
      const hold = active.hold;
      if (!hold.locked && !this.paused) {
        hold.remaining = Math.max(0, hold.remaining - step);
        this.clashTimer.textContent = String(Math.ceil(hold.remaining / 1000));
        if (hold.remaining === 0) this.commit(hold.auto);
      }
      return active.elapsed / this.duration;
    }

    choose(index) {
      const hold = this.active?.hold;
      if (!hold || hold.locked || this.paused) return;
      this.commit(this.active.motion.result.clash.actions[index].id);
    }

    onKey(event) {
      const index = Number(event.key) - 1;
      if (!this.active?.hold || !Number.isInteger(index) || index < 0 || index >= this.clashButtons.length) return;
      event.preventDefault();
      this.choose(index);
    }

    // Both picks go to the engine together; the stage then plays the final result from contact.
    commit(action) {
      const active = this.active;
      const token = this.token;
      active.hold.locked = true;
      this.clashNode.classList.add('hidden');
      new Promise((resolve) => resolve(active.clash(action))).then(
        (final) => this.resume(active, final, token),
        (error) => this.fail(active, error, token),
      );
    }

    resume(active, final, token) {
      if (token !== this.token) return;
      try {
        active.motion = new BattleMotion(active.offense, final, this.featured(final));
        active.hold = null;
        this.statuses = final.statuses ?? null;
        this.badgePhase = null;
        this.impactNode.textContent = active.motion.impact;
        this.element.classList.toggle('scoring', active.motion.scoring);
      } catch (error) {
        this.fail(active, error, token);
      }
    }

    fail(active, error, token) {
      if (token !== this.token) return;
      active.reject(error);
      this.complete(false);
    }

    render(state) {
      this.fighters.forEach((node, index) => {
        const actor = state.actors[index];
        node.style.left = `${actor.x}%`;
        node.style.top = `${actor.y}%`;
        node.style.opacity = actor.opacity;
        this.bodies[index].style.transform =
          `translateY(${actor.bob}px) rotate(${actor.angle}deg) scale(${actor.scaleX}, ${actor.scaleY})`;
        this.shadows[index].style.transform = `scale(${1 + actor.bob * 0.025}, 1)`;
      });
      this.renderCue(state.cue);
      this.renderShield(state.bubble);
      this.renderBadges(state.progress);
      this.element.style.setProperty('--drift', `${this.reduced ? 0 : Math.round(state.progress * 160)}px`);
      this.actionNode.style.transform = `translateX(${state.shake}px)`;
      this.ballNode.style.left = `${state.ball.x}%`;
      this.ballNode.style.top = `${state.ball.y}%`;
      this.ballNode.style.transform = `translate(-50%, -50%) rotate(${state.ball.spin}deg)`;
      this.ballNode.style.opacity = state.ball.visible && !this.reduced ? '1' : '0';
      const showImpact = state.progress >= 0.56 && state.progress < 0.92;
      const pop = BattleMotion.ease(BattleMotion.interval(state.progress, 0.56, 0.64));
      this.impactNode.style.opacity = showImpact ? '1' : '0';
      this.impactNode.style.transform = `translate(-50%, -50%) scale(${this.reduced ? 1 : 0.65 + pop * 0.35}) rotate(-4deg)`;
      this.roundLabel.textContent = state.caption.round;
      this.callout.textContent = state.caption.title;
      this.subline.textContent = state.caption.detail;
      this.progressNode.style.transform = `scaleX(${state.progress})`;
      this.element.style.setProperty(
        '--light-sweep',
        `${this.reduced ? 0 : Math.sin(state.progress * Math.PI * 2) * 12}deg`,
      );
      this.renderParticles(state);
    }

    // Conditions in force during the play show first; ones the play inflicts appear at contact.
    renderBadges(progress) {
      const phase = progress >= BattleMotion.CONTACT ? 'after' : 'before';
      if (!this.statuses || phase === this.badgePhase) return;
      this.badgePhase = phase;
      ['carrier', 'support', 'defender', 'help'].forEach((role, index) => {
        this.badgeNodes[index].textContent = this.statuses[phase][role].join(' ');
      });
    }

    renderShield(spot) {
      this.shieldNode.style.opacity = spot ? '1' : '0';
      if (!spot) return;
      this.shieldNode.style.left = `${spot.x}%`;
      this.shieldNode.style.top = `${spot.y}%`;
    }

    renderCue(cue) {
      if (!cue) {
        this.cueNode.style.opacity = '0';
        return;
      }
      this.cueNode.className = `battle-cue ${cue.kind}`;
      this.cueNode.setAttribute('data-layer', cue.layer ?? '');
      this.cueNode.style.opacity = cue.kind === 'flash' ? String(1 - cue.t) : '1';
      this.cueNode.textContent = cue.label ?? '';
      this.cueNode.style.left = `${BattleMotion.mix(cue.from.x, cue.to.x, cue.t)}%`;
      this.cueNode.style.top = `${BattleMotion.mix(cue.from.y, cue.to.y, cue.t)}%`;
    }

    renderParticles(state) {
      const burst = BattleMotion.interval(state.progress, 0.56, 0.86);
      const visible = !this.reduced && burst > 0 && burst < 1;
      this.effectsNode.style.opacity = visible ? 1 - burst : 0;
      this.particles.forEach((particle, index) => {
        const angle = index * 2.4;
        const radius = burst * (50 + (index % 4) * 18);
        particle.style.transform = `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius + burst * burst * 35}px) rotate(${burst * 220}deg) scale(${1 - burst * 0.5})`;
      });
    }

    setPaused(paused) {
      this.paused = paused;
      if (this.active) this.active.previous = null;
    }

    // Skip jumps to contact on a pending clash and does nothing while the clash is open.
    skip() {
      const active = this.active;
      if (!active || this.paused || active.hold) return;
      if (active.clash && active.motion.pending)
        active.elapsed = Math.max(active.elapsed, this.duration * BattleMotion.CONTACT);
      else this.complete();
    }

    complete(finished = true) {
      this.token += 1;
      cancelAnimationFrame(this.frame);
      this.element.classList.add('hidden');
      this.clashNode.classList.add('hidden');
      this.paused = false;
      const active = this.active;
      this.active = null;
      if (active) {
        try {
          if (finished) active.onProgress(1);
        } catch (error) {
          active.reject(error);
          return;
        }
        active.resolve({ cancelled: !finished });
      }
    }

    cancel() {
      this.complete(false);
    }
  }

  if (typeof module !== 'undefined') module.exports = { BattleStage };
  else Object.assign(window.Pokeballers, { BattleStage });
}
