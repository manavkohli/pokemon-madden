{
  class FootballField {
    static START = 7;
    static END = 92;

    static position(yards) {
      return this.START + (Math.max(0, Math.min(100, yards)) / 100) * (this.END - this.START);
    }

    static markings() {
      return Array.from({ length: 11 }, (_, index) => {
        const yards = index * 10;
        const label = index === 0 || index === 10 ? '' : `<span>${Math.min(yards, 100 - yards)}</span>`;
        return `<i class="yard-line" style="left:${this.position(yards)}%">${label}</i>`;
      }).join('');
    }
  }

  if (typeof module !== 'undefined') module.exports = { FootballField };
  else Object.assign(window.Pokeballers, { FootballField });
}
