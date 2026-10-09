{
  const { OFFENSE, DEFENSE } = typeof module !== 'undefined' ? require('./playbook.js') : window.Pokeballers;

  const { Roster } = typeof module !== 'undefined' ? require('./roster.js') : window.Pokeballers;

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

    unitRating(team, side, play, role) {
      const players = team.lineup(side, play).filter((slot) => slot.role === role);
      return players.length
        ? players.reduce((sum, slot) => sum + Roster.rating(slot.mon, role), 0) / players.length
        : 0;
    }

    offenseStrength(play) {
      const team = this.rosters[this.possession];
      const { carrier, passer } = team.participants(play);
      const rating = (role) => this.unitRating(team, 'offense', play, role);
      if (play.kind === 'run')
        return (
          Roster.rating(carrier, 'RB') * 0.5 +
          rating('OL') * 0.3 +
          (rating('TE') || rating('WR')) * 0.1 +
          rating('QB') * 0.1
        );
      const receiver = Roster.rating(carrier, play.carrier[0]);
      const quarterback = Roster.rating(passer, 'QB');
      if (play.kind === 'trick') return quarterback * 0.35 + rating('RB') * 0.27 + receiver * 0.38;
      if (play.kind === 'deep') return quarterback * 0.48 + receiver * 0.42 + rating('OL') * 0.1;
      return quarterback * 0.4 + receiver * 0.34 + (rating('TE') || rating('RB')) * 0.16 + rating('OL') * 0.1;
    }

    defenseStrength(offense, defense) {
      const team = this.rosters[this.opponent()];
      const rating = (role) => this.unitRating(team, 'defense', defense, role);
      if (offense.kind === 'run') return rating('DL') * 0.44 + rating('LB') * 0.38 + rating('S') * 0.18;
      return rating('DL') * 0.22 + rating('CB') * 0.4 + rating('S') * 0.38;
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
      const special = this.down === 4 ? this.fourthDownCall() : null;
      if (special) return OFFENSE.find((play) => play.id === special);
      const ranked = OFFENSE.filter((play) => play.group !== 'special')
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

    snap(offense, defense) {
      if (this.over) throw new Error('The game has ended.');
      const side = this.possession;
      const wasOvertime = this.quarter === 5;
      const priorScore = this.score.home + this.score.away;
      const result =
        offense.kind === 'punt'
          ? this.punt()
          : offense.kind === 'kick'
            ? this.fieldGoal()
            : this.scrimmage(offense, defense);
      result.participants = this.playParticipants(side, offense, defense, result);
      this.history.push({ side, id: offense.id, kind: offense.kind, defenseId: defense.id });
      this.advanceClock(result.seconds);
      if (wasOvertime && this.score.home + this.score.away > priorScore) this.over = true;
      this.log.unshift(`${side === 'home' ? 'VOLTS' : 'SURF'}: ${offense.name} vs ${defense.name} — ${result.message}`);
      return result;
    }

    featuredDefender(side, offense, defense, result) {
      const lineup = this.rosters[this.opponent(side)].lineup('defense', defense);
      const backfield = result.outcome === 'interception' || result.outcome === 'incomplete';
      const roles = backfield
        ? ['CB', 'S', 'LB']
        : offense.kind === 'run' || result.outcome === 'sack'
          ? ['DL', 'LB']
          : ['CB', 'S', 'LB'];
      const candidates = lineup.filter((slot) => roles.includes(slot.role));
      candidates.sort((a, b) => Roster.rating(b.mon, b.role) - Roster.rating(a.mon, a.role));
      return candidates[0].mon;
    }

    playParticipants(side, offense, defense, result) {
      const { carrier, passer, blocker } = this.rosters[side].participants(offense);
      const sacked = result.outcome === 'sack' || (result.outcome === 'safety' && offense.kind !== 'run');
      const defender = this.featuredDefender(side, offense, defense, result);
      const support = sacked || ['run', 'kick', 'punt'].includes(offense.kind) ? blocker : passer;
      const help = this.rosters[this.opponent(side)]
        .lineup('defense', defense)
        .find((slot) => ['S', 'LB', 'CB'].includes(slot.role) && slot.mon.id !== defender.id).mon;
      return { carrier: sacked ? passer : carrier, support, defender, help };
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

    scrimmage(offense, defense) {
      const matchup = this.matchupScore(offense, defense);
      const advantage = (this.offenseStrength(offense) - this.defenseStrength(offense, defense)) / 10;
      const pass = ['short', 'medium', 'deep', 'trick'].includes(offense.kind);
      if (!pass && this.random() < (defense.strengths.includes(offense.kind) ? 0.22 : 0.1)) {
        return this.tackle(-1 - Math.floor(this.random() * 5), 23, 'STUFFED!', 'stuff');
      }
      const difficulty = { deep: 0.22, trick: 0.12, medium: 0.08 }[offense.kind] || 0;
      const chance = Math.max(0.19, Math.min(0.85, 0.64 + advantage / 100 + matchup / 45 - difficulty));
      if (pass && this.random() > chance) return this.failedPass(offense, defense);
      const yards = Math.max(
        -12,
        Math.round(offense.base + advantage + matchup + (this.random() - 0.5) * offense.spread),
      );
      if (!pass && this.random() < 0.018) {
        this.changePossession(100 - Math.max(1, Math.min(99, this.spot + yards)));
        return { yards, seconds: 12, message: 'FUMBLE! Defense recovers.', turnover: true, outcome: 'fumble' };
      }
      const moved = this.moveBall(yards);
      return {
        yards,
        seconds: pass ? 14 + Math.floor(this.random() * 14) : 22 + Math.floor(this.random() * 17),
        ...moved,
      };
    }

    tackle(yards, seconds, label, outcome) {
      const moved = this.moveBall(yards);
      return {
        yards,
        seconds,
        message: `${label} ${moved.message}`,
        outcome: moved.outcome === 'safety' ? 'safety' : outcome,
        turnover: moved.turnover,
      };
    }

    failedPass(offense, defense) {
      if (this.random() < (offense.kind === 'deep' ? 0.12 : 0.06)) {
        this.changePossession(100 - this.spot);
        return {
          yards: 0,
          seconds: 8,
          message: 'INTERCEPTED! Possession changes.',
          turnover: true,
          outcome: 'interception',
        };
      }
      if (this.random() < (['blitz', 'zone-blitz', 'fire-zone', 'cover-0'].includes(defense.id) ? 0.42 : 0.18)) {
        return this.tackle(-3 - Math.floor(this.random() * 6), 10, 'SACK!', 'sack');
      }
      this.down += 1;
      if (this.down > 4) {
        this.changePossession(100 - this.spot);
        return {
          yards: 0,
          seconds: 7,
          message: 'Incomplete pass. TURNOVER ON DOWNS.',
          outcome: 'turnover-downs',
          turnover: true,
        };
      }
      return { yards: 0, seconds: 7, message: 'Incomplete pass.', outcome: 'incomplete' };
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
      const kicker = this.rosters[this.possession].rating('QB');
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
