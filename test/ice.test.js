import { describe, it, expect, vi } from 'vitest';
import { makeMap, makeGame, advance, step, at } from './helpers/level.js';
import { Inventory } from '../src/inventory.js';
import { IceShimmer, sheenAt, glintAt, SHEEN_SPACING, SHEEN_SPEED } from '../src/ice.js';

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

/**
 * The shine on the ice: a band of light sweeping across it, and glints twinkling
 * on it. All decoration — none of it touches sliding — so what these hold it to is
 * that it moves, that it stays light rather than shadow, and that it is on the ice
 * and nowhere else.
 */

describe('the sheen', () => {
  it('is a band: brightest along its middle, dark between passes', () => {
    expect(sheenAt(0, 0, 0)).toBeCloseTo(1, 5);

    // Out along the way the band travels, as far as halfway to the next one.
    // Beyond that the sweep repeats and the light comes back up, which is the
    // point of the last line here.
    const out = (units) => sheenAt(units / Math.SQRT2, units / Math.SQRT2, 0);
    let last = 1;
    for (let units = 0.4; units <= SHEEN_SPACING / 2; units += 0.4) {
      expect(out(units)).toBeLessThan(last);
      last = out(units);
    }
    expect(last).toBeLessThan(0.01);
    expect(out(SHEEN_SPACING)).toBeCloseTo(1, 5);
  });

  it('only ever adds light, and never more than full', () => {
    for (let x = -8; x < 8; x += 0.3) {
      for (const t of [0, 1.1, 5.4]) {
        expect(sheenAt(x, x / 2, t)).toBeGreaterThanOrEqual(0);
        expect(sheenAt(x, x / 2, t)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('sweeps across the ice, and comes round again', () => {
    /** Where the band is brightest along a line, at a given moment. */
    const band = (t) => {
      let best = { at: 0, light: -1 };
      for (let x = -1; x < SHEEN_SPACING * Math.SQRT2 - 1; x += 0.01) {
        const light = sheenAt(x, 0, t);
        if (light > best.light) best = { at: x, light };
      }
      return best.at;
    };

    expect(band(0.5)).toBeGreaterThan(band(0) + 0.5);
    expect(band(1)).toBeGreaterThan(band(0.5) + 0.5);
    // A full pass later it is back where it started, so the sweep repeats
    // without ever jumping.
    expect(band(SHEEN_SPACING / SHEEN_SPEED)).toBeCloseTo(band(0), 1);
  });

  it('leaves a tile dark for most of the time between passes', () => {
    let lit = 0;
    let frames = 0;
    for (let t = 0; t < 20; t += 0.01) {
      frames++;
      if (sheenAt(0, 0, t) > 0.5) lit++;
    }
    expect(lit / frames).toBeLessThan(0.3);
  });
});

describe('glints', () => {
  it('spark rather than pulse: dark most of the time, briefly full', () => {
    let bright = 0;
    let frames = 0;
    let peak = 0;
    for (let t = 0; t < 20; t += 0.01) {
      const light = glintAt(t, 0.3);
      expect(light).toBeGreaterThanOrEqual(0);
      expect(light).toBeLessThanOrEqual(1);
      peak = Math.max(peak, light);
      frames++;
      if (light > 0.25) bright++;
    }
    expect(peak).toBeGreaterThan(0.95);
    expect(bright / frames).toBeLessThan(0.3);
  });

  it('gives each one its own clock, so they do not blink together', () => {
    /** When this glint is at its brightest, within the first few seconds. */
    const peaksAt = (phase) => {
      let best = { t: 0, light: -1 };
      for (let t = 0; t < 4; t += 0.01) {
        const light = glintAt(t, phase);
        if (light > best.light) best = { t, light };
      }
      return best.t;
    };

    expect(Math.abs(peaksAt(0) - peaksAt(1.7))).toBeGreaterThan(0.5);
  });
});

describe('the shimmer over a map', () => {
  /** Deterministic, so where the glints land does not vary between runs. */
  const seeded = (seed = 1) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it('covers the ice and nothing else', () => {
    const rink = makeMap(['#####', '#@ii#', '#####'], { build: true });
    expect(rink._ice).not.toBeNull();

    const bare = makeMap(['#####', '#@..#', '#####'], { build: true });
    expect(bare._ice).toBeNull();
  });

  it('puts its glints on the ice tiles it was given', () => {
    const tiles = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    const shimmer = new IceShimmer(tiles, { random: seeded() });

    for (const glint of shimmer._glints.list) {
      const home = tiles.find((tile) => Math.abs(glint.x - tile.x) <= 0.5);
      expect(home).toBeDefined();
      expect(Math.abs(glint.z - home.z)).toBeLessThanOrEqual(0.5);
    }
  });

  it('lights up as the band arrives and goes dark again after it', () => {
    const shimmer = new IceShimmer([{ x: 0, y: 0, z: 0 }], { random: seeded() });

    /** The brightest the tile gets at a moment, from a standing start. */
    const brightest = (t) => {
      shimmer._elapsed = 0;
      shimmer.update(t);
      return Math.max(...shimmer._sheen.color.array);
    };

    expect(brightest(0)).toBeGreaterThan(0.1); // the band is on it at the start
    expect(brightest(SHEEN_SPACING / SHEEN_SPEED / 2)).toBeLessThan(0.01);
    expect(brightest(SHEEN_SPACING / SHEEN_SPEED)).toBeGreaterThan(0.1);
  });

  it('only ever adds light, never subtracts it', () => {
    const shimmer = new IceShimmer([{ x: 0, y: 0, z: 0 }], { random: seeded() });
    for (let frame = 0; frame < 300; frame++) {
      shimmer.update(1 / 60);
      for (const value of shimmer._sheen.color.array) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      for (const value of shimmer._glints.color.array) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('lights a glint from its centre, so the star fades out along its arms', () => {
    const shimmer = new IceShimmer([{ x: 0, y: 0, z: 0 }], { random: seeded() });

    // Run until one of them is at its brightest.
    let peak = 0;
    for (let frame = 0; frame < 600; frame++) {
      shimmer.update(1 / 60);
      peak = Math.max(peak, Math.max(...shimmer._glints.color.array));
    }
    expect(peak).toBeGreaterThan(0.3);

    for (const glint of shimmer._glints.list) {
      const colors = shimmer._glints.color.array;
      for (let arm = 1; arm <= 8; arm++) {
        expect(colors[(glint.first + arm) * 3]).toBe(0);
      }
    }
  });

  it('shimmers when the map is ticked, and not at all when it is headless', () => {
    const rink = makeMap(['#####', '#@ii#', '#####'], { build: true });
    const before = [...rink._ice._sheen.color.array];
    rink.update(0.4);
    expect([...rink._ice._sheen.color.array]).not.toEqual(before);

    const headless = makeMap(['#####', '#@ii#', '#####']);
    expect(headless._ice).toBeNull();
    headless.update(0.4);
  });
});
