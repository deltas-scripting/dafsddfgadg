import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/press-start-2p/latin-400.css';
import './style.css';
import * as THREE from 'three';
import { AudioEngine } from './engine/audio';
import { Input } from './engine/input';
import { makeEnvironment } from './engine/lighting';
import { setEnvironment } from './engine/materials';
import { initPhysics } from './engine/physics';
import { textures } from './engine/textures';
import { Game } from './game/game';
import { WEAPON_ORDER } from './game/weapons';
import { MenuScene } from './menu/menuScene';
import type { WeaponId } from './models/weapons';
import { mapThumbnail, weaponIcon } from './ui/capture';
import { Hud, LOGO_HTML } from './ui/hud';
import { Menus } from './ui/menus';

type State = 'menu' | 'maps' | 'game';

async function boot() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const loading = document.createElement('div');
  loading.className = 'screen loading on';
  loading.innerHTML = `${LOGO_HTML}<p>Loading</p>`;
  ui.appendChild(loading);
  // `?debug` runs the game without pointer lock so it can be driven by scripts; `&manual` also
  // stops the frame loop (frames are advanced with __gb.step) and `&scale=` lowers the resolution.
  const query = new URLSearchParams(location.search);
  const debug = query.has('debug');
  const manual = debug && query.has('manual');
  const scale = Number(query.get('scale')) || 0;

  let renderer: THREE.WebGLRenderer;
  try {
    // alpha: weapon icons are rendered with a transparent background
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !scale, alpha: true, powerPreference: 'high-performance' });
  } catch {
    loading.querySelector('p')!.textContent = 'WebGL is not available in this browser.';
    return;
  }
  renderer.setPixelRatio(scale || Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // the game draws the world and the weapon view in two passes
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);

  await initPhysics();
  // let the loading screen paint before the synchronous asset generation
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  setEnvironment(makeEnvironment(renderer));
  const audio = new AudioEngine();
  const input = new Input(canvas);
  const icons = Object.fromEntries(WEAPON_ORDER.map((id) => [id, weaponIcon(renderer, id)])) as Record<WeaponId, string>;
  const thumb = mapThumbnail(renderer);
  const hud = new Hud(ui, icons, (textures().blood.image as HTMLCanvasElement).toDataURL());
  const menuScene = new MenuScene();

  let state: State = 'menu';
  let game: Game | null = null;
  let paused = false;

  const menus = new Menus(ui, thumb, {
    onPlay: () => {
      audio.unlock();
      audio.play('uiClick');
      setState('maps');
    },
    onStart: () => {
      audio.unlock();
      audio.play('uiClick');
      startGame();
    },
    onReturn: () => {
      audio.play('uiClick');
      setState('menu');
    },
    onHover: () => audio.play('uiHover'),
  });

  function setState(s: State) {
    state = s;
    menus.show(s === 'menu' ? 'main' : s === 'maps' ? 'maps' : 'none');
    hud.show(s === 'game');
  }

  function setPaused(on: boolean, note = '') {
    paused = on;
    hud.setPaused(on, note);
  }

  function lock() {
    try {
      const p = canvas.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => undefined);
    } catch {
      // handled by the pointerlockerror listener / the fallback timer
    }
  }

  function startGame() {
    game?.dispose();
    game = new Game({ renderer, audio, input, hud });
    setState('game');
    setPaused(false);
    hud.toast('ToolGun equipped — left click to spawn a goredoll', 5200);
    if (debug) {
      input.enabled = true;
      return;
    }
    lock();
    // if the browser never grants the lock, fall back to the pause menu instead of a dead screen
    window.setTimeout(() => {
      if (state === 'game' && document.pointerLockElement !== canvas) setPaused(true, 'Click Resume to capture the mouse.');
    }, 700);
  }

  function exitToMenu() {
    audio.play('uiClick');
    setState('menu');
    setPaused(false);
    input.enabled = false;
    input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    game?.dispose();
    game = null;
  }

  document.addEventListener('pointerlockchange', () => {
    if (state !== 'game' || debug) return;
    const locked = document.pointerLockElement === canvas;
    input.enabled = locked;
    if (!locked) input.reset();
    setPaused(!locked);
  });
  document.addEventListener('pointerlockerror', () => {
    if (state === 'game' && !debug) setPaused(true, 'Could not capture the mouse. Click Resume to try again.');
  });
  hud.onResume = () => {
    audio.unlock();
    audio.play('uiClick');
    lock();
  };
  hud.onExit = exitToMenu;

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    menuScene.resize(window.innerWidth / Math.max(1, window.innerHeight));
    game?.resize();
  }
  window.addEventListener('resize', resize);
  resize();

  loading.remove();
  setState('menu');

  const tick = (dt: number) => {
    if (state === 'game' && game) {
      if (!paused) game.update(dt, input.enabled);
    } else {
      menuScene.update(dt);
    }
    input.endFrame();
  };
  const draw = () => {
    if (state === 'game' && game) {
      game.render();
    } else {
      renderer.clear();
      renderer.render(menuScene.scene, menuScene.camera);
    }
  };

  if (debug) {
    (window as unknown as Record<string, unknown>).__gb = {
      get game() {
        return game;
      },
      start: startGame,
      menu: menuScene,
      renderer,
      setState,
      input,
      /** Advance `n` fixed steps, then draw once. */
      step(n = 1, dt = 1 / 60) {
        for (let i = 0; i < n; i++) tick(dt);
        draw();
      },
    };
  }
  if (manual) {
    draw();
    return;
  }

  let last = performance.now();
  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
    last = now;
    tick(dt);
    draw();
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  const p = document.querySelector('.loading p');
  if (p) p.textContent = 'Failed to start the game. See the console for details.';
});
