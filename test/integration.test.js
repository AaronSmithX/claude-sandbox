import { describe, it, expect } from 'vitest';
import { DEFAULT_MAP, STAGES, stageLayers } from '../src/levels.js';
import { makeGame, advance, step, walk, at, FRAME } from './helpers/level.js';

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

describe('the opening stages', () => {
  const stage = (id) => stageLayers(STAGES.find((s) => s.id === id));

  /** `n` copies of one direction, for routes that run in straight lines. */
  const times = (n, [dx, dz]) => Array.from({ length: n }, () => [dx, dz]);
  const EAST = [1, 0];
  const WEST = [-1, 0];
  const SOUTH = [0, 1];

  it('walks First Steps to the star', () => {
    const game = makeGame(stage('first-steps'));
    expect(
      walk(game, [...times(6, EAST), ...times(3, SOUTH), WEST]),
    ).toBe(true);
    expect(game.inventory.won).toBe(true);
  });

  it('will not let Lock and Key be finished without the keys', () => {
    const game = makeGame(stage('lock-and-key'));
    // Down the only way out of the opening corridor, leaving the gold key behind.
    walk(game, [...times(7, EAST), ...times(2, SOUTH)]);
    expect(at(game)).toEqual({ gx: 8, gz: 3 });
    expect(step(game, -1, 0)).toBe(false); // the gold door, and nothing to open it
  });

  it('walks Lock and Key through both doors to the star', () => {
    const game = makeGame(stage('lock-and-key'));

    walk(game, times(8, EAST)); // the gold key sits past the way down
    expect(game.inventory.keyCount('gold')).toBe(1);

    walk(game, [WEST, ...times(2, SOUTH), ...times(4, WEST)]);
    expect(game.inventory.keyCount('gold')).toBe(0); // spent on the gold door
    expect(game.inventory.keyCount('violet')).toBe(1);

    walk(game, [...times(3, WEST), ...times(2, SOUTH), ...times(2, EAST)]);
    expect(game.inventory.keyCount('violet')).toBe(0); // spent on the violet door

    walk(game, times(4, EAST));
    expect(game.inventory.won).toBe(true);
  });

  it('climbs Up and Over, and can only reach the star down the chute', () => {
    const game = makeGame(stage('up-and-over'));
    const NORTH = [0, -1];

    // The pen the star sits in has one way in, and it is not at ground level.
    const map = game.tilemap;
    expect(map.isConnected(map.get(7, 3), map.get(7, 4))).toBe(false);

    walk(game, [...times(2, EAST), ...times(2, SOUTH)]); // to the foot of the stair
    expect(at(game)).toEqual({ gx: 3, gz: 3 });

    walk(game, times(2, SOUTH)); // up the stair onto the walkway
    expect(at(game)).toEqual({ gx: 3, gz: 5 });
    expect(game.player.elevation).toBeCloseTo(0.5);

    walk(game, times(4, EAST)); // along the walkway to the top of the chute
    expect(at(game)).toEqual({ gx: 7, gz: 5 });

    step(game, ...NORTH); // and down it, which lands on the star
    expect(at(game)).toEqual({ gx: 7, gz: 3 });
    expect(game.inventory.won).toBe(true);
  });

  it('crosses Over and Under both ways: the deck first, then the river', () => {
    const game = makeGame(stage('over-and-under'));
    const NORTH = [0, -1];

    // The river is the only way to the star, and it takes the tube.
    walk(game, [...times(2, SOUTH), ...times(2, EAST)]);
    expect(at(game)).toEqual({ gx: 3, gz: 3 });
    expect(step(game, 1, 0)).toBe(false); // straight into the water

    // Nor can the landing be climbed: it is a ledge, and the stair is round to the
    // west, which is the whole reason the bridge has an approach.
    expect(step(game, ...NORTH)).toBe(false);
    walk(game, [...times(2, WEST), NORTH]);
    expect(at(game)).toEqual({ gx: 1, gz: 2 });

    walk(game, times(4, EAST)); // stair, landing, and out onto the span
    expect(at(game)).toEqual({ gx: 5, gz: 2 });
    expect(game.player.layer).toBe(1); // on the deck, over water
    expect(game.tilemap.get(5, 2).type).toBe('water');

    walk(game, times(4, EAST)); // the rest of the span, landing, stair, ground
    expect(at(game)).toEqual({ gx: 9, gz: 2 });
    expect(game.player.layer).toBe(0);

    // The tube is on the far bank; then into the river, and along to the island.
    walk(game, [...times(3, SOUTH), WEST]);
    expect(game.inventory.hasTube).toBe(true);
    walk(game, [SOUTH, ...times(2, WEST)]);
    expect(at(game)).toEqual({ gx: 6, gz: 6 });

    expect(step(game, -1, 0)).toBe(true); // onto the island
    expect(game.inventory.won).toBe(true);
  });

  it('rides Going Up for the key, and back down for the door', () => {
    const game = makeGame(stage('going-up'));

    /** Waits, as a player would, for the platform to come to a storey. */
    function waitForLift(level) {
      for (let frame = 0; frame < 600; frame++) {
        if (Math.abs(game.tilemap.get(4, 3).level - level) < 1e-6) return;
        advance(game, FRAME);
      }
      throw new Error(`the platform never reached level ${level}`);
    }

    walk(game, [...times(2, EAST), ...times(2, SOUTH)]);
    expect(at(game)).toEqual({ gx: 3, gz: 3 });

    waitForLift(0);
    expect(step(game, 1, 0)).toBe(true); // aboard
    expect(game.player.tile.type).toBe('elevator');

    waitForLift(1); // up to the gantry
    walk(game, times(3, EAST));
    expect(game.inventory.keyCount('white')).toBe(1);

    walk(game, times(2, WEST)); // back to the platform's landing
    expect(at(game)).toEqual({ gx: 5, gz: 3 });

    waitForLift(1); // it has gone down and come back by now
    expect(step(game, -1, 0)).toBe(true);
    waitForLift(0); // ride it down

    expect(step(game, -1, 0)).toBe(true); // off onto the floor
    expect(step(game, 0, 1)).toBe(true); // through the white door
    expect(step(game, 0, 1)).toBe(true); // onto the star
    expect(game.inventory.won).toBe(true);
  });

  it('crosses Thin Ice in three slides', () => {
    const game = makeGame(stage('thin-ice'));

    walk(game, times(2, EAST));
    step(game, 1, 0); // one press, four tiles of ice
    expect(at(game)).toEqual({ gx: 8, gz: 1 });

    walk(game, [...times(2, SOUTH), ...times(2, WEST)]);
    step(game, -1, 0); // back west, all the way across
    expect(at(game)).toEqual({ gx: 1, gz: 3 });

    walk(game, [...times(2, SOUTH), EAST]);
    step(game, 1, 0); // the last run carries the player onto the star
    expect(at(game)).toEqual({ gx: 8, gz: 5 });
    expect(game.inventory.won).toBe(true);
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
