import { describe, it, expect } from 'vitest';
import {
  waveAt,
  foamAt,
  Ripples,
  WaterSurface,
  SURFACE_DROP,
  WAVE_HEIGHT,
  RIPPLE_HEIGHT,
} from '../src/water.js';
import { makeMap } from './helpers/level.js';

/**
 * The water's surface is decoration, so what is worth holding it to is the shape
 * of the thing rather than any particular frame of it: that it moves, that it
 * stays inside its banks, and that a drop makes a ring which travels outwards and
 * dies.
 */

/** A grid of sample points over a pond-sized patch. */
function samples(step = 0.25, span = 3) {
  const points = [];
  for (let x = -span; x <= span; x += step) {
    for (let z = -span; z <= span; z += step) points.push([x, z]);
  }
  return points;
}

describe('the swell', () => {
  it('stays within the range the surface heights are scaled from', () => {
    for (const [x, z] of samples()) {
      for (const t of [0, 0.7, 3.4, 21]) {
        const height = waveAt(x, z, t);
        expect(height).toBeGreaterThanOrEqual(-1);
        expect(height).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is smooth, so neighbouring vertices never step apart', () => {
    // A tile is divided into eighths, and no two adjacent points may differ by
    // anything like the full height of the swell — that would be a crease.
    for (const [x, z] of samples()) {
      const step = Math.abs(waveAt(x + 0.125, z, 2) - waveAt(x, z, 2));
      expect(step).toBeLessThan(0.5);
    }
  });

  it('moves: the same point is at a different height a moment later', () => {
    expect(waveAt(0.5, -1.5, 0)).not.toBeCloseTo(waveAt(0.5, -1.5, 0.4), 3);
  });

  it('leaves no still points: every part of the water rises and falls', () => {
    // A standing wave has nodes — points that never move at all, which read as
    // pins holding the surface down. Given long enough, every point here has been
    // well up and well down.
    for (const [x, z] of samples(0.5)) {
      let high = -Infinity;
      let low = Infinity;
      for (let t = 0; t < 40; t += 0.05) {
        const height = waveAt(x, z, t);
        high = Math.max(high, height);
        low = Math.min(low, height);
      }
      expect(high - low).toBeGreaterThan(1);
    }
  });
});

describe('foam', () => {
  it('only forms on the crests, never in the troughs', () => {
    for (const [x, z] of samples(0.2)) {
      for (const t of [0, 1.3, 6.2]) {
        const foam = foamAt(x, z, t);
        expect(foam).toBeGreaterThanOrEqual(0);
        expect(foam).toBeLessThanOrEqual(1);
        if (waveAt(x, z, t) <= 0) expect(foam).toBe(0);
      }
    }
  });

  it('ebbs and flows, so two equal crests do not carry equal foam', () => {
    // Crests of much the same height, gathered from all over the water and all
    // through a run. If foam were simply a function of the crest they would all
    // come out alike; the spread is the tide washing lines in and out.
    let quiet = 1;
    let peak = 0;
    for (const [x, z] of samples(0.17)) {
      for (let t = 0; t < 20; t += 0.11) {
        const crest = waveAt(x, z, t);
        if (crest < 0.75 || crest > 0.8) continue;
        const foam = foamAt(x, z, t);
        quiet = Math.min(quiet, foam);
        peak = Math.max(peak, foam);
      }
    }
    expect(quiet).toBeLessThan(0.35);
    expect(peak).toBeGreaterThan(0.7);
  });

  it('covers a part of the water, not all of it and not none of it', () => {
    const points = samples(0.1);
    const covered = points.filter(([x, z]) => foamAt(x, z, 3.2) > 0.2).length;
    const share = covered / points.length;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.35);
  });
});

describe('ripples', () => {
  it('drops one in every few seconds, at a place it is given', () => {
    const ripples = new Ripples({ random: () => 0.5 }); // the middle gap, 1.75s
    const places = [];
    for (let frame = 0; frame < 600; frame++) {
      ripples.update(1 / 60, () => {
        places.push('drop');
        return { x: 0, z: 0 };
      });
    }
    expect(places.length).toBe(5); // ten seconds at one every 1.75
  });

  it('does not drop one where there is nowhere to drop it', () => {
    const ripples = new Ripples({ random: () => 0.5 });
    for (let frame = 0; frame < 600; frame++) ripples.update(1 / 60, () => null);
    expect(ripples.list).toEqual([]);
  });

  it('lifts the water at the point of impact, and nowhere else yet', () => {
    const ripples = new Ripples({ random: () => 0 });
    ripples.spawn(0, 0);
    expect(ripples.liftAt(0, 0)).toBeCloseTo(1, 5);
    expect(ripples.liftAt(1.2, 0)).toBe(0);
  });

  it('sends the ring outwards and fades it as it goes', () => {
    const ripples = new Ripples({ random: () => 0 });
    ripples.spawn(0, 0);

    /** Where the crest is, and how tall, at a given age. */
    const crest = (age) => {
      ripples.list[0].age = age;
      let best = { at: 0, lift: -Infinity };
      for (let d = 0; d < 3; d += 0.01) {
        const lift = ripples.liftAt(d, 0);
        if (lift > best.lift) best = { at: d, lift };
      }
      return best;
    };

    const early = crest(0.3);
    const later = crest(1.2);
    expect(later.at).toBeGreaterThan(early.at);
    expect(later.lift).toBeLessThan(early.lift);
    expect(later.lift).toBeGreaterThan(0);
  });

  it('leaves the water flat once the ring has run its course', () => {
    const ripples = new Ripples({ random: () => 0 });
    ripples.spawn(0, 0);
    for (let frame = 0; frame < 180; frame++) ripples.update(1 / 60, () => null);

    expect(ripples.list).toEqual([]);
    for (let d = 0; d < 4; d += 0.1) expect(ripples.liftAt(d, 0)).toBe(0);
  });

  it('keeps only the newest few, so a long game cannot pile them up', () => {
    const ripples = new Ripples({ random: () => 0, capacity: 3 });
    for (let n = 0; n < 10; n++) ripples.spawn(n, 0);

    expect(ripples.list.length).toBe(3);
    expect(ripples.list.map((r) => r.x)).toEqual([7, 8, 9]);
  });

  it('is cleared by a reset, so a retry starts on still water', () => {
    const ripples = new Ripples({ random: () => 0 });
    ripples.spawn(0, 0);
    ripples.reset();
    expect(ripples.liftAt(0, 0)).toBe(0);
  });
});

describe('the water surface', () => {
  /** Two tiles of water side by side, as the map builder hands them over. */
  const pair = [
    { gx: 0, gz: 0, x: 0, y: 0, z: 0 },
    { gx: 1, gz: 0, x: 1, y: 0, z: 0 },
  ];

  /** @param {{position: {count: number, array: ArrayLike<number>}}} sheet */
  const heights = (sheet) =>
    [...Array(sheet.position.count)].map((_, v) => sheet.position.array[v * 3 + 1]);

  it('joins neighbouring tiles into one sheet, sharing the vertices between them', () => {
    const surface = new WaterSurface(pair, { segments: 2 });
    expect(surface._sheets.length).toBe(1);
    // Two tiles two segments across: 5 lattice points along x, 3 along z. Built
    // tile by tile without sharing it would be 18.
    expect(surface._sheets[0].position.count).toBe(15);
  });

  it('gives water at another height a sheet of its own', () => {
    const surface = new WaterSurface(
      [...pair, { gx: 4, gz: 0, x: 4, y: 1, z: 0 }],
      { segments: 2 },
    );
    expect(surface._sheets.length).toBe(2);
    expect(surface._sheets.map((s) => s.base).sort()).toEqual([-SURFACE_DROP, 1 - SURFACE_DROP]);
  });

  it('starts still, and is moving by the next frame', () => {
    const surface = new WaterSurface(pair, { segments: 4, random: () => 0.5 });
    const before = heights(surface._sheets[0]);
    surface.update(1 / 60);
    const after = heights(surface._sheets[0]);

    expect(after).not.toEqual(before);
    expect(new Set(after).size).toBeGreaterThan(1); // peaks and troughs, not a slab
  });

  it('never laps over the bank it is set into', () => {
    const surface = new WaterSurface(pair, { segments: 4, random: () => 0.5 });
    const ceiling = pair[0].y;
    const floor = pair[0].y - SURFACE_DROP - WAVE_HEIGHT - RIPPLE_HEIGHT;

    for (let frame = 0; frame < 600; frame++) {
      surface.update(1 / 60);
      for (const y of heights(surface._sheets[0])) {
        expect(y).toBeLessThanOrEqual(ceiling);
        expect(y).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('shows a drop landing as a bump in the surface under it', () => {
    const surface = new WaterSurface(pair, { segments: 8, random: () => 0.5 });
    surface.update(1 / 60);
    const calm = heights(surface._sheets[0]);

    surface._ripples.spawn(pair[0].x, pair[0].z);
    surface.update(0);
    const struck = heights(surface._sheets[0]);

    const moved = struck.filter((y, i) => Math.abs(y - calm[i]) > 1e-4);
    expect(moved.length).toBeGreaterThan(0);
    expect(Math.max(...struck)).toBeGreaterThan(Math.max(...calm));
  });

  it('colours the water, so nothing is ever drawn as a black hole', () => {
    const surface = new WaterSurface(pair, { segments: 2, random: () => 0.5 });
    const colors = surface._sheets[0].color.array;
    let lit = 0;
    for (let i = 0; i < colors.length; i += 3) if (colors[i + 2] > 0.05) lit++;
    expect(lit).toBe(surface._sheets[0].color.count); // every vertex, blue
  });
});

describe('a built map', () => {
  it('grows a surface over its water, and none where there is none', () => {
    const pond = makeMap(['#####', '#@~~#', '#####'], { build: true });
    expect(pond._water).not.toBeNull();
    expect(pond._water.tiles.length).toBe(2);

    const dry = makeMap(['#####', '#@..#', '#####'], { build: true });
    expect(dry._water).toBeNull();
  });

  it('moves the water when the map is ticked', () => {
    const pond = makeMap(['#####', '#@~~#', '#####'], { build: true });
    const sheet = pond._water._sheets[0];
    const before = [...sheet.position.array];
    pond.update(0.2);
    expect([...sheet.position.array]).not.toEqual(before);
  });

  it('builds nothing at all when the map is headless', () => {
    const pond = makeMap(['#####', '#@~~#', '#####']);
    expect(pond._water).toBeNull();
    pond.update(0.2); // and ticking one is still fine
  });
});
