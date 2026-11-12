import type { WeaponId } from '../models/weapons';

export const LOGO_HTML = `
  <div class="logo">
    <div class="logo-text"><span class="gun">Gun<i class="drip d1"></i><i class="drip d2"></i><i class="drip d3"></i></span><span class="box">Box</span></div>
    <small>Action, Gore, Sandbox</small>
  </div>`;

const ORDER: WeaponId[] = ['tool', 'ak', 'pistol', 'knife'];
const NAMES: Record<WeaponId, string> = { tool: 'ToolGun', ak: 'AK-47', pistol: 'Pistol', knife: 'Knife' };
const HINTS: Record<WeaponId, string> = {
  tool: '<b>LMB</b> spawn goredoll &nbsp;·&nbsp; <b>RMB</b> remove doll',
  ak: '<b>LMB</b> fire &nbsp;·&nbsp; <b>RMB</b> aim &nbsp;·&nbsp; <b>R</b> reload',
  pistol: '<b>LMB</b> fire &nbsp;·&nbsp; <b>RMB</b> aim &nbsp;·&nbsp; <b>R</b> reload',
  knife: '<b>LMB</b> slash &nbsp;·&nbsp; <b>RMB</b> stab',
};
const KEYS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['C', 'Crouch'],
  ['1 – 4 / Wheel', 'Switch weapon'],
  ['LMB / RMB', 'Use weapon'],
  ['R', 'Reload'],
  ['X', 'Clean up the map'],
  ['Esc', 'Pause'],
];

/** In-game overlay: crosshair, hotbar, ammo, notifications and the pause menu. */
export class Hud {
  onResume: () => void = () => {};
  onExit: () => void = () => {};
  private root: HTMLElement;
  private cross: HTMLElement;
  private marker: HTMLElement;
  private stats: HTMLElement;
  private toastEl: HTMLElement;
  private hint: HTMLElement;
  private splash: HTMLElement;
  private ammoName: HTMLElement;
  private ammoCount: HTMLElement;
  private pauseEl: HTMLElement;
  private pauseNote: HTMLElement;
  private slots: HTMLElement[];
  private last: Record<string, string> = {};
  private toastTimer = 0;
  private markerTimer = 0;

  /** `splats` is the blood decal atlas as an image URL, reused for blood on the screen. */
  constructor(parent: HTMLElement, icons: Record<WeaponId, string>, splats: string) {
    const el = document.createElement('div');
    el.className = 'screen hud';
    el.style.setProperty('--splats', `url(${splats})`);
    el.innerHTML = `
      <div class="vignette"></div>
      <div class="splash"></div>
      <div class="crosshair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="hitmarker"></div>
      <div class="stats"></div>
      <div class="toast"></div>
      <div class="hint"></div>
      <div class="hotbar">
        ${ORDER.map(
          (id, i) => `<div class="slot" data-slot="${i}"><span class="num">${i + 1}</span><img src="${icons[id]}" alt="${NAMES[id]}" draggable="false"><span class="label">${NAMES[id]}</span></div>`,
        ).join('')}
      </div>
      <div class="ammo"><div class="ammo-name"></div><div class="ammo-count"></div></div>
      <div class="pause">
        <div class="pause-panel">
          ${LOGO_HTML}
          <h2>Paused</h2>
          <div class="pause-note"></div>
          <div class="pause-actions">
            <button data-act="resume">Resume</button>
            <button data-act="exit">Exit to menu</button>
          </div>
          <table class="keys">${KEYS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
        </div>
      </div>`;
    parent.appendChild(el);
    this.root = el;
    const q = (sel: string) => el.querySelector(sel) as HTMLElement;
    this.cross = q('.crosshair');
    this.marker = q('.hitmarker');
    this.stats = q('.stats');
    this.toastEl = q('.toast');
    this.hint = q('.hint');
    this.splash = q('.splash');
    this.ammoName = q('.ammo-name');
    this.ammoCount = q('.ammo-count');
    this.pauseEl = q('.pause');
    this.pauseNote = q('.pause-note');
    this.slots = Array.from(el.querySelectorAll('.slot')) as HTMLElement[];
    q('[data-act="resume"]').addEventListener('click', () => this.onResume());
    q('[data-act="exit"]').addEventListener('click', () => this.onExit());
  }

  show(on: boolean) {
    this.root.classList.toggle('on', on);
    if (!on) {
      this.splash.replaceChildren();
      this.toastEl.classList.remove('on');
    }
  }

  /** Writes text/attributes only when they change, to keep the DOM quiet. */
  private set(key: string, value: string, apply: (v: string) => void) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply(value);
  }

  setWeapon(index: number, name: string) {
    this.slots.forEach((s, i) => s.classList.toggle('on', i === index));
    this.ammoName.textContent = name;
    this.hint.innerHTML = HINTS[ORDER[index]];
    this.hint.classList.remove('fade');
    void this.hint.offsetWidth;
    this.hint.classList.add('fade');
  }

  setAmmo(text: string, reloading: boolean) {
    this.set('ammo', `${text}|${reloading}`, () => {
      this.ammoCount.innerHTML = reloading ? '<span class="reload">Reloading</span>' : text ? `<b>${text}</b><span>/ ∞</span>` : '';
    });
  }

  setCrosshair(gap: number, ads: number, weapon: WeaponId) {
    this.set('gap', `${Math.round(gap)}`, (v) => this.cross.style.setProperty('--gap', `${v}px`));
    this.set('cross', `${weapon}|${ads > 0.5}`, () => {
      this.cross.className = `crosshair ${weapon === 'knife' ? 'dot-only' : weapon === 'tool' ? 'tool' : ''} ${ads > 0.5 ? 'hide' : ''}`;
    });
  }

  setStats(dolls: number, max: number, kills: number) {
    this.set('stats', `${dolls}|${kills}`, () => {
      this.stats.innerHTML = `<span>Goredolls <b>${dolls}</b> / ${max}</span><span>Kills <b>${kills}</b></span>`;
    });
  }

  hitMarker(kill: boolean) {
    this.marker.className = `hitmarker on ${kill ? 'kill' : ''}`;
    clearTimeout(this.markerTimer);
    this.markerTimer = window.setTimeout(() => (this.marker.className = 'hitmarker'), kill ? 260 : 120);
  }

  toast(text: string, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  /** Blood spatters on the "lens" after a close-range kill. */
  bloodSplash(n: number) {
    for (let i = 0; i < n; i++) {
      if (this.splash.childElementCount > 9) break;
      const d = document.createElement('i');
      const size = 170 + Math.random() * 260;
      // keep the middle of the screen clear: splats land around the edges
      const edge = Math.random() < 0.5;
      const x = edge ? Math.random() * 100 : Math.random() < 0.5 ? Math.random() * 20 : 80 + Math.random() * 20;
      const y = edge ? (Math.random() < 0.5 ? Math.random() * 18 : 78 + Math.random() * 18) : Math.random() * 100;
      const cell = (Math.random() * 8) | 0;
      d.style.cssText = `width:${size}px;height:${size}px;left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${
        Math.random() * 360
      }deg);background-position:${(cell % 4) * 33.333}% ${Math.floor(cell / 4) * 33.333}%`;
      d.addEventListener('animationend', () => d.remove());
      this.splash.appendChild(d);
    }
  }

  setPaused(on: boolean, note = '') {
    this.pauseEl.classList.toggle('on', on);
    this.pauseNote.textContent = note;
  }
}
