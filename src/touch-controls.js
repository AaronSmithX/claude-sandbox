/**
 * On-screen D-pad for touch devices.
 *
 * The markup lives in `index.html` (`#touch-controls`); this module wires it to
 * the player and mirrors how the keyboard behaves: a tap is one tile, holding a
 * button waits a beat and then walks continuously. The pad only appears on
 * touch-capable devices, or as soon as a real touch happens on a hybrid one.
 */

const MOVES = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

// Seconds a button must be held before it starts auto-repeating, matching the
// feel of an OS keyboard repeat delay.
const HOLD_DELAY = 0.25;

export function setupTouchControls(player) {
  const root = document.getElementById('touch-controls');
  if (!root) return;

  // Direction currently held down, plus how long it has been held.
  let held = null;
  let heldFor = 0;
  let lastFrame = 0;
  let frameId = 0;

  function release() {
    held = null;
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    for (const btn of root.querySelectorAll('.is-pressed')) {
      btn.classList.remove('is-pressed');
    }
  }

  function tick(now) {
    frameId = requestAnimationFrame(tick);
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (!held) return;

    heldFor += dt;
    // Past the initial delay we ask every frame; the player ignores requests
    // while a step is in flight, so this paces itself to one tile per step.
    if (heldFor >= HOLD_DELAY) player.tryMove(held[0], held[1]);
  }

  function press(btn, event) {
    const move = MOVES[btn.dataset.move];
    if (!move) return;

    // Keeps the touch from also scrolling, zooming, or synthesising a click.
    event.preventDefault();
    enableTouchMode();

    btn.classList.add('is-pressed');
    held = move;
    heldFor = 0;
    player.tryMove(move[0], move[1]);

    if (!frameId) {
      lastFrame = performance.now();
      frameId = requestAnimationFrame(tick);
    }
  }

  for (const btn of root.querySelectorAll('[data-move]')) {
    btn.addEventListener('pointerdown', (e) => press(btn, e));
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    // Mouse users can drag off a button; touch pointers stay captured by the
    // element they started on, so this only affects the pointer-fine case.
    btn.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch') release();
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Never leave the player walking into a wall forever after we lose focus.
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) release();
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
