{
  const { OFFENSE, DEFENSE, PASS_KINDS, DEAD_KINDS } =
    typeof module !== 'undefined' ? require('./playbook.js') : window.Pokeballers;

  const { MoveBook } = typeof module !== 'undefined' ? require('./moves.js') : window.Pokeballers;

  const { PlayMatchup } = typeof module !== 'undefined' ? require('./matchup.js') : window.Pokeballers;

  class FootballGame {
    static TEMPOS = { normal: 15, hurry: 3, chew: 30 };
    static ABILITY_CHARGES = 2;
    static FIELD_SNAPS = 5;
    static SPIKES_COST = 10;
    static SAND_DRAIN = 3;
    static SAND_IMMUNE = ['Rock', 'Ground', 'Steel'];
    static PROTECT_YARDS = 5;
    static WEATHERS = ['rain-dance', 'sunny-day', 'sandstorm'];
    static FIELD_NOTES = {
      reflect: 'Reflect shields the team from runs and physical strikes.',
      'light-screen': 'Light Screen shields the team from passes and special strikes.',
      safeguard: 'Safeguard protects the team from ailments.',
      mist: 'Mist protects the team from stat drops.',
      haze: 'All stat changes were eliminated!',
      'rain-dance': 'It started to rain!',
      'sunny-day': 'The sunlight turned harsh!',
      sandstorm: 'A sandstorm kicked up!',
      spikes: 'Spikes were scattered around the rival side!',
    };
    static HEAL = 50;
    static CPU_HEAL_BELOW = 60;
    static CONFUSION_CHANCE = 1 / 3;
    static AILMENT_NOTES = {
      paralysis: 'is paralyzed',
      sleep: 'fell asleep',
      freeze: 'was frozen solid',
      burn: 'was burned',
      poison: 'was poisoned',
      confusion: 'became confused',
      trap: 'was trapped',
      'leech-seed': 'was seeded',
    };
    static MOVE_MIN_STAMINA = 20;
    static CPU_MOVE_CHANCE = 0.4;
    static CRIT_CHANCE = 0.25;
    static CLASH_BAND = 2;
    static CLASH_MEMORY = 5;
    static CLASH_COUNTER_WEIGHT = 0.5;
    // Base yards of a carrier win; lower values keep clash scoring close to a game without clashes.
    static CLASH_WIN_YARDS = 0;
    // Fumble odds added by a Big Hit win and by a Strip; high values make clashes inflate turnovers.
    static CLASH_FUMBLE = { heavy: 0.03, strip: 0.04 };
    // Chance a big carrier win breaks away for a touchdown.
    static BREAKAWAY_CHANCE = 0.01;
    static CLASH = {
      actions: {
        offense: [
          { id: 'juke', name: 'Juke', stat: 'speed' },
          { id: 'truck', name: 'Truck', stat: 'attack' },
          { id: 'cover', name: 'Cover Up', stat: 'hp' },
        ],
        defense: [
          { id: 'wrap', name: 'Wrap Up', stat: 'defense' },
          { id: 'hit', name: 'Big Hit', stat: 'attack' },
          { id: 'strip', name: 'Strip', stat: 'speed' },
        ],
      },
      outcomes: {
        juke: { wrap: 'lose', hit: 'big', strip: 'win' },
        truck: { wrap: 'win', hit: 'heavy', strip: 'win' },
        cover: { wrap: 'even', hit: 'even', strip: 'safe' },
      },
      counters: { juke: 'wrap', truck: 'hit', cover: 'wrap', wrap: 'truck', hit: 'juke', strip: 'cover' },
    };
    static ABILITIES = [
      {
        id: 'burst',
        type: 'Electric',
        name: 'Electric Burst',
        detail: '+12 escape/separation on offense; +12 rush on defense.',
      },
      {
        id: 'shield',
        type: 'Steel',
        name: 'Steel Shield',
        detail: '+18 protection on offense; +18 tackling on defense.',
      },
      { id: 'read', type: 'Psychic', name: 'Psychic Read', detail: 'Reveal the committed rival call before you snap.' },
    ];
    constructor(home, away, quarterSeconds, random = Math.random) {
      this.rosters = { home: home.copy(), away: away.copy() };
      this.phase = null;
      this.clockRunning = false;
      this.timeouts = { home: 3, away: 3 };
      this.charges = { home: FootballGame.ABILITY_CHARGES, away: FootballGame.ABILITY_CHARGES };
      this.pp = { home: new Map(), away: new Map() };
      this.cpuMoveChance = FootballGame.CPU_MOVE_CHANCE;
      this.field = { home: {}, away: {}, weather: null };
      this.autoRotate = { home: false, away: true };
      this.quarterSeconds = quarterSeconds;
      this.random = random;
      this.quarter = 1;
      this.seconds = quarterSeconds;
      this.playClockSeconds = 25;
      this.score = { home: 0, away: 0 };
      this.possession = 'home';
      this.spot = 25;
      this.down = 1;
      this.toGo = 10;
      this.drive = 1;
      this.over = false;
      this.history = [];
      this.pending = null;
      this.clashes = true;
      this.clashMemory = { offense: [], defense: [] };
      this.log = ['Kickoff! Volts start at their own 25.'];
    }

    opponent(side = this.possession) {
      return side === 'home' ? 'away' : 'home';
    }

    get cpuClock() {
      return {
        deficit: this.score.home - this.score.away,
        late: this.quarter >= 4 && this.seconds < 90,
        hurry: (this.quarter === 2 || this.quarter >= 4) && this.seconds < 120,
      };
    }

    fourthDownCall() {
      const { deficit, late } = this.cpuClock;
      const shortConversion = this.toGo <= 2 && this.spot < 95;
      const mustScoreTouchdown = deficit > 3 && (late || shortConversion);
      if (117 - this.spot <= 55 && !mustScoreTouchdown) return 'field-goal';
      if (this.spot < 48 && this.toGo > 2 && !(late && deficit > 0)) return 'punt';
      return null;
    }

    chooseCpuOffense() {
      const { late, deficit } = this.cpuClock;
      if (late && deficit < 0 && this.clockRunning && this.seconds <= 30 && !this.timeouts.home)
        return OFFENSE.find((play) => play.id === 'kneel');
      const special = this.down === 4 ? this.fourthDownCall() : null;
      if (special) return OFFENSE.find((play) => play.id === special);
      const ranked = OFFENSE.filter((play) => play.group !== 'special' && !['spike', 'kneel'].includes(play.kind))
        .map((play) => ({
          play,
          score:
            this.offenseSituationScore(play) +
            this.offenseClockScore(play) +
            this.offenseHistoryScore(play) +
            this.random() * 7,
        }))
        .sort((a, b) => b.score - a.score);
      return ranked[0].play;
    }

    offenseSituationScore(play) {
      const runBias = this.toGo <= 3 ? 4 : this.toGo >= 8 && this.down >= 3 ? -5 : 1;
      const depth = { deep: 3, medium: 2, short: 1 }[play.kind] || 0;
      let score = play.kind === 'run' ? runBias : depth * (this.toGo >= 8 ? 2 : 0);
      if (this.spot >= 80 && play.kind === 'deep') score -= 7;
      if (this.down === 4) score += this.fourthDownScore(play);
      return score;
    }

    fourthDownScore(play) {
      if (play.kind === 'run' && this.toGo > 3) return -8;
      if (play.kind === 'short' && this.toGo > 8) return -5;
      return 0;
    }

    offenseClockScore(play) {
      const { deficit, late, hurry } = this.cpuClock;
      const clockBias = hurry && deficit > 0 ? -5 : late && deficit < 0 ? 3 : 0;
      let score = play.kind === 'run' ? clockBias : -clockBias;
      if (late && deficit > 0 && play.kind === 'deep') score += 4;
      return score;
    }

    offenseHistoryScore(play) {
      const { deficit, late } = this.cpuClock;
      const team = this.rosters.away;
      let score = ((team.rating('QB') - team.rating('RB')) / 12) * (play.kind === 'run' ? -1 : 1);
      if (play.id === 'hail-mary' && !(late && deficit > 0) && this.toGo < 20) score -= 8;
      if (play.id === 'qb-sneak' && this.toGo > 2) score -= 6;
      if (play.kind === 'trick' && this.down >= 3) score -= 3;
      return score + this.tendencyScore(play);
    }

    tendencyScore(play) {
      const recent = this.history.filter((call) => call.side === 'away').slice(-6);
      const defenses = recent.map((call) => DEFENSE.find((scheme) => scheme.id === call.defenseId)).filter(Boolean);
      const previous = this.history.at(-1);
      let score = previous?.side === 'away' && previous.id === play.id ? -3 : 0;
      if (defenses.length >= 3)
        score +=
          defenses.filter((scheme) => scheme.weakness === play.kind).length -
          defenses.filter((scheme) => scheme.strengths.includes(play.kind)).length;
      return score;
    }

    chooseCpuDefense() {
      const ranked = DEFENSE.map((play) => ({
        play,
        score:
          this.defenseSituationScore(play) +
          this.defenseHistoryScore(play) +
          this.defenseClockScore(play) +
          this.random() * 7,
      })).sort((a, b) => b.score - a.score);
      return ranked[0].play;
    }

    defenseSituationScore(play) {
      const expected = this.toGo <= 3 ? 'run' : this.toGo >= 8 && this.down >= 3 ? 'deep' : 'medium';
      let score = play.strengths.includes(expected) ? 4 : play.weakness === expected ? -3 : 0;
      if (this.spot >= 90 && ['goal-line', 'run-stuff', 'robber', 'red-zone-bracket'].includes(play.id)) score += 4;
      if (this.toGo >= 10 && ['nickel', 'cover-4', 'zone-blitz', 'dime', 'quarters-match'].includes(play.id))
        score += 2;
      return score;
    }

    defenseHistoryScore(play) {
      const recent = this.history.filter((call) => call.side === 'home').slice(-8);
      const runs = recent.filter((call) => call.kind === 'run').length;
      const passes = recent.length - runs;
      let score = 0;
      if (recent.length >= 3 && Math.abs(runs - passes) >= 2)
        score += play.strengths.includes(runs > passes ? 'run' : 'short') ? 6 : 0;
      if (recent.at(-1)?.id === 'screen-pass' && play.id === 'robber') score += 2;
      return score;
    }

    defenseClockScore(play) {
      const late = this.quarter >= 4 && this.seconds < 120;
      if (!late) return 0;
      const homeDeficit = this.score.away - this.score.home;
      if (homeDeficit > 0 && ['cover-4', 'prevent', 'cover-6'].includes(play.id)) return 3;
      if (homeDeficit < 0 && ['blitz', 'zone-blitz', 'fire-zone', 'cover-0', 'press'].includes(play.id)) return 3;
      return 0;
    }

    prepareCall(playerCall) {
      if (this.over) throw new Error('The game has ended.');
      if (this.pending) throw new Error('Resolve the clash first.');
      if (this.phase) return this.phase;
      if (!this.isLegalCall(playerCall)) throw new Error('That call is not legal now');
      this.cpuTimeout();
      const offense = this.possession === 'away' ? this.chooseCpuOffense() : playerCall;
      const defense = this.possession === 'home' ? this.chooseCpuDefense() : playerCall;
      this.rotateTeam('away', offense, defense);
      const tell = this.formationTell(defense);
      this.phase = {
        side: this.possession,
        offense,
        defense,
        inspected: false,
        audibled: false,
        tell,
        abilities: {},
        moves: {},
      };
      this.rotateTeam('home', offense, defense);
      return this.phase;
    }

    rotateTeam(side, offense, defense) {
      const { kind, play } = this.unitFor(side, offense, defense);
      this.settleUnit(side, kind, play);
    }

    unitFor(side, offense, defense) {
      const kind = side === this.possession ? 'offense' : 'defense';
      return { kind, play: kind === 'offense' ? offense : defense };
    }

    // Seating undoes a Roar's effect rather than sending a player in, so it never pays Spikes.
    settleUnit(side, kind, play) {
      this.rosters[side].seatBenched(kind, play);
      if (this.autoRotate[side]) this.rotateUnit(side, kind, play);
    }

    // A snap with no prepared call missed the call-time seating, so it seats here; seating never pays Spikes.
    seatUnprepared(offense, defense) {
      if (this.phase) return;
      for (const side of ['home', 'away']) {
        const { kind, play } = this.unitFor(side, offense, defense);
        this.rosters[side].seatBenched(kind, play);
      }
    }

    setAutoRotate(side, enabled) {
      this.autoRotate[side] = enabled;
      if (this.phase) this.rotateTeam(side, this.phase.offense, this.phase.defense);
    }

    formationTell(defense) {
      if (this.random() < 0.2)
        return ['Crowded box', 'Two deep safeties', 'Possible pressure'][Math.floor(this.random() * 3)];
      return this.defensiveShell(defense);
    }

    defensiveShell(defense) {
      if (PlayMatchup.PRESSURE.includes(defense.id)) return 'Possible pressure';
      if (defense.strengths.includes('run')) return 'Crowded box';
      if (defense.strengths.includes('deep')) return 'Two deep safeties';
      return 'Tight underneath coverage';
    }

    canChoosePlayerCall(play) {
      if (!this.phase || this.over || !this.isLegalCall(play)) return false;
      const key = this.possession === 'home' ? 'offense' : 'defense';
      const book = this.possession === 'home' ? OFFENSE : DEFENSE;
      if (!book.includes(play)) return false;
      return this.phase[key].id === play.id || !(this.phase.inspected && this.phase.audibled);
    }

    choosePlayerCall(play) {
      if (!this.canChoosePlayerCall(play)) throw new Error('That call is unavailable: one audible after scouting');
      const key = this.possession === 'home' ? 'offense' : 'defense';
      if (this.phase[key].id === play.id) return;
      if (this.phase.inspected) this.phase.audibled = true;
      this.phase[key] = play;
      delete this.phase.moves.home;
      if (!this.phase.abilities.home?.paid) delete this.phase.abilities.home;
      this.settleUnit('home', key, play);
    }

    substitute(role, first, second) {
      if (!this.phase || this.over) throw new Error('Substitutions require an active call');
      const kind = this.possession === 'home' ? 'offense' : 'defense';
      this.changeUnit('home', kind, this.phase[kind], () => this.rosters.home.substitute(role, first, second));
    }

    rotateUnit(side, kind, play) {
      this.changeUnit(side, kind, play, () => this.rosters[side].rotate(kind, play));
    }

    // Manual swaps, rotation, and Roar run here so Spikes charge each entrant once; seating a benched player is exempt.
    changeUnit(side, kind, play, change) {
      const roster = this.rosters[side];
      if (!this.field[side].spikes) return change();
      const before = new Set(roster.lineup(kind, play).map((slot) => slot.mon.id));
      const result = change();
      for (const slot of roster.lineup(kind, play)) {
        if (!before.has(slot.mon.id)) roster.spend(slot.mon, FootballGame.SPIKES_COST);
      }
      return result;
    }

    isLegalCall(play) {
      return play.group !== 'special' || this.down === 4;
    }

    revealTell() {
      if (!this.phase || this.over) throw new Error('No active call');
      this.phase.inspected = true;
      return this.tell();
    }

    tell() {
      if (!this.phase?.inspected) return 'Scout the formation, then make one audible.';
      const revealed = Object.values(this.phase.abilities).some(
        (ability) => ability.id === 'read' && ability.side === 'home',
      );
      const rival = this.possession === 'home' ? this.phase.defense : this.phase.offense;
      if (revealed) return `Psychic read: ${rival.name}.`;
      if (this.possession === 'home') return `${this.phase.tell}. Coverage may be disguised.`;
      return `Rival personnel: ${this.phase.offense.personnel || '11'}. The exact call is hidden.`;
    }

    availableAbilities(side, play) {
      if (DEAD_KINDS.includes(play.kind)) return [];
      const offense = side === this.possession;
      const roster = this.rosters[side];
      const lineup = roster.lineup(offense ? 'offense' : 'defense', play);
      return FootballGame.ABILITIES.map((ability) => ({
        ...ability,
        actor: this.abilityActor(roster, lineup, play, ability, offense),
      })).filter((ability) => ability.actor && roster.energy(ability.actor) >= 20);
    }

    abilityActor(roster, lineup, play, ability, offense) {
      if (ability.id === 'burst' && offense) {
        const carrier = roster.player(...play.carrier);
        return carrier.types.includes(ability.type) ? carrier : null;
      }
      const roles = offense
        ? ability.id === 'read'
          ? ['QB']
          : ['OL', 'TE']
        : ability.id === 'read'
          ? ['CB', 'S', 'LB']
          : ['DL', 'LB'];
      return lineup.find((slot) => roles.includes(slot.role) && slot.mon.types.includes(ability.type))?.mon;
    }

    activateAbility(side, id, play) {
      if (!this.phase || this.over || this.phase.abilities[side]) throw new Error('One ability per team per call');
      if (!this.charges[side]) throw new Error('No ability charges left this half');
      const committed = side === this.possession ? this.phase.offense : this.phase.defense;
      if (committed.id !== play.id) throw new Error('Ability must use the committed call');
      const ability = this.availableAbilities(side, play).find((entry) => entry.id === id);
      if (!ability) throw new Error('Ability is unavailable for this call');
      this.phase.abilities[side] = { ...ability, side, paid: id === 'read' };
      if (id === 'read') {
        this.payAbility(this.phase.abilities[side]);
        if (side === 'home') this.revealTell();
      }
      return ability;
    }

    // The reveal happens at activation, so Psychic Read is paid then and cannot be withdrawn.
    payAbility(ability) {
      this.charges[ability.side] -= 1;
      this.rosters[ability.side].spend(ability.actor, 10);
      this.log.unshift(
        `${ability.actor.name} activates ${ability.name}. ${this.charges[ability.side]} charges remain.`,
      );
    }

    commitChoices(resolved, defense) {
      if (DEAD_KINDS.includes(resolved.kind)) return this.dropPicks(() => false);
      this.activateCpuAbility(resolved, defense);
      this.activateCpuMove(resolved, defense);
      this.dropStalePicks(resolved, defense);
      this.spendAbilities();
      this.spendMoves();
    }

    // Psychic Read is the only pick paid before the snap, so it never drops; a dead play keeps no other pick.
    dropPicks(keep) {
      for (const key of ['moves', 'abilities'])
        for (const [side, pick] of Object.entries(this.phase[key]))
          if (!pick.paid && !keep(key, side, pick)) this.dropPick(key, side);
    }

    dropPick(key, side) {
      const pick = this.phase[key][side];
      delete this.phase[key][side];
      const name = key === 'moves' ? MoveBook.get(pick.move).display_name : pick.name;
      this.log.unshift(`${pick.actor.name} could not use ${name}.`);
    }

    // A call, target, or substitution changed after the pick can leave the actor without a legal role.
    dropStalePicks(resolved, defense) {
      this.dropPicks((key, side, pick) => {
        const play = side === this.possession ? resolved : defense;
        const options = key === 'moves' ? this.availableMoves(side, play) : this.availableAbilities(side, play);
        return options.some(
          (entry) => entry.actor.id === pick.actor.id && (entry.move ?? entry.id) === (pick.move ?? pick.id),
        );
      });
    }

    spendMoves() {
      for (const pick of Object.values(this.phase.moves)) {
        this.pp[pick.side].set(`${pick.actor.id}:${pick.move}`, this.ppLeft(pick.side, pick.actor, pick.move) - 1);
        this.rosters[pick.side].spend(pick.actor, MoveBook.cost(pick.move));
      }
    }

    // Charges and stamina are paid at the snap so an expired period or a rejected snap costs nothing.
    spendAbilities() {
      for (const ability of Object.values(this.phase.abilities)) if (!ability.paid) this.payAbility(ability);
    }

    activateCpuAbility(resolved, defense) {
      if (!this.charges.away || this.phase.abilities.away || this.random() >= 0.35) return;
      const play = this.possession === 'away' ? resolved : defense;
      const ability = this.availableAbilities('away', play).find((entry) => entry.id !== 'read');
      if (ability) this.activateAbility('away', ability.id, play);
    }

    ppLeft(side, mon, name) {
      return this.pp[side].get(`${mon.id}:${name}`) ?? MoveBook.uses(name);
    }

    moveActors(roster, lineup, play, offense) {
      if (!offense) return lineup.map((slot) => slot.mon);
      const actors = [roster.player(...play.carrier)];
      if (PASS_KINDS.includes(play.kind)) actors.push(roster.player(...play.passer));
      actors.push(...lineup.filter((slot) => ['OL', 'TE'].includes(slot.role)).map((slot) => slot.mon));
      return [...new Map(actors.map((mon) => [mon.id, mon])).values()];
    }

    availableMoves(side, play) {
      if (DEAD_KINDS.includes(play.kind)) return [];
      const offense = side === this.possession;
      const roster = this.rosters[side];
      const lineup = roster.lineup(offense ? 'offense' : 'defense', play);
      return this.moveActors(roster, lineup, play, offense)
        .filter((mon) => roster.energy(mon) >= FootballGame.MOVE_MIN_STAMINA)
        .flatMap((actor) =>
          roster
            .moveset(actor)
            .map((move) => ({ actor, move, pp: this.ppLeft(side, actor, move) }))
            .filter((entry) => entry.pp > 0),
        );
    }

    activateMove(side, actorId, name, play) {
      if (!this.phase || this.over || this.phase.moves[side]) throw new Error('One move per team per call');
      const committed = side === this.possession ? this.phase.offense : this.phase.defense;
      if (committed.id !== play.id) throw new Error('Move must use the committed call');
      const entry = this.availableMoves(side, play).find((item) => item.actor.id === actorId && item.move === name);
      if (!entry) throw new Error('Move is unavailable for this call');
      this.phase.moves[side] = { side, actor: entry.actor, move: name };
      return entry;
    }

    activateCpuMove(resolved, defense) {
      this.fireCpuMove('away', this.possession === 'away' ? resolved : defense);
    }

    // The CPU rule for either side: on `cpuMoveChance` of calls, fire the best-ranked eligible move.
    fireCpuMove(side, play) {
      if (this.phase.moves[side] || this.random() >= this.cpuMoveChance) return;
      const options = this.availableMoves(side, play).filter((entry) => this.cpuWants(side, entry));
      const families = [...new Set(options.map((entry) => MoveBook.family(entry.move)))];
      if (!families.length) return;
      const weight = (family) => (family === 'strike' ? 2 : 1);
      let roll = this.random() * families.reduce((sum, family) => sum + weight(family), 0);
      const family = families.find((entry) => (roll -= weight(entry)) < 0) ?? families.at(-1);
      const best = options
        .filter((entry) => MoveBook.family(entry.move) === family)
        .sort((a, b) => MoveBook.rank(b.move, b.actor) - MoveBook.rank(a.move, a.actor))[0];
      this.activateMove(side, best.actor.id, best.move, play);
    }

    // The CPU skips a field condition that is already up and a heal for a player with stamina to spare.
    cpuWants(side, { actor, move }) {
      const family = MoveBook.family(move);
      if (family === 'heal') return this.rosters[side].energy(actor) < FootballGame.CPU_HEAL_BELOW;
      if (family !== 'field') return true;
      if (FootballGame.WEATHERS.includes(move)) return this.field.weather?.kind !== move;
      if (move === 'spikes') return !this.field[this.opponent(side)].spikes;
      if (move === 'haze') return this.rosters[this.opponent(side)].stageTotal() > this.rosters[side].stageTotal();
      return !this.field[side][move];
    }

    // Nothing is paid before the snap, so a pending pick can be withdrawn.
    cancelMove(side) {
      delete this.phase.moves[side];
    }

    cancelAbility(side) {
      if (this.phase.abilities[side]?.paid) throw new Error('Psychic Read is already paid');
      delete this.phase.abilities[side];
    }

    timeout(side) {
      if (this.over || !this.clockRunning || !this.timeouts[side]) throw new Error('A timeout is not available');
      this.timeouts[side] -= 1;
      this.clockRunning = false;
      for (const roster of Object.values(this.rosters)) roster.recover(6);
      this.log.unshift(`${side === 'home' ? 'Volts' : 'Surf'} timeout. ${this.timeouts[side]} remain this half.`);
    }

    cpuTimeout() {
      const deficit = this.score.home - this.score.away;
      if (!this.clockRunning || !this.timeouts.away || this.quarter % 2 !== 0 || this.seconds > 45) return;
      if (deficit > 0) this.timeout('away');
    }

    cpuOptions(offense, defense) {
      const { deficit, hurry, late } = this.cpuClock;
      const tempo = hurry && deficit > 0 ? 'hurry' : late && deficit < 0 ? 'chew' : 'normal';
      const read = defense.strengths.includes('run') ? 'pass' : 'run';
      const option = ['spy', 'edge-contain', 'contain-man'].includes(defense.id) ? 'handoff' : 'keep';
      const receivers = this.rosters.away
        .lineup('offense', offense)
        .filter((slot) => ['WR', 'TE', 'RB'].includes(slot.role));
      receivers.sort(
        (a, b) => this.rosters.away.effectiveRating(b.mon, b.role) - this.rosters.away.effectiveRating(a.mon, a.role),
      );
      return {
        tempo,
        read: offense.id === 'read-option' ? option : read,
        sideline: hurry && deficit > 0,
        target: [receivers[0].role, receivers[0].depth - 1],
      };
    }

    optionPlay(offense, read) {
      if (offense.id === 'read-option') {
        if (!['keep', 'handoff'].includes(read)) throw new Error('Choose handoff or keep');
        return { ...offense, carrier: [read === 'handoff' ? 'RB' : 'QB', 0], name: `${offense.name} (${read})` };
      }
      if (offense.id !== 'rpo-slant') return offense;
      if (!['run', 'pass'].includes(read)) throw new Error('Choose run or pass');
      return read === 'run'
        ? { ...offense, kind: 'run', carrier: ['RB', 0], base: 4, name: `${offense.name} (run)` }
        : offense;
    }

    resolveOffense(offense, options) {
      const defaultRead = offense.id === 'read-option' ? 'keep' : 'pass';
      const resolved = this.optionPlay(offense, options.read || defaultRead);
      if (!PASS_KINDS.includes(resolved.kind) || !options.target) return resolved;
      const [role, depth] = options.target;
      const target = this.rosters[this.possession]
        .lineup('offense', resolved)
        .find((slot) => slot.role === role && slot.depth === depth + 1);
      if (!target || !['WR', 'TE', 'RB'].includes(role)) throw new Error('Choose a receiver in this personnel package');
      return { ...resolved, carrier: [role, depth] };
    }

    snap(offense, defense, options = {}) {
      if (this.over) throw new Error('The game has ended.');
      if (this.pending) throw new Error('Resolve the clash first.');
      this.validateSnap(offense, defense, options);
      const resolved = this.resolveOffense(offense, options);
      this.seatUnprepared(resolved, defense);
      const prior = {
        side: this.possession,
        drive: this.drive,
        quarter: this.quarter,
        seconds: this.seconds,
        score: this.score.home + this.score.away,
      };
      const runoff = this.runoff(resolved, options.tempo || 'normal');
      if (runoff >= this.seconds) return this.expireBeforeSnap(resolved, defense, runoff);
      this.seconds -= runoff;
      if (this.phase) this.commitChoices(resolved, defense);
      const result = this.resolvePlay(resolved, defense, options);
      if (result.clash) return this.holdForClash(result, { offense: resolved, defense, options, prior, runoff });
      return this.completeSnap(result, resolved, defense, prior, runoff, options);
    }

    completeSnap(result, offense, defense, prior, runoff, options) {
      this.stamp(result, offense, runoff);
      this.finishSnap(offense, defense, result, prior, options);
      return result;
    }

    // The fields both a held clash result and a finished result carry for the stage.
    stamp(result, offense, runoff) {
      result.moves ??= [];
      result.weather = this.field.weather?.kind ?? '';
      result.offense = offense;
      result.runoff = runoff;
      return result;
    }

    runoff(offense, tempo) {
      return this.clockRunning && offense.kind !== 'spike' ? FootballGame.TEMPOS[tempo] : 0;
    }

    validateSnap(offense, defense, options) {
      if (options.lane && !['left', 'middle', 'right'].includes(options.lane)) throw new Error('Unknown attack lane');
      if (!FootballGame.TEMPOS[options.tempo || 'normal']) throw new Error('Unknown tempo');
      if (!this.isLegalCall(offense)) throw new Error('Special teams calls require fourth down');
      if (this.phase && (this.phase.offense.id !== offense.id || this.phase.defense.id !== defense.id))
        throw new Error('Snap must use the committed calls');
    }

    resolvePlay(offense, defense, options) {
      const side = this.possession;
      if (offense.kind === 'punt') return this.specialResult(offense, defense, this.punt(), side);
      if (offense.kind === 'kick') return this.specialResult(offense, defense, this.fieldGoal(), side);
      if (offense.kind === 'spike')
        return this.specialResult(offense, defense, this.tackle(0, 1, 'SPIKE!', 'spike'), side);
      if (offense.kind === 'kneel')
        return this.specialResult(offense, defense, this.tackle(-1, 2, 'KNEEL.', 'kneel'), side);
      return this.scrimmage(offense, defense, options);
    }

    specialResult(offense, defense, result, side = this.possession) {
      const attack = this.rosters[side];
      const matchup = new PlayMatchup(attack, this.rosters[this.opponent(side)], offense, defense);
      result.participants = {
        carrier: matchup.carrier,
        support: matchup.blocker,
        defender: matchup.rusher,
        help: matchup.help,
      };
      return result;
    }

    expireBeforeSnap(offense, defense, runoff) {
      const side = this.possession;
      const elapsed = this.seconds;
      const result = this.specialResult(offense, defense, {
        yards: 0,
        seconds: elapsed,
        runoff: elapsed,
        outcome: 'clock-expired',
        message: 'The clock expires before the snap.',
        weather: this.field.weather?.kind ?? '',
        moves: [],
        offense,
      });
      this.advanceClock(runoff);
      this.clockRunning = false;
      this.phase = null;
      this.playClockSeconds = 25;
      this.log.unshift(`${side === 'home' ? 'VOLTS' : 'SURF'}: ${result.message}`);
      return result;
    }

    finishSnap(offense, defense, result, prior, options) {
      const attack = this.rosters[prior.side];
      const defend = this.rosters[this.opponent(prior.side)];
      attack.finishPlay(attack.lineup('offense', offense), offense, {
        carrier: result.participants.carrier,
        passer: attack.player(...offense.passer),
      });
      defend.finishPlay(
        defend.lineup('defense', defense),
        { ...defense, pressure: PlayMatchup.PRESSURE.includes(defense.id) },
        { defender: result.participants.defender },
      );
      if (this.drive !== prior.drive) {
        attack.recover(6);
        defend.recover(6);
      }
      const before = this.badgeMap(result.participants, attack, defend);
      attack.tick(defend);
      defend.tick(attack);
      this.drainSand(offense, defense, attack, defend);
      this.countDownField();
      this.settleMoves(result.moves ?? [], { offense, defense });
      result.statuses = { before, after: this.badgeMap(result.participants, attack, defend) };
      this.history.push({ side: prior.side, id: offense.id, kind: offense.kind, defenseId: defense.id });
      this.clockRunning = this.isInBounds(offense, result, options) && this.drive === prior.drive;
      this.finishClock(prior, result);
      result.message += result.runoff ? ` ${result.runoff}s runoff.` : '';
      if (result.outOfBounds) result.message += ' Out of bounds: clock stopped.';
      this.log.unshift(
        `${prior.side === 'home' ? 'VOLTS' : 'SURF'}: ${offense.name} vs ${defense.name} — ${result.message}`,
      );
      if (result.explanation) this.log.splice(1, 0, result.explanation);
      this.log.splice(1, 0, ...(result.moves ?? []).map((record) => this.moveLine(record)));
      this.phase = null;
    }

    // Offensive roles read the attacking roster and defensive roles the defending one; a Pokémon can sit on both teams.
    badgeMap(participants, attack, defend) {
      return {
        carrier: attack.badges(participants.carrier),
        support: attack.badges(participants.support),
        defender: defend.badges(participants.defender),
        help: defend.badges(participants.help),
      };
    }

    finishClock(prior, result) {
      result.playSeconds = result.seconds;
      const newPeriod = this.advanceClock(result.playSeconds);
      result.seconds = Math.min(prior.seconds, result.playSeconds + result.runoff);
      this.playClockSeconds = this.drive !== prior.drive || newPeriod ? 25 : 40;
      if (prior.quarter === 5 && this.score.home + this.score.away > prior.score) this.over = true;
      result.clockStopped = !this.clockRunning || this.over;
    }

    isInBounds(offense, result, options) {
      const stopped = [
        'incomplete',
        'interception',
        'fumble',
        'touchdown',
        'safety',
        'turnover-downs',
        'punt',
        'field-goal-good',
        'field-goal-miss',
        'spike',
      ];
      if (stopped.includes(result.outcome)) return false;
      const stuffed = ['sack', 'stuff'].includes(result.outcome) || result.protectedStop;
      if (options.sideline && !stuffed && offense.kind !== 'kneel') {
        result.outOfBounds = true;
        return false;
      }
      return true;
    }

    matchupScore(offense, defense) {
      let score = defense.strengths.includes(offense.kind) ? -5 : defense.weakness === offense.kind ? 2 : 0;
      const recent = this.history.filter((call) => call.side === this.possession).slice(-4);
      score -= recent.filter((call) => call.id === offense.id).length * 2;
      if (offense.id === 'play-action') score += Math.min(4, recent.filter((call) => call.kind === 'run').length * 2);
      if (this.spot >= 85 && offense.kind === 'deep') score -= 5;
      return score + this.schemeScore(offense, defense);
    }

    static SCHEME_MATCHUPS = [
      {
        offenses: ['draw', 'screen-pass', 'shovel-pass', 'trap-run'],
        defenses: ['blitz', 'zone-blitz', 'fire-zone', 'run-blitz'],
        bonus: 6,
      },
      { offenses: ['qb-scramble', 'read-option'], defenses: ['spy', 'edge-contain'], bonus: -5 },
      {
        offenses: ['outside-stretch', 'pitch-toss', 'jet-sweep', 'end-around'],
        defenses: ['edge-contain', 'contain-man'],
        bonus: -5,
      },
      { offenses: ['mesh'], defenses: ['man', 'press', 'cover-1'], bonus: 4 },
      { offenses: ['rpo-slant'], defenses: ['run-stuff', 'bear-front', 'goal-line'], bonus: 4 },
    ];

    schemeScore(offense, defense) {
      const matchup = FootballGame.SCHEME_MATCHUPS.find(
        (rule) => rule.offenses.includes(offense.id) && rule.defenses.includes(defense.id),
      );
      return matchup ? matchup.bonus : 0;
    }

    scrimmage(offense, defense, options) {
      const abilities = {
        attack: this.phase?.abilities[this.possession],
        defend: this.phase?.abilities[this.opponent()],
      };
      const matchup = new PlayMatchup(
        this.rosters[this.possession],
        this.rosters[this.opponent()],
        offense,
        defense,
        options.lane || 'middle',
        abilities,
        this.rollMoves(),
        this.rollConfusion(offense, defense),
        {
          weather: this.field.weather?.kind ?? null,
          attack: this.field[this.possession],
          defend: this.field[this.opponent()],
        },
      );
      const scheme = this.matchupScore(offense, defense);
      const odds = matchup.chances(scheme);
      const knockout = matchup.moveRecords.find(
        (record) => MoveBook.family(record.move) === 'ohko' && record.hit && record.effectiveness,
      );
      let result;
      if (knockout) result = this.knockout(knockout, offense, matchup);
      else if (offense.kind === 'run') result = this.resolveRun(offense, matchup, odds, scheme, options);
      else result = this.resolvePass(offense, matchup, odds, scheme, options);
      return this.describe(result, matchup, odds);
    }

    describe(result, matchup, odds) {
      result.participants = matchup.participants(result);
      result.moves = matchup.moveRecords;
      result.explanation = matchup.explanation();
      result.matchup = { protection: matchup.protection, separation: matchup.separation, tackle: matchup.tackle, odds };
      return result;
    }

    // Accuracy and critical rolls happen here, offense first, so a seeded game reproduces them exactly.
    rollMoves() {
      const entries = {};
      for (const [key, side] of [
        ['attack', this.possession],
        ['defend', this.opponent()],
      ]) {
        const pick = this.phase?.moves[side];
        if (!pick) continue;
        const { accuracy, meta } = MoveBook.get(pick.move);
        const hit = accuracy === null || this.random() * 100 < accuracy;
        const crit = meta.crit_rate > 0 && this.random() < FootballGame.CRIT_CHANCE;
        const chance = hit ? MoveBook.secondary(pick.move)?.chance : undefined;
        const secondary = chance !== undefined && this.random() * 100 < Math.min(100, chance * 2);
        entries[key] = { ...pick, hit, crit, secondary };
      }
      return entries;
    }

    // A confused player stumbles one snap in three; the roll happens here so the matchup stays a pure function.
    rollConfusion(offense, defense) {
      const stumbles = new Set();
      for (const [side, kind, play] of [
        [this.possession, 'offense', offense],
        [this.opponent(), 'defense', defense],
      ]) {
        const roster = this.rosters[side];
        for (const slot of roster.lineup(kind, play)) {
          if (roster.has(slot.mon, 'confusion') && this.random() < FootballGame.CONFUSION_CHANCE)
            stumbles.add(`${kind}:${slot.mon.id}`);
        }
      }
      return stumbles;
    }

    // Effects land after this snap's conditions count down, so a new condition lasts its full duration.
    settleMoves(records, calls) {
      for (const record of records) {
        if (MoveBook.SELF_FAINT.includes(record.move)) this.rosters[record.side].spend(record.actor, 100);
        if (!record.hit) continue;
        this.settleStamina(record);
        const strike = MoveBook.family(record.move) === 'strike';
        for (const effect of MoveBook.effects(record.move)) {
          if (!strike || record.secondary) this.applyEffect(record, effect, calls);
        }
      }
    }

    settleStamina(record) {
      const drain = MoveBook.get(record.move).meta.drain;
      if (!record.value || !drain) return;
      const roster = this.rosters[record.side];
      if (drain < 0) roster.spend(record.actor, Math.round(record.value / 4));
      else roster.restore(record.actor, Math.round(record.value / 2));
    }

    applyEffect(record, effect, calls) {
      if (effect.kind === 'heal') {
        this.rosters[record.side].restore(record.actor, FootballGame.HEAL);
        record.notes.push(`${record.actor.name} regained stamina.`);
      } else if (effect.kind === 'ailment') this.afflict(record, effect);
      else if (effect.kind === 'stat') this.shiftStats(record, effect);
      else if (effect.kind === 'field') this.setField(record, effect.field);
      else if (effect.kind === 'protect') record.notes.push(`${record.actor.name} protected the play.`);
      else this.sendToBench(record, calls);
    }

    // Sandstorm hurts the units that played this snap unless they are Rock, Ground, or Steel.
    drainSand(offense, defense, attack, defend) {
      if (this.field.weather?.kind !== 'sandstorm') return;
      for (const [roster, lineup] of [
        [attack, attack.lineup('offense', offense)],
        [defend, defend.lineup('defense', defense)],
      ]) {
        for (const slot of lineup) {
          if (!slot.mon.types.some((type) => FootballGame.SAND_IMMUNE.includes(type)))
            roster.spend(slot.mon, FootballGame.SAND_DRAIN);
        }
      }
    }

    // Screens and weather set this snap keep their full duration because they start counting next snap.
    countDownField() {
      for (const side of ['home', 'away']) {
        for (const name of Object.keys(this.field[side])) {
          if (name !== 'spikes' && --this.field[side][name] <= 0) delete this.field[side][name];
        }
      }
      if (this.field.weather && --this.field.weather.snaps <= 0) this.field.weather = null;
    }

    setSpikes(side, on) {
      if (on) this.field[side].spikes = true;
      else delete this.field[side].spikes;
    }

    setField(record, name) {
      const foe = this.opponent(record.side);
      if (name === 'haze') for (const roster of Object.values(this.rosters)) roster.clearStages();
      else if (FootballGame.WEATHERS.includes(name))
        this.field.weather = { kind: name, snaps: FootballGame.FIELD_SNAPS };
      else if (name === 'spikes') this.setSpikes(foe, true);
      else this.field[record.side][name] = FootballGame.FIELD_SNAPS;
      record.notes.push(FootballGame.FIELD_NOTES[name]);
    }

    // Roar and Whirlwind only work when a same-role backup can take the player's place next snap.
    sendToBench(record, calls) {
      const foe = this.rosters[this.opponent(record.side)];
      const kind = record.offense ? 'defense' : 'offense';
      const sent = this.changeUnit(this.opponent(record.side), kind, calls[kind], () =>
        foe.sendToBench(record.target, kind, calls[kind]),
      );
      record.notes.push(sent ? `${record.target.name} was sent to the bench!` : 'But it failed!');
    }

    afflict(record, effect) {
      if (record.effectiveness === 0) return;
      const foe = this.rosters[this.opponent(record.side)];
      if (this.field[this.opponent(record.side)].safeguard) {
        record.notes.push(`${record.target.name} is protected by Safeguard.`);
        return;
      }
      const extra = effect.ailment === 'leech-seed' ? { source: record.actor } : { severe: effect.severe };
      const note = foe.afflict(record.target, effect.ailment, extra)
        ? `${record.target.name} ${FootballGame.AILMENT_NOTES[effect.ailment]}.`
        : 'But it failed!';
      record.notes.push(note);
    }

    shiftStats(record, effect) {
      if (!effect.self && record.effectiveness === 0) return;
      const rose = effect.changes.reduce((sum, entry) => sum + entry.change, 0) > 0;
      const mon = effect.self ? record.actor : record.target;
      if (!effect.self && !rose && this.field[this.opponent(record.side)].mist) {
        record.notes.push(`${mon.name} is protected by Mist.`);
        return;
      }
      const roster = this.rosters[effect.self ? record.side : this.opponent(record.side)];
      for (const { stat, change } of effect.changes) roster.shift(mon, stat, change);
      const stats = effect.changes.map(({ stat }) => stat.replace('_', ' ')).join(' and ');
      record.notes.push(`${mon.name}'s ${stats} ${rose ? 'rose' : 'fell'}!`);
    }

    moveLine(record) {
      const move = MoveBook.get(record.move).display_name;
      if (!record.hit) return `${record.actor.name}'s ${move} missed!`;
      const note = MoveBook.callout(record.effectiveness, record.target.name);
      return [`${record.actor.name} used ${move}!`, note, ...record.notes].filter(Boolean).join(' ');
    }

    // A one-hit KO skips the contest rolls, and Protect holds a breakaway to 5 yards or erases a defensive KO.
    knockout(record, offense, matchup) {
      record.notes.push("It's a one-hit KO!");
      if (record.offense) {
        const yards = 100 - this.spot;
        const held = matchup.protects.defense ? Math.min(FootballGame.PROTECT_YARDS, yards) : yards;
        return { yards: held, seconds: 7, ...this.moveBall(held) };
      }
      if (matchup.protects.offense)
        return offense.kind === 'run' ? this.protectedStop() : this.tackle(0, 5, 'Incomplete pass.', 'incomplete');
      return offense.kind === 'run' ? this.fumble(0) : this.interception();
    }

    // A stuff that Protect erased still follows the stuff clock rules.
    protectedStop() {
      return { ...this.tackle(0, 6, 'NO GAIN!', 'stop'), protectedStop: true };
    }

    fumble(yards) {
      this.changePossession(100 - Math.max(1, Math.min(99, this.spot + yards)));
      return { yards, seconds: 7, message: 'FUMBLE! Defense recovers.', turnover: true, outcome: 'fumble' };
    }

    interception() {
      this.changePossession(100 - this.spot);
      return {
        yards: 0,
        seconds: 6,
        message: 'INTERCEPTED! Possession changes.',
        turnover: true,
        outcome: 'interception',
      };
    }

    // Protect on offense turns a sack, stuff, fumble, or interception into no gain or an incompletion.
    resolveRun(offense, matchup, odds, scheme, options) {
      const safe = matchup.protects.offense;
      if (this.random() < odds.stuff)
        return safe ? this.protectedStop() : this.tackle(-1 - Math.floor(this.random() * 4), 6, 'STUFFED!', 'stuff');
      return this.contact(offense, matchup, odds, this.gain(offense, matchup, scheme, options), 6);
    }

    resolvePass(offense, matchup, odds, scheme, options) {
      const safe = matchup.protects.offense;
      const incomplete = () => this.tackle(0, 5, 'Incomplete pass.', 'incomplete');
      if (this.random() < odds.sack)
        return safe
          ? incomplete()
          : { ...this.tackle(-3 - Math.floor(this.random() * 6), 6, 'SACK!', 'sack'), sacked: true };
      if (this.random() < odds.interception) return safe ? incomplete() : this.interception();
      if (this.random() > odds.completion) return incomplete();
      return this.contact(offense, matchup, odds, this.gain(offense, matchup, scheme, options), 5);
    }

    gain(offense, matchup, scheme, options) {
      const sidelineCost = options.sideline ? 2 : 0;
      const yards = Math.max(
        -8,
        Math.round(offense.base + matchup.yardBonus + scheme + (this.random() - 0.5) * offense.spread - sidelineCost),
      );
      return matchup.protects.defense ? Math.min(FootballGame.PROTECT_YARDS, yards) : yards;
    }

    // A close tackle contest, or any third or fourth down, pauses the play at contact for the clash.
    reachesClash(matchup) {
      return this.clashes && (Math.abs(matchup.tackle) <= FootballGame.CLASH_BAND || this.down >= 3);
    }

    // The no-clash branch must draw the same random numbers in the same order as a play with no clash step.
    contact(offense, matchup, odds, yards, seconds) {
      if (this.reachesClash(matchup)) {
        this.pending = { matchup, odds, yards, seconds };
        return { clash: true };
      }
      if (offense.kind === 'run' && this.random() < odds.fumble && !matchup.protects.offense) return this.fumble(yards);
      return { yards, seconds: seconds + Math.floor(this.random() * 4), ...this.moveBall(yards) };
    }

    // The human always coaches the home side, so the clash box belongs to the home side's role.
    humanRole(side) {
      return side === 'home' ? 'offense' : 'defense';
    }

    holdForClash(result, call) {
      Object.assign(this.pending, call);
      const { prior, matchup } = this.pending;
      const role = this.humanRole(prior.side);
      const { roster, mon } = this.clashActor(role);
      const before = this.badgeMap(
        result.participants,
        this.rosters[prior.side],
        this.rosters[this.opponent(prior.side)],
      );
      this.stamp(result, call.offense, call.runoff);
      result.seconds = Math.min(prior.seconds, this.pending.seconds + call.runoff);
      result.statuses = { before, after: before };
      result.clash = {
        carrier: matchup.carrier,
        tackler: matchup.tackler.mon,
        role,
        actions: FootballGame.CLASH.actions[role].map((action) => ({
          ...action,
          skill: Math.round(roster.skill(mon, action.stat)),
        })),
        auto: this.autoClashAction(role),
      };
      return result;
    }

    clashActor(role, pending = this.pending) {
      const { prior, matchup } = pending;
      return role === 'offense'
        ? { roster: this.rosters[prior.side], mon: matchup.carrier }
        : { roster: this.rosters[this.opponent(prior.side)], mon: matchup.tackler.mon };
    }

    // The auto action uses the player's highest relevant stat; ties go to table order.
    autoClashAction(role) {
      const { roster, mon } = this.clashActor(role);
      return FootballGame.CLASH.actions[role].reduce((best, action) =>
        roster.skill(mon, action.stat) > roster.skill(mon, best.stat) ? action : best,
      ).id;
    }

    // Each action weighs by its stat share; the counter of the human's most frequent recent pick gains extra weight.
    cpuClashAction(role) {
      const { roster, mon } = this.clashActor(role);
      const actions = FootballGame.CLASH.actions[role];
      const skills = actions.map((action) => roster.skill(mon, action.stat));
      const total = skills.reduce((sum, value) => sum + value, 0);
      const weights = skills.map((value) => value / total);
      const memory = this.clashMemory[role === 'offense' ? 'defense' : 'offense'];
      const counts = memory.reduce((tally, id) => ({ ...tally, [id]: (tally[id] ?? 0) + 1 }), {});
      const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const counter = actions.findIndex((action) => action.id === FootballGame.CLASH.counters[common]);
      if (counter >= 0) weights[counter] += FootballGame.CLASH_COUNTER_WEIGHT;
      let roll = this.random() * weights.reduce((sum, value) => sum + value, 0);
      return actions[weights.findIndex((weight) => (roll -= weight) < 0)]?.id ?? actions.at(-1).id;
    }

    // The human picks one side of the clash; the CPU, which remembers the human's recent picks, picks the other.
    resolveHumanClash(action) {
      if (!this.pending) throw new Error('No clash is pending.');
      const human = this.humanRole(this.pending.prior.side);
      const cpu = human === 'offense' ? 'defense' : 'offense';
      const picks = { [human]: action, [cpu]: this.cpuClashAction(cpu) };
      return this.resolveClash(picks.offense, picks.defense);
    }

    autoResolveClash() {
      if (!this.pending) throw new Error('No clash is pending.');
      return this.resolveHumanClash(this.autoClashAction(this.humanRole(this.pending.prior.side)));
    }

    resolveClash(offenseAction, defenseAction) {
      const pending = this.pending;
      if (!pending) throw new Error('No clash is pending.');
      const picks = { offense: offenseAction, defense: defenseAction };
      for (const role of ['offense', 'defense']) {
        if (!FootballGame.CLASH.actions[role].some((action) => action.id === picks[role]))
          throw new Error(`Unknown ${role} clash action`);
      }
      this.pending = null;
      this.rememberClash(pending.prior.side, picks);
      const stumbled = {
        offense: this.stumble(pending, 'offense', picks.offense),
        defense: this.stumble(pending, 'defense', picks.defense),
      };
      const result = this.clashPlay(pending, this.clashOutcome(pending, stumbled));
      this.describe(result, pending.matchup, pending.odds);
      this.completeSnap(result, pending.offense, pending.defense, pending.prior, pending.runoff, pending.options);
      this.log.splice(1, 0, this.clashLine(result.clash));
      return result;
    }

    rememberClash(side, picks) {
      const role = this.humanRole(side);
      this.clashMemory[role] = [...this.clashMemory[role], picks[role]].slice(-FootballGame.CLASH_MEMORY);
    }

    // A confused player swaps the chosen action for a random one one time in three.
    stumble(pending, role, id) {
      const { roster, mon } = this.clashActor(role, pending);
      if (!roster.has(mon, 'confusion') || this.random() >= FootballGame.CONFUSION_CHANCE) return id;
      const actions = FootballGame.CLASH.actions[role];
      return actions[Math.floor(this.random() * actions.length)].id;
    }

    clashOutcome(pending, picks) {
      const [carrier, tackler] = ['offense', 'defense'].map((role) => this.clashActor(role, pending));
      const [attack, defend] = ['offense', 'defense'].map((role) =>
        FootballGame.CLASH.actions[role].find((action) => action.id === picks[role]),
      );
      const edge = carrier.roster.skill(carrier.mon, attack.stat) - tackler.roster.skill(tackler.mon, defend.stat);
      const outcome = FootballGame.CLASH.outcomes[attack.id][defend.id];
      const win = Math.max(2, Math.round(FootballGame.CLASH_WIN_YARDS + 0.3 * edge));
      const yards = { win, big: win * 2, lose: -2, heavy: -4, safe: 2, even: 0 }[outcome];
      const slowed = attack.id === 'juke' && yards > 0 && carrier.roster.has(carrier.mon, 'paralysis');
      const stripped = defend.id === 'strip' ? FootballGame.CLASH_FUMBLE.strip : 0;
      return {
        offense: attack.id,
        defense: defend.id,
        names: { offense: attack.name, defense: defend.name },
        carrier: carrier.mon,
        tackler: tackler.mon,
        outcome,
        yards: slowed ? Math.round(yards / 2) : yards,
        edge: Math.round(edge),
        fumble: outcome === 'safe' ? null : (outcome === 'heavy' ? FootballGame.CLASH_FUMBLE.heavy : 0) + stripped,
      };
    }

    // Fumble first, then the breakaway, then the ball moves; Protect holds the final gain to its cap.
    clashPlay(pending, clash) {
      const { matchup, odds, seconds } = pending;
      const held = (yards) => (matchup.protects.defense ? Math.min(FootballGame.PROTECT_YARDS, yards) : yards);
      const yards = held(pending.yards + clash.yards);
      // A run keeps its base fumble roll; a completed pass has none, so only the clash add can fumble it.
      const chance = (pending.offense.kind === 'run' ? odds.fumble : 0) + clash.fumble;
      if (clash.fumble !== null && chance > 0 && !matchup.protects.offense && this.random() < chance)
        return { ...this.fumble(yards), clash: { ...clash, yards: yards - pending.yards } };
      const breakaway = clash.outcome === 'big' && this.random() < FootballGame.BREAKAWAY_CHANCE;
      const gained = breakaway ? held(100 - this.spot) : yards;
      return {
        yards: gained,
        seconds: seconds + Math.floor(this.random() * 4),
        ...this.moveBall(gained),
        clash: { ...clash, yards: gained - pending.yards, breakaway },
      };
    }

    clashLine(clash) {
      const sign = clash.yards > 0 ? '+' : '';
      return `${clash.carrier.name} ${clash.names.offense} vs ${clash.tackler.name} ${clash.names.defense}: ${sign}${clash.yards} yards after contact.`;
    }

    tackle(yards, seconds, label, outcome) {
      const moved = this.moveBall(yards);
      const terminal = ['safety', 'touchdown'].includes(moved.outcome);
      return {
        yards,
        seconds,
        message: `${label} ${moved.message}`,
        outcome: terminal ? moved.outcome : outcome,
        turnover: moved.turnover,
      };
    }

    moveBall(yards) {
      if (this.spot + yards >= 100) {
        this.score[this.possession] += 7;
        this.changePossession(25);
        return { message: `TOUCHDOWN! ${yards} yards and the extra point is good.`, outcome: 'touchdown' };
      }
      if (this.spot + yards <= 0) {
        this.score[this.opponent()] += 2;
        this.changePossession(25);
        return { message: 'SAFETY! The defense scores two.', outcome: 'safety', turnover: true };
      }
      this.spot += yards;
      this.toGo -= yards;
      if (this.toGo <= 0) {
        this.down = 1;
        this.toGo = Math.min(10, 100 - this.spot);
        return { message: `${yards} yards. FIRST DOWN!`, outcome: 'first-down' };
      }
      this.down += 1;
      if (this.down > 4) {
        this.changePossession(100 - this.spot);
        return { message: `${yards} yards. TURNOVER ON DOWNS.`, outcome: 'turnover-downs', turnover: true };
      }
      return {
        message: `${yards > 0 ? '+' : ''}${yards} yards. ${this.down}${this.down === 2 ? 'nd' : this.down === 3 ? 'rd' : 'th'} & ${this.toGo}.`,
        outcome: yards > 0 ? 'gain' : 'stop',
      };
    }

    punt() {
      const yards = 36 + Math.floor(this.random() * 18);
      const landing = this.spot + yards;
      if (landing >= 100) {
        this.changePossession(20);
        return { yards, seconds: 9, message: `${yards}-yard punt. Touchback to the 20.`, outcome: 'punt' };
      }
      const returner = this.rosters[this.opponent()].player('CB');
      const returned = Math.floor(this.random() * (8 + returner.base_stats.speed / 12));
      this.changePossession(100 - landing + returned);
      return {
        yards,
        seconds: 12,
        message: `${yards}-yard punt, ${returned}-yard return. ${this.possession === 'home' ? 'Volts' : 'Surf'} ball.`,
        outcome: 'punt',
      };
    }

    fieldGoal() {
      const distance = 100 - this.spot + 17;
      const team = this.rosters[this.possession];
      const kicker = team.effectiveRating(team.player('QB'), 'QB');
      const chance = Math.max(0.08, Math.min(0.97, 0.91 + (kicker - 60) * 0.003 - Math.max(0, distance - 35) * 0.027));
      const good = this.random() < chance;
      if (good) this.score[this.possession] += 3;
      this.changePossession(good ? 25 : 100 - this.spot);
      return {
        yards: 0,
        seconds: 6,
        message: good ? `${distance}-yard field goal is GOOD!` : `${distance}-yard field goal is no good.`,
        outcome: good ? 'field-goal-good' : 'field-goal-miss',
      };
    }

    changePossession(spot) {
      this.possession = this.opponent();
      this.spot = Math.max(1, Math.min(99, spot));
      this.down = 1;
      this.toGo = Math.min(10, 100 - this.spot);
      this.drive += 1;
    }

    advanceClock(elapsed) {
      this.seconds = Math.max(0, this.seconds - elapsed);
      if (this.seconds > 0) return;
      if (this.quarter === 4 && this.score.home !== this.score.away) {
        this.over = true;
        this.clockRunning = false;
        this.log.unshift('FINAL WHISTLE.');
        return;
      }
      if (this.quarter === 5 && this.score.home !== this.score.away) {
        this.over = true;
        this.clockRunning = false;
        this.log.unshift('OVERTIME WINNER!');
        return;
      }
      if (this.quarter === 5) {
        this.seconds = this.quarterSeconds;
        this.clockRunning = false;
        return true;
      }
      this.startQuarter();
      return true;
    }

    startQuarter() {
      this.quarter += 1;
      this.clockRunning = false;
      for (const roster of Object.values(this.rosters)) roster.recover(15);
      this.seconds = this.quarterSeconds;
      if (this.quarter === 3) {
        this.timeouts = { home: 3, away: 3 };
        for (const side of ['home', 'away']) this.setSpikes(side, false);
        this.charges = { home: FootballGame.ABILITY_CHARGES, away: FootballGame.ABILITY_CHARGES };
        for (const roster of Object.values(this.rosters)) roster.recover(100);
        this.possession = 'away';
        this.spot = 25;
        this.down = 1;
        this.toGo = 10;
        this.drive += 1;
      }
      this.log.unshift(
        this.quarter === 3
          ? 'HALFTIME. Surf receive the second-half kickoff.'
          : this.quarter === 5
            ? 'OVERTIME. Next score wins.'
            : `QUARTER ${this.quarter} begins.`,
      );
    }
  }

  if (typeof module !== 'undefined') module.exports = { FootballGame };
  else Object.assign((window.Pokeballers ||= {}), { FootballGame });
}
