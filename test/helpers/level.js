import { TileMap } from '../../src/tilemap.js';
import { Player } from '../../src/player.js';
import { Enemies } from '../../src/enemy.js';
import { Inventory } from '../../src/inventory.js';
import { tickWorld } from '../../src/world.js';

/**
 * Test fixtures are miniature levels: a handful of legend characters, just big
 * enough to isolate one rule or one interaction between two rules. Reading a
 * failing test should tell you the whole story of the level it ran on.
 *
 *   const game = makeGame(['#####', '#@gG*#', '#####']);
 */

/** A headless tilemap from an inline level. No meshes are built. */
export function makeMap(rows) {
  return new TileMap(rows, { build: false });
}

/**
 * A whole headless game, wired the way main.js wires it.
 * @param {string[]} rows the miniature level
 * @param {{enemies?: {interval?: number, phase?: number}}} [options]
 *   `enemies` overrides the pacing of every enemy, so a test can say "one step
 *   per second, starting now" instead of depending on the production tables.
 */
export function makeGame(rows, { enemies: enemyOptions } = {}) {
  const tilemap = makeMap(rows);
  const inventory = new Inventory();
  const player = new Player(tilemap, inventory);
  const enemies = new Enemies(tilemap, enemyOptions);
  return { tilemap, player, enemies, inventory };
}

export const FRAME = 1 / 60;

/**
 * Advances the world exactly as the render loop does.
 * @returns {object[]} the events tickWorld returned, one entry per frame
 */
export function advance(game, seconds, dt = FRAME) {
  const events = [];
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) events.push(tickWorld(game, dt));
  return events;
}

/**
 * Requests a move and runs frames until the player is at rest again.
 *
 * Always move the player through this rather than calling tryMove directly:
 * arriving on a tile is what triggers pickups, switches and the goal, and
 * arrival happens inside player.update() once the tween completes. A test that
 * calls tryMove and asserts a pickup on the next line will always fail.
 *
 * "At rest" rather than a fixed duration, because one request is not always one
 * tile: a step onto ice slides on until something stops it.
 *
 * @returns {boolean} whether the move was allowed at all
 */
export function step(game, dx, dz) {
  const before = { gx: game.player.gx, gz: game.player.gz };
  game.player.tryMove(dx, dz);
  const accepted = game.player.gx !== before.gx || game.player.gz !== before.gz;

  const LIMIT = 600; // ten seconds of frames: a slide always ends long before
  for (let frame = 0; frame < LIMIT; frame++) {
    if (!game.player.isMoving && !game.player.isSliding) break;
    tickWorld(game, FRAME);
  }
  return accepted;
}

/** Walks a path of [dx, dz] steps, returning true only if every step landed. */
export function walk(game, path) {
  return path.every(([dx, dz]) => step(game, dx, dz));
}

/** Where the player is, for concise assertions. */
export function at(game) {
  return { gx: game.player.gx, gz: game.player.gz };
}
