const POSITIONS = [
  { code: 'QB', name: 'Quarterback' },
  { code: 'RB', name: 'Running back' },
  { code: 'WR', name: 'Wide receiver' },
  { code: 'WR', name: 'Wide receiver' },
  { code: 'TE', name: 'Tight end' },
  { code: 'OL', name: 'Offensive line' },
  { code: 'DL', name: 'Defensive line' },
  { code: 'DL', name: 'Defensive line' },
  { code: 'LB', name: 'Linebacker' },
  { code: 'CB', name: 'Cornerback' },
  { code: 'S', name: 'Safety' },
];
const SALARY_CAP = 13000;

const OFFENSE = [
  { id: 'inside-zone', name: 'Inside Zone', icon: '🦬', group: 'run', kind: 'run', base: 3, spread: 10, detail: 'Patient run between the tackles' },
  { id: 'power-run', name: 'Power Run', icon: '💪', group: 'run', kind: 'run', base: 4, spread: 11, detail: 'Follow your strongest blocker' },
  { id: 'outside-stretch', name: 'Outside Stretch', icon: '🌿', group: 'run', kind: 'run', base: 3, spread: 15, detail: 'Race the defense to the edge' },
  { id: 'draw', name: 'Draw Play', icon: '🎣', group: 'run', kind: 'run', base: 4, spread: 13, detail: 'Invite the rush, then run' },
  { id: 'qb-sneak', name: 'QB Sneak', icon: '🐾', group: 'run', kind: 'run', base: 1, spread: 5, detail: 'Push for a short first down' },
  { id: 'counter-run', name: 'Counter Run', icon: '↪️', group: 'run', kind: 'run', base: 4, spread: 13, detail: 'Step one way, cut back behind the line' },
  { id: 'read-option', name: 'Read Option', icon: '🔀', group: 'run', kind: 'run', base: 5, spread: 15, detail: 'Quarterback reads the edge defender' },
  { id: 'quick-slant', name: 'Quick Slant', icon: '⚡', group: 'pass', kind: 'short', base: 6, spread: 10, detail: 'Fast timing route' },
  { id: 'curl-routes', name: 'Curl Routes', icon: '↩️', group: 'pass', kind: 'short', base: 7, spread: 11, detail: 'Reliable sideline throw' },
  { id: 'screen-pass', name: 'Screen Pass', icon: '🫧', group: 'pass', kind: 'short', base: 6, spread: 14, detail: 'Punish an aggressive rush' },
  { id: 'drag-cross', name: 'Drag Cross', icon: '➰', group: 'pass', kind: 'short', base: 7, spread: 11, detail: 'Receivers cross underneath coverage' },
  { id: 'out-route', name: 'Out Route', icon: '↗️', group: 'pass', kind: 'short', base: 6, spread: 12, detail: 'Quick break toward the sideline' },
  { id: 'te-seam', name: 'TE Seam', icon: '🪡', group: 'pass', kind: 'medium', base: 11, spread: 15, detail: 'Split the safeties' },
  { id: 'play-action', name: 'Play Action', icon: '🎭', group: 'pass', kind: 'medium', base: 12, spread: 16, detail: 'Sell the run, throw behind it' },
  { id: 'post-route', name: 'Post Route', icon: '📮', group: 'pass', kind: 'medium', base: 14, spread: 16, detail: 'Attack the gap between deep defenders' },
  { id: 'wheel-route', name: 'Wheel Route', icon: '🎡', group: 'pass', kind: 'medium', base: 12, spread: 18, detail: 'Back turns upfield along the sideline' },
  { id: 'deep-shot', name: 'Deep Shot', icon: '🚀', group: 'pass', kind: 'deep', base: 22, spread: 20, detail: 'Vertical strike, high risk' },
  { id: 'hail-mary', name: 'Hail Mary', icon: '🌠', group: 'pass', kind: 'deep', base: 32, spread: 26, detail: 'Desperation ball downfield' },
  { id: 'double-move', name: 'Double Move', icon: '〽️', group: 'pass', kind: 'deep', base: 24, spread: 22, detail: 'Fake a short route, break deep' },
  { id: 'jet-sweep', name: 'Jet Sweep', icon: '🌪️', group: 'trick', kind: 'run', base: 5, spread: 17, detail: 'Receiver takes the handoff' },
  { id: 'reverse', name: 'Reverse', icon: '🔄', group: 'trick', kind: 'trick', base: 10, spread: 21, detail: 'Send pursuit the wrong way' },
  { id: 'flea-flicker', name: 'Flea Flicker', icon: '🪄', group: 'trick', kind: 'trick', base: 18, spread: 25, detail: 'Double handoff into a pass' },
  { id: 'qb-scramble', name: 'QB Scramble', icon: '🏃', group: 'trick', kind: 'run', base: 4, spread: 13, detail: 'Let the passer find a lane' },
  { id: 'end-around', name: 'End Around', icon: '🌀', group: 'trick', kind: 'run', base: 5, spread: 17, detail: 'Wideout circles behind the quarterback' },
  { id: 'punt', name: 'Punt', icon: '🦵', group: 'special', kind: 'punt', base: 0, spread: 0, detail: 'Flip the field on fourth down' },
  { id: 'field-goal', name: 'Field Goal', icon: '🎯', group: 'special', kind: 'kick', base: 0, spread: 0, detail: 'Three points if it is good' },
];

