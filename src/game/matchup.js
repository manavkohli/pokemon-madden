{
  class PlayMatchup {
    // Rating differences move probabilities by one percentage point per five points, with bounded odds.
    static ODDS_SCALE = 0.002;
    static YARDS_SCALE = 0.12;
    static PRESSURE = ['blitz', 'zone-blitz', 'fire-zone', 'cover-0', 'run-blitz'];

    constructor(attack, defend, offense, defense, lane = 'middle', abilities = {}) {
      this.attack = attack;
      this.defend = defend;
      this.offense = offense;
      this.defense = defense;
      this.abilities = abilities;
      this.line = attack.lineup('offense', offense);
      this.cover = defend.lineup('defense', defense);
      this.carrier = attack.player(...offense.carrier);
      this.passer = attack.player(...offense.passer);
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
      this.blocker = pair.blocker.mon;
      this.rusher = pair.rusher.mon;
      const coverageRole = this.offense.carrier[0] === 'WR' ? 'CB' : 'LB';
      const markers = this.cover.filter((slot) => slot.role === coverageRole);
      this.marker = markers[this.offense.carrier[1] % markers.length];
      const tacklers = this.cover.filter((slot) => slot.role === 'LB');
      this.tackler = this.offense.kind === 'run' ? tacklers[this.lane % tacklers.length] : this.marker;
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
          0.7 - depth + (quarterback - 60) * 0.003 + this.separation * 0.004 + scheme * 0.018 - deepHelp,
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
        fumble: PlayMatchup.bounded(0.018 - this.tackle * 0.0003, 0.005, 0.05),
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
      return { carrier: sack ? this.passer : this.carrier, support, defender, help: this.help };
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
