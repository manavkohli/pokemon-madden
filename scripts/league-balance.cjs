// Usage: node scripts/league-balance.cjs [circuits] [transfers per window]. Plays seeded Gym Challenge circuits and prints win rates and evolutions.
const data = require('../pokemon_gen1_2.json').pokemon;
const { Roster } = require('../src/game/roster.js');
const { League } = require('../src/game/league.js');
const { POSITIONS } = require('../src/game/playbook.js');
const { seeded } = require('../tests/helpers.cjs');

// Plays whole circuits with the CPU coaching both sides and a simple manager spending stones and transfers.
class LeagueSim {
  static MAX_TRIES = 12;
  // The no-transfer win rate falls linearly from the first leader to the Champion.
  static TARGET_START = 80;
  static TARGET_END = 35;
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
    this.random = seeded(seed);
    this.swaps = swaps;
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
      // The human side takes its auto action in every clash, as clash-balance.cjs does.
      if (game.snap(offense, defense, options).clash) game.autoResolveClash();
    }
    return game;
  }

  // Spends every stone on the biggest stat jump, then applies the transfer policy.
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
    this.traded = league.complete ? [] : this.upgrade(league);
    return events;
  }

  // The transfer policy: up to `swaps` times, the lowest-rated starter goes for the best-rated free agent at its
  // position that League.transfer accepts. Returns the ids of the players traded away.
  upgrade(league) {
    const depths = new Map(LeagueSim.STARTERS);
    const starters = POSITIONS.map((position, index) => ({ position, index })).filter(
      ({ position }) => position.depth <= depths.get(position.code),
    );
    const out = [];
    const tried = new Set();
    while (out.length < this.swaps && tried.size < starters.length) {
      const weakest = starters
        .filter(({ index }) => !tried.has(index))
        .map(({ position, index }) => ({ position, index, mon: league.roster.players[index] }))
        .sort((a, b) => Roster.rating(a.mon, a.position.code) - Roster.rating(b.mon, b.position.code))[0];
      tried.add(weakest.index);
      const rate = (mon) => Roster.rating(mon, weakest.position.code);
      const better = data
        .filter((mon) => !league.roster.players.includes(mon) && rate(mon) > rate(weakest.mon))
        .sort((a, b) => rate(b) - rate(a));
      for (const mon of better) {
        try {
          league.transfer(weakest.mon.id, mon.id);
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          continue;
        }
        out.push(weakest.mon.id);
        break;
      }
    }
    return out;
  }

  // Plays one circuit with a fresh 13,000-credit roster; a leader gets up to MAX_TRIES attempts.
  circuit() {
    const league = League.start(
      data,
      Roster.random(data, League.DRAFT_CAP, { random: () => this.random(), pool: League.startingPool(data) }),
      () => this.random(),
    );
    const starting = new Set();
    for (const [code, count] of LeagueSim.STARTERS)
      for (let depth = 0; depth < count; depth++) starting.add(league.roster.player(code, depth).id);
    const lineage = new Map(
      league.roster.players.map((mon) => [mon.id, { starter: starting.has(mon.id), evolved: false }]),
    );
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
        // A player traded away counts as neither evolved nor not evolved.
        for (const id of this.traded) {
          const entry = lineage.get(id);
          for (const [key, value] of lineage) if (value === entry) lineage.delete(key);
        }
      }
      gyms.push(gym);
      if (!gym.won) break;
    }
    return { gyms, complete: league.complete, players: new Set(lineage.values()) };
  }

  static run(circuits, swaps, first = 1) {
    const stages = League.LEADERS.map(() => ({ reached: 0, first: 0, wins: 0, tries: 0, points: 0, against: 0 }));
    let complete = 0;
    const share = { all: [0, 0], starters: [0, 0] };
    for (let seed = first; seed < first + circuits; seed++) {
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
      for (const entry of result.players) {
        for (const key of entry.starter ? ['all', 'starters'] : ['all']) {
          share[key][0] += entry.evolved ? 1 : 0;
          share[key][1] += 1;
        }
      }
    }
    return { stages, complete, share };
  }
}

if (require.main === module) {
  const circuits = Number(process.argv[2] ?? 200);
  const results = [League.TRANSFERS, 0].map((swaps) => LeagueSim.run(circuits, swaps));
  const last = League.LEADERS.length - 1;
  const pct = (part, whole) => (whole ? ((100 * part) / whole).toFixed(0) : '-').padStart(4);
  console.log(
    `${circuits} circuits, ${League.DRAFT_CAP.toLocaleString()}-credit starting roster, ${LeagueSim.MAX_TRIES} tries per leader, clashes on`,
  );
  console.log('win % per game (first-try %); the target applies to the transfer policy');
  console.log('leader      cap    target  3 transfers (gap)     no transfers');
  League.LEADERS.forEach((leader, index) => {
    const [policy, none] = results.map(({ stages }) => stages[index]);
    const target = LeagueSim.TARGET_START - ((LeagueSim.TARGET_START - LeagueSim.TARGET_END) * index) / last;
    const rate = (100 * policy.wins) / (policy.tries || 1);
    console.log(
      `${leader.name.padEnd(10)} ${String(leader.cap).padStart(6)}  ${target.toFixed(0).padStart(5)}%  ${pct(policy.wins, policy.tries)}% (${pct(policy.first, policy.reached).trim()}%) ${(rate - target).toFixed(0).padStart(4)}      ${pct(none.wins, none.tries)}% (${pct(none.first, none.reached).trim()}%)`,
    );
  });
  const percent = ([part, whole]) => `${((100 * part) / whole).toFixed(0)}% (${part} of ${whole})`;
  for (const [label, { complete, share }] of [
    ['3 transfers', results[0]],
    ['no transfers', results[1]],
  ])
    console.log(
      `${label}: ${((100 * complete) / circuits).toFixed(0)}% of circuits finish; players who stayed that evolve at least once: ${percent(share.all)}; the 22 starters: ${percent(share.starters)}`,
    );
}

module.exports = { LeagueSim };
