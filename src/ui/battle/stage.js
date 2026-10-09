{
  const { SpriteArt } = typeof module !== 'undefined' ? require('../sprites.js') : window.Pokeballers;
  const { BattleMotion } = typeof module !== 'undefined' ? require('./motion.js') : window.Pokeballers;

  class BattleStage {
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
      this.progressNode = element.querySelector('#battleProgress');
      this.motionPreference =
        typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
      this.paused = false;
      this.token = 0;
      this.active = null;
      element.querySelector('#skipBattle').addEventListener('click', () => this.skip());
    }

    featured(result) {
      const { carrier, support, defender, help } = result.participants;
      return { lead: carrier, support, stopper: defender, help };
    }

    play({ offense, defense, result, onProgress = () => {} }) {
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
        this.active = { resolve, reject, onProgress, motion, elapsed: 0, previous: null };
        this.render(motion.sample(0, this.reduced));
        this.frame = requestAnimationFrame((now) => this.tick(now, token));
      });
    }

    tick(now, token) {
      if (token !== this.token) return;
      try {
        const active = this.active;
        if (active.previous !== null && !this.paused) active.elapsed += Math.min(50, now - active.previous);
        active.previous = now;
        const duration = this.reduced ? BattleMotion.REDUCED_DURATION : BattleMotion.DURATION;
        const progress = Math.min(1, active.elapsed / duration);
        if (!this.paused) {
          this.render(active.motion.sample(progress, this.reduced));
          if (progress < 1) active.onProgress(progress);
        }
        if (token !== this.token) return;
        if (progress === 1) this.complete();
        else this.frame = requestAnimationFrame((time) => this.tick(time, token));
      } catch (error) {
        const reject = this.active.reject;
        reject(error);
        this.complete(false);
      }
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
      this.renderBadges(state.progress);
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

    skip() {
      if (this.active && !this.paused) this.complete();
    }

    complete(finished = true) {
      this.token += 1;
      cancelAnimationFrame(this.frame);
      this.element.classList.add('hidden');
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
