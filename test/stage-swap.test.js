import { describe, it, expect } from 'vitest';
import { TileMap } from '../src/tilemap.js';
import { Enemies } from '../src/enemy.js';
import { Player } from '../src/player.js';
import { Inventory } from '../src/inventory.js';
import { StageScene } from '../src/stage-scene.js';
import { makeMap, advance, at } from './helpers/level.js';

/**
 * What has to happen when one stage gives way to the next — or to no stage at all,
 * which is what the title screen and the level list are: the old stage's meshes are
 * handed back, and the player — which outlives every stage, because the camera
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

/**
 * A stage is now built when one is played and destroyed when it stops being played,
 * rather than living for the whole session — the title screen, the level list and the
 * win panel have nothing behind them. That makes what a stage owns, and what it only
 * borrows, worth stating exactly.
 */
describe('a stage on the screen', () => {
  /** Everything a stage can build: tiles, a patrol and a crate. */
  const STAGE = {
    id: 'fixture',
    name: 'Fixture',
    hint: '',
    rows: ['######', '#@.B.#', '#..-.#', '#...*#', '######'],
  };

  it('builds its map, its patrols and its crates under one root', () => {
    const scene = new StageScene(STAGE);

    expect(scene.enemies.list).toHaveLength(1);
    expect(scene.blocks.list).toHaveLength(1);
    expect(scene.root.children).toEqual([
      scene.tilemap.group,
      scene.enemies.group,
      scene.blocks.group,
    ]);
  });

  it('hands back every geometry and material when it is unloaded', () => {
    const scene = new StageScene(STAGE);
    const watch = watchDisposal(resources(scene.root));
    expect(watch.total).toBeGreaterThan(0);

    scene.dispose();

    expect(watch.count).toBe(watch.total);
  });

  it('empties its root, including anything only visiting it', () => {
    // The player and the sparks are parented to the stage so that unloading takes
    // them off the screen — but they outlive it, so they are cleared rather than
    // disposed. Anything still parented here after an unload would be a stage that
    // is gone still drawing.
    const scene = new StageScene(STAGE);
    const player = new Player(scene.tilemap, new Inventory());
    scene.root.add(player.mesh);

    scene.dispose();

    expect(scene.root.children).toHaveLength(0);
    expect(player.mesh.parent).toBe(null);
    // Still whole, and ready for the next stage.
    expect(player.mesh.children.length).toBeGreaterThan(0);
  });
});

describe('moving the player to another stage', () => {
  const FIRST = ['#####', '#@..#', '#####'];
  const SECOND = ['#####', '#...#', '#..@#', '#####'];

  /** A player part-way through the first map, holding a direction. */
  function partWayThrough() {
    const inventory = new Inventory();
    const player = new Player(makeMap(FIRST), inventory);
    // A real Enemies, which on these maps is an empty one: the point here is the
    // player crossing from one stage to the next, not what is chasing it.
    const game = {
      tilemap: player.tilemap,
      player,
      enemies: new Enemies(player.tilemap),
      inventory,
    };
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