const DEFENSE = [
  { id: 'cover-2', name: 'Cover 2', icon: '🛡️', detail: 'Two deep defenders', strengths: ['medium', 'deep'], weakness: 'run' },
  { id: 'cover-3', name: 'Cover 3', icon: '☂️', detail: 'Three deep zones', strengths: ['deep'], weakness: 'short' },
  { id: 'cover-4', name: 'Cover 4', icon: '🌧️', detail: 'Blanket long routes', strengths: ['deep', 'trick'], weakness: 'run' },
  { id: 'man', name: 'Man Coverage', icon: '👁️', detail: 'Match every receiver', strengths: ['short', 'medium'], weakness: 'run' },
  { id: 'press', name: 'Press Man', icon: '✋', detail: 'Jam receivers early', strengths: ['short'], weakness: 'deep' },
  { id: 'blitz', name: 'Blitz', icon: '💥', detail: 'Send extra rushers', strengths: ['deep', 'medium'], weakness: 'short' },
  { id: 'run-stuff', name: 'Run Stuff', icon: '🧱', detail: 'Stack the box', strengths: ['run'], weakness: 'deep' },
  { id: 'spy', name: 'QB Spy', icon: '🎯', detail: 'Track the passer', strengths: ['trick', 'run'], weakness: 'medium' },
  { id: 'prevent', name: 'Prevent', icon: '🌊', detail: 'Keep it in front', strengths: ['deep'], weakness: 'short' },
  { id: 'zone-blitz', name: 'Zone Blitz', icon: '🌀', detail: 'Disguised pressure', strengths: ['medium', 'trick'], weakness: 'run' },
  { id: 'nickel', name: 'Nickel', icon: '🪙', detail: 'Extra defensive back', strengths: ['short', 'medium'], weakness: 'run' },
  { id: 'goal-line', name: 'Goal Line', icon: '🚧', detail: 'Heavy short-yardage front', strengths: ['run'], weakness: 'deep' },
  { id: 'cover-1', name: 'Cover 1', icon: '☝️', detail: 'Single high safety; tight man underneath', strengths: ['short'], weakness: 'deep' },
  { id: 'cover-6', name: 'Cover 6', icon: '6️⃣', detail: 'Split-field zones; resist deep posts', strengths: ['deep', 'medium'], weakness: 'run' },
  { id: 'tampa-2', name: 'Tampa 2', icon: '🌴', detail: 'Linebacker drops deep through the middle', strengths: ['medium'], weakness: 'short' },
  { id: 'bear-front', name: 'Bear Front', icon: '🐻', detail: 'Crowd the line to shut down inside runs', strengths: ['run'], weakness: 'deep' },
  { id: 'edge-contain', name: 'Edge Contain', icon: '🪤', detail: 'Set a hard edge against sweeps and scrambles', strengths: ['run', 'trick'], weakness: 'medium' },
  { id: 'robber', name: 'Robber', icon: '🦝', detail: 'Safety jumps crossing and slant routes', strengths: ['short', 'medium'], weakness: 'deep' },
  { id: 'double-wide', name: 'Double Wide', icon: '👥', detail: 'Bracket the two outside receivers', strengths: ['deep'], weakness: 'run' },
];

class Roster {
  constructor(pokemon, ids) {
    this.pokemon = pokemon;
    this.players = ids.map(id => pokemon[id - 1]);
  }

  static random(pokemon) {
    const used = new Set();
    const players = POSITIONS.map(position => {
      const candidates = pokemon.filter(mon => !used.has(mon.id))
        .sort((a, b) => Roster.rating(b, position.code) - Roster.rating(a, position.code));
      const player = candidates[Math.floor(Math.random() * Math.min(85, candidates.length))];
      used.add(player.id);
      return player;
    });
    const roster = new Roster(pokemon, []);
    roster.players = players;
    return roster;
  }

  static salary(mon) {
    return Math.round(mon.base_stats.total * 1.25 + ([144,145,146,150,151,243,244,245,249,250,251].includes(mon.id) ? 450 : 0));
  }

  static rating(mon, position) {
    const s = mon.base_stats;
    const traits = {
      QB: s.special_attack * .42 + s.speed * .26 + s.special_defense * .2 + s.hp * .12,
      RB: s.attack * .38 + s.speed * .31 + s.hp * .21 + s.defense * .1,
      WR: s.speed * .43 + s.attack * .22 + s.special_attack * .25 + s.hp * .1,
      TE: s.hp * .28 + s.attack * .24 + s.defense * .2 + s.special_attack * .28,
      OL: s.hp * .32 + s.defense * .37 + s.attack * .31,
      DL: s.attack * .35 + s.defense * .4 + s.hp * .25,
      LB: s.attack * .29 + s.defense * .28 + s.speed * .24 + s.hp * .19,
      CB: s.speed * .39 + s.defense * .22 + s.special_defense * .28 + s.hp * .11,
      S: s.speed * .3 + s.special_defense * .34 + s.defense * .24 + s.hp * .12,
    };
    return Math.max(20, Math.min(99, Math.round(20 + traits[position] * .63)));
  }

  get salary() {
    return this.players.reduce((sum, mon) => sum + Roster.salary(mon), 0);
  }

  player(position, occurrence = 0) {
    return this.players[POSITIONS.findIndex((slot, i) => slot.code === position && POSITIONS.slice(0, i).filter(previous => previous.code === position).length === occurrence)];
  }

  rating(position) {
    if (position === 'WR' || position === 'DL') return Math.round((Roster.rating(this.player(position), position) + Roster.rating(this.player(position, 1), position)) / 2);
    return Roster.rating(this.player(position), position);
  }

  assign(slotIndex, mon) {
    const otherIndex = this.players.findIndex(player => player.id === mon.id);
    if (otherIndex === slotIndex) return;
    if (otherIndex >= 0) this.players[otherIndex] = this.players[slotIndex];
    this.players[slotIndex] = mon;
  }
}

