/**
 * One simulation step.
 *
 * This lives outside main.js on purpose. Enemies now move on their own clocks,
 * so a catch can happen on any frame rather than only in response to a player
 * move — which makes the update order and the collision check part of the game's
 * rules rather than incidental detail of the render loop. The headless tests
 * drive this exact function, so they cannot drift away from what ships.
 *
 * @param {import('./types.js').World} world
 * @param {number} dt seconds
 * @returns {{died?: boolean}} events for the caller to render
 */
export function tickWorld(world, dt) {
  const { tilemap, player, enemies, inventory, particles } = world;

  // A finished level keeps animating — tweens still settle, pickups still bob —
  // but nothing can advance the game any further.
  const frozen = inventory.won || inventory.dead;

  tilemap.update(dt);
  player.update(dt); // may fire tilemap.onEnter mid-frame, on arrival
  enemies.update(dt, frozen);
  particles?.update(dt);

  if (!frozen && enemies.hits(player)) {
    inventory.setDead(true);
    return { died: true };
  }

  return {};
}
