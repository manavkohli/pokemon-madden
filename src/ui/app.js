{
  const {
    POSITION_GROUPS,
    POSITIONS,
    SALARY_CAP,
    OFFENSE,
    DEFENSE,
    Roster,
    FootballGame,
    BattleStage,
    SpriteArt,
    PlayDiagram,
    FootballField,
  } = window.Pokeballers;

  class GameApp {
    constructor(pokemon) {
      if (pokemon.length !== 251) throw new Error('Expected 251 Pokémon in pokemon_gen1_2.js');
      this.pokemon = pokemon;
      this.home = Roster.random(pokemon);
      this.away = Roster.random(pokemon);
      this.selectedSlot = 0;
      this.selectedPokemon = this.home.players[0];
      this.selectedOffense = OFFENSE[0];
      this.selectedDefense = DEFENSE[0];
      this.game = null;
      this.locked = false;
      this.paused = false;
      this.pendingSnap = null;
      this.sequence = 0;
      this.battle = new BattleStage(this.el('battleStage'));

      document.addEventListener('error', (event) => SpriteArt.handleError(event), true);
      document.addEventListener('load', (event) => SpriteArt.handleLoad(event), true);
      this.el('fieldMarkings').innerHTML = FootballField.markings();
      this.bind();
      this.renderDraft();
    }

    el(id) {
      return document.getElementById(id);
    }

    bind() {
      this.el('draftSlots').addEventListener('click', (event) => {
        const slot = event.target.closest('[data-slot]');
        if (!slot) return;
        this.selectedSlot = Number(slot.dataset.slot);
        this.selectedPokemon = this.home.players[this.selectedSlot];
        this.renderDraft();
      });
      this.el('catalogList').addEventListener('click', (event) => {
        const card = event.target.closest('[data-pokemon]');
        if (!card) return;
        this.selectedPokemon = this.pokemon[Number(card.dataset.pokemon) - 1];
        this.renderCatalog();
        this.renderDetail();
      });
      this.el('searchInput').addEventListener('input', () => this.renderCatalog());
      this.el('typeFilter').addEventListener('change', () => this.renderCatalog());
      this.el('sortSelect').addEventListener('change', () => this.renderCatalog());
      this.el('noCap').addEventListener('change', () => this.renderBudget());
      this.el('randomizeButton').addEventListener('click', () => {
        this.home = Roster.random(this.pokemon);
        this.away = Roster.random(this.pokemon);
        this.selectedPokemon = this.home.players[this.selectedSlot];
        this.renderDraft();
        this.el('draftMessage').textContent = 'Both teams randomized.';
      });
      this.el('kickoffButton').addEventListener('click', () => this.start());
      this.el('playbookSelect').addEventListener('change', () => this.renderPlays());
      this.el('playList').addEventListener('click', (event) => {
        const card = event.target.closest('[data-play]');
        if (!card || this.locked) return;
        if (this.game.possession === 'home')
          this.selectedOffense = OFFENSE.find((play) => play.id === card.dataset.play);
        else this.selectedDefense = DEFENSE.find((play) => play.id === card.dataset.play);
        this.renderPlays();
        this.renderField();
      });
      this.el('snapButton').addEventListener('click', () => this.snap().catch((error) => this.showError(error)));
      this.el('pauseButton').addEventListener('click', () => this.pause());
      this.el('resumeButton').addEventListener('click', () => this.resume());
      this.el('pauseOverlay').addEventListener('cancel', (event) => {
        event.preventDefault();
        this.resume();
      });
      this.el('finalOverlay').addEventListener('cancel', (event) => event.preventDefault());
      this.el('editTeamButton').addEventListener('click', () => this.openDraft());
      this.el('rematchButton').addEventListener('click', () => this.start());
      this.el('redraftButton').addEventListener('click', () => this.openDraft());
    }

    renderDraft() {
      this.el('draftSlots').innerHTML = POSITIONS.map((position, index) => {
        const mon = this.home.players[index];
        const heading =
          position.depth === 1
            ? `<div class="depth-heading">${position.name.toUpperCase()} · ${POSITION_GROUPS.find((group) => group.code === position.code).slots} SLOTS</div>`
            : '';
        return `${heading}<button class="draft-slot ${index === this.selectedSlot ? 'active' : ''}" data-slot="${index}"><span class="position-tag">${position.code}${position.depth}</span>${SpriteArt.frame(mon)}<span><b>${mon.name}</b><small>${mon.types.join(' / ')}</small></span><span class="rating">${Roster.rating(mon, position.code)}</span></button>`;
      }).join('');
      const filter = this.el('typeFilter');
      if (filter.options.length === 1) {
        const types = [...new Set(this.pokemon.flatMap((mon) => mon.types))].sort();
        filter.innerHTML += types.map((type) => `<option>${type}</option>`).join('');
      }
      this.el('catalogTitle').textContent =
        `${POSITIONS[this.selectedSlot].name} ${POSITIONS[this.selectedSlot].depth}`;
      this.renderCatalog();
      this.renderDetail();
      this.renderBudget();
    }

    renderBudget() {
      const cap = SALARY_CAP;
      const salary = this.home.salary;
      this.el('salaryValue').textContent = `${salary.toLocaleString()} CR`;
      this.el('salaryValue').style.color = salary > cap ? 'var(--orange)' : 'var(--lime)';
      this.el('salaryMeter').style.width = `${Math.min(100, (salary / cap) * 100)}%`;
      this.el('salaryMeter').style.background = salary > cap ? 'var(--orange)' : 'var(--lime)';
      this.el('salaryNote').textContent = this.el('noCap').checked
        ? 'Cap disabled for testing'
        : `Cap: ${cap.toLocaleString()} credits`;
      this.el('draftMessage').textContent =
        salary > cap && !this.el('noCap').checked
          ? 'Over cap: swap a player or enable testing mode.'
          : 'Ready for kickoff.';
      this.el('draftMessage').classList.toggle('error', salary > cap && !this.el('noCap').checked);
      this.el('kickoffButton').disabled = salary > cap && !this.el('noCap').checked;
      this.el('rosterCount').textContent = `${this.home.players.length} / ${POSITIONS.length}`;
    }

    renderCatalog() {
      const position = POSITIONS[this.selectedSlot].code;
      const query = this.el('searchInput').value.trim().toLowerCase();
      const type = this.el('typeFilter').value;
      const sort = this.el('sortSelect').value;
      const candidates = this.pokemon.filter(
        (mon) =>
          (!type || mon.types.includes(type)) &&
          (!query || mon.name.toLowerCase().includes(query) || String(mon.id).includes(query)),
      );
      candidates.sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'salary') return Roster.salary(a) - Roster.salary(b);
        if (sort === 'speed') return b.base_stats.speed - a.base_stats.speed;
        if (sort === 'total') return b.base_stats.total - a.base_stats.total;
        return Roster.rating(b, position) - Roster.rating(a, position);
      });
      this.el('catalogCount').textContent = `${candidates.length} players`;
      this.el('catalogList').innerHTML = candidates.length
        ? candidates
            .map(
              (mon) =>
                `<button class="catalog-card ${mon.id === this.selectedPokemon.id ? 'active' : ''}" data-pokemon="${mon.id}">${SpriteArt.frame(mon)}<span class="meta"><b>${mon.name}</b><small>#${String(mon.id).padStart(3, '0')} · ${mon.types.join(' / ')}</small></span><span class="fit">${Roster.rating(mon, position)}</span></button>`,
            )
            .join('')
        : '<p class="catalog-empty">No Pokémon match those filters.</p>';
    }

    renderDetail() {
      const mon = this.selectedPokemon;
      const position = POSITIONS[this.selectedSlot];
      const s = mon.base_stats;
      const stats = [
        ['HP', s.hp],
        ['ATTACK', s.attack],
        ['DEFENSE', s.defense],
        ['SP. ATK', s.special_attack],
        ['SP. DEF', s.special_defense],
        ['SPEED', s.speed],
      ];
      this.el('playerDetail').innerHTML =
        `<div class="detail-content"><div class="detail-hero">${SpriteArt.frame(mon, 'big')}<div><h3>${mon.name}</h3><p>#${String(mon.id).padStart(3, '0')} · ${mon.types.join(' / ')}</p></div></div><div class="detail-cost"><span>${position.code} FIT ${Roster.rating(mon, position.code)}</span><strong>${Roster.salary(mon)} CR</strong></div><div class="detail-label">BASE STATS · ${s.total} TOTAL</div>${stats.map(([name, value]) => `<div class="stat-row"><span>${name}</span><div class="stat-track"><i style="width:${Math.min(100, (value / 255) * 100)}%"></i></div><strong>${value}</strong></div>`).join('')}<p class="detail-note">Base stats are from Pokémon Database. Position fit and salary are Pokéballers game ratings.</p><button id="assignButton" class="button primary" type="button">Put at ${position.code}${position.depth} ▶</button></div>`;
      this.el('assignButton').addEventListener('click', () => {
        this.home.assign(this.selectedSlot, mon);
        this.renderDraft();
        this.el('draftMessage').textContent = `${mon.name} assigned to ${position.code}.`;
      });
    }

    start() {
      if (this.home.salary > SALARY_CAP && !this.el('noCap').checked) return;
      this.sequence += 1;
      clearTimeout(this.resultTimer);
      this.el('resultBanner').classList.add('hidden');
      this.battle.cancel();
      this.game = new FootballGame(this.home, this.away, Number(this.el('quarterLength').value));
      this.selectedOffense = OFFENSE[0];
      this.selectedDefense = DEFENSE[0];
      this.locked = false;
      this.paused = false;
      this.pendingSnap = null;
      this.el('snapButton').disabled = false;
      this.el('draftScreen').classList.add('hidden');
      this.el('gameScreen').classList.remove('hidden');
      this.el('pauseOverlay').close();
      this.el('finalOverlay').close();
      this.renderGame();
    }

    openDraft() {
      this.sequence += 1;
      clearTimeout(this.resultTimer);
      this.el('resultBanner').classList.add('hidden');
      this.battle.cancel();
      this.locked = false;
      this.pendingSnap = null;
      this.el('draftScreen').classList.remove('hidden');
      this.el('gameScreen').classList.add('hidden');
      this.el('finalOverlay').close();
      this.el('pauseOverlay').close();
      this.paused = false;
      this.renderDraft();
    }

    pause() {
      if (!this.game || (this.game.over && !this.locked) || this.el('gameScreen').classList.contains('hidden')) return;
      this.paused = true;
      this.battle.setPaused(true);
      this.el('pauseOverlay').showModal();
    }

    resume() {
      this.paused = false;
      this.battle.setPaused(false);
      this.el('pauseOverlay').close();
      if (this.pendingSnap) {
        const finish = this.pendingSnap;
        this.pendingSnap = null;
        finish();
      }
    }

    playChoices() {
      if (this.game.possession === 'away') return DEFENSE;
      const group = this.el('playbookSelect').value;
      return OFFENSE.filter(
        (play) => (group === 'all' || play.group === group) && (play.group !== 'special' || this.game.down === 4),
      );
    }

    renderPlays() {
      const offense = this.game.possession === 'home';
      const choices = this.playChoices();
      if (offense && !choices.includes(this.selectedOffense)) this.selectedOffense = choices[0];
      this.el('callKicker').textContent = offense ? 'YOUR OFFENSE' : 'YOUR DEFENSE';
      this.el('callHeading').textContent = offense ? 'Call your play' : 'Call your coverage';
      this.el('playbookWrap').classList.toggle('hidden', !offense);
      this.el('callHint').textContent = 'Rival call revealed at snap.';
      this.el('snapButton').textContent = offense ? 'SNAP ▶' : 'LOCK IN ▶';
      this.el('playList').innerHTML = choices
        .map(
          (play) =>
            `<button class="play-card ${play.id === (offense ? this.selectedOffense : this.selectedDefense).id ? 'active' : ''}" data-play="${play.id}" aria-pressed="${play.id === (offense ? this.selectedOffense : this.selectedDefense).id}"><span>${play.icon}</span><strong>${play.name}</strong></button>`,
        )
        .join('');
      this.renderPlayInspector(offense ? this.selectedOffense : this.selectedDefense, offense);
    }

    renderPlayInspector(play, offense) {
      const diagram = PlayDiagram.render(play, offense);
      const labels = offense
        ? '<span>◉ Ball carrier / route</span><span>┊ Line of scrimmage</span>'
        : '<span>◉ Defenders</span><span>↗ Coverage / rush</span>';
      const risk = ['kick', 'punt'].includes(play.kind)
        ? 'SPECIAL TEAMS'
        : ['deep', 'trick'].includes(play.kind)
          ? 'HIGH RISK'
          : play.kind === 'run'
            ? 'CLOCK RUNS'
            : 'BALANCED';
      const counters = DEFENSE.filter((scheme) => scheme.weakness === play.kind)
        .map((scheme) => scheme.name)
        .slice(0, 2)
        .join(' / ');
      const notes = offense
        ? `<b>${play.name}</b><p>${play.detail}</p><small>${risk}${counters ? ` · BEATS ${counters}` : ''}</small>`
        : `<b>${play.name}</b><p>${play.detail}</p><small>STOPS ${play.strengths.join(' / ')} · OPEN TO ${play.weakness}</small>`;
      const roster = this.game.rosters[offense ? this.game.possession : this.game.opponent()];
      const lineup = roster.lineup(offense ? 'offense' : 'defense', play);
      const mix = [...new Set(lineup.map((slot) => slot.role))]
        .map((role) => `${lineup.filter((slot) => slot.role === role).length} ${role}`)
        .join(' · ');
      this.el('playInspector').innerHTML =
        `<div class="inspector-diagram">${diagram}<div class="diagram-legend">${labels}</div></div><div class="inspector-copy"><small>PLAY SCOUT</small>${notes}<div class="play-personnel">${mix}</div><div class="play-context">${this.playSituation(play, offense)}</div></div>`;
    }

    defenseSituation(play) {
      const likely = this.game.toGo <= 3 ? 'run' : this.game.toGo >= 8 ? 'deep' : 'medium';
      return play.strengths.includes(likely)
        ? 'This call fits the current down and distance.'
        : 'A change of pace if the offense breaks tendency.';
    }

    playSituation(play, offense) {
      if (!offense) return this.defenseSituation(play);
      if (play.kind === 'kick') return `${100 - this.game.spot + 17}-yard attempt from here.`;
      if (play.kind === 'punt') return `Flip field position from your own ${this.game.spot}.`;
      if (play.kind === 'run' && this.game.toGo <= 3) return 'Short yardage: a first down is within reach.';
      if (play.kind === 'deep' && this.game.toGo >= 10) return 'Long yardage: the route can reach the sticks.';
      if (play.kind === 'short' && this.game.toGo > 10) return 'Short of the sticks unless a receiver breaks free.';
      return `Need ${this.game.toGo} yards on this down.`;
    }

    async snap() {
      if (this.locked || this.paused || this.game.over) return;
      this.locked = true;
      this.el('snapButton').disabled = true;
      this.el('field').scrollIntoView({ block: 'center', behavior: 'auto' });
      const sequence = this.sequence;
      const game = this.game;
      const offense = this.game.possession === 'home' ? this.selectedOffense : this.game.chooseCpuOffense();
      const defense = this.game.possession === 'home' ? this.game.chooseCpuDefense() : this.selectedDefense;
      const beforeSeconds = game.seconds;
      const result = game.snap(offense, defense);
      await this.battle.play({
        offense,
        defense,
        result,
        onProgress: (progress) => {
          if (sequence !== this.sequence) return;
          const shown = Math.max(0, beforeSeconds - Math.round(result.seconds * progress));
          this.el('clockLabel').textContent = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}`;
        },
      });
      if (sequence !== this.sequence) return;
      const banner = this.el('resultBanner');
      banner.innerHTML = `<strong>${offense.name} VS ${defense.name}</strong><span>${result.message}</span>`;
      banner.classList.remove('hidden');
      this.renderGame();
      const finish = () => {
        if (sequence !== this.sequence) return;
        banner.classList.add('hidden');
        this.locked = false;
        this.el('snapButton').disabled = false;
        if (this.game.over) this.showFinal();
      };
      this.resultTimer = setTimeout(() => (this.paused ? (this.pendingSnap = finish) : finish()), 900);
    }

    showError(error) {
      console.error(error);
      this.battle.cancel();
      this.locked = false;
      this.el('snapButton').disabled = false;
      this.renderGame();
      this.el('callHint').textContent = `Play animation failed: ${error.message}. The drive log contains the result.`;
      this.el('callHint').setAttribute('role', 'alert');
      if (this.game.over) this.showFinal();
    }

    renderGame() {
      const game = this.game;
      this.el('homeScore').textContent = String(game.score.home).padStart(2, '0');
      this.el('awayScore').textContent = String(game.score.away).padStart(2, '0');
      this.el('periodLabel').textContent = game.quarter === 5 ? 'OT' : `Q${game.quarter}`;
      this.el('clockLabel').textContent =
        `${Math.floor(game.seconds / 60)}:${String(game.seconds % 60).padStart(2, '0')}`;
      this.el('possessionLabel').textContent = `${game.possession === 'home' ? 'VOLTS' : 'SURF'} BALL`;
      const ordinal = ['', '1ST', '2ND', '3RD', '4TH'][game.down];
      this.el('downLabel').textContent = `${ordinal} & ${game.toGo}`;
      this.el('sideDown').textContent = ordinal;
      this.el('sideDistance').textContent = `${game.toGo} YDS`;
      const location = game.spot <= 50 ? `OWN ${game.spot}` : `OPP ${100 - game.spot}`;
      this.el('sidePosition').textContent = location;
      this.el('fieldPositionLabel').textContent = location;
      this.el('ballSpotLabel').textContent = String(game.spot);
      this.el('driveLabel').textContent = String(game.drive).padStart(2, '0');
      this.el('firstDownMeter').style.width = `${Math.max(3, Math.min(100, (10 - game.toGo) * 10))}%`;
      this.el('playLog').innerHTML = game.log
        .slice(0, 8)
        .map((line) => `<p>${line}</p>`)
        .join('');
      this.renderField();
      this.renderPlays();
    }

    renderField() {
      const game = this.game;
      const x = FootballField.position(game.spot);
      this.el('scrimmageLine').style.left = `${x}%`;
      this.el('firstDownLine').style.left = `${FootballField.position(game.spot + game.toGo)}%`;
      this.el('football').style.left = `${x}%`;
      const offenseCall = game.possession === 'home' ? this.selectedOffense : OFFENSE[0];
      const defenseCall = game.possession === 'away' ? this.selectedDefense : DEFENSE[0];
      const attack = game.rosters[game.possession].lineup('offense', offenseCall);
      const defend = game.rosters[game.opponent()].lineup('defense', defenseCall);
      const offenseFormation = [
        [-12, 50],
        [-18, 65],
        [-9, 13],
        [-9, 87],
        [-5, 74],
        [-4, 49],
        [-5, 28],
        [-5, 62],
        [-17, 35],
        [-19, 18],
        [-18, 82],
      ];
      const defenseFormation = [
        [17, 50],
        [13, 65],
        [17, 13],
        [17, 87],
        [11, 74],
        [9, 35],
        [4, 43],
        [4, 58],
        [10, 52],
        [14, 24],
        [21, 78],
      ];
      const formation = [
        ...attack.map((slot, i) => ({ ...slot, dx: offenseFormation[i][0], y: offenseFormation[i][1], side: 'off' })),
        ...defend.map((slot, i) => ({ ...slot, dx: defenseFormation[i][0], y: defenseFormation[i][1], side: 'def' })),
      ];
      this.el('fieldPlayers').innerHTML = formation
        .map((unit) => {
          const room = unit.dx < 0 ? x - FootballField.START : FootballField.END - x;
          const left = x + unit.dx * Math.min(1, room / 22);
          const label = `${unit.role}${unit.depth}`;
          return `<div class="field-player ${unit.side}" data-role="${unit.role}" style="left:${left}%;top:${unit.y}%" title="${unit.mon.name} · ${label}">${SpriteArt.frame(unit.mon)}<small>${label}</small></div>`;
        })
        .join('');
    }

    showFinal() {
      this.el('finalTitle').textContent =
        this.game.score.home > this.game.score.away
          ? 'Volts win!'
          : this.game.score.home < this.game.score.away
            ? 'Surf win!'
            : 'Final whistle';
      this.el('finalScore').textContent =
        `Viridian Volts ${this.game.score.home} · Cerulean Surf ${this.game.score.away}`;
      this.el('pauseOverlay').close();
      this.el('finalOverlay').showModal();
    }
  }

  new GameApp(window.POKEMON_DATA);
}
