/**
 * On-screen D-pad for touch devices.
 *
 * The markup lives in `index.html` (`#touch-controls`); this module wires it to
 * the player and mirrors how the keyboard behaves: a tap is one tile, and a held
 * button walks on from there without a pause. The pad only appears on
 * touch-capable devices, or as soon as a real touch happens on a hybrid one.
 *
 * The player owns the held direction and the pacing, so there is no repeat timer
 * here — a button down is a press, a button up is a release.
 */

const MOVES = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * @param {{enabled?: () => boolean}} [options] `enabled` is asked before every
 *   move, so the pad is inert while a panel is up — matching the keyboard.
 */
export function setupTouchControls(player, { enabled } = {}) {
  const root = document.getElementById('touch-controls');
  if (!root) return;

  const canMove = () => enabled?.() ?? true;

  function releaseAll() {
    player.releaseAll();
    for (const btn of root.querySelectorAll('.is-pressed')) {
      btn.classList.remove('is-pressed');
    }
  }

  /** Lifting one button leaves any other still under a finger holding its way. */
  function release(btn) {
    const move = MOVES[btn.dataset.move];
    if (move) player.release(move[0], move[1]);
    btn.classList.remove('is-pressed');
  }

  function press(btn, event) {
    const move = MOVES[btn.dataset.move];
    if (!move) return;

    // Keeps the touch from also scrolling, zooming, or synthesising a click.
    event.preventDefault();
    enableTouchMode();
    if (!canMove()) return;

    btn.classList.add('is-pressed');
    player.press(move[0], move[1]);
  }

  for (const btn of root.querySelectorAll('[data-move]')) {
    btn.addEventListener('pointerdown', (e) => press(btn, e));
    btn.addEventListener('pointerup', () => release(btn));
    btn.addEventListener('pointercancel', () => release(btn));
    // Mouse users can drag off a button; touch pointers stay captured by the
    // element they started on, so this only affects the pointer-fine case.
    btn.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch') release(btn);
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // A pointerup we never see would otherwise leave the player walking on.
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
}

/** Reveals the pad and switches the hint text over to touch wording. */
function enableTouchMode() {
  if (document.body.classList.contains('touch-mode')) return;
  document.body.classList.add('touch-mode');
  const controls = document.getElementById('touch-controls');
  if (controls) controls.removeAttribute('aria-hidden');
}

/**
 * Touch-capable devices get the pad up front; hybrids (a laptop with a
 * touchscreen) only get it once something is actually touched.
 */
export function detectTouch() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse || navigator.maxTouchPoints > 0) {
    enableTouchMode();
    return;
  }
  window.addEventListener('touchstart', enableTouchMode, { once: true });
}
