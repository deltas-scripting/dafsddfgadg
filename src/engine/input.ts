const BLOCKED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyR', 'KeyC', 'KeyX']);

/** Keyboard and mouse state with per-frame edge detection. */
export class Input {
  private down = new Set<string>();
  private hit = new Set<string>();
  private buttons = [false, false, false];
  private clicks = [false, false, false];
  dx = 0;
  dy = 0;
  wheel = 0;
  /** Game input is only collected while enabled (i.e. while playing). */
  enabled = false;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (BLOCKED.has(e.code) && !e.ctrlKey && !e.metaKey) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.hit.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button > 2) return;
      this.buttons[e.button] = true;
      this.clicks[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button <= 2) this.buttons[e.button] = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== this.target) return;
      // Browsers occasionally report a huge bogus delta right after locking.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.enabled) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.reset());
  }

  key(code: string) {
    return this.down.has(code);
  }
  pressed(code: string) {
    return this.hit.has(code);
  }
  button(i: number) {
    return this.buttons[i];
  }
  clicked(i: number) {
    return this.clicks[i];
  }

  /** Scripted input, used by automated checks. */
  setKey(code: string, down: boolean) {
    if (down) {
      this.down.add(code);
      this.hit.add(code);
    } else {
      this.down.delete(code);
    }
  }
  setButton(i: number, down: boolean) {
    this.buttons[i] = down;
    if (down) this.clicks[i] = true;
  }

  endFrame() {
    this.hit.clear();
    this.clicks.fill(false);
    this.dx = this.dy = this.wheel = 0;
  }

  reset() {
    this.down.clear();
    this.buttons.fill(false);
    this.endFrame();
  }
}
