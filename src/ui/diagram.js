{
  class PlayDiagram {
    static ROUTES = {
      'inside-zone': 'M80 58 L116 58',
      'power-run': 'M80 58 L107 58 L124 43',
      'outside-stretch': 'M80 58 Q95 80 130 79',
      draw: 'M80 58 L70 58 Q97 60 119 55',
      'qb-sneak': 'M89 50 L112 50',
      'counter-run': 'M80 58 L72 68 Q96 75 125 42',
      'halfback-dive': 'M80 58 L115 58',
      'pitch-toss': 'M88 50 L75 68 Q105 82 135 76',
      'trap-run': 'M80 58 L72 58 Q99 45 124 49',
      'read-option': 'M80 58 L105 58 M88 50 Q111 35 125 31',
      'quick-slant': 'M81 23 L106 23 L126 43',
      'curl-routes': 'M81 23 L125 23 L116 32',
      'screen-pass': 'M88 50 L103 50 L80 70 L125 76',
      'drag-cross': 'M81 23 Q108 50 130 64',
      'out-route': 'M81 23 L116 23 L125 8',
      mesh: 'M81 23 Q110 46 130 72 M81 78 Q110 55 130 30',
      'shovel-pass': 'M88 50 L105 50 Q116 63 127 58',
      'te-seam': 'M82 72 L108 70 L145 70',
      'play-action': 'M80 58 L100 58 M81 23 Q120 40 145 32',
      'post-route': 'M81 23 L121 23 L149 48',
      'wheel-route': 'M80 58 Q98 81 122 81 L150 72',
      flood: 'M81 23 L130 18 M81 78 L120 68 M82 58 L115 53',
      'corner-route': 'M81 23 L118 33 L151 12',
      'deep-shot': 'M81 23 L158 17',
      'hail-mary': 'M81 23 Q122 10 169 25',
      'double-move': 'M81 23 L108 23 L100 32 L159 18',
      'four-verticals': 'M81 23 L160 23 M81 78 L160 78 M83 43 L155 43 M83 58 L155 58',
      'jet-sweep': 'M81 23 Q68 45 125 75',
      reverse: 'M81 23 Q73 48 120 72 L88 80 L140 62',
      'flea-flicker': 'M80 58 L106 58 L88 50 L155 25',
      'qb-scramble': 'M88 50 Q102 62 126 37',
      'end-around': 'M81 23 Q66 45 82 75 L135 78',
      'rpo-slant': 'M80 58 L111 58 M81 23 L106 23 L127 43',
      wildcat: 'M80 58 Q105 46 129 45',
      'double-pass': 'M88 50 L80 70 M80 70 Q125 20 160 25',
      'goal-line-stack': 'M80 58 L108 58',
      punt: 'M88 50 Q127 20 164 49',
      'field-goal': 'M88 50 L166 50',
    };

    static render(play, offense) {
      const paths = offense
        ? PlayDiagram.ROUTES[play.id]
        : play.strengths.includes('run')
          ? 'M112 25 L91 25 M112 50 L91 50 M112 75 L91 75'
          : play.id.includes('blitz')
            ? 'M120 22 L88 44 M120 78 L88 56 M135 50 L105 50'
            : play.strengths.includes('deep')
              ? 'M119 20 Q148 12 169 20 M119 50 Q148 40 169 50 M119 80 Q148 88 169 80'
              : 'M119 20 L104 35 M119 50 L102 50 M119 80 L104 65';
      return `<svg viewBox="0 0 200 100" role="img" aria-label="${play.name} diagram"><rect width="200" height="100" fill="#2d6949"/><path d="M100 0V100" stroke="#d3f565" stroke-width="2" stroke-dasharray="5 4"/><path d="M50 0V100 M150 0V100" stroke="#b6d1a2" stroke-opacity=".35"/><path d="${paths}" fill="none" stroke="${offense ? '#f6dd83' : '#ff9776'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)"/><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5 0 5" fill="${offense ? '#f6dd83' : '#ff9776'}"/></marker></defs>${(offense
        ? [
            [88, 50],
            [80, 58],
            [81, 23],
            [81, 78],
            [96, 38],
            [96, 62],
          ]
        : [
            [111, 20],
            [111, 50],
            [111, 80],
            [125, 35],
            [125, 65],
            [140, 50],
          ]
      )
        .map(
          ([x, y]) =>
            `<circle cx="${x}" cy="${y}" r="4" fill="${offense ? '#d3f565' : '#ff9776'}" stroke="#1a2735" stroke-width="2"/>`,
        )
        .join('')}</svg>`;
    }
  }
  Object.assign(window.Pokeballers, { PlayDiagram });
}
