import { describe, it, expect, vi } from 'vitest';
import { WATER_SINK } from '../src/tilemap.js';
import { makeGame, advance, step, at, FRAME } from './helpers/level.js';

describe('Player movement', () => {
  it('walks onto floor and updates its grid position straight away', () => {
    const game = makeGame(['####', '#@.#', '####']);
    expect(step(game, 1, 0)).toBe(true);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
  });

  it('refuses to walk into a wall', () => {
    const game = makeGame(['###', '#@#', '###']);
    expect(step(game, 1, 0)).toBe(false);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
  });

  it('ignores input while a step is still in flight', () => {
    const game = makeGame(['#####', '#@..#', '#####']);
    game.player.tryMove(1, 0);
    advance(game, FRAME); // one frame in: mid-tween
    game.player.tryMove(1, 0);
    advance(game, 0.2);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
  });

  it('stops accepting input once the level is won', () => {
    const game = makeGame(['####', '#@*#', '####']);
    step(game, 1, 0);
    expect(game.inventory.won).toBe(true);
    expect(step(game, -1, 0)).toBe(false);
  });

  it('stops accepting input once dead', () => {
    const game = makeGame(['####', '#@.#', '####']);
    game.inventory.setDead(true);
    expect(step(game, 1, 0)).toBe(false);
  });

  it('reports the step it took', () => {
    const game = makeGame(['####', '#@.#', '####']);
    const onStep = vi.fn();
    game.player.onStep = onStep;
    step(game, 1, 0);
    expect(onStep).toHaveBeenCalledWith({ gx: 1, gz: 1 }, { gx: 2, gz: 1 });
  });

  it('announces the first move only once', () => {
    const game = makeGame(['#####', '#@..#', '#####']);
    const onFirstMove = vi.fn();
    game.player.onFirstMove = onFirstMove;
    step(game, 1, 0);
    step(game, 1, 0);
    expect(onFirstMove).toHaveBeenCalledTimes(1);
  });

  it('collects a pickup on arrival, not on departure', () => {
    const game = makeGame(['####', '#@g#', '####']);
    game.player.tryMove(1, 0);
    // The move is committed but the tween has not finished, so nothing has
    // happened on the destination tile yet.
    expect(game.inventory.keyCount('gold')).toBe(0);
    advance(game, 0.2);
    expect(game.inventory.keyCount('gold')).toBe(1);
  });

  it('returns to spawn with nothing carried on reset', () => {
    const game = makeGame(['#####', '#@gO#', '#####']);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(game.inventory.hasTube).toBe(true);

    game.tilemap.reset();
    game.inventory.reset();
    game.player.reset();

    expect(at(game)).toEqual({ gx: 1, gz: 1 });
    expect(game.inventory.hasTube).toBe(false);
    expect(game.tilemap.get(2, 1).taken).toBe(false);
  });
});