class FootballGame {
  constructor(home, away, quarterSeconds, random = Math.random) {
    this.rosters = { home, away };
    this.quarterSeconds = quarterSeconds;
    this.random = random;
    this.quarter = 1;
    this.seconds = quarterSeconds;
    this.score = { home: 0, away: 0 };
    this.possession = 'home';
    this.spot = 25;
    this.down = 1;
    this.toGo = 10;
    this.drive = 1;
    this.over = false;
    this.history = [];
    this.log = ['Kickoff! Volts start at their own 25.'];
  }

  opponent(side = this.possession) {
    return side === 'home' ? 'away' : 'home';
  }

  offenseStrength(play) {
    const team = this.rosters[this.possession];
    if (play.kind === 'run') return team.rating('RB') * .5 + team.rating('OL') * .3 + team.rating('TE') * .1 + team.rating('QB') * .1;
    if (play.kind === 'trick') return team.rating('QB') * .35 + team.rating('RB') * .27 + team.rating('WR') * .38;
    if (play.kind === 'deep') return team.rating('QB') * .48 + team.rating('WR') * .42 + team.rating('OL') * .1;
    return team.rating('QB') * .4 + team.rating('WR') * .34 + team.rating('TE') * .16 + team.rating('OL') * .1;
  }

  defenseStrength(play) {
    const team = this.rosters[this.opponent()];
    if (play.kind === 'run') return team.rating('DL') * .44 + team.rating('LB') * .38 + team.rating('S') * .18;
    return team.rating('DL') * .22 + team.rating('CB') * .4 + team.rating('S') * .38;
  }

  chooseCpuOffense() {
    const deficit = this.score.home - this.score.away;
    const late = this.quarter >= 4 && this.seconds < 90;
    const hurry = (this.quarter === 2 || this.quarter >= 4) && this.seconds < 120;
    if (this.down === 4) {
      const kickDistance = 117 - this.spot;
      const shortConversion = this.toGo <= 2 && this.spot >= 50 && this.spot < 95;
      if (kickDistance <= 55 && !(late && deficit > 3) && !(shortConversion && deficit > 3)) return OFFENSE.find(play => play.id === 'field-goal');
      if (this.spot < 48 && this.toGo > 2 && !(late && deficit > 0)) return OFFENSE.find(play => play.id === 'punt');
    }
    const pool = OFFENSE.filter(play => play.group !== 'special');
    const runBias = this.toGo <= 3 ? 4 : this.toGo >= 8 && this.down >= 3 ? -5 : 1;
    const clockBias = hurry && deficit > 0 ? -5 : late && deficit < 0 ? 3 : 0;
    const recentDefense = this.history.filter(call => call.side === 'away').slice(-6).map(call => DEFENSE.find(play => play.id === call.defenseId)).filter(Boolean);
    const previous = this.history.at(-1);
    const team = this.rosters.away;
    const ranked = pool.map(play => {
      const depth = play.kind === 'deep' ? 3 : play.kind === 'medium' ? 2 : play.kind === 'short' ? 1 : 0;
      let score = play.kind === 'run' ? runBias + clockBias : depth * (this.toGo >= 8 ? 2 : 0) - clockBias;
      if (this.spot >= 80 && play.kind === 'deep') score -= 7;
      if (this.down === 4 && play.kind === 'run' && this.toGo > 3) score -= 8;
      if (this.down === 4 && play.kind === 'short' && this.toGo > 8) score -= 5;
      if (late && deficit > 0 && play.kind === 'deep') score += 4;
      if (play.id === 'hail-mary' && !(late && deficit > 0) && this.toGo < 20) score -= 8;
      if (play.id === 'qb-sneak' && this.toGo > 2) score -= 6;
      if (play.kind === 'trick' && this.down >= 3) score -= 3;
      if (play.kind === 'run') score += (team.rating('RB') - team.rating('QB')) / 12;
      if (play.kind !== 'run') score += (team.rating('QB') - team.rating('RB')) / 12;
      if (previous?.side === 'away' && previous.id === play.id) score -= 3;
      if (recentDefense.length >= 3) score += recentDefense.filter(scheme => scheme.weakness === play.kind).length - recentDefense.filter(scheme => scheme.strengths.includes(play.kind)).length;
      return { play, score: score + this.random() * 7 };
    }).sort((a, b) => b.score - a.score);
    return ranked[0].play;
  }

  chooseCpuDefense() {
    const recent = this.history.filter(call => call.side === 'home').slice(-8);
    const runs = recent.filter(call => call.kind === 'run').length;
    const passes = recent.length - runs;
    const expected = this.toGo <= 3 ? 'run' : this.toGo >= 8 && this.down >= 3 ? 'deep' : 'medium';
    const late = this.quarter >= 4 && this.seconds < 120;
    const homeDeficit = this.score.away - this.score.home;
    const ranked = DEFENSE.map(play => {
      let score = play.strengths.includes(expected) ? 4 : play.weakness === expected ? -3 : 0;
      if (recent.length >= 3 && Math.abs(runs - passes) >= 2) score += play.strengths.includes(runs > passes ? 'run' : 'short') ? 6 : 0;
      if (this.spot >= 90 && ['goal-line', 'run-stuff', 'robber'].includes(play.id)) score += 4;
      if (this.toGo >= 10 && ['nickel', 'cover-4', 'zone-blitz'].includes(play.id)) score += 2;
      if (late && homeDeficit > 0 && ['cover-4', 'prevent', 'cover-6'].includes(play.id)) score += 3;
      if (late && homeDeficit < 0 && ['blitz', 'zone-blitz', 'press'].includes(play.id)) score += 3;
      if (recent.at(-1)?.id === 'screen-pass' && play.id === 'robber') score += 2;
      return { play, score: score + this.random() * 7 };
    }).sort((a, b) => b.score - a.score);
    return ranked[0].play;
  }

