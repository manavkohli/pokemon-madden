{
  const { POSITIONS } = typeof module !== 'undefined' ? require('./playbook.js') : window.Pokeballers;
  const { Roster } = typeof module !== 'undefined' ? require('./roster.js') : window.Pokeballers;
  const { FootballGame } = typeof module !== 'undefined' ? require('./football.js') : window.Pokeballers;

  // Mulberry32: a 32-bit generator whose whole state is one number, so a save can resume the same rolls.
  class SeededRandom {
    constructor(state) {
      this.state = state >>> 0;
    }

    next() {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    }
  }

  // One Kanto circuit: 13 games against fixed leaders, with the player's roster carried from game to game.
  class League {
    static VERSION = 1;
    static DRAFT_CAP = 20000;
    static BADGE_CAP = 1000;
    static TRANSFERS = 3;
    static CORE_SIZE = 12;
    static CORE_SHARE = 0.6;
    static BASE_LEVEL = 5;
    static FINAL_LEVEL = 40;
    static NON_LEVEL_FLOOR = 20;
    static MAX_LEVEL = 100;
    static WIN_BONUS = 2;
    static YARDS_PER_LEVEL = 10;
    static FRIENDSHIP_GAMES = 5;
    static LEADERS = [
      { name: 'Brock', title: 'Gym Leader', type: 'Rock', style: 'run', cap: 15500, stone: null },
      { name: 'Misty', title: 'Gym Leader', type: 'Water', style: 'pass', cap: 16500, stone: 'water-stone' },
      { name: 'Lt. Surge', title: 'Gym Leader', type: 'Electric', style: 'pass', cap: 17500, stone: 'thunder-stone' },
      { name: 'Erika', title: 'Gym Leader', type: 'Grass', style: 'balanced', cap: 18500, stone: 'leaf-stone' },
      { name: 'Koga', title: 'Gym Leader', type: 'Poison', style: 'pressure', cap: 19500, stone: null },
      { name: 'Sabrina', title: 'Gym Leader', type: 'Psychic', style: 'balanced', cap: 20500, stone: 'moon-stone' },
      { name: 'Blaine', title: 'Gym Leader', type: 'Fire', style: 'balanced', cap: 22000, stone: 'fire-stone' },
      { name: 'Giovanni', title: 'Gym Leader', type: 'Ground', style: 'run', cap: 23000, stone: 'sun-stone' },
      { name: 'Lorelei', title: 'Elite Four', type: 'Ice', style: 'balanced', cap: 24000, stone: null },
      { name: 'Bruno', title: 'Elite Four', type: 'Fighting', style: 'balanced', cap: 25000, stone: null },
      { name: 'Agatha', title: 'Elite Four', type: 'Ghost', style: 'pressure', cap: 26000, stone: null },
      { name: 'Lance', title: 'Elite Four', type: 'Dragon', style: 'balanced', cap: 27000, stone: null },
      { name: 'Rival', title: 'Champion', type: null, style: 'balanced', cap: 28000, stone: null },
    ];

    constructor(catalog, roster, seed) {
      this.catalog = catalog;
      this.roster = roster;
      this.seed = seed >>> 0;
      this.random = new SeededRandom(this.seed ^ 0x9e3779b9);
      this.roll = () => this.random.next();
      this.parents = new Map();
      for (const mon of catalog) for (const step of mon.evolutions) this.parents.set(step.into, { mon, step });
      this.stage = 0;
      this.badges = [];
      this.stones = {};
      this.transfersLeft = League.TRANSFERS;
      this.levels = new Map(roster.players.map((mon) => [mon.id, this.floor(mon)]));
      this.games = new Map(roster.players.map((mon) => [mon.id, 0]));
    }

    // The injected random only draws the circuit seed; every later roll comes from the league's own saved generator.
    static start(catalog, roster, random = Math.random) {
      if (roster.salary > League.DRAFT_CAP) throw new RangeError('The starting roster is over the draft cap');
      const pool = League.startingPool(catalog);
      if (!roster.players.every((mon) => pool.includes(mon)))
        throw new RangeError('The starting roster holds a Pokémon with no evolution left');
      return new League(catalog, roster.copy(), Math.floor(random() * 2 ** 32));
    }

    // The circuit draft only offers base and middle forms, so every starter has growth ahead.
    static startingPool(catalog) {
      return catalog.filter((mon) => mon.evolutions.length > 0);
    }

    // The player's payroll limit: the draft cap plus 1,000 for each badge. Evolution may push payroll over it.
    get playerCap() {
      return League.DRAFT_CAP + League.BADGE_CAP * this.badges.length;
    }

    get leader() {
      return League.LEADERS[this.stage];
    }

    get complete() {
      return this.stage >= League.LEADERS.length;
    }

    // A species starts at its stage floor: base forms at 5, middle forms where they evolved, final forms at 40.
    floor(mon) {
      const parent = this.parents.get(mon.id);
      if (!parent) return League.BASE_LEVEL;
      if (!mon.evolutions.length) return League.FINAL_LEVEL;
      return parent.step.min_level ?? League.NON_LEVEL_FLOOR;
    }

    level(mon) {
      return this.levels.get(mon.id);
    }

    // The same circuit seed and leader index always give the same roster, so a retry faces the same team.
    leaderRoster(index) {
      const leader = League.LEADERS[index];
      const random = new SeededRandom(this.seed + Math.imul(index + 1, 0x9e3779b1));
      return Roster.random(this.catalog, leader.cap, () => random.next(), this.core(leader));
    }

    // The leader's type stars, best first, each in the open slot where it rates highest.
    core(leader) {
      const fixed = new Map();
      if (!leader.type) return fixed;
      const best = (mon) => Math.max(...POSITIONS.map((position) => Roster.rating(mon, position.code)));
      const stars = this.catalog
        .filter((mon) => mon.types.includes(leader.type))
        .sort((a, b) => best(b) - best(a) || a.id - b.id);
      let spent = 0;
      const picked = [];
      for (const mon of stars) {
        if (picked.length === League.CORE_SIZE) break;
        if (spent + Roster.salary(mon) > leader.cap * League.CORE_SHARE) continue;
        spent += Roster.salary(mon);
        picked.push(mon);
      }
      for (const mon of picked) {
        const slots = POSITIONS.map((position, index) => ({ index, rating: Roster.rating(mon, position.code) }));
        const open = slots.filter((slot) => !fixed.has(slot.index));
        fixed.set(open.sort((a, b) => b.rating - a.rating || a.index - b.index)[0].index, mon);
      }
      return fixed;
    }

    game(quarterSeconds = 300) {
      if (this.complete) throw new Error('The circuit is complete');
      const game = new FootballGame(this.roster, this.leaderRoster(this.stage), quarterSeconds, this.roll);
      game.cpuStyle = this.leader.style;
      return game;
    }

    static impact(box = {}) {
      const { yards = 0, touchdowns = 0, tackles = 0, sacks = 0, interceptions = 0, moveHits = 0 } = box;
      const gained = Math.floor(Math.max(0, yards) / League.YARDS_PER_LEVEL);
      return gained + 3 * touchdowns + tackles + 2 * (sacks + interceptions) + moveHits;
    }

    // Settles a finished game: levels, games played, the badge and stone on a win, evolutions, and a fresh transfer window.
    record(game) {
      if (!game.over) throw new Error('The game is not over');
      const leader = this.leader;
      const win = game.score.home > game.score.away;
      const gains = this.roster.players.map((mon) => {
        const impact = League.impact(game.stats.home[mon.id]);
        const from = this.level(mon);
        const to = Math.min(League.MAX_LEVEL, from + impact + (win ? League.WIN_BONUS : 0));
        return { mon, impact, from, to };
      });
      const mvp = win ? gains.reduce((top, entry) => (entry.impact > top.impact ? entry : top)).mon : null;
      for (const { mon, to } of gains) {
        this.levels.set(mon.id, to);
        this.games.set(mon.id, this.games.get(mon.id) + 1);
      }
      const events = [...this.roster.players].flatMap((mon) => this.settle(mon, mvp));
      if (win) this.award(leader);
      this.transfersLeft = League.TRANSFERS;
      return { win, leader, score: { ...game.score }, stone: win ? leader.stone : null, gains, mvp, events };
    }

    award(leader) {
      this.badges.push(leader.name);
      if (leader.stone) this.stones[leader.stone] = (this.stones[leader.stone] ?? 0) + 1;
      this.stage += 1;
    }

    ready(mon, step, mvp) {
      if (step.trigger === 'level-up') return this.level(mon) >= step.min_level;
      if (step.trigger === 'trade') return mon === mvp;
      if (step.trigger === 'friendship') return this.games.get(mon.id) >= League.FRIENDSHIP_GAMES;
      return false;
    }

    onRoster(step) {
      return this.roster.players.includes(this.catalog[step.into - 1]);
    }

    // Level, trade, and friendship evolutions fire in a chain; a target already on the roster waits.
    settle(mon, mvp) {
      const events = [];
      let current = mon;
      for (;;) {
        const ready = current.evolutions.filter((step) => this.ready(current, step, mvp));
        const free = ready.filter((step) => !this.onRoster(step));
        if (!free.length) {
          if (ready.length)
            events.push({
              from: current,
              into: this.catalog[ready[0].into - 1],
              reason: 'already on your team',
              waiting: true,
            });
          return events;
        }
        const step = free[Math.floor(this.random.next() * free.length)];
        events.push(this.apply(current, step));
        current = this.catalog[step.into - 1];
      }
    }

    apply(mon, step) {
      const target = this.catalog[step.into - 1];
      this.roster.evolve(mon, step.into);
      for (const records of [this.levels, this.games]) {
        records.set(target.id, records.get(mon.id));
        records.delete(mon.id);
      }
      return { from: mon, into: target, reason: step.trigger, waiting: false };
    }

    stoneSteps(mon, stone) {
      return mon.evolutions.filter(
        (step) => step.trigger === 'use-item' && step.item === stone && !this.onRoster(step),
      );
    }

    evolve(monId, stone) {
      const mon = this.roster.players.find((player) => player.id === monId);
      if (!mon) throw new RangeError('That player is not on your team');
      if (!this.stones[stone]) throw new RangeError('You have no such stone');
      const [step] = this.stoneSteps(mon, stone);
      if (!step) throw new RangeError(`${mon.name} cannot use that stone`);
      this.stones[stone] -= 1;
      return this.apply(mon, step);
    }

    // A transfer may not lift payroll above the player's cap; a cheaper or equal swap is always legal.
    transfer(outId, inId) {
      if (this.complete) throw new Error('The circuit is complete');
      if (!this.transfersLeft) throw new RangeError('No transfers left in this window');
      const slot = this.roster.players.findIndex((player) => player.id === outId);
      const incoming = this.catalog[inId - 1];
      if (slot < 0) throw new RangeError('That player is not on your team');
      if (!incoming || this.roster.players.includes(incoming)) throw new RangeError('That player is unavailable');
      const before = this.roster.salary;
      const after = before - Roster.salary(this.roster.players[slot]) + Roster.salary(incoming);
      if (after > this.playerCap && after > before) throw new RangeError('That transfer breaks the cap');
      this.levels.delete(outId);
      this.games.delete(outId);
      this.roster.assign(slot, incoming);
      this.levels.set(incoming.id, this.floor(incoming));
      this.games.set(incoming.id, 0);
      this.transfersLeft -= 1;
    }

    toJSON() {
      return {
        version: League.VERSION,
        seed: this.seed,
        random: this.random.state,
        stage: this.stage,
        badges: this.badges,
        stones: this.stones,
        transfersLeft: this.transfersLeft,
        players: this.roster.players.map((mon) => ({
          id: mon.id,
          level: this.level(mon),
          games: this.games.get(mon.id),
          moves: this.roster.movesets.get(mon.id) ?? null,
        })),
      };
    }

    static fromJSON(catalog, json) {
      if (json.version !== League.VERSION) throw new RangeError('Unknown league save version');
      const roster = new Roster(
        catalog,
        json.players.map((entry) => entry.id),
      );
      if (roster.players.length !== POSITIONS.length || roster.players.some((mon) => !mon))
        throw new RangeError('The saved roster is incomplete');
      const league = new League(catalog, roster, json.seed);
      league.random.state = json.random;
      Object.assign(league, {
        stage: json.stage,
        badges: [...json.badges],
        stones: { ...json.stones },
        transfersLeft: json.transfersLeft,
      });
      for (const entry of json.players) {
        league.levels.set(entry.id, entry.level);
        league.games.set(entry.id, entry.games);
        if (entry.moves) roster.setMoveset(catalog[entry.id - 1], entry.moves);
      }
      return league;
    }
  }

  const exported = { League, SeededRandom };
  if (typeof module !== 'undefined') module.exports = exported;
  else Object.assign((window.Pokeballers ||= {}), exported);
}
