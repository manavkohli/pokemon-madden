class BattleStage {
  constructor(element) {
    this.element = element;
    this.canvasHost = element.querySelector('#battleCanvas');
    this.roundLabel = element.querySelector('#battleRound');
    this.matchupLabel = element.querySelector('#battleMatchup');
    this.attackers = element.querySelector('#battleAttackers');
    this.defenders = element.querySelector('#battleDefenders');
    this.callout = element.querySelector('#battleCallout');
    this.subline = element.querySelector('#battleSubline');
    this.leadNode = element.querySelector('#battleLead');
    this.stopperNode = element.querySelector('#battleStopper');
    this.ballNode = element.querySelector('#battleBall');
    this.impactNode = element.querySelector('#battleImpact');
    this.paused = false;
    this.token = 0;
    this.resolve = null;
    this.actors = [];
    element.querySelector('#skipBattle').addEventListener('click', () => this.skip());
  }

  featured(attack, defend, offense, defense, result = {}) {
    let lead;
    let support;
    if (offense.id === 'double-pass') {
      lead = attack.player('QB', 1);
      support = attack.player('QB');
    } else if (['qb-scramble', 'read-option'].includes(offense.id)) {
      lead = attack.player('QB');
      support = attack.player('RB');
    } else if (['jet-sweep', 'end-around', 'reverse'].includes(offense.id)) {
      lead = attack.player('WR');
      support = attack.player('RB');
    } else if (offense.id === 'screen-pass') {
      lead = attack.player('RB');
      support = attack.player('QB');
    } else if (offense.id === 'te-seam' || offense.id === 'shovel-pass') {
      lead = attack.player('TE');
      support = attack.player('QB');
    } else if (offense.kind === 'run') {
      lead = attack.player('RB');
      support = attack.player('OL');
    } else if (['kick', 'punt'].includes(offense.kind)) {
      lead = attack.player('QB');
      support = attack.player('OL');
    } else {
      lead = attack.player('WR');
      support = attack.player('QB');
    }
    const runFront = defense.strengths.includes('run') && offense.kind === 'run';
    const pressure = ['blitz', 'zone-blitz', 'fire-zone', 'run-blitz', 'cover-0'].includes(defense.id);
    const stopper = result.defender || (offense.kind === 'run' ? defend.player('LB') : runFront || pressure ? defend.player('DL') : defense.id === 'spy' ? defend.player('LB') : offense.kind === 'deep' ? defend.player('S') : defend.player('CB'));
    let help = runFront ? defend.player('LB') : pressure ? defend.player('DL') : defend.player('S');
    if (help.id === stopper.id) help = defend.player('CB');
    return { lead, support, stopper, help };
  }

  initialize() {
    if (this.initializing) return this.initializing;
    this.initializing = Promise.race([
      import('https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('3D load timed out')), 2400)),
    ]).then(three => {
      this.three = three;
      this.createScene();
      return true;
    }).catch(error => {
      console.warn('3D battle view unavailable; using the animated 2D view.', error);
      this.element.classList.add('flat');
      return false;
    });
    return this.initializing;
  }

  createScene() {
    const THREE = this.three;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvasHost.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-7.2, 7.2, 3.8, -3.8, .1, 100);
    this.camera.position.set(0, 7, 11);
    this.camera.lookAt(0, .4, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.4));
    const light = new THREE.DirectionalLight(0xffefb9, 2.5);
    light.position.set(-4, 8, 5);
    this.scene.add(light);
    const turf = new THREE.Mesh(new THREE.BoxGeometry(15, .2, 7), new THREE.MeshLambertMaterial({ color: 0x2c6949 }));
    turf.position.y = -.15;
    this.scene.add(turf);
    for (let x = -6; x <= 6; x += 2) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.045, .012, 7), new THREE.MeshBasicMaterial({ color: 0x83ba88 }));
      stripe.position.set(x, -.035, 0);
      this.scene.add(stripe);
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(.06, .018, 7), new THREE.MeshBasicMaterial({ color: 0xd3f565 }));
    line.position.set(0, -.025, 0);
    this.scene.add(line);
    this.party = new THREE.Group();
    this.scene.add(this.party);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0x8c4b2a }));
    this.ball.scale.set(1, .62, .62);
    this.party.add(this.ball);
    this.loader = new THREE.TextureLoader();
    window.addEventListener('resize', () => this.resize());
  }

  addActor(mon, side, x, z) {
    const THREE = this.three;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const color = side === 'attack' ? 0xd3f565 : 0xff8967;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.64, .77, .25, 8), new THREE.MeshLambertMaterial({ color }));
    base.position.y = .1;
    group.add(base);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(.52, 0), new THREE.MeshLambertMaterial({ color, transparent: true, opacity: .75 }));
    body.position.y = .78;
    group.add(body);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.8, 12), new THREE.MeshBasicMaterial({ color: 0x173f2c, transparent: true, opacity: .5, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -.035;
    group.add(shadow);
    this.party.add(group);
    const token = this.token;
    this.loader.load(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png`, texture => {
      if (token !== this.token) {
        texture.dispose();
        return;
      }
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      sprite.position.y = 1.35;
      sprite.scale.set(2.1, 2.1, 1);
      group.add(sprite);
    }, undefined, () => { body.material.opacity = 1; });
    this.actors.push({ group, side, x, z });
  }

  populate(featured) {
    if (!this.renderer) return;
    this.disposeActors();
    this.party.clear();
    this.actors = [];
    this.party.add(this.ball);
    this.addActor(featured.lead, 'attack', -3.5, 1.2);
    this.addActor(featured.support, 'attack', -5.1, -1.15);
    this.addActor(featured.stopper, 'defend', 3.45, 1.15);
    this.addActor(featured.help, 'defend', 5.05, -1.2);
    this.resize();
  }

  disposeActors() {
    this.actors.forEach(actor => actor.group.traverse(object => {
      object.geometry?.dispose();
      if (object.material) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    }));
    this.actors = [];
  }

  resize() {
    if (!this.renderer) return;
    const width = this.canvasHost.clientWidth;
    const height = this.canvasHost.clientHeight;
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    this.camera.left = -4.4 * aspect;
    this.camera.right = 4.4 * aspect;
    this.camera.updateProjectionMatrix();
  }

  card(mon) {
    return `<div class="battle-mon"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png" alt="" onerror="this.replaceWith(document.createTextNode('◓'))"><b>${mon.name}</b></div>`;
  }

  fighter(mon) {
    const glyphs = { Fire: '🔥', Water: '💧', Grass: '🌿', Electric: '⚡', Psychic: '🔮', Ghost: '👻', Dragon: '🐉', Fighting: '🥊', Rock: '🪨', Ground: '🪨', Bug: '🐛', Flying: '🪽', Ice: '❄️', Dark: '🌙', Steel: '⚙️', Poison: '☠️', Normal: '◓', Fairy: '✨' };
    return `<div class="battle-avatar"><span>${glyphs[mon.types[0]] || '◓'}</span><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png" alt="" onerror="this.remove()"></div><b>${mon.name}</b>`;
  }

  play({ attack, defend, offense, defense, result, onProgress }) {
    this.cancel();
    const token = this.token;
    const featured = this.featured(attack, defend, offense, defense, result);
    this.element.classList.remove('hidden');
    this.element.classList.add('battle-playing');
    this.roundLabel.textContent = offense.kind === 'kick' || offense.kind === 'punt' ? 'SPECIAL TEAMS' : 'SNAP!';
    this.matchupLabel.textContent = `${offense.name}  VS  ${defense.name}`;
    this.attackers.innerHTML = this.card(featured.lead) + this.card(featured.support);
    this.defenders.innerHTML = this.card(featured.stopper) + this.card(featured.help);
    this.leadNode.innerHTML = this.fighter(featured.lead);
    this.stopperNode.innerHTML = this.fighter(featured.stopper);
    this.leadNode.style.transform = '';
    this.stopperNode.style.transform = '';
    this.ballNode.style.transform = '';
    this.impactNode.classList.remove('hit');
    this.callout.textContent = `${offense.icon} ${offense.name}`;
    this.subline.textContent = `${featured.lead.name} faces ${featured.stopper.name}`;
    let ready = false;
    this.initialize().then(loaded => {
      if (loaded && token === this.token) {
        this.populate(featured);
        ready = true;
      }
    });
    return new Promise(resolve => {
      this.resolve = resolve;
      let elapsed = 0;
      let previous = 0;
      const duration = 2600;
      const frame = now => {
        if (token !== this.token) return;
        if (previous && !this.paused) elapsed += Math.min(50, now - previous);
        previous = now;
        const progress = Math.min(1, elapsed / duration);
        onProgress?.(progress);
        if (progress > .48 && progress < .74) {
          const tackle = ['stuff', 'stop', 'sack', 'turnover-downs', 'safety'].includes(result.outcome);
          this.callout.textContent = result.outcome === 'interception' ? `${featured.stopper.name} PICKS IT!` : tackle ? `${featured.stopper.name} TACKLES!` : result.turnover ? 'TURNOVER!' : result.yards > 0 ? 'BREAKING THROUGH!' : 'DEFENSE HOLDS!';
          this.subline.textContent = tackle ? `${featured.lead.name} stopped at the line` : `${featured.lead.name} vs ${featured.stopper.name}`;
        } else if (progress >= .74) {
          this.callout.textContent = result.message;
          this.subline.textContent = `${offense.name} · ${defense.name}`;
        }
        this.drawAction(progress, offense, result);
        if (ready) this.draw(progress, offense, defense, result);
        if (progress >= 1) {
          this.complete();
          return;
        }
        this.frame = requestAnimationFrame(frame);
      };
      this.frame = requestAnimationFrame(frame);
    });
  }

  drawAction(progress, offense, result) {
    const surge = Math.max(0, Math.min(1, (progress - .14) / .43));
    const contact = Math.max(0, Math.min(1, (progress - .55) / .13));
    const distance = Math.min(126, this.element.clientWidth * .15);
    const stop = ['stuff', 'stop', 'sack', 'turnover-downs', 'safety'].includes(result.outcome);
    const pick = result.outcome === 'interception';
    const fumble = result.outcome === 'fumble';
    const incomplete = result.outcome === 'incomplete';
    const leadX = distance * surge - (stop || pick ? distance * .55 * contact : 0);
    const defenderX = -distance * (pick ? .85 : stop ? 1.05 : .7) * surge + (result.yards > 0 && !pick ? distance * .55 * contact : 0);
    this.leadNode.style.transform = `translate(${leadX}px,${pick || stop ? 12 * contact : -10 * surge}px) rotate(${stop ? -18 * contact : 0}deg)`;
    this.stopperNode.style.transform = `translate(${defenderX}px,${pick ? -28 * contact : -9 * surge}px) rotate(${result.yards > 0 ? 12 * contact : 0}deg)`;
    const airborne = offense.kind !== 'run' || ['pitch-toss', 'jet-sweep', 'end-around'].includes(offense.id);
    const ballX = airborne ? 35 + 31 * surge + (pick ? 9 * contact : 0) : 34 + 24 * surge + (fumble ? 9 * contact : 0);
    const ballY = airborne ? 32 + 29 * Math.sin(Math.PI * surge) - (pick ? 12 * contact : 0) : 36 + (fumble ? 24 * contact : 0);
    this.ballNode.style.left = `${ballX}%`;
    this.ballNode.style.bottom = `${ballY}%`;
    this.ballNode.style.opacity = progress < .15 || progress > .86 ? '0' : '1';
    this.impactNode.textContent = pick ? 'PICK!' : fumble ? 'FUMBLE!' : incomplete ? 'BROKEN UP!' : stop ? 'TACKLE!' : result.outcome === 'touchdown' ? 'TOUCHDOWN!' : 'BREAKAWAY!';
    this.impactNode.classList.toggle('hit', progress > .52 && progress < .79);
  }

  draw(progress, offense, defense, result) {
    const rushing = offense.kind === 'run';
    const surge = Math.max(0, Math.min(1, (progress - .2) / .45));
    const contact = Math.max(0, Math.min(1, (progress - .55) / .25));
    const pressure = ['blitz', 'zone-blitz', 'fire-zone', 'run-blitz', 'cover-0'].includes(defense.id);
    const edgePlay = ['outside-stretch', 'pitch-toss', 'jet-sweep', 'end-around', 'wheel-route', 'corner-route', 'out-route'].includes(offense.id);
    const crossingPlay = ['quick-slant', 'drag-cross', 'mesh', 'post-route', 'rpo-slant', 'reverse'].includes(offense.id);
    this.actors.forEach((actor, index) => {
      const lead = index === 0;
      const defender = actor.side === 'defend';
      let distance = rushing ? 1.3 : .4;
      let direction = 1;
      if (lead) distance = rushing ? 3.3 : 3.8;
      if (defender) {
        distance = pressure || rushing ? 1.8 : .6;
        direction = pressure || rushing ? -1 : 1;
      }
      const stopped = result.yards <= 0 || result.turnover;
      actor.group.position.x = actor.x + direction * distance * surge + (defender && !stopped ? 1.1 * contact : 0) + (!defender && stopped ? -1 * contact : 0);
      actor.group.position.y = Math.abs(Math.sin(progress * 20 + index)) * .16 * surge;
      actor.group.position.z = actor.z + (lead && edgePlay ? -1.8 * surge : lead && crossingPlay ? -1.3 * surge : 0);
      actor.group.rotation.y = Math.sin(progress * 9 + index) * .13;
    });
    const air = !rushing || ['pitch-toss', 'jet-sweep', 'end-around'].includes(offense.id);
    const arc = offense.kind === 'deep' ? 3.2 : 2.2;
    this.ball.position.set(-3.45 + 6.3 * surge, air ? .8 + arc * Math.sin(Math.PI * surge) : .5, this.actors[0]?.group.position.z || 1.2);
    this.ball.rotation.z = progress * 15;
    this.renderer.render(this.scene, this.camera);
  }

  setPaused(paused) {
    this.paused = paused;
    this.element.classList.toggle('is-paused', paused);
  }

  skip() {
    if (this.resolve) this.complete();
  }

  complete() {
    this.token += 1;
    cancelAnimationFrame(this.frame);
    this.element.classList.add('hidden');
    this.element.classList.remove('battle-playing', 'is-paused');
    this.paused = false;
    this.disposeActors();
    this.party?.clear();
    const resolve = this.resolve;
    this.resolve = null;
    if (resolve) resolve();
  }

  cancel() {
    this.complete();
  }
}

if (typeof window !== 'undefined') window.BattleStage = BattleStage;
if (typeof module !== 'undefined') module.exports = { BattleStage };