  snap(offense, defense) {
    if (this.over) throw new Error('The game has ended.');
    const side = this.possession;
    const wasOvertime = this.quarter === 5;
    const priorScore = this.score.home + this.score.away;
    const result = offense.kind === 'punt' ? this.punt() : offense.kind === 'kick' ? this.fieldGoal() : this.scrimmage(offense, defense);
    this.history.push({ side, id: offense.id, kind: offense.kind, defenseId: defense.id });
    this.advanceClock(result.seconds);
    if (wasOvertime && this.score.home + this.score.away > priorScore) this.over = true;
    this.log.unshift(`${side === 'home' ? 'VOLTS' : 'SURF'}: ${offense.name} vs ${defense.name} — ${result.message}`);
    return result;
  }

  scrimmage(offense, defense) {
    let matchup = defense.strengths.includes(offense.kind) ? -5 : defense.weakness === offense.kind ? 2 : 0;
    if (['draw', 'screen-pass'].includes(offense.id) && ['blitz', 'zone-blitz'].includes(defense.id)) matchup += 6;
    if (['qb-scramble', 'read-option'].includes(offense.id) && ['spy', 'edge-contain'].includes(defense.id)) matchup -= 5;
    if (['outside-stretch', 'jet-sweep', 'end-around'].includes(offense.id) && defense.id === 'edge-contain') matchup -= 5;
    const advantage = (this.offenseStrength(offense) - this.defenseStrength(offense)) / 10;
    const pass = ['short', 'medium', 'deep', 'trick'].includes(offense.kind);
    if (!pass && this.random() < (defense.strengths.includes(offense.kind) ? .22 : .1)) {
      const yards = -1 - Math.floor(this.random() * 5);
      return { yards, seconds: 23, message: `STUFFED! ${this.moveBall(yards)}` };
    }
    const chance = Math.max(.19, Math.min(.85, .64 + advantage / 100 + matchup / 45 - (offense.kind === 'deep' ? .22 : offense.kind === 'trick' ? .12 : offense.kind === 'medium' ? .08 : 0)));
    if (pass && this.random() > chance) {
      const turnover = this.random() < (offense.kind === 'deep' ? .12 : .06);
      if (turnover) {
        this.changePossession(100 - this.spot);
        return { yards: 0, seconds: 8, message: 'INTERCEPTED! Possession changes.', turnover: true };
      }
      if (this.random() < (['blitz', 'zone-blitz'].includes(defense.id) ? .42 : .18)) {
        const yards = -3 - Math.floor(this.random() * 6);
        return { yards, seconds: 10, message: `SACK! ${this.moveBall(yards)}` };
      }
      this.down += 1;
      if (this.down > 4) {
        this.changePossession(100 - this.spot);
        return { yards: 0, seconds: 7, message: 'Incomplete pass. TURNOVER ON DOWNS.' };
      }
      return { yards: 0, seconds: 7, message: 'Incomplete pass.' };
    }
    const yards = Math.max(-12, Math.round(offense.base + advantage + matchup + (this.random() - .5) * offense.spread));
    if (!pass && this.random() < .018) {
      this.changePossession(100 - Math.max(1, Math.min(99, this.spot + yards)));
      return { yards, seconds: 12, message: 'FUMBLE! Defense recovers.', turnover: true };
    }
    const message = this.moveBall(yards);
    return { yards, seconds: pass ? 14 + Math.floor(this.random() * 14) : 22 + Math.floor(this.random() * 17), message };
  }

  moveBall(yards) {
    if (this.spot + yards >= 100) {
      this.score[this.possession] += 7;
      this.changePossession(25);
      return `TOUCHDOWN! ${yards} yards and the extra point is good.`;
    }
    if (this.spot + yards <= 0) {
      this.score[this.opponent()] += 2;
      this.changePossession(25);
      return 'SAFETY! The defense scores two.';
    }
    this.spot += yards;
    this.toGo -= yards;
    if (this.toGo <= 0) {
      this.down = 1;
      this.toGo = Math.min(10, 100 - this.spot);
      return `${yards} yards. FIRST DOWN!`;
    }
    this.down += 1;
    if (this.down > 4) {
      this.changePossession(100 - this.spot);
      return `${yards} yards. TURNOVER ON DOWNS.`;
    }
    return `${yards > 0 ? '+' : ''}${yards} yards. ${this.down}${this.down === 2 ? 'nd' : this.down === 3 ? 'rd' : 'th'} & ${this.toGo}.`;
  }

  punt() {
    const yards = 36 + Math.floor(this.random() * 18);
    this.changePossession(Math.max(10, 100 - this.spot - yards));
    return { yards, seconds: 9, message: `${yards}-yard punt. ${this.possession === 'home' ? 'Volts' : 'Surf'} take over.` };
  }

  fieldGoal() {
    const distance = 100 - this.spot + 17;
    const chance = Math.max(.08, .97 - Math.max(0, distance - 35) * .027);
    const good = this.random() < chance;
    if (good) this.score[this.possession] += 3;
    this.changePossession(good ? 25 : 100 - this.spot);
    return { yards: 0, seconds: 6, message: good ? `${distance}-yard field goal is GOOD!` : `${distance}-yard field goal is no good.` };
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
      this.log.unshift('FINAL WHISTLE.');
      return;
    }
    if (this.quarter === 5 && this.score.home !== this.score.away) {
      this.over = true;
      this.log.unshift('OVERTIME WINNER!');
      return;
    }
    if (this.quarter === 5) {
      this.seconds = this.quarterSeconds;
      return;
    }
    this.quarter += 1;
    this.seconds = this.quarterSeconds;
    if (this.quarter === 3) {
      this.possession = 'away';
      this.spot = 25;
      this.down = 1;
      this.toGo = 10;
      this.drive += 1;
    }
    this.log.unshift(this.quarter === 3 ? 'HALFTIME. Surf receive the second-half kickoff.' : this.quarter === 5 ? 'OVERTIME. Next score wins.' : `QUARTER ${this.quarter} begins.`);
  }
}

