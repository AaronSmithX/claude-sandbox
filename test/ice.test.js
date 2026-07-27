import { describe, it, expect, vi } from 'vitest';
import { makeMap, makeGame, advance, step, at } from './helpers/level.js';
import { Inventory } from '../src/inventory.js';

/**
 * `step()` runs frames until the player is at rest, so it carries a slide all the
 * way to its end — which is what makes these read as one move, the way they play.
 */

describe('ice tiles', () => {
  it('does not block, and enemies cross it like any floor', () => {
    const map = makeMap(['####', '#@i#', '####']);
    expect(map.canEnter(2, 1, new Inventory())).toBe(true);
    expect(map.isWalkable(2, 1)).toBe(true);
  });

  it('is only ice that is slippery', () => {
    const map = makeMap(['#####', '#@i.#', '#####']);
    expect(map.isSlippery(2, 1)).toBe(true);
    expect(map.isSlippery(3, 1)).toBe(false);
    expect(map.isSlippery(99, 99)).toBe(false);
  });
});

describe('sliding', () => {
  it('carries the player across the ice and onto the first tile beyond it', () => {
    const game = makeGame(['########', '#@iii..#', '########']);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 5, gz: 1 }); // past 2,3,4 — the first floor tile
    expect(game.player.isSliding).toBe(false);
  });

  it('keeps the direction it was entered with, not the one that follows', () => {
    const game = makeGame([
      '#####',
      '#@..#',
      '#i..#',
      '#i..#',
      '#...#',
      '#####',
    ]);
    step(game, 0, 1); // south onto the ice
    expect(at(game)).toEqual({ gx: 1, gz: 4 });
  });

  it('stops on the last ice tile when a wall is in the way', () => {
    const game = makeGame(['#####', '#@ii#', '#####']);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('stops against a raised column', () => {
    const game = makeGame(['######', '#@iiX#', '######']);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('stops before water when there is no tube', () => {
    const game = makeGame(['######', '#@ii~#', '######']);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('slides onto water when the tube is carried, and stops there', () => {
    const game = makeGame(['#######', '#@Oii~#', '#######']);
    step(game, 1, 0); // take the tube
    step(game, 1, 0); // onto the ice, and away
    expect(at(game)).toEqual({ gx: 5, gz: 1 });
    expect(game.tilemap.get(5, 1).type).toBe('water');
  });

  it('does not slide at all when the ice is a single tile in a dead end', () => {
    const game = makeGame(['####', '#@i#', '####']);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
    expect(game.player.isSliding).toBe(false);
  });
});

describe('control while sliding', () => {
  it('ignores input until the slide has finished', () => {
    const game = makeGame([
      '######',
      '#@iii#',
      '#....#',
      '######',
    ]);
    game.player.tryMove(1, 0);
    advance(game, 0.2); // on the ice and moving by now
    expect(game.player.isSliding).toBe(true);

    game.player.tryMove(0, 1); // try to duck south, mid-slide
    advance(game, 1);

    expect(at(game)).toEqual({ gx: 4, gz: 1 }); // rode it to the wall
    expect(game.player.isSliding).toBe(false);
  });

  it('takes control again once stopped', () => {
    const game = makeGame(['######', '#@iii#', '#....#', '######']);
    step(game, 1, 0);
    expect(step(game, 0, 1)).toBe(true);
    expect(at(game)).toEqual({ gx: 4, gz: 2 });
  });

  it('reports one step for the whole slide, not one per tile', () => {
    const game = makeGame(['######', '#@iii#', '######']);
    const onStep = vi.fn();
    game.player.onStep = onStep;
    step(game, 1, 0);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it('announces the slide once, when it starts', () => {
    const game = makeGame(['######', '#@iii#', '######']);
    const onSlideStart = vi.fn();
    game.player.onSlideStart = onSlideStart;
    step(game, 1, 0);
    expect(onSlideStart).toHaveBeenCalledTimes(1);
  });

  it('does not glide on the spot: the walk cycle stops during a slide', () => {
    const game = makeGame(['######', '#@iii#', '######']);
    game.player.tryMove(1, 0);
    advance(game, 0.25);
    expect(game.player.isSliding).toBe(true);
    expect(Math.abs(game.player.parts.legL.rotation.x)).toBeLessThan(0.2);
  });
});

/**
 * A tile is either ice or something else, so a slide never passes *over* a key or
 * a switch — it ends on the first tile that is not ice, and that tile does
 * whatever it would have done had you walked onto it.
 */
describe('what a slide does where it lands', () => {
  it('collects the pickup it comes to rest on', () => {
    const game = makeGame(['#######', '#@iig.#', '#######']);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 4, gz: 1 });
    expect(game.inventory.keyCount('gold')).toBe(1);
  });

  it('presses the switch it comes to rest on', () => {
    const game = makeGame(['#######', '#@ii1.#', '#Xx...#', '#######']);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 4, gz: 1 });
    expect(game.tilemap.isPressed(game.tilemap.get(4, 1))).toBe(true);
    expect(game.tilemap.isRaised(game.tilemap.get(1, 2))).toBe(false); // X dropped
  });

  it('wins if it carries the player onto the star', () => {
    const game = makeGame(['######', '#@ii*#', '######']);
    step(game, 1, 0);
    expect(game.inventory.won).toBe(true);
    expect(at(game)).toEqual({ gx: 4, gz: 1 });
  });

  it('stops at a shut door rather than spending a key for you', () => {
    const game = makeGame(['#######', '#@giG.#', '#######']);
    step(game, 1, 0); // onto the key
    step(game, 1, 0); // onto the ice: the slide must not open the door
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
    expect(game.inventory.keyCount('gold')).toBe(1);
    expect(game.tilemap.get(4, 1).open).toBeFalsy();

    // Walking into it deliberately still opens it.
    expect(step(game, 1, 0)).toBe(true);
    expect(game.tilemap.get(4, 1).open).toBe(true);
  });

  it('slides through a door that is already open', () => {
    const game = makeGame(['########', '#@giG.i#', '########']);
    step(game, 1, 0); // key
    step(game, 1, 0); // ice: stops at 3,1 against the shut door
    step(game, 1, 0); // open the door and step in
    expect(at(game)).toEqual({ gx: 4, gz: 1 });

    // 5,1 is floor and 6,1 is ice against the east wall.
    step(game, 1, 0);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 6, gz: 1 });
  });

  it('stops where it is if the player dies mid-slide', () => {
    const game = makeGame(['#######', '#@iiii#', '#######']);
    game.player.tryMove(1, 0);
    advance(game, 0.2);
    expect(game.player.isSliding).toBe(true);

    game.inventory.setDead(true);
    const where = at(game);
    advance(game, 1);

    // It may finish the tile it is on, but it must not set off again.
    expect(game.player.gx).toBeLessThanOrEqual(where.gx + 1);
    expect(game.player.isSliding).toBe(false);
  });

  it('forgets it was sliding after a reset', () => {
    const game = makeGame(['######', '#@iii#', '######']);
    game.player.tryMove(1, 0);
    advance(game, 0.2);
    expect(game.player.isSliding).toBe(true);

    game.player.reset();

    expect(game.player.isSliding).toBe(false);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
    expect(step(game, 0, 1)).toBe(false); // walled in below, but input is heard
  });
});
