import { describe, it, expect } from 'vitest';
import { LOOKS, lookOf, variantOf } from '../src/looks.js';
import { tileDef } from '../src/tilemap.js';
import { makeMap, makeGame, step, at } from './helpers/level.js';

/**
 * Looks are the axis that appearance lives on, and the whole value of having it be a
 * separate axis is that nothing on the other one can see it. So these tests are mostly
 * about things *not* happening: a name not colliding, a rule not noticing, a tile that
 * looks different behaving identically.
 */

describe('look names', () => {
  it('never lets a look be mistaken for an elevation', () => {
    // `tileDef` checks LEGEND before it tries the `floor:(\d+)` regex, so a look named
    // "2" would generate `floor:2` and quietly shadow floor-two-levels-up on every map
    // in the game. A name that must begin with a letter cannot be a number.
    for (const name of Object.keys(LOOKS)) expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('keeps floor:N an elevation and floor:name an appearance', () => {
    expect(tileDef('floor:2')).toEqual({ type: 'floor', level: 2 });
    expect(tileDef('floor:stone')).toEqual({ type: 'floor', ground: 'stone' });
  });

  it('offers a tile name for every look that is not internal', () => {
    for (const [name, look] of Object.entries(LOOKS)) {
      if (look.internal) continue;
      const wanted = look.shape === 'slab' ? `floor:${name}` : `wall:${name}`;
      expect(tileDef(wanted)).toBeTruthy();
    }
  });

  it('offers no name for a look that would promise something it cannot keep', () => {
    // Being slippery is `type: 'ice'`. A `floor:ice` would look like a slide and hold
    // firm underfoot, which is the one thing this split exists to make impossible.
    expect(LOOKS.ice.internal).toBe(true);
    expect(tileDef('floor:ice')).toBe(null);
  });

  it('has no name for a look that does not exist', () => {
    expect(tileDef('wall:nope')).toBe(null);
    expect(lookOf('nope')).toBe(null);
  });
});

describe('a legend that names a look', () => {
  it('rejects a misspelt look, and says which field and which character', () => {
    expect(() =>
      makeMap(['###', '#X#', '###'], { legend: { X: { type: 'wall', look: 'rok' } } }),
    ).toThrow(/Legend binds "X" to look "rok", which is not a look/);
  });

  it('rejects a misspelt ground the same way', () => {
    expect(() =>
      makeMap(['###', '#.#', '###'], { legend: { '.': { type: 'floor', ground: 'stoen' } } }),
    ).toThrow(/Legend binds "\." to ground "stoen", which is not a look/);
  });

  it('rejects it even where the map never uses that character', () => {
    // Same reason the name check is eager: the moment to report a typo is when the
    // stage loads, not when a player finally walks into the corner that has one.
    expect(() =>
      makeMap(['###', '#@#', '###'], { legend: { Q: { type: 'wall', look: 'rok' } } }),
    ).toThrow(/is not a look/);
  });
});

describe('which tint a tile of a look wears', () => {
  /** @type {import('../src/looks.js').Look} */
  const twoWays = { color: 0x111111, shape: 'slab', variants: [0xaaaaaa, 0xbbbbbb] };

  it('alternates strictly by default, so a floor stays countable', () => {
    expect(variantOf(twoWays, 0, 0)).toBe(0xaaaaaa);
    expect(variantOf(twoWays, 1, 0)).toBe(0xbbbbbb);
    expect(variantOf(twoWays, 0, 1)).toBe(0xbbbbbb);
    expect(variantOf(twoWays, 1, 1)).toBe(0xaaaaaa);
  });

  it('scatters when asked, and gives the same answer every time', () => {
    /** @type {import('../src/looks.js').Look} */
    const rock = { ...twoWays, vary: 'scatter' };
    // Deterministic is the point: a stage reloaded looks the same, and a built test
    // asserting on a material does not pass and fail at random.
    const once = [...Array(8)].map((_, i) => variantOf(rock, i, 3));
    const twice = [...Array(8)].map((_, i) => variantOf(rock, i, 3));
    expect(once).toEqual(twice);
    expect(new Set(once).size).toBe(2);
  });

  it('answers with the one colour when there is nothing to vary', () => {
    expect(variantOf({ color: 0x123456, shape: 'slab' }, 4, 7)).toBe(0x123456);
  });

  it('gives a look with no variants the same colour everywhere', () => {
    /** @type {import('../src/looks.js').Look} */
    const plain = { color: 0x123456, shape: 'block' };
    expect(variantOf(plain, 0, 0)).toBe(variantOf(plain, 5, 9));
  });
});

describe('a level plays the same however it is dressed', () => {
  // The claim this whole separation makes, put to the only test that really settles
  // it: take one level, draw it two completely different ways, and play both.
  const ROWS = ['########', '#@.B.p.#', '########'];

  /** @type {import('../src/types.js').Legend} */
  const DRESSED = {
    '#': 'wall:rock',
    '.': 'floor:sand',
    B: { type: 'floor', block: true, ground: 'dirt' },
    p: { type: 'plate', color: 'red', ground: 'stone' },
  };

  const play = (legend) => {
    const game = makeGame(ROWS, { legend });
    const accepted = [1, 1, 1, 1, 1].map(() => step(game, 1, 0));
    return {
      accepted,
      player: at(game),
      crates: game.blocks.occupants().map((o) => [o.tile.gx, o.tile.gz]),
      held: game.tilemap._plates.map((t) => t.pressed),
    };
  };

  it('accepts the same moves, and ends with everything in the same place', () => {
    expect(play(DRESSED)).toEqual(play(undefined));
  });

  it('really did change how it is drawn', () => {
    // Otherwise the test above would pass on two identical maps and prove nothing.
    const plain = makeMap(ROWS, { build: true });
    const dressed = makeMap(ROWS, { build: true, legend: DRESSED });
    const wallMaterials = (map) => {
      const found = new Set();
      map.group.traverse((o) => {
        if (o.isMesh && o.name === 'wall') found.add(o.material.color.getHex());
      });
      return found;
    };
    expect([...wallMaterials(plain)]).not.toEqual([...wallMaterials(dressed)]);
  });
});