class GameApp {
  constructor(pokemon) {
    if (pokemon.length !== 251) throw new Error('Expected 251 Pokémon in pokemon_gen1_2.js');
    this.pokemon = pokemon;
    this.home = new Roster(pokemon, [25, 143, 59, 94, 149, 76, 248, 65, 68, 212, 197]);
    this.away = Roster.random(pokemon);
    this.selectedSlot = 0;
    this.selectedPokemon = this.home.players[0];
    this.selectedOffense = OFFENSE[0];
    this.selectedDefense = DEFENSE[0];
    this.game = null;
    this.locked = false;
    this.paused = false;
    this.pendingSnap = null;
    this.typeIcons = { Normal:'🐻',Fire:'🔥',Water:'💧',Electric:'⚡',Grass:'🌿',Ice:'❄️',Fighting:'🥊',Poison:'☠️',Ground:'🪨',Flying:'🪽',Psychic:'🔮',Bug:'🐛',Rock:'🪨',Ghost:'👻',Dragon:'🐉',Dark:'🌙',Steel:'⚙️',Fairy:'✨' };
    this.bind();
    this.renderDraft();
  }

  el(id) { return document.getElementById(id); }

  sprite(mon, size = '') {
    const emoji = this.typeIcons[mon.types[0]] || '◓';
    return `<span class="pixel-frame ${size}"><span>${emoji}</span><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
  }

  bind() {
    this.el('draftSlots').addEventListener('click', event => {
      const slot = event.target.closest('[data-slot]');
      if (!slot) return;
      this.selectedSlot = Number(slot.dataset.slot);
      this.selectedPokemon = this.home.players[this.selectedSlot];
      this.renderDraft();
    });
    this.el('catalogList').addEventListener('click', event => {
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
    this.el('playList').addEventListener('click', event => {
      const card = event.target.closest('[data-play]');
      if (!card || this.locked) return;
      if (this.game.possession === 'home') this.selectedOffense = OFFENSE.find(play => play.id === card.dataset.play);
      else this.selectedDefense = DEFENSE.find(play => play.id === card.dataset.play);
      this.renderPlays();
    });
    this.el('snapButton').addEventListener('click', () => this.snap());
    this.el('pauseButton').addEventListener('click', () => this.pause());
    this.el('resumeButton').addEventListener('click', () => this.resume());
    this.el('editTeamButton').addEventListener('click', () => this.openDraft());
    this.el('rematchButton').addEventListener('click', () => this.start());
    this.el('redraftButton').addEventListener('click', () => this.openDraft());
  }

  renderDraft() {
    this.el('draftSlots').innerHTML = POSITIONS.map((position, index) => {
      const mon = this.home.players[index];
      return `<button class="draft-slot ${index === this.selectedSlot ? 'active' : ''}" data-slot="${index}"><span class="position-tag">${position.code}${['WR', 'DL'].includes(position.code) ? POSITIONS.slice(0, index).filter(slot => slot.code === position.code).length + 1 : ''}</span>${this.sprite(mon)}<span><b>${mon.name}</b><small>${mon.types.join(' / ')}</small></span><span class="rating">${Roster.rating(mon, position.code)}</span></button>`;
    }).join('');
    const filter = this.el('typeFilter');
    if (filter.options.length === 1) {
      const types = [...new Set(this.pokemon.flatMap(mon => mon.types))].sort();
      filter.innerHTML += types.map(type => `<option>${type}</option>`).join('');
    }
    this.el('catalogTitle').textContent = `${POSITIONS[this.selectedSlot].name} prospects`;
    this.renderCatalog();
    this.renderDetail();
    this.renderBudget();
  }

  renderBudget() {
    const cap = SALARY_CAP;
    const salary = this.home.salary;
    this.el('salaryValue').textContent = `${salary.toLocaleString()} CR`;
    this.el('salaryValue').style.color = salary > cap ? 'var(--orange)' : 'var(--lime)';
    this.el('salaryMeter').style.width = `${Math.min(100, salary / cap * 100)}%`;
    this.el('salaryMeter').style.background = salary > cap ? 'var(--orange)' : 'var(--lime)';
    this.el('salaryNote').textContent = this.el('noCap').checked ? 'Cap disabled for testing' : `Cap: ${cap.toLocaleString()} credits`;
    this.el('draftMessage').textContent = salary > cap && !this.el('noCap').checked ? 'Over cap: swap a player or enable testing mode.' : 'Ready for kickoff.';
    this.el('draftMessage').classList.toggle('error', salary > cap && !this.el('noCap').checked);
    this.el('kickoffButton').disabled = salary > cap && !this.el('noCap').checked;
    this.el('rosterCount').textContent = `${this.home.players.length} / 11`;
  }

  renderCatalog() {
    const position = POSITIONS[this.selectedSlot].code;
    const query = this.el('searchInput').value.trim().toLowerCase();
    const type = this.el('typeFilter').value;
    const sort = this.el('sortSelect').value;
    const candidates = this.pokemon.filter(mon => (!type || mon.types.includes(type)) && (!query || mon.name.toLowerCase().includes(query) || String(mon.id).includes(query)));
    candidates.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'salary') return Roster.salary(a) - Roster.salary(b);
      if (sort === 'speed') return b.base_stats.speed - a.base_stats.speed;
      if (sort === 'total') return b.base_stats.total - a.base_stats.total;
      return Roster.rating(b, position) - Roster.rating(a, position);
    });
    this.el('catalogCount').textContent = `${candidates.length} players`;
    this.el('catalogList').innerHTML = candidates.length ? candidates.map(mon => `<button class="catalog-card ${mon.id === this.selectedPokemon.id ? 'active' : ''}" data-pokemon="${mon.id}">${this.sprite(mon)}<span class="meta"><b>${mon.name}</b><small>#${String(mon.id).padStart(3, '0')} · ${mon.types.join(' / ')}</small></span><span class="fit">${Roster.rating(mon, position)}</span></button>`).join('') : '<p class="catalog-empty">No Pokémon match those filters.</p>';
  }

