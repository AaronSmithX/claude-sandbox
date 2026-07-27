import { describe, it, expect } from 'vitest';
import { TileMap } from '../src/tilemap.js';
import { Enemies } from '../src/enemy.js';
import { Player } from '../src/player.js';
import { Inventory } from '../src/inventory.js';
import { makeMap, advance, at } from './helpers/level.js';

/**
 * What has to happen when one stage gives way to the next: the old stage's meshes
 * are handed back, and the player — which outlives every stage, because the camera
 * follows it and the input is bound to it — arrives on the new map at its spawn
 * with nothing carried over.
 */

/** Every geometry and material under an object, each counted once. */
function resources(root) {
  const found = new Set();
  root.traverse((object) => {
    if (object.geometry) found.add(object.geometry);
    const material = object.material;
    for (const one of Array.isArray(material) ? material : material ? [material] : []) {
      found.add(one);
    }
  });
  return found;
}

/** Counts dispose() calls by listening for the event three fires from it. */
function watchDisposal(items) {
  const state = { count: 0, total: items.size };
  for (const item of items) item.addEventListener('dispose', () => (state.count += 1));
  return state;
}

describe('unloading a stage', () => {
  it('disposes every tile geometry and material, and empties the group', () => {
    const map = new TileMap(['#####', '#@gG#', '#.~1#', '#####'], { build: true });
    const watch = watchDisposal(resources(map.group));
    expect(watch.total).toBeGreaterThan(0);

    map.dispose();

    expect(watch.count).toBe(watch.total);
    expect(map.group.children).toHaveLength(0);
  });

  it('disposes the enemies with it', () => {
    const map = makeMap(['#####', '#@-.#', '#..|#', '#####']);
    const enemies = new Enemies(map);
    expect(enemies.list).toHaveLength(2);

    const watch = watchDisposal(resources(enemies.group));
    enemies.dispose();

    expect(watch.count).toBe(watch.total);
    expect(enemies.group.children).toHaveLength(0);
    expect(enemies.list).toHaveLength(0);
  });
});

describe('moving the player to another stage', () => {
  const FIRST = ['#####', '#@..#', '#####'];
  const SECOND = ['#####', '#...#', '#..@#', '#####'];

  /** A player part-way through the first map, holding a direction. */
  function partWayThrough() {
    const inventory = new Inventory();
    const player = new Player(makeMap(FIRST), inventory);
    const game = { tilemap: player.tilemap, player, enemies: { update() {}, hits: () => null }, inventory };
    player.press(1, 0);
    advance(game, 0.2);
    return { player, inventory, game };
  }

  it('spawns on the new map, not where it left the old one', () => {
    const { player, game } = partWayThrough();
    expect(player.gx).toBeGreaterThan(1);

    const second = makeMap(SECOND);
    player.setTilemap(second);
    game.tilemap = second;

    expect(player.tilemap).toBe(second);
    expect(at({ player })).toEqual({ gx: 3, gz: 2 });
    expect(player.isMoving).toBe(false);
  });

  it('drops the direction the player was holding', () => {
    const { player, game } = partWayThrough();
    const second = makeMap(SECOND);
    player.setTilemap(second);
    game.tilemap = second;

    // Nothing is held any more, so the player stays put until asked again.
    advance(game, 0.5);
    expect(at({ player })).toEqual({ gx: 3, gz: 2 });
  });

  it('lets the new stage announce its own first move, so its hint can clear', () => {
    const { player, game } = partWayThrough();
    let announced = 0;
    player.onFirstMove = () => (announced += 1);

    player.setTilemap(makeMap(SECOND));
    game.tilemap = player.tilemap;
    player.press(-1, 0);
    advance(game, 0.2);

    expect(announced).toBe(1);
  });
});
