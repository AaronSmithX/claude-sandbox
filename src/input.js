/**
 * Maps WASD + arrow keys to one-tile grid moves on the player, and M to mute.
 *
 * Keys are tracked as held rather than leaning on the OS keydown repeat: the
 * repeat only starts after a delay of a few hundred milliseconds, which showed
 * up as a stall between the first tile and the rest. The player walks for as
 * long as a direction is down, and paces itself at one tile per step.
 *
 * @param {{onMute?: () => void}} [handlers]
 */
export function setupInput(player, { onMute } = {}) {
  const moves = {
    ArrowUp: [0, -1],
    KeyW: [0, -1],
    ArrowDown: [0, 1],
    KeyS: [0, 1],
    ArrowLeft: [-1, 0],
    KeyA: [-1, 0],
    ArrowRight: [1, 0],
    KeyD: [1, 0],
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') {
      e.preventDefault();
      onMute?.();
      return;
    }

    const move = moves[e.code];
    if (!move) return;
    e.preventDefault();
    // The OS repeat still arrives while a key is down; the key is already held,
    // so there is nothing to do with it.
    if (e.repeat) return;
    player.press(move[0], move[1]);
  });

  window.addEventListener('keyup', (e) => {
    const move = moves[e.code];
    if (!move) return;
    player.release(move[0], move[1]);
  });

  // A keyup that lands on another window never reaches us, so a key held as
  // focus goes away would otherwise walk on forever.
  window.addEventListener('blur', () => player.releaseAll());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) player.releaseAll();
  });
}
