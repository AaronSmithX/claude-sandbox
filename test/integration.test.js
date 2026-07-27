import { describe, it, expect } from 'vitest';
import { DEFAULT_MAP } from '../src/tilemap.js';
import { makeGame, advance, step, walk, at } from './helpers/level.js';

/**
 * Each level here is the smallest one that makes two mechanics meet: a key and
 * the door it opens, the tube and the water it crosses, a switch and the columns
 * it moves, a patrol and the player it is hunting.
 */

describe('keys and doors', () => {
  const LEVEL = ['######', '#@gG*#', '######'];

  it('will not open the door empty-handed', () => {
    const game = makeGame(LEVEL);
    // Straight past the key is impossible in this corridor, so start by taking
    // the key tile without collecting it: reach the door with no key at all.
    const bare = makeGame(['#####', '#@G*#', '#####']);
    expect(step(bare, 1, 0)).toBe(false);
    expect(at(bare)).toEqual({ gx: 1, gz: 1 });
    expect(game.inventory.keyCount('gold')).toBe(0);
  });

  it('takes the key, spends it on the door, and reaches the star', () => {
    const game = makeGame(LEVEL);

    expect(step(game, 1, 0)).toBe(true); // onto the key
    expect(game.inventory.keyCount('gold')).toBe(1);

    expect(step(game, 1, 0)).toBe(true); // through the door
    expect(game.inventory.keyCount('gold')).toBe(0);
    expect(game.tilemap.get(3, 1).open).toBe(true);

    expect(step(game, 1, 0)).toBe(true); // onto the star
    expect(game.inventory.won).toBe(true);
  });

  it('leaves an opened door open, so it costs one key and not two', () => {
    const game = makeGame(['#####', '#@gG#', '#..##', '#####']);
    walk(game, [
      [1, 0],
      [1, 0],
    ]);
    expect(game.inventory.keyCount('gold')).toBe(0);
    // Step off the door and back on: the second crossing is free.
    expect(walk(game, [[-1, 0], [1, 0]])).toBe(true);
  });
});

describe('the tube and the water', () => {
  const LEVEL = ['######', '#@O~*#', '######'];

  it('refuses the water until the tube is collected', () => {
    const game = makeGame(['#####', '#@~*#', '#####']);
    expect(step(game, 1, 0)).toBe(false);
  });

  it('crosses the water once carrying the tube', () => {
    const game = makeGame(LEVEL);
    expect(step(game, 1, 0)).toBe(true); // tube
    expect(game.inventory.hasTube).toBe(true);
    expect(step(game, 1, 0)).toBe(true); // water
    expect(step(game, 1, 0)).toBe(true); // star
    expect(game.inventory.won).toBe(true);
  });
});

describe('switches and columns', () => {
  it('opens the way by pressing the switch that lowers the columns', () => {
    const game = makeGame(['######', '#@1X*#', '######']);

    // The red columns start raised, so the way out is shut.
    expect(game.tilemap.canEnter(3, 1, game.inventory)).toBe(false);

    expect(step(game, 1, 0)).toBe(true); // stand on the red switch
    expect(game.tilemap.canEnter(3, 1, game.inventory)).toBe(true);

    expect(walk(game, [[1, 0], [1, 0]])).toBe(true);
    expect(game.inventory.won).toBe(true);
  });

  it('shuts one group as it opens the other', () => {
    const game = makeGame(['#####', '#@1.#', '#x.X#', '#####']);
    expect(game.tilemap.canEnter(1, 2, game.inventory)).toBe(true); // x retracted
    step(game, 1, 0);
    expect(game.tilemap.canEnter(1, 2, game.inventory)).toBe(false); // now raised
    expect(game.tilemap.canEnter(3, 2, game.inventory)).toBe(true); // X retracted
  });
});

describe('the shipped level', () => {
  // Patrols parked, so this is about the level's shape and nothing else.
  const level = () => makeGame(DEFAULT_MAP, { enemies: { interval: 999, phase: 0 } });

  it('sends you down the ice corridor and out the other end', () => {
    const game = level();
    expect(walk(game, [[1, 0], [0, 1], [0, 1]])).toBe(true); // to 2,3
    expect(at(game)).toEqual({ gx: 2, gz: 3 });

    step(game, 0, 1); // onto the ice: one press, three tiles

    expect(at(game)).toEqual({ gx: 2, gz: 7 });
    expect(game.player.isSliding).toBe(false);
  });

  it('lets you slide back up it again', () => {
    const game = level();
    walk(game, [[1, 0], [0, 1], [0, 1]]);
    step(game, 0, 1); // down to 2,7
    step(game, 0, -1); // and back
    expect(at(game)).toEqual({ gx: 2, gz: 3 });
  });
});

describe('patrols hunting a stationary player', () => {
  it('reaches a player who stands still', () => {
    const game = makeGame(['######', '#@..-#', '######'], {
      enemies: { interval: 0.25, phase: 0 },
    });
    advance(game, 4);
    expect(game.inventory.dead).toBe(true);
  });

  it('cannot follow the player through a door it has opened', () => {
    // The patrol is shut in with the player's starting room; the door blocks it
    // even after the player has unlocked it and walked through.
    const game = makeGame(['#######', '#@g-#*#', '#####G#', '#######'], {
      enemies: { interval: 0.25, phase: 0 },
    });
    expect(game.tilemap.isWalkable(5, 2)).toBe(false);
    advance(game, 1);
    expect(game.enemies.list[0].gx).toBeLessThan(4);
  });
});
