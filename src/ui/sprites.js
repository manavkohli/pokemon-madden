{
  class SpriteArt {
    static url(mon, back = false) {
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${back ? 'back/' : ''}${mon.id}.png`;
    }

    static escape(value) {
      return String(value).replace(
        /[&<>"']/g,
        (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
      );
    }

    static image(mon, { back = false, lazy = true } = {}) {
      return `<img data-sprite src="${this.url(mon, back)}" alt="" draggable="false" ${lazy ? 'loading="lazy"' : ''}>`;
    }

    static frame(mon, size = '') {
      return `<span class="pixel-frame ${size}"><span aria-hidden="true">◓</span>${this.image(mon)}</span>`;
    }

    static fighter(mon, back) {
      return `<div class="battle-shadow"></div><div class="battle-body"><span class="battle-fallback" aria-hidden="true">◓</span>${this.image(mon, { back, lazy: false })}</div><b>${this.escape(mon.name)}</b>`;
    }

    static handleError(event) {
      if (event.target.matches('img[data-sprite]')) event.target.hidden = true;
    }
  }

  if (typeof module !== 'undefined') module.exports = { SpriteArt };
  else Object.assign(window.Pokeballers, { SpriteArt });
}
