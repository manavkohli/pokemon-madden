{
  const { SpriteArt } = typeof module !== 'undefined' ? require('./sprites.js') : window.Pokeballers;
  const { League } = typeof module !== 'undefined' ? require('../game/league.js') : window.Pokeballers;
  const { POSITIONS } = typeof module !== 'undefined' ? require('../game/playbook.js') : window.Pokeballers;

  // Draws the Gym Challenge screens: the league map, the post-game report, the Hall of Fame, and the evolution scene.
  class LeagueView {
    static EVOLVE_MS = 3200;
    static REPORT_ROWS = 12;
    static STYLES = { run: 'Run-heavy', pass: 'Pass-heavy', pressure: 'Blitz and tricks', balanced: 'Balanced' };
    static REASONS = {
      'level-up': 'reached its evolution level',
      'use-item': 'used a stone',
      trade: 'as the game MVP',
      friendship: 'after enough games together',
    };
    // [main, light] colors per type; the Champion has no type and uses the neutral pair.
    static COLORS = {
      Rock: ['#8f7f52', '#cfc190'],
      Water: ['#4a78b8', '#9dc0e8'],
      Electric: ['#c9a62a', '#f1de83'],
      Grass: ['#4d8f46', '#a5d39a'],
      Poison: ['#8a5aa6', '#c9a6dc'],
      Psychic: ['#c25a88', '#eab0cc'],
      Fire: ['#c8622d', '#f0ac86'],
      Ground: ['#9c8050', '#d7c096'],
      Ice: ['#5aa5b8', '#b4e0ea'],
      Fighting: ['#a8452f', '#e0a08e'],
      Ghost: ['#5a4f8a', '#b0a6d8'],
      Dragon: ['#4a5cc0', '#a4aeea'],
      Champion: ['#66598b', '#b0a0c4'],
    };
    // [hair, skin, skin light] per leader.
    static LOOKS = {
      Brock: ['#3b2a1c', '#c78d5c', '#dca878'],
      Misty: ['#d2683a', '#e8b98e', '#f6d6b0'],
      'Lt. Surge': ['#c9b04a', '#e4b987', '#f3d5a5'],
      Erika: ['#2b2a2a', '#f0d0a4', '#f8e2c0'],
      Koga: ['#4a2f5c', '#d9a878', '#ecc79a'],
      Sabrina: ['#242626', '#e9c9a0', '#f5deba'],
      Blaine: ['#8a8a8a', '#d9a070', '#ecc08c'],
      Giovanni: ['#4a3322', '#d9a878', '#ecc79a'],
      Lorelei: ['#3a5a9a', '#f0d0a8', '#f8e2c4'],
      Bruno: ['#242626', '#c07f50', '#d89c6c'],
      Agatha: ['#b8b8c0', '#e0b88e', '#f0d2ae'],
      Lance: ['#b8442c', '#e4b987', '#f3d5a5'],
      Rival: ['#6b4a2a', '#e4b987', '#f3d5a5'],
    };

    constructor({ stage, onAction }) {
      this.stage = stage;
      this.onAction = onAction;
      this.report = null;
      this.view = 'map';
      for (const id of ['leagueScreen', 'reportScreen']) {
        this.el(id).addEventListener('click', (event) => {
          const button = event.target.closest('[data-action]');
          if (button && !button.disabled) this.onAction(button.dataset.action, button.dataset);
        });
      }
      this.el('skipEvolve').addEventListener('click', () => this.stage.skip());
      this.el('evolveOverlay').addEventListener('cancel', (event) => {
        event.preventDefault();
        this.stage.skip();
      });
    }

    el(id) {
      return document.getElementById(id);
    }

    static colors(leader) {
      return LeagueView.COLORS[leader.type ?? 'Champion'];
    }

    static itemName(item) {
      return item
        .split('-')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ');
    }

    // The trainer sprite reuses the Cerulean Ace's silhouette with a per-leader palette.
    static portrait(leader) {
      const [main, light] = LeagueView.colors(leader);
      const [hair, skin, glow] = LeagueView.LOOKS[leader.name];
      return `<svg class="portrait" viewBox="0 0 48 56" shape-rendering="crispEdges" role="img" aria-label="${leader.name}"><path fill="${hair}" d="M18 2h14v3h6v5h3v12h-4v8h-4v4h6v5h4v15H5V40h5v-6h8v-5h-4v-6h-3V11h4V6h3z"/><path fill="${main}" d="M18 5h14v3h5v7H15v-4h3z"/><path fill="${light}" d="M21 5h7v3h-7zm-6 10h25v4H15z"/><path fill="${skin}" d="M17 19h18v10h-5v5H20v-6h-3z"/><path fill="${glow}" d="M20 20h13v4H20zm3 5h7v4h-7z"/><path fill="${hair}" d="M20 21h3v3h-3zm10 0h3v3h-3zm-8 9h8v2h-8z"/><path fill="${main}" d="M11 37h8v7H9v7H7V42h4zm20-2h7v7h3v9H30V40z"/><path fill="${light}" d="M12 36h6v5h-6zm21 0h4v9h-4z"/><path fill="#ede8c8" d="M20 34h9v14h-9z"/><path fill="${skin}" d="M10 44h9v5h16v4H9v-4H6v-4h4z"/><path fill="${glow}" d="M11 44h7v3h-7zm13 5h10v2H24z"/><path fill="#b7443c" d="M30 40h6v3h-6z"/><path fill="#ede8c8" d="M30 43h6v3h-6z"/><path fill="${hair}" d="M32 42h2v2h-2z"/></svg>`;
    }

    // Every path out of the species: each stone, trade, friendship, and level step with its target.
    evolveNote(league, mon) {
      return mon.evolutions
        .map((step) => {
          const notes = {
            'level-up': () => `Lv ${step.min_level}`,
            'use-item': () => LeagueView.itemName(step.item),
            trade: () => 'game MVP',
            friendship: () => `${League.FRIENDSHIP_GAMES} games`,
          };
          return `${notes[step.trigger]()} → ${league.catalog[step.into - 1].name}`;
        })
        .join('; ');
    }

    show(id) {
      for (const screen of ['leagueScreen', 'reportScreen']) this.el(screen).classList.toggle('hidden', screen !== id);
    }

    renderMap(league) {
      this.view = 'map';
      this.el('leagueKicker').textContent = league.complete
        ? 'KANTO CIRCUIT · COMPLETE'
        : `KANTO CIRCUIT · GAME ${league.stage + 1} OF ${League.LEADERS.length}`;
      this.el('leagueBody').innerHTML = league.complete
        ? `${this.hallHtml(league)}${this.teamHtml(league, 'Your champions')}`
        : `<div class="league-layout"><div class="league-main">${this.leaderHtml(league)}${this.stoneHtml(league)}</div>${this.badgeHtml(league)}</div>${this.teamHtml(league, 'Your team')}`;
      this.show('leagueScreen');
    }

    leaderHtml(league) {
      const leader = league.leader;
      const [main] = LeagueView.colors(leader);
      const key = league.leaderRoster(league.stage);
      const party = ['QB', 'RB', 'WR', 'DL', 'CB']
        .map((code) => `<span title="${key.player(code).name} · ${code}">${SpriteArt.frame(key.player(code))}</span>`)
        .join('');
      const reward = leader.stone ? `${LeagueView.itemName(leader.stone)} and badge` : 'Badge';
      return `<div class="surface leader-card" style="--main:${main}"><div class="leader-portrait" aria-hidden="true">${LeagueView.portrait(leader)}</div><div class="leader-copy"><small>${leader.title.toUpperCase()}</small><h2>${leader.name}</h2><div class="leader-tags"><span class="type-chip">${leader.type ?? 'All types'}</span><span>${LeagueView.STYLES[leader.style]}</span><span>${leader.cap.toLocaleString()} CR cap</span></div><div class="rival-party" aria-label="Key players">${party}</div><p>Win to earn: ${reward}.</p><div class="leader-actions"><button class="button primary" type="button" data-action="challenge">Challenge ▶</button><button class="button ghost" type="button" data-action="window">Transfer window · ${league.transfersLeft} swaps</button></div></div></div>`;
    }

    badgeHtml(league) {
      const slots = League.LEADERS.map((leader, index) => {
        const state = index < league.stage ? 'earned' : index === league.stage ? 'next' : '';
        return `<div class="badge-slot ${state}" data-title="${leader.title}" style="--badge:${LeagueView.colors(leader)[0]}" title="${leader.name}"><i></i><small>${leader.name}</small></div>`;
      }).join('');
      return `<div class="surface badge-case"><div class="panel-heading"><div><small>BADGE CASE</small><h2>${league.badges.length} of ${League.LEADERS.length}</h2></div></div><div class="badge-grid">${slots}</div></div>`;
    }

    hallHtml(league) {
      return `<div class="league-layout"><div class="surface hall-card"><div class="panel-heading"><div><small>CHAMPIONS</small><h2>Hall of Fame</h2></div><span class="badge">${league.badges.length} badges</span></div><p>You beat the eight gym leaders, the Elite Four, and your rival. Your ${POSITIONS.length} players enter the Hall at their final evolutions.</p></div>${this.badgeHtml(league)}</div>`;
    }

    teamHtml(league, title) {
      const cards = POSITIONS.map((position, index) => {
        const mon = league.roster.players[index];
        const note = this.evolveNote(league, mon);
        return `<div class="team-mon"><span class="position-tag">${position.code}${position.depth}</span>${SpriteArt.frame(mon)}<span><b>${mon.name}</b><small>Lv ${league.level(mon)}${note ? ` · ${note}` : ''}</small></span></div>`;
      }).join('');
      return `<div class="surface team-panel"><div class="panel-heading"><div><small>ROSTER</small><h2>${title}</h2></div><span class="badge">${league.roster.salary.toLocaleString()} CR</span></div><div class="team-grid">${cards}</div></div>`;
    }

    stoneHtml(league) {
      return `<div class="surface stone-panel" data-stones>${this.stoneRows(league)}</div>`;
    }

    // One button per player and stone pair that would evolve.
    stoneRows(league) {
      const held = Object.entries(league.stones).filter(([, count]) => count > 0);
      if (!held.length)
        return '<div class="panel-heading"><div><small>EVOLUTION STONES</small><h2>None yet</h2></div></div>';
      const rows = held.map(([stone, count]) => {
        const options = league.roster.players
          .filter((mon) => league.stoneSteps(mon, stone).length)
          .map((mon) => {
            const [step] = league.stoneSteps(mon, stone);
            const target = league.catalog[step.into - 1];
            return `<button class="button ghost stone-use" type="button" data-action="stone" data-stone="${stone}" data-mon="${mon.id}">${mon.name} → ${target.name}</button>`;
          })
          .join('');
        return `<div class="stone-row"><b>${LeagueView.itemName(stone)} ×${count}</b><div>${options || '<span>No player can use it yet.</span>'}</div></div>`;
      });
      return `<div class="panel-heading"><div><small>EVOLUTION STONES</small><h2>Use a stone</h2></div></div>${rows.join('')}`;
    }

    renderStones(league) {
      for (const node of document.querySelectorAll('[data-stones]')) node.innerHTML = this.stoneRows(league);
    }

    // Shows the report and plays its evolutions one after another.
    async showReport(league, report) {
      this.report = report;
      this.renderReport(league);
      this.show('reportScreen');
      await this.playEvolutions(report.events.filter((event) => !event.waiting));
    }

    renderReport(league) {
      const { win, leader, score, mvp } = this.report;
      this.view = 'report';
      this.el('reportKicker').textContent = `${leader.title.toUpperCase()} · ${leader.name.toUpperCase()}`;
      this.el('reportTitle').textContent = win ? 'Victory!' : 'Defeat';
      const evolved = this.report.events.filter((event) => !event.waiting).length;
      const badge = mvp ? `<span class="badge">MVP ${mvp.name}</span>` : '';
      this.el('reportBody').innerHTML =
        `<div class="report-layout"><div class="report-side"><div class="surface report-summary"><small>FINAL SCORE</small><strong class="report-score">${score.home} – ${score.away}</strong><p>${this.outcomeText(league)}</p><div class="report-actions">${this.actionsHtml(league)}</div></div><div class="surface report-events"><div class="panel-heading"><div><small>EVOLUTIONS</small><h2>${evolved} this game</h2></div></div>${this.eventHtml()}</div>${this.stoneHtml(league)}</div><div class="surface report-xp"><div class="panel-heading"><div><small>EXPERIENCE</small><h2>Level gains</h2></div>${badge}</div><ul class="xp-list">${this.xpHtml()}</ul></div></div>`;
    }

    outcomeText(league) {
      const { win, leader, stone } = this.report;
      if (!win)
        return `${leader.name} wins this time. Players earn no win bonus. Rematch, or change your roster first.`;
      const prize = stone ? ` and a ${LeagueView.itemName(stone)}` : '';
      return `You beat ${leader.name} and earned the badge${prize}. ${league.complete ? '' : `Next: ${league.leader.name}.`}`;
    }

    actionsHtml(league) {
      const button = (kind, action, label) =>
        `<button class="button ${kind}" type="button" data-action="${action}">${label}</button>`;
      if (league.complete) return button('primary', 'continue', 'Enter the Hall of Fame ▶');
      const transfers = button('ghost', 'window', `Transfer window · ${league.transfersLeft} swaps`);
      if (this.report.win) return `${button('primary', 'continue', 'To the map ▶')}${transfers}`;
      return `${button('primary', 'challenge', 'Rematch ▶')}${transfers}${button('ghost', 'continue', 'To the map')}`;
    }

    eventHtml() {
      const lines = this.report.events.map((event) =>
        event.waiting
          ? `<li class="waiting">${event.from.name} is ready to evolve, but ${event.into.name} is already on your team.</li>`
          : `<li>${SpriteArt.frame(event.into)}<span>${event.from.name} evolved into <b>${event.into.name}</b> ${LeagueView.REASONS[event.reason]}.</span></li>`,
      );
      return `<ul class="event-list">${lines.join('') || '<li class="waiting">No player evolved.</li>'}</ul>`;
    }

    xpHtml() {
      const evolved = new Map(
        this.report.events.filter((event) => !event.waiting).map((event) => [event.from, event.into]),
      );
      // A player may evolve several times in one report, so each row follows the chain to its last species.
      const finalForm = (mon) => (evolved.has(mon) ? finalForm(evolved.get(mon)) : mon);
      const earned = this.report.gains.filter((entry) => entry.to > entry.from);
      if (!earned.length) return `<li class="waiting">No player earned experience.</li>`;
      return earned
        .sort((a, b) => b.to - b.from - (a.to - a.from))
        .slice(0, LeagueView.REPORT_ROWS)
        .map(({ mon, from, to }) => {
          const step = mon.evolutions.find((entry) => entry.trigger === 'level-up');
          const goal = step ? step.min_level : League.MAX_LEVEL;
          const name = evolved.has(mon) ? `${mon.name} → ${finalForm(mon).name}` : mon.name;
          const percent = (level) => Math.min(100, Math.round((level / goal) * 100));
          return `<li class="xp-row">${SpriteArt.frame(mon)}<span class="xp-name"><b>${name}</b><small>Lv ${from} → Lv ${to}${step ? ` · evolves at Lv ${goal}` : ''}</small></span><div class="xp-bar" style="--from:${percent(from)}%;--to:${percent(to)}%" aria-hidden="true"><i></i></div></li>`;
        })
        .join('');
    }

    // A stone evolution joins the report and replays the scene, then the report redraws.
    async showStoneEvolution(league, event) {
      if (this.view === 'report') this.report.events.push(event);
      await this.playEvolutions([event]);
      if (this.view === 'report') this.renderReport(league);
      else this.renderMap(league);
    }

    async playEvolutions(events) {
      for (const event of events) {
        const result = await this.playEvolution(event);
        if (result.cancelled) return;
      }
    }

    async playEvolution(event) {
      const dialog = this.el('evolveOverlay');
      this.el('evolveArt').innerHTML =
        `<span class="evolve-from">${SpriteArt.frame(event.from, 'big')}</span><span class="evolve-into">${SpriteArt.frame(event.into, 'big')}</span>`;
      dialog.showModal();
      try {
        return await this.stage.sequence({
          duration: LeagueView.EVOLVE_MS,
          draw: (progress, reduced) => this.drawEvolution(event, progress, reduced),
        });
      } finally {
        dialog.close();
      }
    }

    // The sprite flickers between the two forms, then settles on the new one.
    drawEvolution(event, progress, reduced) {
      const done = progress >= 0.85;
      const flicker = progress > 0.2 && Math.floor(progress * 36) % 2 === 1;
      const into = done || (reduced ? progress >= 0.5 : flicker);
      this.el('evolveArt').querySelector('.evolve-from').style.opacity = into ? '0' : '1';
      this.el('evolveArt').querySelector('.evolve-into').style.opacity = into ? '1' : '0';
      this.el('evolveArt').style.setProperty('--glow', reduced ? '0' : String(Math.sin(progress * Math.PI).toFixed(2)));
      this.el('evolveText').textContent = done
        ? `${event.from.name} evolved into ${event.into.name}!`
        : `What? ${event.from.name} is evolving!`;
    }
  }

  if (typeof module !== 'undefined') module.exports = { LeagueView };
  else Object.assign(window.Pokeballers, { LeagueView });
}
