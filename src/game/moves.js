{
  const data =
    typeof module !== 'undefined'
      ? require('../../pokemon_gen1_2.json')
      : { moves: window.POKEMON_MOVES, types: window.POKEMON_TYPES };

  class MoveBook {
    static catalog = data.moves;
    static chart = data.types;
    static MOVESET_SIZE = 4;
    static MODELED_AILMENTS = ['paralysis', 'sleep', 'freeze', 'burn', 'poison', 'confusion', 'trap', 'leech-seed'];
    static FAMILIES = {
      'net-good-stats': 'stat',
      heal: 'heal',
      'field-effect': 'field',
      'whole-field-effect': 'field',
      ohko: 'ohko',
      'force-switch': 'switch',
      swagger: 'ailment',
    };
    // Ranks a non-strike move against a strike's power so a default moveset can mix both.
    static STATUS_RANK = { ailment: 50, stat: 45, heal: 40, field: 35, protect: 30, switch: 20, ohko: 10 };
    static STAT_KEYS = { physical: 'attack', special: 'special_attack', status: 'attack' };
    static BADGES = { paralysis: 'PAR', sleep: 'SLP', freeze: 'FRZ', burn: 'BRN', poison: 'PSN', confusion: 'CNF' };
    static WEATHER = {
      'rain-dance': { Water: 1.5, Fire: 0.5 },
      'sunny-day': { Fire: 1.5, Water: 0.5 },
    };
    static SCREEN_POINTS = 10;
    static STRIKE_CAP = 30;
    static PRIORITY_BONUS = 8;
    static NO_POWER = 60;
    static defaults = new WeakMap();

    static get(name) {
      return MoveBook.catalog[name];
    }

    static family(name) {
      const { category, ailment } = MoveBook.get(name).meta;
      if (category.startsWith('damage')) return 'strike';
      if (category === 'ailment') return MoveBook.MODELED_AILMENTS.includes(ailment) ? 'ailment' : null;
      if (category === 'unique') return ['protect', 'detect'].includes(name) ? 'protect' : null;
      return MoveBook.FAMILIES[category] ?? null;
    }

    static learnable(mon) {
      return mon.moves.filter((name) => MoveBook.family(name));
    }

    static hits(name) {
      const { min_hits: min, max_hits: max } = MoveBook.get(name).meta;
      return min ? Math.floor((min + max) / 2) : 1;
    }

    static power(name) {
      return (MoveBook.get(name).power ?? MoveBook.NO_POWER) * MoveBook.hits(name);
    }

    static uses(name) {
      return Math.ceil(MoveBook.get(name).pp / 5);
    }

    static cost(name) {
      const power = MoveBook.get(name).power ?? MoveBook.NO_POWER;
      return MoveBook.family(name) === 'strike' ? 6 + Math.round(power / 20) : 6;
    }

    static effectiveness(name, target) {
      const row = MoveBook.chart[MoveBook.get(name).type];
      return target.types.reduce((product, type) => product * (row[type] ?? 1), 1);
    }

    static callout(effectiveness, targetName) {
      if (effectiveness === 0) return `It doesn't affect ${targetName}…`;
      if (effectiveness > 1) return "It's super effective!";
      return effectiveness < 1 ? "It's not very effective…" : '';
    }

    static isStab(name, mon) {
      return mon.types.includes(MoveBook.get(name).type);
    }

    // A positive net change raises the user; a negative net change lowers the opponent.
    static statEffect(name, chance = null) {
      const changes = MoveBook.get(name).stat_changes.map(({ stat, change }) => ({
        stat: stat.replace('-', '_'),
        change,
      }));
      return { kind: 'stat', changes, self: changes.reduce((sum, entry) => sum + entry.change, 0) > 0, chance };
    }

    // The effect a strike adds on top of its damage: an ailment or a stat change that rolls when the strike hits.
    static secondary(name) {
      const { meta, stat_changes: changes } = MoveBook.get(name);
      if (MoveBook.family(name) !== 'strike') return null;
      if (MoveBook.MODELED_AILMENTS.includes(meta.ailment))
        return { kind: 'ailment', ailment: meta.ailment, chance: meta.ailment_chance };
      return changes.length && meta.stat_chance ? MoveBook.statEffect(name, meta.stat_chance) : null;
    }

    // Everything a hit applies besides contest points; Swagger confuses and raises the opponent's attack.
    static effects(name) {
      const family = MoveBook.family(name);
      const { meta, stat_changes: changes } = MoveBook.get(name);
      if (family === 'strike') return [MoveBook.secondary(name)].filter(Boolean);
      if (family === 'heal') return [{ kind: 'heal' }];
      if (family === 'stat') return [MoveBook.statEffect(name)];
      if (family === 'field') return [{ kind: 'field', field: name }];
      if (family === 'protect') return [{ kind: 'protect' }];
      if (family === 'switch') return [{ kind: 'switch' }];
      if (family !== 'ailment') return [];
      const ailment = { kind: 'ailment', ailment: meta.ailment, severe: name === 'toxic' };
      return changes.length ? [ailment, { ...MoveBook.statEffect(name), self: false }] : [ailment];
    }

    // Contest points a strike adds to the actor's margin; type immunity zeroes it, including priority.
    static strike(name, { actor, skill, effectiveness, crit = false, modifier = 1 }) {
      if (!effectiveness) return 0;
      const move = MoveBook.get(name);
      const stab = MoveBook.isStab(name, actor) ? 1.5 : 1;
      const base = MoveBook.power(name) * 0.15 * stab * effectiveness * modifier * (skill / 70);
      const total = (base + (move.priority > 0 ? MoveBook.PRIORITY_BONUS : 0)) * (crit ? 2 : 1);
      return Math.min(MoveBook.STRIKE_CAP, Math.round(total));
    }

    // Orders a Pokémon's moves for the default moveset and the CPU: strikes by expected power, others by family.
    static rank(name, mon) {
      const move = MoveBook.get(name);
      const family = MoveBook.family(name);
      if (family !== 'strike') return MoveBook.STATUS_RANK[family];
      const stat = mon.base_stats[MoveBook.STAT_KEYS[move.damage_class]] / 70;
      return MoveBook.power(name) * ((move.accuracy ?? 100) / 100) * (MoveBook.isStab(name, mon) ? 1.5 : 1) * stat;
    }

    static ranked(names, mon) {
      return [...names].sort((a, b) => MoveBook.rank(b, mon) - MoveBook.rank(a, mon) || a.localeCompare(b));
    }

    static defaultMoveset(mon) {
      if (MoveBook.defaults.has(mon)) return MoveBook.defaults.get(mon);
      const learnable = MoveBook.learnable(mon);
      const strikes = MoveBook.ranked(
        learnable.filter((name) => MoveBook.family(name) === 'strike'),
        mon,
      );
      const status = MoveBook.ranked(
        learnable.filter((name) => MoveBook.family(name) !== 'strike'),
        mon,
      );
      const picks = new Set(
        [
          strikes.find((name) => MoveBook.isStab(name, mon)),
          strikes.find((name) => !MoveBook.isStab(name, mon)),
          status[0],
        ].filter(Boolean),
      );
      const rest = MoveBook.ranked(
        learnable.filter((name) => !picks.has(name)),
        mon,
      );
      const moveset = [...picks, ...rest].slice(0, MoveBook.MOVESET_SIZE);
      MoveBook.defaults.set(mon, moveset);
      return moveset;
    }
  }

  if (typeof module !== 'undefined') module.exports = { MoveBook };
  else Object.assign((window.Pokeballers ||= {}), { MoveBook });
}
