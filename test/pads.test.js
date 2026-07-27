import { describe, it, expect, vi } from 'vitest';
import { LEVEL_RISE } from '../src/tilemap.js';
import { makeMap, makeGame, advance, step, at, FRAME } from './helpers/level.js';

/**
 * Teleport pads: two tiles wearing the same colour, and one trip between them.
 *
 * The rule that makes a pair usable rather than a trap is that the pad you arrive on
 * will not send you back until you step off it — so a pair is a door you can go
 * through twice, not a loop with no way out.
 */

const padsOf = (map) => map.allTiles().filter((t) => t.type === 'pad');

describe('a pair of pads', () => {
  const LEVEL = ['#######', '#@.a#a#', '#######'];

  it('knows its other end', () => {
    const map = makeMap(LEVEL);
    const [first, second] = padsOf(map);
    expect(first.partner).toBe(second);
    expect(second.partner).toBe(first);
  });

  it('refuses to exist alone, or in a crowd', () => {
    expect(() => makeMap(['#####', '#@a.#', '#####'])).toThrow(/pads come in pairs/);
    expect(() => makeMap(['######', '#@aaa#', '######'])).toThrow(
      /appears 3 times.*pads come in pairs/,
    );
  });

  it('lets two different colours share a map without crossing', () => {
    const map = makeMap(['########', '#@a.b.##', '#a....b#', '########']);
    const [a1, b1, a2, b2] = padsOf(map);
    expect(a1.partner).toBe(a2);
    expect(b1.partner).toBe(b2);
  });

  it('moves the player the moment they arrive on one', () => {
    const game = makeGame(LEVEL);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });

    step(game, 1, 0); // onto the pad at 3,1
    expect(at(game)).toEqual({ gx: 5, gz: 1 });
    expect(game.player.tile.type).toBe('pad');
  });

  it('does not send them straight back again', () => {
    const game = makeGame(LEVEL);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 5, gz: 1 });

    // Sitting there for a while changes nothing: a pad is a step, not a current.
    advance(game, 1);
    expect(at(game)).toEqual({ gx: 5, gz: 1 });
  });

  it('works again once the player has stepped off and back on', () => {
    const game = makeGame(['#######', '#@.a.a#', '#######']);
    step(game, 1, 0);
    step(game, 1, 0); // onto 3,1, arriving at 5,1
    expect(at(game)).toEqual({ gx: 5, gz: 1 });

    step(game, -1, 0); // off the pad
    expect(at(game)).toEqual({ gx: 4, gz: 1 });

    step(game, 1, 0); // and back on: away again
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('tells the camera, so a warp is not a sweep across the level', () => {
    const game = makeGame(LEVEL);
    const onTeleport = vi.fn();
    game.player.onTeleport = onTeleport;

    step(game, 1, 0);
    step(game, 1, 0);
    expect(onTeleport).toHaveBeenCalledTimes(1);
  });

  it('announces both ends, so the sparks show where you went', () => {
    const game = makeGame(LEVEL);
    /** @type {string[]} */
    const seen = [];
    game.tilemap.onEvent = (name, detail) => {
      if (name === 'teleport') seen.push(`${detail.kind}:${detail.color}`);
    };
    step(game, 1, 0);
    step(game, 1, 0);
    expect(seen).toEqual(['pad:a', 'pad:a']);
  });

  it('puts the player down at the height of the far end', () => {
    //  the second pad sits on a deck, one level up
    const game = makeGame([
      ['#####', '#@a.#', '#...#', '#####'],
      ['     ', '     ', '  a  ', '     '],
    ]);
    const ground = game.player.mesh.position.y;

    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 2, gz: 2 });
    expect(game.player.layer).toBe(1);
    expect(game.player.mesh.position.y).toBeCloseTo(ground + LEVEL_RISE);
    expect(game.player.elevation).toBeCloseTo(LEVEL_RISE);
  });

  it('ends a slide rather than flinging the player on', () => {
    const game = makeGame(['########', '#@ia..a#', '########']);
    step(game, 1, 0); // onto the ice, sliding east into the pad at 3,1

    expect(at(game)).toEqual({ gx: 6, gz: 1 });
    expect(game.player.isSliding).toBe(false);
    expect(game.player.isMoving).toBe(false);
  });

  it('drops any claim to have come from somewhere, so nothing can catch it there', () => {
    const game = makeGame(['#######', '#@.a#a#', '#######']);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(game.player.prevGx).toBe(game.player.gx);
    expect(game.player.prevGz).toBe(game.player.gz);
  });

  it('is ordinary floor to a patrol, which has no use for it', () => {
    const map = makeMap(['#######', '#-a#a.#', '#######']);
    expect(map.isWalkable(2, 1)).toBe(true);
    expect(map.canPatrol(1, 1, 2, 1)).toBe(true);
  });

  it('cannot have a crate shoved onto it', () => {
    const game = makeGame(['#######', '#@Ba#a#', '#######']);
    expect(step(game, 1, 0)).toBe(false);
  });

  it('sends the player home again on a retry', () => {
    const game = makeGame(['#######', '#@.a#a#', '#######']);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 5, gz: 1 });

    game.player.reset();
    expect(at(game)).toEqual({ gx: 1, gz: 1 });

    // And the pad is armed again, rather than remembering that it just delivered.
    step(game, 1, 0);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 5, gz: 1 });
  });

  it('arrives at rest, so a held direction has to be asked for again', () => {
    const game = makeGame(['########', '#@.a#a.#', '########']);
    game.player.press(1, 0);
    advance(game, 0.5);

    // The warp interrupts the walk; the direction is still held, so the player walks
    // on from where they landed rather than being stuck.
    expect(game.player.gx).toBeGreaterThan(4);
    expect(game.player.tile.type).not.toBe('pad');
  });
});
