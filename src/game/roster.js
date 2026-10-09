{
  const { POSITIONS } = typeof module !== 'undefined' ? require('./playbook.js') : window.Pokeballers;

  class Roster {
    constructor(pokemon, ids) {
      this.pokemon = pokemon;
      this.players = ids.map((id) => pokemon[id - 1]);
    }

    static random(pokemon) {
      const used = new Set();
      const players = POSITIONS.map((position) => {
        const candidates = pokemon
          .filter((mon) => !used.has(mon.id))
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
      this.players[slotIndex] = mon;
    }
  }

  if (typeof module !== 'undefined') module.exports = { Roster };
  else Object.assign((window.Pokeballers ||= {}), { Roster });
}
