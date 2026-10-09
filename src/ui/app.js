{
  const {
    POSITION_GROUPS,
    POSITIONS,
    SALARY_CAP,
    OFFENSE,
    DEFENSE,
    PASS_KINDS,
    DEAD_KINDS,
    Roster,
    FootballGame,
    BattleStage,
    SpriteArt,
    PlayDiagram,
    FootballField,
    PlayClock,
    MoveBook,
  } = window.Pokeballers;

  class GameApp {
    static STADIUMS = [
      {
        id: 'indigo',
        name: 'Indigo Stadium',
        location: 'Kanto · Indigo Plateau',
        description: 'The Indigo League venue. Green turf under the floodlights.',
      },
      {
        id: 'silver',
        name: 'Silver Stadium',
        location: 'Johto · Silver Town',
        description: 'The Silver Conference venue. A cool blue field beneath Mt. Silver.',
      },
    ];

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
      this.callClock = new PlayClock({
        onTick: (seconds) => this.renderCallClock(seconds),
        onExpire: () => this.expireCall(),
      });

      const range = Roster.salaryRange(pokemon);
      for (const side of ['home', 'away']) {
        this.el(`${side}Cap`).min = Math.ceil(range.min / 500) * 500;
        this.el(`${side}Cap`).max = Math.ceil(range.max / 500) * 500;
        this.el(`${side}Cap`).value = SALARY_CAP;
      }
      this.el('stadiumSelect').innerHTML = GameApp.STADIUMS.map(
        (stadium) => `<option value="${stadium.id}">${stadium.name} · ${stadium.location.split(' · ')[0]}</option>`,
      ).join('');
      this.renderStadium();

      document.addEventListener('error', (event) => SpriteArt.handleError(event), true);
      document.addEventListener('load', (event) => SpriteArt.handleLoad(event), true);
      this.el('fieldMarkings').innerHTML = FootballField.markings();
      this.bind();
      this.bindCoaching();
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
        this.showPanel('catalogTitle');
      });
      this.el('catalogList').addEventListener('click', (event) => {
        const card = event.target.closest('[data-pokemon]');
        if (!card) return;
        this.selectedPokemon = this.pokemon[Number(card.dataset.pokemon) - 1];
        this.renderCatalog();
        this.renderDetail();
        this.showPanel('playerDetail');
      });
      this.el('playerDetail').addEventListener('click', (event) => {
        const pick = event.target.closest('[data-pick]');
        if (pick && !pick.disabled) this.toggleMove(pick.dataset.pick);
      });
      this.el('searchInput').addEventListener('input', () => this.renderCatalog());
      this.el('typeFilter').addEventListener('change', () => this.renderCatalog());
      this.el('sortSelect').addEventListener('change', () => this.renderCatalog());
      this.el('noCap').addEventListener('change', () => this.renderBudget());
      this.el('stadiumSelect').addEventListener('change', () => this.renderStadium());
      for (const side of ['home', 'away']) {
        this.el(`${side}Cap`).addEventListener('input', () => this.renderBudget());
        this.el(side === 'home' ? 'generateHome' : 'generateAway').addEventListener('click', () => {
          this.generateTeams([side]);
        });
      }
      this.el('randomizeButton').addEventListener('click', () => {
        this.generateTeams(['home', 'away']);
      });
      this.el('kickoffButton').addEventListener('click', () => this.start());
      this.el('playbookSelect').addEventListener('change', () => this.renderPlays());
      this.el('playList').addEventListener('click', (event) => {
        const card = event.target.closest('[data-play]');
        if (!card || this.locked) return;
        const book = this.game.possession === 'home' ? OFFENSE : DEFENSE;
        this.choosePlay(book.find((play) => play.id === card.dataset.play));
      });
      this.el('snapButton').addEventListener('click', () => this.requestSnap());
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

    bindCoaching() {
      this.el('subRole').innerHTML = POSITION_GROUPS.map(
        (group) => `<option value="${group.code}">${group.code}</option>`,
      ).join('');
      this.el('scoutButton').addEventListener('click', () => {
        this.game.revealTell();
        this.callChosen = true;
        this.renderPlays();
      });
      this.el('tempoSelect').addEventListener('change', () => {
        this.callOptions.tempo = this.el('tempoSelect').value;
        this.renderCoaching();
      });
      this.el('laneSelect').addEventListener('change', () => {
        this.callOptions.lane = this.el('laneSelect').value;
        this.renderCoaching();
      });
      this.el('targetSelect').addEventListener('change', () => {
        const [role, depth] = this.el('targetSelect').value.split(':');
        this.callOptions.target = [role, Number(depth)];
        this.renderCoaching();
      });
      this.el('readSelect').addEventListener('change', () => {
        this.callOptions.read = this.el('readSelect').value;
        this.callOptions.target = null;
        this.renderCoaching();
        this.renderField();
      });
      this.el('finishSelect').addEventListener('change', () => {
        this.callOptions.sideline = this.el('finishSelect').value === 'sideline';
        this.renderCoaching();
      });
      this.el('timeoutButton').addEventListener('click', () => {
        this.game.timeout('home');
        this.renderGame();
      });
      this.el('abilityList').addEventListener('click', (event) => {
        const button = event.target.closest('[data-ability]');
        if (!button || button.disabled) return;
        const pending = this.game.phase.abilities.home;
        if (pending) this.game.cancelAbility('home');
        if (pending?.id !== button.dataset.ability)
          this.game.activateAbility('home', button.dataset.ability, this.playerPreview());
        this.callChosen = true;
        this.renderGame();
      });
      this.el('moveList').addEventListener('click', (event) => {
        const button = event.target.closest('[data-move]');
        if (!button || button.disabled) return;
        const actor = Number(button.dataset.actor);
        const pending = this.game.phase.moves.home;
        if (pending) this.game.cancelMove('home');
        if (pending?.actor.id !== actor || pending.move !== button.dataset.move)
          this.game.activateMove('home', actor, button.dataset.move, this.playerPreview());
        this.callChosen = true;
        this.renderGame();
      });
      this.el('autoRotate').addEventListener('change', () => {
        this.game.setAutoRotate('home', this.el('autoRotate').checked);
        this.renderGame();
      });
      this.el('subRole').addEventListener('change', () => this.renderSubstitutions(this.playerPreview()));
      this.el('subButton').addEventListener('click', () => {
        this.game.substitute(
          this.el('subRole').value,
          Number(this.el('subFrom').value),
          Number(this.el('subTo').value),
        );
        this.renderGame();
      });
      for (const id of ['subFrom', 'subTo'])
        this.el(id).addEventListener('change', () => {
          this.el('subButton').disabled = this.el('subFrom').value === this.el('subTo').value;
        });
    }

    choosePlay(play) {
      this.game.choosePlayerCall(play);
      this.callChosen = true;
      if (this.game.possession === 'home') {
        this.selectedOffense = play;
        this.resetOffenseOptions();
      } else this.selectedDefense = play;
      this.renderPlays();
      this.renderField();
    }

    resetOffenseOptions() {
      this.callOptions.target = null;
      this.callOptions.read = this.selectedOffense.id === 'read-option' ? 'keep' : 'pass';
    }

    playerPreview() {
      if (this.game.possession === 'away') return this.selectedDefense;
      return this.game.resolveOffense(this.selectedOffense, this.callOptions);
    }

    renderCoaching(preview = this.playerPreview()) {
      this.renderCallStatus();
      if (this.game.possession === 'home') this.renderDecisions(preview);
      this.renderClockCoaching(preview);
      this.renderAbilities(preview);
      this.renderMoves(preview);
      this.renderSubstitutions(preview);
      const roster = this.game.rosters.home;
      const mon = this.game.possession === 'home' ? roster.participants(preview).carrier : roster.player('DL');
      this.el('unitStatus').textContent =
        `${mon.name} · ${roster.energy(mon)} stamina · fatigue penalty −${roster.penalty(mon)}. Penalties start below ${Roster.FATIGUE_THRESHOLD}; bench recovery +${Roster.BENCH_RECOVERY} per play.`;
    }

    renderCallStatus() {
      const game = this.game;
      const phase = game.phase;
      this.el('coachControls').disabled = this.locked || this.paused || game.over || !phase;
      this.el('scoutButton').disabled = !phase || phase.inspected;
      this.el('scoutTell').textContent = game.tell();
      this.el('audibleStatus').textContent = phase?.audibled ? 'Audible used' : '1 audible after scouting';
      this.el('offenseDecisions').classList.toggle('hidden', game.possession !== 'home');
    }

    renderClockCoaching(play) {
      const game = this.game;
      const offense = game.possession === 'home';
      const runoff = offense ? game.runoff(play, this.callOptions.tempo) : 0;
      this.el('clockSituation').textContent = offense
        ? `${game.clockRunning ? 'Clock running' : 'Clock stopped'} · ${runoff}s simulated runoff before your next snap. Browsing does not use game time.`
        : `${game.clockRunning ? 'Clock running: a timeout prevents rival runoff.' : 'Clock stopped.'} Rival manages its own tempo.`;
      this.el('timeoutButton').disabled = !game.clockRunning || !game.timeouts.home;
      this.el('timeoutStatus').textContent = `Timeouts: you ${game.timeouts.home} · rival ${game.timeouts.away}`;
    }

    renderDecisions(play) {
      const base = this.selectedOffense;
      const passing = PASS_KINDS.includes(play.kind);
      this.el('targetWrap').classList.toggle('hidden', !passing);
      this.el('laneWrap').classList.toggle('hidden', play.kind !== 'run');
      this.el('finishWrap').classList.toggle('hidden', !passing && play.kind !== 'run');
      this.el('readWrap').classList.toggle('hidden', !['read-option', 'rpo-slant'].includes(base.id));
      const choices =
        base.id === 'read-option'
          ? [
              ['keep', 'QB keep'],
              ['handoff', 'RB handoff'],
            ]
          : [
              ['pass', 'Throw slant'],
              ['run', 'Hand off'],
            ];
      this.el('readSelect').innerHTML = choices
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join('');
      this.el('readSelect').value = this.callOptions.read || choices[0][0];
      const roster = this.game.rosters.home;
      const receivers = roster.lineup('offense', play).filter((slot) => ['WR', 'TE', 'RB'].includes(slot.role));
      this.el('targetSelect').innerHTML = receivers
        .map(
          (slot) =>
            `<option value="${slot.role}:${slot.depth - 1}">${slot.role}${slot.depth} · ${slot.mon.name} · ${roster.effectiveRating(slot.mon, slot.role)} fit</option>`,
        )
        .join('');
      this.el('targetSelect').value = `${play.carrier[0]}:${play.carrier[1]}`;
      this.el('tempoSelect').value = this.callOptions.tempo;
      this.el('laneSelect').value = this.callOptions.lane;
      this.el('finishSelect').value = this.callOptions.sideline ? 'sideline' : 'fight';
    }

    renderAbilities(play) {
      const game = this.game;
      const active = game.phase?.abilities.home;
      this.el('abilityBudget').textContent =
        `${game.charges.home - (active ? 1 : 0)} charges this half · 10 stamina each`;
      const abilities = DEAD_KINDS.includes(play.kind) ? [] : game.availableAbilities('home', play);
      this.el('abilityList').innerHTML =
        abilities
          .map(
            (ability) =>
              `<button type="button" class="ability-button ${active?.id === ability.id ? 'active' : ''}" data-ability="${ability.id}" aria-pressed="${active?.id === ability.id}" ${game.charges.home ? '' : 'disabled'}><b>${ability.name} · ${ability.actor.name}</b><span>${ability.detail}</span></button>`,
          )
          .join('') ||
        '<p>No eligible Electric, Steel, or Psychic player in this unit. Draft one to unlock an ability.</p>';
      this.el('coachNotice').textContent = active
        ? `${active.actor.name}: ${active.name} activated. Physical bonuses apply only while that player remains in the active unit; Burst follows its carrier.`
        : 'One ability per call. Both teams have two shared charges each half.';
    }

    badges(roster, mon) {
      return roster
        .badges(mon)
        .map((badge) => `<em class="status-badge">${badge}</em>`)
        .join('');
    }

    renderMoves(play) {
      const active = this.game.phase?.moves.home;
      this.el('moveBudget').textContent = active
        ? `${active.actor.name} uses ${MoveBook.get(active.move).display_name} at the snap. Click it again to cancel.`
        : 'One move per call · uses PP and stamina';
      this.el('moveList').innerHTML =
        this.game
          .availableMoves('home', play)
          .map(({ actor, move, pp }) => {
            const entry = MoveBook.get(move);
            const chosen = active?.actor.id === actor.id && active.move === move;
            return `<button type="button" class="ability-button move-button ${chosen ? 'active' : ''}" data-actor="${actor.id}" data-move="${move}" aria-pressed="${chosen}"><b>${entry.display_name} · ${actor.name}</b><span>${entry.type.toUpperCase()} ${entry.power ?? MoveBook.family(move).toUpperCase()} · ${pp}/${MoveBook.uses(move)} PP</span></button>`;
          })
          .join('') || '<p>No move is available for this call. Players need 20 stamina and PP.</p>';
    }

    renderSubstitutions(play) {
      const roster = this.game.rosters.home;
      const role = this.el('subRole').value;
      const group = POSITION_GROUPS.find((entry) => entry.code === role);
      const options = Array.from({ length: group.slots }, (_, depth) => {
        const mon = roster.player(role, depth);
        return `<option value="${depth}">${role}${depth + 1} · ${mon.name} · ${roster.energy(mon)} stamina</option>`;
      }).join('');
      this.el('subFrom').innerHTML = options;
      this.el('subTo').innerHTML = options;
      this.el('subTo').value = '1';
      this.el('subButton').disabled = this.el('subFrom').value === this.el('subTo').value;
      this.el('autoRotate').checked = this.game.autoRotate.home;
      const active = new Set(
        roster.lineup(this.game.possession === 'home' ? 'offense' : 'defense', play).map((slot) => slot.mon.id),
      );
      this.el('staminaList').innerHTML = POSITIONS.map((slot, index) => {
        const mon = roster.players[index];
        return `<div class="stamina-player ${active.has(mon.id) ? 'on-field' : ''}"><span>${slot.code}${slot.depth} · ${mon.name}${this.badges(roster, mon)}</span><span>${roster.effectiveRating(mon, slot.code)} FIT · ${roster.energy(mon)} STA${active.has(mon.id) ? ' · ON FIELD' : ' · BENCH'}</span></div>`;
      }).join('');
    }

    showPanel(id) {
      if (matchMedia('(max-width: 700px)').matches) this.el(id).scrollIntoView({ block: 'start', behavior: 'auto' });
    }

    creditCap(side) {
      return this.el('noCap').checked ? Infinity : Number(this.el(`${side}Cap`).value);
    }

    renderStadium() {
      const stadium = GameApp.STADIUMS.find((venue) => venue.id === this.el('stadiumSelect').value);
      document.body.dataset.stadium = stadium.id;
      this.el('stadiumDescription').textContent = stadium.description;
      this.el('stadiumTitle').textContent = stadium.name;
      this.el('stadiumRegion').textContent = stadium.location.toUpperCase();
    }

    get overBudget() {
      return ['home', 'away'].filter((side) => this[side].salary > this.creditCap(side));
    }

    generateTeams(sides) {
      for (const side of sides) this[side] = Roster.random(this.pokemon, this.creditCap(side));
      this.selectedPokemon = this.home.players[this.selectedSlot];
      this.renderDraft();
      if (this.overBudget.length === 0)
        this.el('draftMessage').textContent =
          sides.length === 2 ? 'Both teams generated. Ready for kickoff.' : 'Team generated. Ready for kickoff.';
    }

    renderDraft() {
      this.el('draftSlots').innerHTML = POSITIONS.map((position, index) => {
        const mon = this.home.players[index];
        const heading =
          position.depth === 1
            ? `<div class="depth-heading">${position.name.toUpperCase()} · ${POSITION_GROUPS.find((group) => group.code === position.code).slots} SLOTS</div>`
            : '';
        return `${heading}<button class="draft-slot ${index === this.selectedSlot ? 'active' : ''}" data-slot="${index}" aria-pressed="${index === this.selectedSlot}"><span class="position-tag">${position.code}${position.depth}</span>${SpriteArt.frame(mon)}<span><b>${mon.name}</b><small>${mon.types.join(' / ')}</small></span><span class="rating">${Roster.rating(mon, position.code)}</span></button>`;
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
      const rivals = ['QB', 'RB', 'WR']
        .map((role) => {
          const mon = this.away.player(role);
          return `<span title="${mon.name} · ${role}" aria-label="${mon.name} · ${role}">${SpriteArt.frame(mon)}</span>`;
        })
        .join('');
      this.el('rivalParty').innerHTML = rivals;
      this.el('matchRivalParty').innerHTML = rivals;
    }

    renderBudget() {
      for (const side of ['home', 'away']) {
        const cap = this.creditCap(side);
        const slider = this.el(`${side}Cap`);
        const salary = this[side].salary;
        const color = salary > cap ? 'var(--orange)' : 'var(--lime)';
        slider.disabled = this.el('noCap').checked;
        slider.setAttribute('aria-valuetext', `${Number(slider.value).toLocaleString()} credits`);
        this.el(`${side}CapValue`).textContent = Number.isFinite(cap) ? `${cap.toLocaleString()} CR` : 'NO CAP';
        this.el(`${side}Salary`).textContent = `${salary.toLocaleString()} CR`;
        this.el(`${side}Salary`).style.color = color;
        this.el(`${side}Meter`).style.width = `${Math.min(100, (salary / Number(slider.value)) * 100)}%`;
        this.el(`${side}Meter`).style.background = color;
      }
      const over = this.overBudget;
      this.el('draftMessage').textContent =
        over.length > 0
          ? `${over.includes('home') ? 'Your team' : 'Rival team'} is over cap. Generate a team, raise the cap, or choose free play.`
          : 'Ready for kickoff.';
      this.el('draftMessage').classList.toggle('error', over.length > 0);
      this.el('kickoffButton').disabled = over.length > 0;
      this.el('rosterCount').textContent = `${this.home.players.length} ready`;
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
                `<button class="catalog-card ${mon.id === this.selectedPokemon.id ? 'active' : ''}" data-pokemon="${mon.id}" aria-pressed="${mon.id === this.selectedPokemon.id}">${SpriteArt.frame(mon)}<span class="meta"><b>${mon.name}</b><small>#${String(mon.id).padStart(3, '0')} · ${mon.types.join(' / ')}</small></span><span class="fit">${Roster.rating(mon, position)}<small>${position} FIT</small></span></button>`,
            )
            .join('')
        : '<p class="catalog-empty">No Pokémon match those filters.</p>';
    }

    toggleMove(name) {
      const mon = this.selectedPokemon;
      const chosen = this.home.moveset(mon);
      this.home.setMoveset(mon, chosen.includes(name) ? chosen.filter((entry) => entry !== name) : [...chosen, name]);
      this.renderDetail();
    }

    renderMovePicker(mon) {
      const learnable = MoveBook.learnable(mon);
      if (!learnable.length) return '<div class="detail-label">MOVES</div><p class="detail-note">No moves</p>';
      const onTeam = this.home.players.includes(mon);
      const chosen = this.home.moveset(mon);
      const full = chosen.length >= MoveBook.MOVESET_SIZE;
      const rows = MoveBook.ranked(learnable, mon)
        .map((name) => {
          const move = MoveBook.get(name);
          const picked = onTeam && chosen.includes(name);
          const locked = !onTeam || (full && !picked);
          return `<button type="button" class="move-pick ${picked ? 'active' : ''}" data-pick="${name}" aria-pressed="${picked}" ${locked ? 'disabled' : ''}><b>${move.display_name}</b><span>${move.type.toUpperCase()} · ${MoveBook.family(name).toUpperCase()} · PWR ${move.power ?? '—'} · ACC ${move.accuracy ?? '—'} · ${MoveBook.uses(name)} PP</span></button>`;
        })
        .join('');
      const label = onTeam
        ? `MOVES · ${chosen.length}/${MoveBook.MOVESET_SIZE} CHOSEN`
        : 'LEARNABLE MOVES · ASSIGN TO CHOOSE';
      return `<div class="detail-label">${label}</div><div class="move-picker">${rows}</div>`;
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
        `<div class="detail-content"><div class="detail-hero">${SpriteArt.frame(mon, 'big')}<div><h3>${mon.name}</h3><p>#${String(mon.id).padStart(3, '0')} · ${mon.types.join(' / ')}</p></div></div><div class="detail-cost"><span>${position.code} FIT ${Roster.rating(mon, position.code)}</span><strong>${Roster.salary(mon)} CR</strong></div><div class="detail-label">BASE STATS · ${s.total} TOTAL</div>${stats.map(([name, value]) => `<div class="stat-row"><span>${name}</span><div class="stat-track"><i style="width:${Math.min(100, (value / 255) * 100)}%"></i></div><strong>${value}</strong></div>`).join('')}${this.renderMovePicker(mon)}<p class="detail-note">Base stats are from Pokémon Database. Position fit and salary are Pokéballers game ratings.</p><button id="assignButton" class="button primary" type="button">Put at ${position.code}${position.depth} ▶</button></div>`;
      this.el('assignButton').addEventListener('click', () => {
        this.home.assign(this.selectedSlot, mon);
        this.renderDraft();
        if (this.overBudget.length === 0)
          this.el('draftMessage').textContent = `${mon.name} assigned to ${position.code}.`;
        this.showPanel('draftSlots');
      });
    }

    start() {
      if (this.overBudget.length > 0) return;
      this.sequence += 1;
      clearTimeout(this.resultTimer);
      this.callClock.stop();
      this.el('resultBanner').classList.add('hidden');
      this.battle.cancel();
      this.game = new FootballGame(this.home, this.away, Number(this.el('quarterLength').value));
      this.selectedOffense = OFFENSE[0];
      this.selectedDefense = DEFENSE[0];
      this.callOptions = { tempo: 'normal', lane: 'middle', sideline: false };
      this.locked = false;
      this.paused = false;
      this.pendingSnap = null;
      this.el('snapButton').disabled = false;
      this.el('pauseButton').disabled = false;
      this.el('draftScreen').classList.add('hidden');
      this.el('gameScreen').classList.remove('hidden');
      this.el('pauseOverlay').close();
      this.el('finalOverlay').close();
      this.renderGame();
      this.beginCall();
      this.el('gameScreen').scrollIntoView({ block: 'start', behavior: 'auto' });
    }

    openDraft() {
      this.sequence += 1;
      clearTimeout(this.resultTimer);
      this.callClock.stop();
      this.renderCallClock(0);
      this.el('resultBanner').classList.add('hidden');
      this.battle.cancel();
      this.locked = false;
      this.pendingSnap = null;
      this.el('draftScreen').classList.remove('hidden');
      this.el('gameScreen').classList.add('hidden');
      this.el('finalOverlay').close();
      this.el('pauseOverlay').close();
      this.paused = false;
      this.el('pauseButton').disabled = true;
      this.renderDraft();
      this.el('draftScreen').scrollIntoView({ block: 'start', behavior: 'auto' });
    }

    pause() {
      if (!this.game || (this.game.over && !this.locked) || this.el('gameScreen').classList.contains('hidden')) return;
      this.paused = true;
      this.callClock.setPaused(true);
      this.battle.setPaused(true);
      this.el('pauseOverlay').showModal();
    }

    resume() {
      this.paused = false;
      this.callClock.setPaused(false);
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
      this.el('playbookSelect').querySelector('[value="special"]').disabled = this.game.down !== 4;
      if (this.game.down !== 4 && this.el('playbookSelect').value === 'special')
        this.el('playbookSelect').value = 'all';
      const group = this.el('playbookSelect').value;
      return OFFENSE.filter((play) => (group === 'all' || play.group === group) && this.game.isLegalCall(play));
    }

    beginCall() {
      this.callChosen = false;
      if (!this.game.isLegalCall(this.selectedOffense)) this.selectedOffense = OFFENSE[0];
      this.resetOffenseOptions();
      this.game.prepareCall(this.game.possession === 'home' ? this.selectedOffense : this.selectedDefense);
      this.el('callHint').removeAttribute('role');
      this.renderGame();
      this.callClock.start(this.game.playClockSeconds);
    }

    renderCallClock(seconds) {
      this.el('playClock').classList.toggle('hidden', !this.callClock.active);
      this.el('playClock').classList.toggle('urgent', seconds <= 10);
      this.el('playClockValue').textContent = String(seconds);
    }

    expireCall() {
      if (this.locked || this.paused || this.game.over) return;
      if (!this.callChosen) {
        const choices = this.playChoices().filter((play) => play.group !== 'clock');
        const play = choices[Math.floor(Math.random() * choices.length)];
        this.choosePlay(play);
      }
      this.requestSnap();
    }

    requestSnap() {
      const sequence = this.sequence;
      return this.snap().catch((error) => this.showError(error, sequence));
    }

    renderPlays(preview = this.playerPreview()) {
      const offense = this.game.possession === 'home';
      const choices = this.playChoices();
      this.el('callKicker').textContent = offense ? 'YOUR OFFENSE' : 'YOUR DEFENSE';
      this.el('callHeading').textContent = offense ? 'Call your play' : 'Call your coverage';
      this.el('playbookWrap').classList.toggle('hidden', !offense);
      const selected = offense ? this.selectedOffense : this.selectedDefense;
      this.el('callHint').textContent = this.locked
        ? 'Play in progress.'
        : this.callChosen
          ? `${selected.name} selected. Snap now or wait for the play clock.`
          : 'Pick a play. At zero, an unchosen call is picked at random.';
      this.el('snapButton').disabled = this.locked;
      this.el('snapButton').textContent = offense ? 'SNAP ▶' : 'LOCK IN ▶';
      this.el('playList').innerHTML = choices
        .map(
          (play) =>
            `<button class="play-card ${play.id === (offense ? this.selectedOffense : this.selectedDefense).id ? 'active' : ''}" data-play="${play.id}" ${this.locked || !this.game.canChoosePlayerCall(play) ? 'disabled' : ''} aria-pressed="${play.id === (offense ? this.selectedOffense : this.selectedDefense).id}"><span class="play-kind">${offense ? play.group.toUpperCase() : 'DEFENSE'}</span><strong>${play.name}</strong></button>`,
        )
        .join('');
      this.renderPlayInspector(offense ? preview : this.selectedDefense, offense);
      this.renderCoaching(preview);
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
        `<div class="inspector-diagram">${diagram}<div class="diagram-legend">${labels}</div></div><div class="inspector-copy">${notes}<div class="play-personnel">${mix}</div><div class="play-context">${this.playSituation(play, offense)}</div></div>`;
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
      this.callClock.stop();
      this.renderCallClock(0);
      this.locked = true;
      this.el('snapButton').disabled = true;
      this.el('callHint').textContent = 'Play in progress.';
      this.el('field').scrollIntoView({ block: 'center', behavior: 'auto' });
      const sequence = this.sequence;
      const game = this.game;
      const { offense: call, defense } = game.phase;
      const options = game.possession === 'home' ? this.callOptions : game.cpuOptions(call, defense);
      const beforeSeconds = game.seconds;
      this.el('coachControls').disabled = true;
      const result = game.snap(call, defense, options);
      const offense = result.offense;
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
      this.resetOffenseOptions();
      this.renderGame();
      const finish = () => {
        if (sequence !== this.sequence) return;
        banner.classList.add('hidden');
        this.locked = false;
        if (this.game.over) this.showFinal();
        else this.beginCall();
      };
      this.resultTimer = setTimeout(() => (this.paused ? (this.pendingSnap = finish) : finish()), 900);
    }

    showError(error, sequence) {
      console.error(error);
      if (sequence !== this.sequence) return;
      this.battle.cancel();
      this.locked = false;
      this.el('snapButton').disabled = false;
      this.resetOffenseOptions();
      this.renderGame();
      if (!this.game.over) this.beginCall();
      this.el('callHint').textContent = `Play animation failed: ${error.message}. The drive log contains the result.`;
      this.el('callHint').setAttribute('role', 'alert');
      if (this.game.over) this.showFinal();
    }

    renderGame() {
      const game = this.game;
      this.el('homeScore').textContent = String(game.score.home);
      this.el('awayScore').textContent = String(game.score.away);
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
      this.el('rivalReaction').textContent =
        game.score.home > game.score.away
          ? '“Fine. Make me earn it.”'
          : game.down === 4
            ? '“Fourth down. What have you got?”'
            : game.possession === 'away'
              ? '“My turn. Keep up.”'
              : '“Your call.”';
      this.el('playLog').innerHTML = game.log
        .slice(0, 8)
        .map((line) => `<p>${line}</p>`)
        .join('');
      const preview = this.playerPreview();
      this.renderField(preview);
      this.renderPlays(preview);
    }

    renderField(preview = this.playerPreview()) {
      const game = this.game;
      const x = FootballField.position(game.spot);
      this.el('field').dataset.weather = game.field.weather?.kind ?? '';
      this.el('weatherLabel').textContent = game.field.weather
        ? `${MoveBook.get(game.field.weather.kind).display_name.toUpperCase()} · ${game.field.weather.snaps}`
        : '';
      this.el('scrimmageLine').style.left = `${x}%`;
      this.el('firstDownLine').style.left = `${FootballField.position(game.spot + game.toGo)}%`;
      this.el('football').style.left = `${x}%`;
      const offenseCall = game.possession === 'home' ? preview : OFFENSE[0];
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
          return `<div class="field-player ${unit.side}" data-role="${unit.role}" style="left:${left}%;top:${unit.y}%" title="${unit.mon.name} · ${label}">${SpriteArt.frame(unit.mon)}<small>${label}</small>${this.badges(game.rosters[unit.side === 'off' ? game.possession : game.opponent()], unit.mon)}</div>`;
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
