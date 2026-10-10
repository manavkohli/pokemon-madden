// Usage: node scripts/league-balance.cjs [circuits] [transfers per window]. Plays seeded Gym Challenge circuits and prints win rates and evolutions.
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { League } = require('../src/game/league.js');
const { POSITIONS } = require('../src/game/playbook.js');

// Plays whole circuits with the CPU coaching both sides and a simple manager spending stones and transfers.
class LeagueSim {
  static MAX_TRIES = 12;
  static STARTERS = [
    ...['QB', 'RB', 'TE'].map((code) => [code, 1]),
    ['WR', 3],
    ['OL', 5],
    ['DL', 4],
    ['LB', 3],
    ['CB', 2],
    ['S', 2],
  ];

  // `swaps` is how many transfers the manager makes per window; 0 keeps the drafted roster.
  constructor(seed, swaps = 0) {
    this.seed = seed;
    this.swaps = swaps;
  }

  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 2 ** 32;
  }

  // The CPU rules coach the away side; this view swaps the sides so the same rules coach the home side.
  static mirror(game) {
    const swap = { home: 'away', away: 'home' };
    const flip = (pair) => ({ home: pair.away, away: pair.home });
    return new Proxy(game, {
      get: (target, prop, receiver) => {
        if (['score', 'rosters', 'timeouts'].includes(prop)) return flip(target[prop]);
        if (prop === 'possession') return swap[target.possession];
        if (prop === 'history') return target.history.map((call) => ({ ...call, side: swap[call.side] }));
        if (prop === 'cpuStyle') return 'balanced';
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  play(game) {
    const view = LeagueSim.mirror(game);
    game.autoRotate.home = true;
    for (let snaps = 0; !game.over && snaps < 900; snaps++) {
      const home = game.possession === 'home';
      game.prepareCall(home ? view.chooseCpuOffense() : view.chooseCpuDefense());
      const { offense, defense } = game.phase;
      const options = (home ? view : game).cpuOptions(offense, defense);
      game.fireCpuMove('home', home ? game.resolveOffense(offense, options) : defense);
      game.snap(offense, defense, options);
    }
    return game;
  }

  // Spends every stone on the biggest stat jump, then upgrades the weakest starters that the cap leaves room for.
  manage(league) {
    const events = [];
    for (const stone of Object.keys(league.stones)) {
      while (league.stones[stone] > 0) {
        const options = league.roster.players
          .flatMap((mon) =>
            league
              .stoneSteps(mon, stone)
              .map((step) => ({ mon, gain: data[step.into - 1].base_stats.total - mon.base_stats.total })),
          )
          .sort((a, b) => b.gain - a.gain);
        if (!options.length) break;
        events.push(league.evolve(options[0].mon.id, stone));
      }
    }
    if (!league.complete) this.upgrade(league);
    return events;
  }

  upgrade(league) {
    const starters = POSITIONS.map((position, index) => ({ position, index })).filter(
      ({ position }) => position.depth === 1,
    );
    for (let swaps = 0; swaps < this.swaps; swaps++) {
      const room = league.leader.cap - league.roster.salary;
      const weakest = starters
        .map(({ position, index }) => ({ position, mon: league.roster.players[index] }))
        .sort((a, b) => Roster.rating(a.mon, a.position.code) - Roster.rating(b.mon, b.position.code))[0];
      const budget = Roster.salary(weakest.mon) + Math.max(0, room);
      const better = data
        .filter((mon) => !league.roster.players.includes(mon) && Roster.salary(mon) <= budget)
        .sort((a, b) => Roster.rating(b, weakest.position.code) - Roster.rating(a, weakest.position.code))[0];
      if (
        !better ||
        Roster.rating(better, weakest.position.code) < Roster.rating(weakest.mon, weakest.position.code) + 3
      )
        return;
      league.transfer(weakest.mon.id, better.id);
    }
  }

  // Plays one circuit with a fresh 20,000-credit roster; a leader gets up to MAX_TRIES attempts.
  circuit() {
    const league = League.start(
      data,
      Roster.random(data, League.DRAFT_CAP, () => this.random()),
      () => this.random(),
    );
    const lineage = new Map();
    for (const [code, count] of LeagueSim.STARTERS)
      for (let depth = 0; depth < count; depth++) {
        const mon = league.roster.player(code, depth);
        lineage.set(mon.id, { origin: mon.id, evolvable: mon.evolutions.length > 0, evolved: false });
      }
    const gyms = [];
    while (!league.complete) {
      const gym = { index: league.stage, tries: 0, won: false, firstTry: false, points: 0, against: 0 };
      while (!gym.won && gym.tries < LeagueSim.MAX_TRIES) {
        const game = this.play(league.game(300));
        const report = league.record(game);
        gym.tries += 1;
        gym.won = report.win;
        gym.firstTry ||= report.win && gym.tries === 1;
        gym.points += game.score.home;
        gym.against += game.score.away;
        for (const event of [...report.events, ...this.manage(league)]) {
          if (!event.waiting && lineage.has(event.from.id)) {
            const entry = lineage.get(event.from.id);
            entry.evolved = true;
            lineage.set(event.into.id, entry);
          }
        }
      }
      gyms.push(gym);
      if (!gym.won) break;
    }
    return { gyms, complete: league.complete, starters: new Set(lineage.values()) };
  }

  static run(circuits, swaps) {
    const stages = League.LEADERS.map(() => ({ reached: 0, first: 0, wins: 0, tries: 0, points: 0, against: 0 }));
    let complete = 0;
    let evolved = 0;
    let evolvable = 0;
    let starters = 0;
    for (let seed = 1; seed <= circuits; seed++) {
      const result = new LeagueSim(seed, swaps).circuit();
      complete += result.complete ? 1 : 0;
      for (const gym of result.gyms) {
        const stage = stages[gym.index];
        stage.reached += 1;
        stage.first += gym.firstTry ? 1 : 0;
        stage.wins += gym.won ? 1 : 0;
        stage.tries += gym.tries;
        stage.points += gym.points;
        stage.against += gym.against;
      }
      for (const entry of result.starters) {
        starters += 1;
        evolved += entry.evolved ? 1 : 0;
        evolvable += entry.evolvable ? 1 : 0;
      }
    }
    return { stages, complete, evolved, evolvable, starters };
  }
}

if (require.main === module) {
  const circuits = Number(process.argv[2] ?? 200);
  const swaps = Number(process.argv[3] ?? 0);
  const { stages, complete, evolved, evolvable, starters } = LeagueSim.run(circuits, swaps);
  console.log(
    `${circuits} circuits, 20,000-credit starting roster, ${swaps} transfers per window, ${LeagueSim.MAX_TRIES} tries per leader`,
  );
  console.log('leader      cap    reached  first-try win%  win%/game  score');
  League.LEADERS.forEach((leader, index) => {
    const row = stages[index];
    const pct = (part, whole) => (whole ? ((100 * part) / whole).toFixed(0) : '-').padStart(5);
    console.log(
      `${leader.name.padEnd(10)} ${String(leader.cap).padStart(6)} ${String(row.reached).padStart(8)} ${pct(row.first, row.reached)}%         ${pct(row.wins, row.tries)}%   ${(row.points / (row.tries || 1)).toFixed(1)}-${(row.against / (row.tries || 1)).toFixed(1)}`,
    );
  });
  console.log(`circuits completed: ${((100 * complete) / circuits).toFixed(0)}%`);
  console.log(
    `starters that evolve at least once: ${((100 * evolved) / starters).toFixed(0)}% of all starters, ${((100 * evolved) / evolvable).toFixed(0)}% of starters that have an evolution (${starters} starters, ${evolvable} with an evolution)`,
  );
}

module.exports = { LeagueSim };