  renderDetail() {
    const mon = this.selectedPokemon;
    const position = POSITIONS[this.selectedSlot];
    const s = mon.base_stats;
    const stats = [['HP',s.hp],['ATTACK',s.attack],['DEFENSE',s.defense],['SP. ATK',s.special_attack],['SP. DEF',s.special_defense],['SPEED',s.speed]];
    this.el('playerDetail').innerHTML = `<div class="detail-content"><div class="detail-hero">${this.sprite(mon, 'big')}<div><h3>${mon.name}</h3><p>#${String(mon.id).padStart(3, '0')} · ${mon.types.join(' / ')}</p></div></div><div class="detail-cost"><span>${position.code} FIT ${Roster.rating(mon, position.code)}</span><strong>${Roster.salary(mon)} CR</strong></div><div class="detail-label">BASE STATS · ${s.total} TOTAL</div>${stats.map(([name,value]) => `<div class="stat-row"><span>${name}</span><div class="stat-track"><i style="width:${Math.min(100, value / 255 * 100)}%"></i></div><strong>${value}</strong></div>`).join('')}<p class="detail-note">Base stats are from Pokémon Database. Position fit and salary are Pokéballers game ratings.</p><button id="assignButton" class="button primary" type="button">Put at ${position.code}${['WR', 'DL'].includes(position.code) ? POSITIONS.slice(0, this.selectedSlot).filter(slot => slot.code === position.code).length + 1 : ''} ▶</button></div>`;
    this.el('assignButton').addEventListener('click', () => {
      this.home.assign(this.selectedSlot, mon);
      this.renderDraft();
      this.el('draftMessage').textContent = `${mon.name} assigned to ${position.code}.`;
    });
  }

  start() {
    if (this.home.salary > SALARY_CAP && !this.el('noCap').checked) return;
    this.game = new FootballGame(this.home, this.away, Number(this.el('quarterLength').value));
    this.selectedOffense = OFFENSE[0];
    this.selectedDefense = DEFENSE[0];
    this.locked = false;
    this.paused = false;
    this.el('draftScreen').classList.add('hidden');
    this.el('gameScreen').classList.remove('hidden');
    this.el('pauseOverlay').classList.add('hidden');
    this.el('finalOverlay').classList.add('hidden');
    this.renderGame();
  }

  openDraft() {
    this.el('draftScreen').classList.remove('hidden');
    this.el('gameScreen').classList.add('hidden');
    this.el('finalOverlay').classList.add('hidden');
    this.el('pauseOverlay').classList.add('hidden');
    this.paused = false;
    this.renderDraft();
  }

  pause() {
    if (!this.game || this.game.over || this.el('gameScreen').classList.contains('hidden')) return;
    this.paused = true;
    this.el('pauseOverlay').classList.remove('hidden');
  }

  resume() {
    this.paused = false;
    this.el('pauseOverlay').classList.add('hidden');
    if (this.pendingSnap) {
      const finish = this.pendingSnap;
      this.pendingSnap = null;
      finish();
    }
  }

  playChoices() {
    if (this.game.possession === 'away') return DEFENSE;
    const group = this.el('playbookSelect').value;
    return OFFENSE.filter(play => (group === 'all' || play.group === group) && (play.group !== 'special' || this.game.down === 4));
  }

  renderPlays() {
    const offense = this.game.possession === 'home';
    const choices = this.playChoices();
    if (offense && !choices.includes(this.selectedOffense)) this.selectedOffense = choices[0];
    this.el('callKicker').textContent = offense ? 'YOUR OFFENSE' : 'YOUR DEFENSE';
    this.el('callHeading').textContent = offense ? 'Call your play' : 'Call your coverage';
    this.el('playbookWrap').classList.toggle('hidden', !offense);
    this.el('callHint').textContent = offense ? 'The defense reveals its scheme at the snap.' : 'The CPU offense reveals its play at the snap.';
    this.el('snapButton').textContent = offense ? 'Snap ball ▶' : 'Reveal offense ▶';
    this.el('playList').innerHTML = choices.map(play => `<button class="play-card ${play.id === (offense ? this.selectedOffense : this.selectedDefense).id ? 'active' : ''}" data-play="${play.id}"><span>${play.icon}</span><strong>${play.name}</strong><small>${play.detail}</small></button>`).join('');
    this.renderPlayInspector(offense ? this.selectedOffense : this.selectedDefense, offense);
  }

