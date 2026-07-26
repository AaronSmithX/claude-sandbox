/**
 * Maps WASD + arrow keys to one-tile grid moves on the player.
 * Holding a key auto-repeats via the OS keydown repeat, and the player itself
 * ignores input while a move is in progress, so movement stays tile-locked.
 */
export function setupInput(player) {
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
    const move = moves[e.code];
    if (!move) return;
    e.preventDefault();
    player.tryMove(move[0], move[1]);
  });
}