describe('holding a direction', () => {
  const CORRIDOR = ['##########', '#@.......#', '##########'];
  const ROOM = ['#####', '#...#', '#@..#', '#...#', '#####'];

  it('walks on tile after tile for as long as it is held', () => {
    const game = makeGame(CORRIDOR);
    game.player.press(1, 0);
    advance(game, 0.5);
    expect(game.player.gx).toBeGreaterThan(3);
  });

  it('never comes to rest between tiles, so there is no hitch', () => {
    const game = makeGame(CORRIDOR);
    game.player.press(1, 0);
    // Seven tiles at 0.14s each is a shade under a second of frames.
    for (let frame = 0; frame < 70; frame++) {
      advance(game, FRAME);
      if (game.player.gx === 8) break; // the far end of the corridor
      expect(game.player.isMoving).toBe(true);
    }
    expect(game.player.gx).toBe(8);
  });

  it('walks exactly one tile if the direction is let go straight away', () => {
    const game = makeGame(CORRIDOR);
    game.player.press(1, 0);
    game.player.release(1, 0);
    advance(game, 0.5);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
  });

  it('stops after the tile in flight when the direction is let go', () => {
    const game = makeGame(CORRIDOR);
    game.player.press(1, 0);
    advance(game, 0.2); // one tile down, the second under way
    game.player.release(1, 0);
    advance(game, 0.5);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('gives the newest direction the next tile, then hands back the one still held', () => {
    const game = makeGame(ROOM);
    game.player.press(1, 0);
    game.player.press(0, -1); // too late for the tile in flight; wins the next
    advance(game, 0.15);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });

    game.player.release(0, -1);
    advance(game, 0.15);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('drops every direction on releaseAll, for a window that loses focus', () => {
    const game = makeGame(CORRIDOR);
    game.player.press(1, 0);
    game.player.releaseAll();
    advance(game, 0.5);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
  });

  it('holds still against a wall rather than spinning on the spot', () => {
    const game = makeGame(['###', '#@#', '###']);
    game.player.press(1, 0);
    advance(game, 0.5);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
    expect(game.player.isMoving).toBe(false);
  });

  it('keeps a footstep per tile rather than one per hold', () => {
    const game = makeGame(CORRIDOR);
    const onStep = vi.fn();
    game.player.onStep = onStep;
    game.player.press(1, 0);
    advance(game, 3 * 0.14);
    expect(onStep).toHaveBeenCalledTimes(3);
  });

  it('forgets what was held on reset', () => {
    const game = makeGame(CORRIDOR);
    game.player.press(1, 0);
    advance(game, 0.2);
    game.player.reset();
    advance(game, 0.5);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
  });
});

describe('facing', () => {
  const ROOM = ['#####', '#...#', '#.@.#', '#...#', '#####'];

  /** Where the body is pointing, normalised to (-PI, PI]. */
  const facing = (game) => Math.atan2(
    Math.sin(game.player.body.rotation.y),
    Math.cos(game.player.body.rotation.y),
  );

  /** How far apart two headings are, the short way round. */
  const apart = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  it('spawns facing the camera', () => {
    expect(makeGame(ROOM).player.body.rotation.y).toBe(0);
  });

  it('turns to face each direction of travel', () => {
    /** @type {[import('../src/types.js').Direction, number][]} */
    const cases = [
      [[1, 0], Math.PI / 2], // east
      [[-1, 0], -Math.PI / 2], // west
      [[0, 1], 0], // south, towards the camera
      [[0, -1], Math.PI], // north, away from the camera
    ];
    for (const [[dx, dz], expected] of cases) {
      const game = makeGame(ROOM);
      step(game, dx, dz);
      expect(apart(facing(game), expected)).toBeLessThan(0.1);
    }
  });

  it('completes a full reversal within a single step', () => {
    const game = makeGame(['######', '#.@..#', '######']);
    step(game, 1, 0);
    step(game, -1, 0);
    expect(apart(facing(game), -Math.PI / 2)).toBeLessThan(0.1);
  });

  it('turns the short way round rather than the long way', () => {
    // North (PI) to east (PI/2) is a quarter turn; going the other way would
    // sweep three quarters of a circle and read as a spin.
    const game = makeGame(ROOM);
    step(game, 0, -1);
    const before = game.player._facing;
    game.player.tryMove(1, 0);
    advance(game, FRAME);
    expect(game.player._facing).toBeLessThan(before);
  });
});

describe('the walk cycle', () => {
  it('swings the legs while walking and closes them when stopped', () => {
    const game = makeGame(['######', '#@...#', '######']);
    const { legL, legR } = game.player.parts;

    game.player.tryMove(1, 0);
    advance(game, 0.07); // mid-step
    expect(Math.abs(legL.rotation.x)).toBeGreaterThan(0.1);
    expect(legR.rotation.x).toBeCloseTo(-legL.rotation.x);

    advance(game, 0.6); // stand still for a while
    expect(Math.abs(legL.rotation.x)).toBeLessThan(0.01);
  });

  it('swings the arms opposite the legs', () => {
    const game = makeGame(['######', '#@...#', '######']);
    const { legL, armL } = game.player.parts;
    game.player.tryMove(1, 0);
    advance(game, 0.07);
    expect(Math.sign(armL.rotation.x)).toBe(-Math.sign(legL.rotation.x));
  });

  it('carries the gait on across consecutive steps, alternating legs', () => {
    const game = makeGame(['######', '#@...#', '######']);
    const { legL } = game.player.parts;

    game.player.tryMove(1, 0);
    advance(game, 0.07);
    const first = Math.sign(legL.rotation.x);

    advance(game, 0.1); // finish the step
    game.player.tryMove(1, 0);
    advance(game, 0.07);
    expect(Math.sign(legL.rotation.x)).toBe(-first);
  });
});

describe('wading', () => {
  const LEVEL = ['#####', '#@O~#', '#####'];

  /** Walks onto the tube tile, then into the water beside it. */
  function intoTheWater() {
    const game = makeGame(LEVEL);
    step(game, 1, 0);
    step(game, 1, 0);
    return game;
  }

  it('stands lower in the water than on dry land', () => {
    const game = makeGame(LEVEL);
    const dry = game.player.mesh.position.y;
    step(game, 1, 0);
    step(game, 1, 0);
    expect(game.player.mesh.position.y).toBeCloseTo(dry - WATER_SINK);
  });

  it('rises back up on stepping out', () => {
    const game = intoTheWater();
    const sunk = game.player.mesh.position.y;
    step(game, -1, 0);
    expect(game.player.mesh.position.y).toBeCloseTo(sunk + WATER_SINK);
  });

  it('descends gradually rather than dropping on arrival', () => {
    const game = makeGame(LEVEL);
    step(game, 1, 0); // onto the tube
    const dry = game.player.mesh.position.y;

    game.player.tryMove(1, 0);
    advance(game, 0.07); // half way through the step
    const y = game.player.mesh.position.y;

    expect(y).toBeLessThan(dry);
    expect(y).toBeGreaterThan(dry - WATER_SINK);
  });

  it('damps the hop while wading, so it reads as a wade', () => {
    const game = intoTheWater();
    expect(game.player._hopScale).toBeLessThan(1);
    step(game, -1, 0); // out of the water: still a wade
    expect(game.player._hopScale).toBeLessThan(1);
    step(game, -1, 0); // dry land to dry land
    expect(game.player._hopScale).toBe(1);
  });

  it('does not let the hop drift the resting height over many steps', () => {
    // Both ends of the tween come from the grid, so a hop in progress can never
    // be baked into the start of the next step.
    const game = makeGame(['######', '#@...#', '######']);
    const resting = game.player.mesh.position.y;
    for (let i = 0; i < 3; i++) step(game, 1, 0);
    expect(game.player.mesh.position.y).toBeCloseTo(resting);
  });
});

/**
 * A step that cannot be taken is still a thing the player asked for, and a level
 * that answers it with nothing at all feels broken rather than solid. So the
 * intention shows: the body turns, takes a stride on the spot, and is heard hitting
 * whatever it is. What must *not* change is where the player is.
 */
describe('bumping into what will not move', () => {
  const CELL = ['###', '#@#', '###'];

  it('sounds the bump when a step is refused', () => {
    const game = makeGame(CELL);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    game.player.tryMove(1, 0);
    expect(onBump).toHaveBeenCalledTimes(1);
  });

  it('still goes nowhere', () => {
    const game = makeGame(CELL);
    const { x, z } = game.player.mesh.position;

    expect(step(game, 1, 0)).toBe(false);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });

    game.player.tryMove(1, 0);
    advance(game, 0.12); // mid-shove, which is when a stray tween would show
    expect(game.player.mesh.position.x).toBeCloseTo(x);
    expect(game.player.mesh.position.z).toBeCloseTo(z);
  });

  it('turns to face the thing in the way', () => {
    const game = makeGame(CELL);
    game.player.tryMove(1, 0); // east, into the wall
    advance(game, 0.2);
    expect(game.player._facing).toBeCloseTo(Math.PI / 2, 1);
  });

  it('takes a stride on the spot, and closes the legs when it is done', () => {
    const game = makeGame(CELL);
    const { legL, legR } = game.player.parts;

    game.player.tryMove(1, 0);
    advance(game, 0.12); // half way through the shove
    expect(Math.abs(legL.rotation.x)).toBeGreaterThan(0.1);
    expect(legR.rotation.x).toBeCloseTo(-legL.rotation.x);

    advance(game, 0.5);
    expect(game.player.isBumping).toBe(false);
    expect(Math.abs(legL.rotation.x)).toBeLessThan(0.01);
  });

  it('is one shove, not one per frame', () => {
    const game = makeGame(CELL);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    game.player.press(1, 0);
    advance(game, 0.2); // a dozen frames, all inside the first shove
    expect(onBump).toHaveBeenCalledTimes(1);
  });

  it('shoves again, at a walking rhythm, while the direction is held', () => {
    const game = makeGame(CELL);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    game.player.press(1, 0);
    advance(game, 0.6);
    // Leaning on a wall for six tenths of a second is a few shoves, not forty.
    expect(onBump.mock.calls.length).toBeGreaterThan(1);
    expect(onBump.mock.calls.length).toBeLessThan(6);
  });

  it('says nothing when the step actually happens', () => {
    const game = makeGame(['####', '#@.#', '####']);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    step(game, 1, 0);
    expect(onBump).not.toHaveBeenCalled();
  });

  it('gives up the shove the moment there is somewhere to go', () => {
    // A held direction that was refused must not keep walking on the spot once the
    // way opens: pressing the switch retracts the columns, and the walk resumes.
    const game = makeGame(['#####', '#@X.#', '#1..#', '#####']);
    game.player.press(1, 0);
    advance(game, 0.2);
    expect(game.player.isBumping).toBe(true);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });

    game.tilemap.pressSwitch(game.tilemap.get(1, 2)); // the columns drop
    advance(game, 0.2);
    expect(game.player.isBumping).toBe(false);
    expect(game.player.gx).toBeGreaterThan(1);
  });

  it('is silent about a direction pressed mid-step', () => {
    // Being busy is not being blocked: the walk asks again when the tile lands.
    const game = makeGame(['#####', '#@..#', '#####']);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    game.player.tryMove(1, 0);
    advance(game, FRAME);
    game.player.tryMove(1, 0);
    expect(onBump).not.toHaveBeenCalled();
  });

  it('has nothing to say once the stage is over', () => {
    const game = makeGame(['####', '#@*#', '####']);
    step(game, 1, 0);
    expect(game.inventory.won).toBe(true);

    const onBump = vi.fn();
    game.player.onBump = onBump;
    game.player.tryMove(1, 0);
    expect(onBump).not.toHaveBeenCalled();
  });

  it('bumps against a locked door, which is an obstacle like any other', () => {
    const game = makeGame(['####', '#@G#', '####']);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    expect(step(game, 1, 0)).toBe(false);
    expect(onBump).toHaveBeenCalledTimes(1);
  });

  it('bumps against a crate with nowhere to be shoved', () => {
    const game = makeGame(['####', '#@B#', '####']);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    expect(step(game, 1, 0)).toBe(false);
    expect(onBump).toHaveBeenCalledTimes(1);
  });

  it('does not bump when the crate does move', () => {
    const game = makeGame(['#####', '#@B.#', '#####']);
    const onBump = vi.fn();
    game.player.onBump = onBump;
    expect(step(game, 1, 0)).toBe(true);
    expect(onBump).not.toHaveBeenCalled();
  });
});
