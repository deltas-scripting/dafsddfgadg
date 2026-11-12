import { LOGO_HTML } from './hud';

const GUN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h20v4h-2v1h-7c0 1.7-1.3 3-3 3H9l-1.5 6H3l1.6-6.4C3.6 13 3 12 3 11H2z"/></svg>';
const PERSON_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4.2"/><path d="M3.5 21c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z"/></svg>';

export interface MenuCallbacks {
  /** Main menu "Play": open the map list. */
  onPlay(): void;
  /** Map screen "Play": start the selected map. */
  onStart(): void;
  onReturn(): void;
  onHover(): void;
}

/** Main menu and map-select screens (DOM overlays above the 3D backdrop). */
export class Menus {
  private main: HTMLElement;
  private maps: HTMLElement;

  constructor(parent: HTMLElement, thumb: string, cb: MenuCallbacks) {
    this.main = document.createElement('div');
    this.main.className = 'screen menu';
    this.main.innerHTML = `
      <div class="bar bar-top">${LOGO_HTML}<div class="bar-info">Sandbox <span>v1.0</span></div></div>
      <div class="bar bar-bottom">
        <button class="menu-btn" data-act="play">${GUN_ICON}<span>Play</span></button>
      </div>`;

    this.maps = document.createElement('div');
    this.maps.className = 'screen maps';
    this.maps.innerHTML = `
      <div class="maps-frame">
        <div class="maps-head">
          ${LOGO_HTML}
          <div class="maps-user"><u>Sandbox</u><div>Player <i>|</i> Offline <i>|</i> v1.0.0</div></div>
        </div>
        <div class="maps-tabs"><div class="tab on">Singleplayer ${PERSON_ICON}</div></div>
        <div class="maps-body">
          <div class="maps-grid">
            <button class="tile on" data-map="polygon"><img src="${thumb}" alt="" draggable="false"><span>Polygon</span></button>
          </div>
          <div class="maps-side">
            <img class="preview" src="${thumb}" alt="Polygon preview" draggable="false">
            <div class="map-name">Polygon</div>
            <div class="map-desc">Your private training ground. Spawn goredolls and try every weapon.</div>
            <button class="play" data-act="start">Play</button>
          </div>
        </div>
        <div class="maps-foot"><button data-act="return">Return</button></div>
      </div>`;

    parent.append(this.main, this.maps);
    const on = (root: HTMLElement, act: string, fn: () => void) => {
      const el = root.querySelector(`[data-act="${act}"]`) as HTMLElement;
      el.addEventListener('click', fn);
      el.addEventListener('mouseenter', () => cb.onHover());
    };
    on(this.main, 'play', () => cb.onPlay());
    on(this.maps, 'start', () => cb.onStart());
    on(this.maps, 'return', () => cb.onReturn());
  }

  show(which: 'main' | 'maps' | 'none') {
    this.main.classList.toggle('on', which === 'main');
    this.maps.classList.toggle('on', which === 'maps');
  }
}