  renderPlayInspector(play, offense) {
    const routes = {
      'inside-zone': 'M80 58 L116 58', 'power-run': 'M80 58 L107 58 L124 43', 'outside-stretch': 'M80 58 Q95 80 130 79',
      draw: 'M80 58 L70 58 Q97 60 119 55', 'qb-sneak': 'M89 50 L112 50', 'counter-run': 'M80 58 L72 68 Q96 75 125 42',
      'read-option': 'M80 58 L105 58 M88 50 Q111 35 125 31', 'quick-slant': 'M81 23 L106 23 L126 43',
      'curl-routes': 'M81 23 L125 23 L116 32', 'screen-pass': 'M88 50 L103 50 L80 70 L125 76',
      'drag-cross': 'M81 23 Q108 50 130 64', 'out-route': 'M81 23 L116 23 L125 8',
      'te-seam': 'M82 72 L108 70 L145 70', 'play-action': 'M80 58 L100 58 M81 23 Q120 40 145 32',
      'post-route': 'M81 23 L121 23 L149 48', 'wheel-route': 'M80 58 Q98 81 122 81 L150 72',
      'deep-shot': 'M81 23 L158 17', 'hail-mary': 'M81 23 Q122 10 169 25', 'double-move': 'M81 23 L108 23 L100 32 L159 18',
      'jet-sweep': 'M81 23 Q68 45 125 75', reverse: 'M81 23 Q73 48 120 72 L88 80 L140 62',
      'flea-flicker': 'M80 58 L106 58 L88 50 L155 25', 'qb-scramble': 'M88 50 Q102 62 126 37',
      'end-around': 'M81 23 Q66 45 82 75 L135 78', punt: 'M88 50 Q127 20 164 49', 'field-goal': 'M88 50 L166 50',
    };
    const labels = offense
      ? `<span>◉ Ball carrier / route</span><span>┊ Line of scrimmage</span>`
      : `<span>◉ Defenders</span><span>↗ Coverage / rush</span>`;
    const paths = offense ? routes[play.id] : play.strengths.includes('run')
      ? 'M112 25 L91 25 M112 50 L91 50 M112 75 L91 75'
      : play.id.includes('blitz') ? 'M120 22 L88 44 M120 78 L88 56 M135 50 L105 50'
        : play.strengths.includes('deep') ? 'M119 20 Q148 12 169 20 M119 50 Q148 40 169 50 M119 80 Q148 88 169 80'
          : 'M119 20 L104 35 M119 50 L102 50 M119 80 L104 65';
    const diagram = `<svg viewBox="0 0 200 100" role="img" aria-label="${play.name} diagram"><rect width="200" height="100" fill="#2d6949"/><path d="M100 0V100" stroke="#d3f565" stroke-width="2" stroke-dasharray="5 4"/><path d="M50 0V100 M150 0V100" stroke="#b6d1a2" stroke-opacity=".35"/><path d="${paths}" fill="none" stroke="${offense ? '#f6dd83' : '#ff9776'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)"/><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5 0 5" fill="${offense ? '#f6dd83' : '#ff9776'}"/></marker></defs>${(offense ? [[88,50],[80,58],[81,23],[81,78],[96,38],[96,62]] : [[111,20],[111,50],[111,80],[125,35],[125,65],[140,50]]).map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${offense ? '#d3f565' : '#ff9776'}" stroke="#1a2735" stroke-width="2"/>`).join('')}</svg>`;
    const notes = offense ? `<b>${play.kind === 'kick' || play.kind === 'punt' ? 'Special teams' : play.kind === 'run' ? 'Ground call' : `${play.kind.toUpperCase()} PASS`}</b><p>${play.detail}. ${['kick', 'punt'].includes(play.kind) ? 'Available on fourth down; field position and kick distance determine the result.' : play.kind === 'deep' || play.kind === 'trick' ? 'Explosive upside, but a greater chance of a stop or turnover.' : play.kind === 'run' ? 'Keeps the clock moving; stacked fronts can force a loss.' : 'Completion and protection depend on coverage and the pass rush.'}</p><small>Favorable against: ${DEFENSE.filter(scheme => scheme.weakness === play.kind).map(scheme => scheme.name).slice(0, 3).join(', ') || 'situational looks'}</small>`
      : `<b>${play.name}</b><p>${play.detail}. ${play.strengths.includes('run') ? 'Loads up against the run; a pass can punish the extra defenders near the line.' : 'Coverage and pressure target passing lanes; watch the uncovered area.'}</p><small>Strong vs ${play.strengths.join(' / ')} · Vulnerable to ${play.weakness}</small>`;
    this.el('playInspector').innerHTML = `<div class="inspector-diagram">${diagram}<div class="diagram-legend">${labels}</div></div><div class="inspector-copy"><small>PLAY SCOUT · CLICK A CALL TO INSPECT</small>${notes}<div class="play-context">${this.playSituation(play, offense)}</div></div>`;
  }

  playSituation(play, offense) {
    if (!offense) {
      const likely = this.game.toGo <= 3 ? 'run' : this.game.toGo >= 8 ? 'deep' : 'medium';
      return play.strengths.includes(likely) ? 'This call fits the current down and distance.' : 'A change of pace if the offense breaks tendency.';
    }
    if (play.kind === 'kick') return `${100 - this.game.spot + 17}-yard attempt from here.`;
    if (play.kind === 'punt') return `Flip field position from your own ${this.game.spot}.`;
    if (play.kind === 'run' && this.game.toGo <= 3) return 'Short yardage: a first down is within reach.';
    if (play.kind === 'deep' && this.game.toGo >= 10) return 'Long yardage: the route can reach the sticks.';
    if (play.kind === 'short' && this.game.toGo > 10) return 'Short of the sticks unless a receiver breaks free.';
    return `Need ${this.game.toGo} yards on this down.`;
  }

  snap() {
    if (this.locked || this.paused || this.game.over) return;
    this.locked = true;
    const offense = this.game.possession === 'home' ? this.selectedOffense : this.game.chooseCpuOffense();
    const defense = this.game.possession === 'home' ? this.game.chooseCpuDefense() : this.selectedDefense;
    const field = this.el('field');
    const passing = ['short', 'medium', 'deep', 'trick'].includes(offense.kind);
    field.style.setProperty('--ball-x', passing ? (offense.kind === 'deep' ? '82px' : '55px') : '35px');
    field.style.setProperty('--ball-y', passing ? '-25px' : '8px');
    field.querySelectorAll('.field-player').forEach(unit => {
      const role = unit.dataset.role;
      const offenseUnit = unit.classList.contains('off');
      let move = passing && ['CB', 'S'].includes(role) ? 19 : -20;
      if (offenseUnit && passing) move = ['WR', 'TE'].includes(role) ? 55 : role === 'QB' ? 4 : 16;
      if (offenseUnit && !passing) move = role === 'RB' || (offense.id === 'qb-scramble' && role === 'QB') ? 45 : 15;
      unit.style.setProperty('--move-x', `${move}px`);
    });
    field.classList.remove('play-live');
    void field.offsetWidth;
    field.classList.add('play-live');
    const banner = this.el('resultBanner');
    banner.innerHTML = `<strong>${offense.name} VS ${defense.name}</strong><span>Play unfolding…</span>`;
    banner.classList.remove('hidden');
    const finish = () => {
      const result = this.game.snap(offense, defense);
      field.classList.remove('play-live');
      banner.innerHTML = `<strong>${offense.name} VS ${defense.name}</strong><span>${result.message}</span>`;
      this.renderGame();
      setTimeout(() => {
        banner.classList.add('hidden');
        this.locked = false;
        if (this.game.over) this.showFinal();
      }, 1300);
    };
    setTimeout(() => this.paused ? this.pendingSnap = finish : finish(), 900);
  }

  renderGame() {
    const game = this.game;
    this.el('homeScore').textContent = String(game.score.home).padStart(2, '0');
    this.el('awayScore').textContent = String(game.score.away).padStart(2, '0');
    this.el('periodLabel').textContent = game.quarter === 5 ? 'OT' : `Q${game.quarter}`;
    this.el('clockLabel').textContent = `${Math.floor(game.seconds / 60)}:${String(game.seconds % 60).padStart(2, '0')}`;
    this.el('possessionLabel').textContent = `${game.possession === 'home' ? 'VOLTS' : 'SURF'} BALL`;
    const ordinal = ['','1ST','2ND','3RD','4TH'][game.down];
    this.el('downLabel').textContent = `${ordinal} & ${game.toGo}`;
    this.el('sideDown').textContent = ordinal;
    this.el('sideDistance').textContent = `${game.toGo} YDS`;
    const location = game.spot <= 50 ? `OWN ${game.spot}` : `OPP ${100 - game.spot}`;
    this.el('sidePosition').textContent = location;
    this.el('fieldPositionLabel').textContent = location;
    this.el('ballSpotLabel').textContent = String(game.spot);
    this.el('driveLabel').textContent = String(game.drive).padStart(2, '0');
    this.el('firstDownMeter').style.width = `${Math.max(3, Math.min(100, (10 - game.toGo) * 10))}%`;
    this.el('playLog').innerHTML = game.log.slice(0, 18).map(line => `<p>${line}</p>`).join('');
    this.el('gameRoster').innerHTML = POSITIONS.map((position, i) => {
      const mon = this.home.players[i];
      return `<div class="draft-slot"><span class="position-tag">${position.code}</span>${this.sprite(mon)}<span><b>${mon.name}</b><small>${mon.types.join(' / ')}</small></span><span class="rating">${Roster.rating(mon, position.code)}</span></div>`;
    }).join('');
    this.renderField();
    this.renderPlays();
  }

  renderField() {
    const game = this.game;
    const x = 7 + game.spot * .85;
    this.el('scrimmageLine').style.left = `${x}%`;
    this.el('firstDownLine').style.left = `${Math.min(92, x + game.toGo * .85)}%`;
    this.el('football').style.left = `${x}%`;
    const attack = game.rosters[game.possession];
    const defend = game.rosters[game.opponent()];
    const offenseFormation = [[-12,50],[-18,65],[-9,13],[-9,87],[-5,74],[-4,49],[-5,28],[-5,62],[-17,35],[-19,18],[-18,82]];
    const defenseFormation = [[17,50],[13,65],[17,13],[17,87],[11,74],[9,35],[4,43],[4,58],[10,52],[14,24],[21,78]];
    const formation = [
      ...attack.players.map((mon, i) => ({ mon, index: i, dx: offenseFormation[i][0], y: offenseFormation[i][1], side: 'off' })),
      ...defend.players.map((mon, i) => ({ mon, index: i, dx: defenseFormation[i][0], y: defenseFormation[i][1], side: 'def' })),
    ];
    this.el('fieldPlayers').innerHTML = formation.map(unit => {
      const room = unit.dx < 0 ? x - 4 : 92 - x;
      const left = x + unit.dx * Math.min(1, room / 22);
      const label = POSITIONS[unit.index].code;
      const move = unit.side === 'off' ? (['QB', 'RB', 'WR', 'TE'].includes(label) ? 34 : 16) : -22;
      return `<div class="field-player ${unit.side}" data-role="${label}" style="left:${left}%;top:${unit.y}%;--move-x:${move}px;--move-y:${unit.index % 2 ? 8 : -8}px" title="${unit.mon.name} · ${label}"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${unit.mon.id}.png" alt="${unit.mon.name}" onerror="this.replaceWith(document.createTextNode('◓'))"><small>${label}</small></div>`;
    }).join('');
  }

  showFinal() {
    this.el('finalTitle').textContent = this.game.score.home > this.game.score.away ? 'Volts win!' : this.game.score.home < this.game.score.away ? 'Surf win!' : 'Final whistle';
    this.el('finalScore').textContent = `Viridian Volts ${this.game.score.home} · Cerulean Surf ${this.game.score.away}`;
    this.el('finalOverlay').classList.remove('hidden');
  }
}

if (typeof window !== 'undefined') new GameApp(window.POKEMON_DATA);
if (typeof module !== 'undefined') module.exports = { Roster, FootballGame, OFFENSE, DEFENSE, POSITIONS };
