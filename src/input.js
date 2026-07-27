/**
 * Maps WASD + arrow keys to one-tile grid moves on the player, and M to mute.
 *
 * Keys are tracked as held rather than leaning on the OS keydown repeat: the
 * repeat only starts after a delay of a few hundred milliseconds, which showed
 * up as a stall between the first tile and the rest. The player walks for as
 * long as a direction is down, and paces itself at one tile per step.
 *
 * @typedef {object} InputHandlers
 * @property {() => void} [onMute]
 * @property {() => void} [onRetry]
 * @property {() => void} [onExit] Escape — leaving the stage for the level list. The
 *   shell decides what that means from the phase it is in, including backing out of
 *   the prompt it just put up.
 * @property {() => boolean} [enabled] asked before every move: false while a panel is
 *   up, so the title screen and the stage-clear panel do not quietly let the player
 *   walk around behind them. Mute, retry and exit are never gated.
 */

/**
 * Asked for the player rather than handed one, because there is not always a player
 * to hand over: there is no stage behind the title screen or the level list, and a
 * player needs a map to stand on. M and Escape still have to work there, so the keys
 * are bound at start-up and every one of them tolerates finding nobody home.
 *
 * @param {() => (import('./player.js').Player | null)} getPlayer
 * @param {InputHandlers} [handlers]
 */
export function setupInput(getPlayer, { onMute, onRetry, onExit, enabled } = {}) {
  const canMove = () => enabled?.() ?? true;
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

    // Restarting the stage you are on, for when you would rather start over than
    // walk back — and, once a stage can be wedged, for when you have to.
    if (e.code === 'KeyR') {
      e.preventDefault();
      getPlayer()?.releaseAll();
      onRetry?.();
      return;
    }

    // Out of the stage, back to the level list — after a confirmation, which the
    // shell puts up. Escape backs out of that prompt too, so the key that opens it
    // is also the key that dismisses it.
    if (e.code === 'Escape') {
      e.preventDefault();
      getPlayer()?.releaseAll();
      onExit?.();
      return;
    }

    const move = moves[e.code];
    if (!move) return;
    e.preventDefault();
    // The OS repeat still arrives while a key is down; the key is already held,
    // so there is nothing to do with it.
    if (e.repeat) return;
    if (!canMove()) return;
    getPlayer()?.press(move[0], move[1]);
  });

  window.addEventListener('keyup', (e) => {
    const move = moves[e.code];
    if (!move) return;
    getPlayer()?.release(move[0], move[1]);
  });

  // A keyup that lands on another window never reaches us, so a key held as
  // focus goes away would otherwise walk on forever.
  window.addEventListener('blur', () => getPlayer()?.releaseAll());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) getPlayer()?.releaseAll();
  });
}
