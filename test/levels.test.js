import { describe, it, expect } from 'vitest';
import { TileMap, KEY_COLORS } from '../src/tilemap.js';
import { STAGES, stageLayers } from '../src/levels.js';
import { reachableFrom, sealedIn, tileKey, tilesOfType } from './helpers/reach.js';

/**
 * The checks every stage has to pass, run over the whole list. These are the
 * mistakes that are easy to make while authoring a map and impossible to see by
 * reading it: a star behind a wall, a door with no key anywhere, a switch that
 * seals you in, a door with no wall to fill.
 *
 * They are not a solver. A stage that passes these can still be a bad stage; a
 * stage that fails one cannot be finished at all.
 */

const parse = (stage) => new TileMap(stageLayers(stage), { build: false });

describe('the stage list', () => {
  it('has stages, each with a unique id', () => {
    expect(STAGES.length).toBeGreaterThan(0);
    const ids = STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every stage a name and a hint to show', () => {
    for (const stage of STAGES) {
      expect(stage.name, `${stage.id} needs a name`).toBeTruthy();
      expect(stage.hint, `${stage.id} needs a hint`).toBeTruthy();
    }
  });
});

for (const stage of STAGES) {
  describe(`stage: ${stage.name}`, () => {
    it('parses', () => {
      expect(() => parse(stage)).not.toThrow();
    });

    it('builds its meshes', () => {
      // The headless checks below never touch the mesh code, so this is what says
      // a stair, a chute or a raised floor can actually be put on the screen.
      expect(() => new TileMap(stageLayers(stage), { build: true })).not.toThrow();
    });

    it('has exactly one spawn', () => {
      expect(tilesOfType(parse(stage), 'spawn')).toHaveLength(1);
    });

    it('has a star to find', () => {
      expect(tilesOfType(parse(stage), 'star').length).toBeGreaterThan(0);
    });

    it('can be walked from the spawn to the star', () => {
      const map = parse(stage);
      const reachable = reachableFrom(map);
      for (const star of tilesOfType(map, 'star')) {
        expect(
          reachable.has(tileKey(star)),
          `the star at ${star.gx},${star.gz} is walled off from the spawn`,
        ).toBe(true);
      }
    });

    it('has a key somewhere for every door', () => {
      const map = parse(stage);
      for (const color of Object.keys(KEY_COLORS)) {
        const doors = tilesOfType(map, 'door').filter((t) => t.color === color);
        const keys = tilesOfType(map, 'key').filter((t) => t.color === color);
        expect(
          keys.length,
          `${doors.length} ${color} door(s) but ${keys.length} ${color} key(s)`,
        ).toBeGreaterThanOrEqual(doors.length);
      }
    });

    it('gives every door a wall to span', () => {
      const map = parse(stage);
      const solid = (gx, gz) => {
        const t = map.get(gx, gz);
        return !t || t.type === 'wall';
      };
      for (const door of tilesOfType(map, 'door')) {
        const acrossX = solid(door.gx - 1, door.gz) && solid(door.gx + 1, door.gz);
        const acrossZ = solid(door.gx, door.gz - 1) && solid(door.gx, door.gz + 1);
        expect(
          acrossX || acrossZ,
          `the door at ${door.gx},${door.gz} stands in the open`,
        ).toBe(true);
      }
    });

    it('has no switch that can seal the player in', () => {
      const map = parse(stage);
      for (const tile of tilesOfType(map, 'switch')) {
        expect(
          sealedIn(map, tile),
          `the ${tile.color} switch at ${tile.gx},${tile.gz} can be cut off from the spawn`,
        ).toEqual([]);
        map.reset();
      }
    });
  });
}
