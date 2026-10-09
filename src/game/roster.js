{
  const { POSITIONS, SALARY_CAP } = typeof module !== 'undefined' ? require('./playbook.js') : window.Pokeballers;
  const { MoveBook } = typeof module !== 'undefined' ? require('./moves.js') : window.Pokeballers;

  class Roster {
    static FATIGUE_THRESHOLD = 70;
    static FATIGUE_PENALTY = 0.4;
    static BENCH_RECOVERY = 9;
    static DURATIONS = {
      paralysis: 4,
      sleep: 2,
      freeze: 2,
      burn: 4,
      poison: 5,
      confusion: 3,
      trap: 3,
      'leech-seed': 5,
      benched: 2,
    };
    static MAJOR = ['paralysis', 'sleep', 'freeze', 'burn', 'poison'];
    static DRAIN = { burn: 3, poison: 5, 'leech-seed': 4 };
    static TOXIC_DRAIN = 8;
    static STATUS_PENALTY = 40;
    static SLOWED = 0.75;
    static STAGE_SNAPS = 3;
    static STAGE_CAP = 2;

    constructor(pokemon, ids) {
      this.pokemon = pokemon;
      this.players = ids.map((id) => pokemon[id - 1]);
      this.stamina = new Map();
      this.movesets = new Map();
      this.conditions = new Map();
      this.stages = new Map();
    }

    copy() {
      const roster = new Roster(this.pokemon, []);
      roster.players = [...this.players];
      roster.movesets = new Map(this.movesets);
      return roster;
    }

    moveset(mon) {
      return this.movesets.get(mon.id) ?? MoveBook.defaultMoveset(mon);
    }

    setMoveset(mon, names) {
      const learnable = MoveBook.learnable(mon);
      if (names.length > MoveBook.MOVESET_SIZE) throw new RangeError('A moveset holds at most four moves');
      if (new Set(names).size !== names.length) throw new RangeError('A moveset cannot repeat a move');
      if (!names.every((name) => learnable.includes(name))) throw new RangeError(`${mon.name} cannot learn that move`);
      this.movesets.set(mon.id, [...names]);
    }

    energy(mon) {
      return this.stamina.get(mon.id) ?? 100;
    }

    spend(mon, amount) {
      this.stamina.set(mon.id, Math.max(0, this.energy(mon) - amount));
    }

    restore(mon, amount) {
      this.stamina.set(mon.id, Math.min(100, this.energy(mon) + amount));
    }

    recover(amount) {
      for (const mon of this.players) this.restore(mon, amount);
    }

    effectiveRating(mon, role) {
      return Math.max(20, Roster.rating(mon, role) - this.penalty(mon));
    }

    penalty(mon) {
      const dazed = this.has(mon, 'sleep') || this.has(mon, 'freeze');
      const fatigue = Math.round(Math.max(0, Roster.FATIGUE_THRESHOLD - this.energy(mon)) * Roster.FATIGUE_PENALTY);
      return fatigue + (dazed ? Roster.STATUS_PENALTY : 0);
    }

    skill(mon, stat) {
      const slowed = (stat === 'speed' && this.has(mon, 'paralysis')) || (stat === 'attack' && this.has(mon, 'burn'));
      const base = Math.min(99, 20 + mon.base_stats[stat] * 0.63) * (slowed ? Roster.SLOWED : 1);
      return Math.max(20, base - this.penalty(mon));
    }

    has(mon, kind) {
      return Boolean(this.conditions.get(mon.id)?.[kind]);
    }

    // A player holds one major ailment at a time; confusion, trap, and Leech Seed stack on top.
    afflict(mon, kind, extra = {}) {
      const current = this.conditions.get(mon.id) ?? {};
      if (current[kind] || (Roster.MAJOR.includes(kind) && this.hasMajor(mon))) return false;
      this.conditions.set(mon.id, { ...current, [kind]: { snaps: Roster.DURATIONS[kind], ...extra } });
      return true;
    }

    badges(mon) {
      return Object.keys(this.conditions.get(mon.id) ?? {})
        .filter((kind) => MoveBook.BADGES[kind])
        .map((kind) => MoveBook.BADGES[kind]);
    }

    stage(mon, stat) {
      return this.stages.get(mon.id)?.[stat]?.stage ?? 0;
    }

    shift(mon, stat, change) {
      const entries = this.stages.get(mon.id) ?? {};
      const stage = Math.max(-Roster.STAGE_CAP, Math.min(Roster.STAGE_CAP, (entries[stat]?.stage ?? 0) + change));
      this.stages.set(mon.id, { ...entries, [stat]: { stage, snaps: Roster.STAGE_SNAPS } });
    }

    clearStages() {
      this.stages.clear();
    }

    // Counts every player's conditions and stages down, bench included; Leech Seed feeds the opposing user.
    tick(foe) {
      for (const mon of this.players) {
        this.tickConditions(mon, foe);
        const stages = this.stages.get(mon.id) ?? {};
        for (const [stat, entry] of Object.entries(stages)) if (--entry.snaps <= 0) delete stages[stat];
      }
    }

    tickConditions(mon, foe) {
      const current = this.conditions.get(mon.id) ?? {};
      for (const [kind, state] of Object.entries(current)) {
        const drain = state.severe ? Roster.TOXIC_DRAIN : Roster.DRAIN[kind];
        if (drain) this.spend(mon, drain);
        if (kind === 'leech-seed') foe.restore(state.source, drain);
        if (--state.snaps <= 0) delete current[kind];
      }
    }

    finishPlay(lineup, play, participants) {
      const active = new Set(lineup.map((slot) => slot.mon.id));
      for (const mon of this.players) {
        if (!active.has(mon.id)) this.stamina.set(mon.id, Math.min(100, this.energy(mon) + Roster.BENCH_RECOVERY));
      }
      const extra = play.kind === 'deep' || play.pressure ? 3 : 0;
      for (const slot of lineup) this.spend(slot.mon, 3 + extra);
      for (const mon of new Set(Object.values(participants))) this.spend(mon, 4);
    }

    substitute(role, first, second) {
      const slots = POSITIONS.map((slot, index) => ({ ...slot, index })).filter((slot) => slot.code === role);
      if (!slots[first] || !slots[second] || first === second) throw new RangeError('Choose two different depth slots');
      // A benched player may move down the depth chart but never up toward the field.
      const rising = [
        [first, second],
        [second, first],
      ].find(([from, to]) => to < from && this.has(this.players[slots[from].index], 'benched'));
      if (rising) throw new RangeError(`${this.players[slots[rising[0]].index].name} is benched`);
      const trapped = [first, second].find((index) => this.has(this.players[slots[index].index], 'trap'));
      if (trapped !== undefined) throw new RangeError(`${this.players[slots[trapped].index].name} is trapped`);
      const a = slots[first].index;
      const b = slots[second].index;
      [this.players[a], this.players[b]] = [this.players[b], this.players[a]];
    }

    // The best-rested same-role player outside the unit who is free to enter it.
    backupFor(mon, side, play) {
      const taken = new Set(this.lineup(side, play).map((entry) => entry.mon.id));
      const own = POSITIONS[this.players.indexOf(mon)];
      return POSITIONS.map((position, index) => ({ ...position, mon: this.players[index] }))
        .filter(
          (entry) =>
            entry.code === own.code &&
            !taken.has(entry.mon.id) &&
            !this.has(entry.mon, 'benched') &&
            !this.has(entry.mon, 'trap'),
        )
        .sort((a, b) => this.energy(b.mon) - this.energy(a.mon))[0];
    }

    // Swaps the target with its backup and benches it; false when the target is trapped, benched, or has no backup.
    sendToBench(mon, side, play) {
      if (this.has(mon, 'trap') || this.has(mon, 'benched')) return false;
      const backup = this.backupFor(mon, side, play);
      if (!backup) return false;
      this.substitute(backup.code, POSITIONS[this.players.indexOf(mon)].depth - 1, backup.depth - 1);
      return this.afflict(mon, 'benched');
    }

    // A bigger formation can reach a benched player's depth, so a free backup takes that slot before the snap.
    seatBenched(side, play) {
      for (const slot of this.lineup(side, play)) {
        if (!this.has(slot.mon, 'benched')) continue;
        const backup = this.backupFor(slot.mon, side, play);
        if (backup) this.substitute(slot.role, slot.depth - 1, backup.depth - 1);
      }
    }

    stageTotal() {
      return [...this.stages.values()].reduce(
        (sum, entries) => sum + Object.values(entries).reduce((total, entry) => total + entry.stage, 0),
        0,
      );
    }

    hasMajor(mon) {
      return Roster.MAJOR.some((kind) => this.has(mon, kind));
    }

    // Under 70 stamina or any major ailment makes a starter a rotation candidate.
    needsRest(mon) {
      return this.energy(mon) < Roster.FATIGUE_THRESHOLD || this.hasMajor(mon);
    }

    rotate(side, play) {
      const active = this.lineup(side, play);
      const activeIds = new Set(active.map((slot) => slot.mon.id));
      for (const slot of active) {
        if (this.has(slot.mon, 'trap') || this.has(slot.mon, 'benched') || !this.needsRest(slot.mon)) continue;
        const bench = POSITIONS.map((position) => ({
          ...position,
          mon: this.player(position.code, position.depth - 1),
        }))
          .filter(
            (candidate) =>
              candidate.code === slot.role &&
              !activeIds.has(candidate.mon.id) &&
              !this.has(candidate.mon, 'trap') &&
              !this.has(candidate.mon, 'benched') &&
              !this.hasMajor(candidate.mon),
          )
          .sort((a, b) => this.effectiveRating(b.mon, b.code) - this.effectiveRating(a.mon, a.code));
        if (!bench.length || this.effectiveRating(bench[0].mon, slot.role) <= this.effectiveRating(slot.mon, slot.role))
          continue;
        this.substitute(slot.role, slot.depth - 1, bench[0].depth - 1);
        activeIds.delete(slot.mon.id);
        activeIds.add(bench[0].mon.id);
      }
    }

    static salaryRange(pokemon) {
      const salaries = pokemon.map((mon) => Roster.salary(mon)).sort((a, b) => a - b);
      return {
        min: salaries.slice(0, POSITIONS.length).reduce((sum, salary) => sum + salary, 0),
        max: salaries.slice(-POSITIONS.length).reduce((sum, salary) => sum + salary, 0),
      };
    }

    static random(pokemon, cap = SALARY_CAP, random = Math.random) {
      if (!(cap >= Roster.salaryRange(pokemon).min)) throw new RangeError('Cap cannot fund a full roster');
      let available = [...pokemon].sort((a, b) => Roster.salary(a) - Roster.salary(b));
      let budget = cap;
      const roster = new Roster(pokemon, []);
      for (const position of POSITIONS) {
        const slots = POSITIONS.length - roster.players.length;
        const minimum = available.slice(0, slots).reduce((sum, mon) => sum + Roster.salary(mon), 0);
        const cutoff = Roster.salary(available[slots - 1]);
        const allowance = Math.max(Roster.salary(available[0]), budget / slots);
        // Reserve enough for every remaining slot, even at the lowest possible cap.
        const candidates = available
          .filter((mon) => {
            const salary = Roster.salary(mon);
            const reserve = minimum - Math.min(salary, cutoff);
            return salary <= allowance && salary + reserve <= budget;
          })
          .sort((a, b) => Roster.rating(b, position.code) - Roster.rating(a, position.code));
        const player = candidates[Math.floor(random() * Math.min(85, candidates.length))];
        roster.players.push(player);
        budget -= Roster.salary(player);
        available = available.filter((mon) => mon.id !== player.id);
      }
      return roster;
    }

    static salary(mon) {
      return Math.round(
        mon.base_stats.total * 1.25 +
          ([144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251].includes(mon.id) ? 450 : 0),
      );
    }

    static rating(mon, position) {
      const s = mon.base_stats;
      const traits = {
        QB: s.special_attack * 0.42 + s.speed * 0.26 + s.special_defense * 0.2 + s.hp * 0.12,
        RB: s.attack * 0.38 + s.speed * 0.31 + s.hp * 0.21 + s.defense * 0.1,
        WR: s.speed * 0.43 + s.attack * 0.22 + s.special_attack * 0.25 + s.hp * 0.1,
        TE: s.hp * 0.28 + s.attack * 0.24 + s.defense * 0.2 + s.special_attack * 0.28,
        OL: s.hp * 0.32 + s.defense * 0.37 + s.attack * 0.31,
        DL: s.attack * 0.35 + s.defense * 0.4 + s.hp * 0.25,
        LB: s.attack * 0.29 + s.defense * 0.28 + s.speed * 0.24 + s.hp * 0.19,
        CB: s.speed * 0.39 + s.defense * 0.22 + s.special_defense * 0.28 + s.hp * 0.11,
        S: s.speed * 0.3 + s.special_defense * 0.34 + s.defense * 0.24 + s.hp * 0.12,
      };
      return Math.max(20, Math.min(99, Math.round(20 + traits[position] * 0.63)));
    }

    get salary() {
      return this.players.reduce((sum, mon) => sum + Roster.salary(mon), 0);
    }

    player(position, occurrence = 0) {
      return this.players[POSITIONS.findIndex((slot) => slot.code === position && slot.depth === occurrence + 1)];
    }

    participants(play) {
      return {
        carrier: this.player(...play.carrier),
        passer: this.player(...play.passer),
        blocker: this.player('OL'),
      };
    }

    rating(position) {
      if (position === 'WR' || position === 'DL')
        return Math.round(
          (Roster.rating(this.player(position), position) + Roster.rating(this.player(position, 1), position)) / 2,
        );
      return Roster.rating(this.player(position), position);
    }

    lineup(side, play) {
      let slots;
      if (side === 'offense') {
        const packages = {
          11: [
            ['QB', 0],
            ['RB', 0],
            ['WR', 0],
            ['WR', 1],
            ['WR', 2],
            ['TE', 0],
          ],
          12: [
            ['QB', 0],
            ['RB', 0],
            ['WR', 0],
            ['WR', 1],
            ['TE', 0],
            ['TE', 1],
          ],
          13: [
            ['QB', 0],
            ['RB', 0],
            ['WR', 0],
            ['TE', 0],
            ['TE', 1],
            ['TE', 2],
          ],
          21: [
            ['QB', 0],
            ['RB', 0],
            ['RB', 1],
            ['WR', 0],
            ['WR', 1],
            ['TE', 0],
          ],
          10: [
            ['QB', 0],
            ['RB', 0],
            ['WR', 0],
            ['WR', 1],
            ['WR', 2],
            ['WR', 3],
          ],
          '2QB': [
            ['QB', 0],
            ['QB', 1],
            ['RB', 0],
            ['WR', 0],
            ['WR', 1],
            ['TE', 0],
          ],
        };
        slots = [...packages[play?.personnel || '11'], ...Array.from({ length: 5 }, (_, depth) => ['OL', depth])];
      } else {
        const goal = ['goal-line', 'run-stuff', 'bear-front', 'run-blitz'].includes(play?.id);
        const dime = ['dime', 'cover-4', 'cover-6', 'quarters-match', 'prevent'].includes(play?.id);
        const nickel = ['nickel', 'robber', 'press', 'man', 'contain-man', 'red-zone-bracket'].includes(play?.id);
        const counts = goal ? [5, 4, 1, 1] : dime ? [3, 2, 4, 2] : nickel ? [4, 2, 3, 2] : [4, 3, 2, 2];
        slots = ['DL', 'LB', 'CB', 'S'].flatMap((code, i) =>
          Array.from({ length: counts[i] }, (_, depth) => [code, depth]),
        );
      }
      return slots.map(([role, depth]) => ({ mon: this.player(role, depth), role, depth: depth + 1 }));
    }

    assign(slotIndex, mon) {
      const otherIndex = this.players.findIndex((player) => player.id === mon.id);
      if (otherIndex === slotIndex) return;
      if (otherIndex >= 0) this.players[otherIndex] = this.players[slotIndex];
      else this.movesets.delete(this.players[slotIndex].id);
      this.players[slotIndex] = mon;
    }
  }

  if (typeof module !== 'undefined') module.exports = { Roster };
  else Object.assign((window.Pokeballers ||= {}), { Roster });
}
