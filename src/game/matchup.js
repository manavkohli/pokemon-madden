{
  const { MoveBook } = typeof module !== 'undefined' ? require('./moves.js') : window.Pokeballers;

  class PlayMatchup {
    // Rating differences move probabilities by one percentage point per five points, with bounded odds.
    static ODDS_SCALE = 0.002;
    static YARDS_SCALE = 0.12;
    static STAGE_POINTS = 6;
    static ACCURACY_STAGE = 0.04;
    static CONFUSED_DROP = 15;
    static PRESSURE = ['blitz', 'zone-blitz', 'fire-zone', 'cover-0', 'run-blitz'];

    constructor(
      attack,
      defend,
      offense,
      defense,
      lane = 'middle',
      abilities = {},
      moves = {},
      confused = new Set(),
      field = {},
    ) {
      this.attack = attack;
      this.defend = defend;
      this.offense = offense;
      this.defense = defense;
      this.abilities = abilities;
      this.moves = moves;
      this.confused = confused;
      this.field = field;
      this.protects = { offense: false, defense: false };
      this.accuracyShift = 0;
      this.moveRecords = [];
      this.line = attack.lineup('offense', offense);
      this.cover = defend.lineup('defense', defense);
      this.carrier = attack.occupant(this.line, offense.carrier);
      this.passer = attack.occupant(this.line, offense.passer);
      this.lane = { left: 0, middle: 2, right: 4 }[lane];
      if (this.lane === undefined) throw new RangeError('Unknown attack lane');
      this.pressure = PlayMatchup.PRESSURE.includes(defense.id);
      this.selectContests();
    }

    static bounded(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    selectContests() {
      const front = this.cover.filter((slot) => slot.role === 'DL' || (this.pressure && slot.role === 'LB'));
      const blockers = this.line.filter((slot) => slot.role === 'OL');
      const pairs = blockers.map((blocker, index) => ({
        blocker,
        rusher: front[index % front.length],
        margin:
          this.attack.effectiveRating(blocker.mon, 'OL') -
          this.defend.effectiveRating(front[index % front.length].mon, front[index % front.length].role),
      }));
      const pair = this.offense.kind === 'run' ? pairs[this.lane] : pairs.sort((a, b) => a.margin - b.margin)[0];
      this.overrideLine(pair);
      this.blocker = pair.blocker.mon;
      this.rusher = pair.rusher.mon;
      const coverageRole = this.offense.carrier[0] === 'WR' ? 'CB' : 'LB';
      const markers = this.cover.filter((slot) => slot.role === coverageRole);
      this.marker = markers[this.offense.carrier[1] % markers.length];
      const tacklers = this.cover.filter((slot) => slot.role === 'LB');
      this.tackler = this.offense.kind === 'run' ? tacklers[this.lane % tacklers.length] : this.marker;
      this.overrideCoverage();
      this.help = this.cover.find((slot) => slot.role === 'S').mon;
      const support = this.line.filter((slot) => slot.role === 'TE' || slot.role === 'RB').length;
      this.protection = pair.margin + support * 2 - (this.pressure ? 12 : 0) - Math.max(0, front.length - 4) * 3;
      this.separation =
        (this.attack.effectiveRating(this.carrier, this.offense.carrier[0]) +
          this.attack.skill(this.carrier, 'speed') -
          this.defend.effectiveRating(this.marker.mon, this.marker.role) -
          this.defend.skill(this.marker.mon, 'speed')) /
        2;
      this.tackle =
        this.attack.effectiveRating(this.carrier, 'RB') -
        this.defend.effectiveRating(this.tackler.mon, this.tackler.role);
      this.applyAttackAbility();
      this.applyDefenseAbility();
      this.applyConditions();
      this.applyScreens();
      this.applyMoves();
    }

    // Reflect and Light Screen give the defending team 10 margin against runs and passes.
    applyScreens() {
      const screens = this.field.defend ?? {};
      if (this.offense.kind === 'run' && screens.reflect) this.tackle -= MoveBook.SCREEN_POINTS;
      if (this.offense.kind !== 'run' && screens['light-screen']) this.separation -= MoveBook.SCREEN_POINTS;
    }

    // Stat stages move the contest each stat feeds; a confused player's stumble costs its own side 15 points.
    applyConditions() {
      const run = this.offense.kind === 'run';
      const roles = [
        ['offense', this.carrier, run ? ['attack'] : ['speed'], run ? 'tackle' : 'separation', 1],
        ['offense', this.blocker, ['defense'], 'protection', 1],
        ['defense', this.rusher, ['attack'], 'protection', -1],
        ['defense', this.tackler.mon, ['defense'], 'tackle', -1],
      ];
      if (!run)
        roles.push(
          ['offense', this.passer, ['special_attack'], 'separation', 1],
          ['defense', this.marker.mon, ['speed', 'special_defense'], 'separation', -1],
        );
      for (const [kind, mon, stats, margin, sign] of roles) {
        const roster = kind === 'offense' ? this.attack : this.defend;
        for (const stat of stats) this[margin] += sign * roster.stage(mon, stat) * PlayMatchup.STAGE_POINTS;
        if (this.confused.has(`${kind}:${mon.id}`)) this[margin] -= sign * PlayMatchup.CONFUSED_DROP;
      }
      if (!run) this.accuracyShift = PlayMatchup.ACCURACY_STAGE * this.accuracyStages();
    }

    // Accuracy helps the passing side and evasion helps the covering side, each from the player's current stages.
    accuracyStages() {
      const { attack, defend, passer, carrier } = this;
      const marker = this.marker.mon;
      return (
        attack.stage(passer, 'accuracy') +
        attack.stage(carrier, 'accuracy') +
        attack.stage(carrier, 'evasion') -
        defend.stage(marker, 'accuracy') -
        defend.stage(marker, 'evasion')
      );
    }

    // A move's user takes its role's contest, so a fired move always lands on a real opponent.
    overrideLine(pair) {
      const user = this.moves.attack?.actor;
      const carries = user && [this.carrier.id, this.offense.kind !== 'run' && this.passer.id].includes(user.id);
      const blocker = carries
        ? null
        : this.line.find((slot) => slot.mon.id === user?.id && ['OL', 'TE'].includes(slot.role));
      const rusher = this.cover.find((slot) => slot.mon.id === this.moves.defend?.actor.id && slot.role === 'DL');
      if (!blocker && !rusher) return;
      if (blocker) pair.blocker = { ...blocker, role: 'OL' };
      if (rusher) pair.rusher = rusher;
      pair.margin =
        this.attack.effectiveRating(pair.blocker.mon, 'OL') -
        this.defend.effectiveRating(pair.rusher.mon, pair.rusher.role);
    }

    overrideCoverage() {
      const slot = this.cover.find((entry) => entry.mon.id === this.moves.defend?.actor.id);
      if (!slot || slot.role === 'DL') return;
      if (this.offense.kind === 'run') this.tackler = slot;
      else this.marker = this.tackler = slot;
    }

    offenseContest(actor) {
      const pass = this.offense.kind !== 'run';
      if (actor.id === this.carrier.id)
        return { target: pass ? this.marker.mon : this.tackler.mon, margin: pass ? 'separation' : 'tackle' };
      if (actor.id === this.passer.id && pass) return { target: this.marker.mon, margin: 'separation' };
      return { target: this.rusher, margin: 'protection' };
    }

    defenseContest(actor) {
      const pass = this.offense.kind !== 'run';
      if ([this.marker, this.tackler].some((slot) => slot.mon.id === actor.id))
        return { target: this.carrier, margin: pass ? 'separation' : 'tackle' };
      return { target: this.blocker, margin: 'protection' };
    }

    applyMoves() {
      for (const key of ['attack', 'defend']) {
        const entry = this.moves[key];
        if (entry) this.moveRecords.push(this.applyMove(entry, key === 'attack'));
      }
    }

    applyMove(entry, offense) {
      const { target, margin } = offense ? this.offenseContest(entry.actor) : this.defenseContest(entry.actor);
      const family = MoveBook.family(entry.move);
      const effectiveness = ['strike', 'ohko'].includes(family) ? MoveBook.effectiveness(entry.move, target) : 1;
      const value = entry.hit && family === 'strike' ? this.strikeValue(entry, offense, effectiveness) : 0;
      this[margin] += offense ? value : -value;
      if (entry.hit && family === 'protect') this.protects[offense ? 'offense' : 'defense'] = true;
      return {
        side: entry.side,
        offense,
        secondary: entry.secondary,
        notes: [],
        actor: entry.actor,
        target,
        move: entry.move,
        hit: entry.hit,
        effectiveness,
        value,
      };
    }

    // Weather scales the strike; a screen on the target's team removes up to 10 points of a matching strike.
    strikeValue(entry, offense, effectiveness) {
      const move = MoveBook.get(entry.move);
      const skill = (offense ? this.attack : this.defend).skill(entry.actor, MoveBook.STAT_KEYS[move.damage_class]);
      const modifier = MoveBook.WEATHER[this.field.weather]?.[move.type] ?? 1;
      const value = MoveBook.strike(entry.move, {
        actor: entry.actor,
        skill,
        effectiveness,
        crit: entry.crit,
        modifier,
      });
      const screen =
        this.field[offense ? 'defend' : 'attack']?.[move.damage_class === 'physical' ? 'reflect' : 'light-screen'];
      return screen ? Math.max(0, value - MoveBook.SCREEN_POINTS) : value;
    }

    applyAttackAbility() {
      if (this.abilities.attack?.id === 'burst' && this.abilities.attack.actor.id === this.carrier.id) {
        this.separation += 12;
        this.tackle += 12;
      }
      if (
        this.abilities.attack?.id === 'shield' &&
        this.line.some((slot) => slot.mon.id === this.abilities.attack.actor.id)
      )
        this.protection += 18;
    }

    applyDefenseAbility() {
      if (
        this.abilities.defend?.id === 'burst' &&
        this.cover.some((slot) => slot.mon.id === this.abilities.defend.actor.id)
      )
        this.protection -= 12;
      if (
        this.abilities.defend?.id === 'shield' &&
        this.cover.some((slot) => slot.mon.id === this.abilities.defend.actor.id)
      )
        this.tackle -= 18;
    }

    chances(scheme) {
      const depth = { deep: 0.18, trick: 0.1, medium: 0.05 }[this.offense.kind] || 0;
      const quarterback = this.attack.effectiveRating(this.passer, 'QB');
      const deepHelp = this.offense.kind === 'deep' ? (this.defend.effectiveRating(this.help, 'S') - 60) * 0.002 : 0;
      return {
        completion: PlayMatchup.bounded(
          0.7 -
            depth +
            (quarterback - 60) * 0.003 +
            this.separation * 0.004 +
            scheme * 0.018 -
            deepHelp +
            this.accuracyShift,
          0.15,
          0.92,
        ),
        sack: PlayMatchup.bounded(
          0.1 - this.protection * 0.005 + (this.offense.kind === 'deep' ? 0.04 : 0),
          0.02,
          0.45,
        ),
        stuff: PlayMatchup.bounded(0.13 - this.protection * 0.004 - scheme * 0.008, 0.03, 0.45),
        interception: PlayMatchup.bounded(
          0.025 + depth * 0.12 - this.separation * PlayMatchup.ODDS_SCALE - (quarterback - 60) * 0.001,
          0.008,
          0.12,
        ),
        fumble:
          PlayMatchup.bounded(0.018 - this.tackle * 0.0003, 0.005, 0.05) +
          (this.field.weather === 'rain-dance' ? 0.01 : 0),
      };
    }

    get yardBonus() {
      const margin =
        this.offense.kind === 'run' ? this.protection * 0.5 + this.tackle : this.separation + this.tackle * 0.5;
      const passing = this.offense.kind === 'run' ? 0 : (this.attack.effectiveRating(this.passer, 'QB') - 60) * 0.1;
      return PlayMatchup.bounded(margin * PlayMatchup.YARDS_SCALE + passing, -9, 9);
    }

    participants(result) {
      const sack = result.outcome === 'sack' || (result.outcome === 'safety' && this.offense.kind !== 'run');
      const stopped = result.outcome === 'stuff' || sack;
      const defender = stopped ? this.rusher : this.tackler.mon;
      const support = sack || this.offense.kind === 'run' ? this.blocker : this.passer;
      const cast = { carrier: sack ? this.passer : this.carrier, support, defender, help: this.help };
      return this.featureMovers(cast);
    }

    // Every move user takes the stage: an offensive user replaces support and a defensive user replaces help.
    featureMovers(cast) {
      for (const { actor, offense } of this.moveRecords) {
        const [lead, slot] = offense ? ['carrier', 'support'] : ['defender', 'help'];
        if (cast[lead] !== actor && cast[slot] !== actor) cast[slot] = actor;
      }
      return cast;
    }

    explanation() {
      const contest = this.offense.kind === 'run' ? this.tackler : this.marker;
      const margin = this.offense.kind === 'run' ? this.tackle : this.separation;
      return `${this.blocker.name} vs ${this.rusher.name}: protection ${Math.round(this.protection)}. ${this.carrier.name} vs ${contest.mon.name}: matchup ${Math.round(margin)}.`;
    }
  }

  if (typeof module !== 'undefined') module.exports = { PlayMatchup };
  else Object.assign((window.Pokeballers ||= {}), { PlayMatchup });
}
