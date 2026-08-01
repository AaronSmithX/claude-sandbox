import { describe, it, expect, vi } from 'vitest';
import { TileMap, tileDef, KEY_COLORS, SWITCH_COLORS, LEVEL_RISE } from '../src/tilemap.js';
import { GLYPHS } from '../src/glyphs.js';
import { BIG_MAP } from './helpers/stages.js';
import { Inventory } from '../src/inventory.js';
import { makeMap } from './helpers/level.js';
import { reachableFrom, sealedIn } from '../src/reach.js';
import { STAGES, stageLayers } from '../src/levels.js';

describe('TileMap parsing', () => {
  it('rejects a character the legend does not bind, and says where', () => {
    expect(() => makeMap(['###', '#?#', '###'])).toThrow(
      /Map character "\?" at 1,1 is not in the legend/,
    );
  });

  it('rejects a ragged row, rather than reading past its end', () => {
    expect(() => makeMap(['#####', '#@.#', '#####'])).toThrow(/expected 5/);
  });

  it('finds the spawn tile', () => {
    const map = makeMap(['#####', '#..@#', '#####']);
    expect(map.findSpawn()).toEqual({ gx: 3, gz: 1 });
  });

  it('collects enemy spawns in row-major order with their patterns', () => {
    const map = makeMap([
      '#####',
      '#|.-#',
      '#).(#',
      '#####',
    ]);
    expect(map.enemySpawns).toEqual([
      { gx: 1, gz: 1, pattern: 'vertical' },
      { gx: 3, gz: 1, pattern: 'horizontal' },
      { gx: 1, gz: 2, pattern: 'clockwise' },
      { gx: 3, gz: 2, pattern: 'counterclockwise' },
    ]);
  });

  it('treats an enemy spawn tile as ordinary floor', () => {
    const map = makeMap(['###', '#|#', '###']);
    expect(map.get(1, 1).type).toBe('floor');
  });

  it('returns null outside the grid', () => {
    const map = makeMap(['###', '#@#', '###']);
    expect(map.get(-1, 1)).toBeNull();
    expect(map.get(1, 99)).toBeNull();
  });

  it('centres the grid on the world origin', () => {
    const map = makeMap(['###', '#@#', '###']);
    const p = map.gridToWorld(1, 1);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);
  });

  it('parses a full-sized level without complaint', () => {
    // Every mechanic on one grid: a parser that copes with the little fixtures but
    // not with a real map's worth of them would otherwise pass. Whether the game's
    // own stages parse is asked of them directly, in levels.test.js.
    expect(() => new TileMap(BIG_MAP, { build: false })).not.toThrow();
  });
});

describe('the legend', () => {
  it('binds every character of the default dialect to a real tile', () => {
    // The dialect and the vocabulary live in different files and nothing else makes
    // them agree, so a name renamed on one side and not the other would otherwise go
    // unnoticed until a stage that happens to use it failed to load.
    for (const [char, name] of Object.entries(GLYPHS)) {
      expect(tileDef(name), `"${char}" is bound to "${name}", which is not a tile`)
        .not.toBeNull();
    }
  });

  it('gives every colour in a palette the tiles that can wear it', () => {
    // What the format promises: a colour is a line in a palette, and nothing else.
    for (const color of Object.keys(KEY_COLORS)) {
      expect(tileDef(`key:${color}`)).toEqual({ type: 'key', color });
      expect(tileDef(`door:${color}`)).toEqual({ type: 'door', color });
    }
    for (const color of Object.keys(SWITCH_COLORS)) {
      expect(tileDef(`switch:${color}`)).toEqual({ type: 'switch', color });
      expect(tileDef(`plate:${color}`)).toEqual({ type: 'plate', color });
      expect(tileDef(`gate:${color}`)).toEqual({ type: 'gate', color });
    }
  });

  it('reads a floor at any level, not just the two there were characters for', () => {
    const map = makeMap(['###', '#T#', '###'], { legend: { T: 'floor:7' } });
    expect(map.get(1, 1).type).toBe('floor');
    expect(map.get(1, 1).level).toBe(7);
  });

  it('lets a map bind a character the dialect has no use for', () => {
    const map = makeMap(['###', '#k#', '###'], { legend: { k: 'key:gold' } });
    expect(map.get(1, 1)).toMatchObject({ type: 'key', color: 'gold' });
  });

  it('takes a def written out in full, for a one-off with no name', () => {
    const map = makeMap(['###', '#T#', '###'], {
      legend: { T: { type: 'floor', enemy: 'clockwise' } },
    });
    expect(map.enemySpawns).toEqual([{ gx: 1, gz: 1, pattern: 'clockwise' }]);
  });

  it('lets a map override a character the dialect already binds', () => {
    const flooded = makeMap(['###', '#.#', '###'], { legend: { '.': 'water' } });
    expect(flooded.get(1, 1).type).toBe('water');
  });

  it('leaves the dialect alone for the next map', () => {
    // The merge has to be a copy: a stage that rebinds `.` must not flood every stage
    // loaded after it.
    makeMap(['###', '#.#', '###'], { legend: { '.': 'water' } });
    expect(makeMap(['###', '#.#', '###']).get(1, 1).type).toBe('floor');
  });

  it('rejects a binding to a tile that does not exist', () => {
    expect(() => makeMap(['###', '#k#', '###'], { legend: { k: 'key:rust' } })).toThrow(
      /Legend binds "k" to "key:rust", which is not a tile/,
    );
  });

  it('rejects a bad binding even where the map never uses it', () => {
    // A typo in a legend is a mistake whether or not this particular map trips over
    // it, and saying so at load beats saying so on the one stage that does.
    expect(() => makeMap(['###', '#@#', '###'], { legend: { k: 'key:rust' } })).toThrow(
      /is not a tile/,
    );
  });
});

describe('door facing', () => {
  it('spans a gap in a north-south wall', () => {
    // Walls above and below, so the passage runs east-west and the panel must
    // turn to fill the gap.
    const map = makeMap(['#####', '#.G.#', '#####']);
    expect(map._doorFacing(map.get(2, 1))).toBeCloseTo(Math.PI / 2);
  });

  it('spans a gap in an east-west wall', () => {
    const map = makeMap(['###', '#.#', '#G#', '#.#', '###']);
    expect(map._doorFacing(map.get(1, 2))).toBe(0);
  });

  it('turns every door in a full-sized level to the wall it spans', () => {
    const map = new TileMap(BIG_MAP, { build: false });
    const doors = map.tiles.flat().filter((t) => t.type === 'door');
    expect(doors).not.toHaveLength(0);
    for (const door of doors) {
      const facing = map._doorFacing(door);
      const acrossZ = facing !== 0;
      // Whichever way it turns, the two tiles it spans between must be solid.
      const [a, b] = acrossZ
        ? [map.get(door.gx, door.gz - 1), map.get(door.gx, door.gz + 1)]
        : [map.get(door.gx - 1, door.gz), map.get(door.gx + 1, door.gz)];
      expect([a?.type, b?.type]).toEqual(['wall', 'wall']);
    }
  });
});

describe('surfaceY', () => {
  const map = makeMap(['#####', '#@~G#', '#####']);

  it('sinks on water and nowhere else', () => {
    expect(map.surfaceY(2, 1)).toBeLessThan(0);
    expect(map.surfaceY(1, 1)).toBe(0);
    expect(map.surfaceY(3, 1)).toBe(0);
  });

  it('treats the void outside the map as level', () => {
    expect(map.surfaceY(-1, -1)).toBe(0);
  });
});

describe('canEnter', () => {
  const map = makeMap([
    '#######',
    '#@.~GX#',
    '#....x#',
    '#######',
  ]);
  const empty = new Inventory();
  const stocked = new Inventory();
  stocked.addKey('gold');
  stocked.setTube(true);

  it('blocks walls and anything off the map', () => {
    expect(map.canEnter(0, 1, stocked)).toBe(false);
    expect(map.canEnter(-1, 1, stocked)).toBe(false);
  });

  it('allows plain floor', () => {
    expect(map.canEnter(2, 1, empty)).toBe(true);
  });

  it('gates water on the tube', () => {
    expect(map.canEnter(3, 1, empty)).toBe(false);
    expect(map.canEnter(3, 1, stocked)).toBe(true);
  });

  it('gates a door on a key of its own colour', () => {
    const violetOnly = new Inventory();
    violetOnly.addKey('violet');
    expect(map.canEnter(4, 1, empty)).toBe(false);
    expect(map.canEnter(4, 1, violetOnly)).toBe(false);
    expect(map.canEnter(4, 1, stocked)).toBe(true);
  });

  it('blocks a raised obstacle and allows a retracted one', () => {
    // Group A starts raised, so X blocks and x does not.
    expect(map.canEnter(5, 1, stocked)).toBe(false);
    expect(map.canEnter(5, 2, stocked)).toBe(true);
  });
});

describe('isWalkable (what an enemy may cross)', () => {
  const map = makeMap(['#####', '#@~G#', '#..X#', '#####']);

  it('blocks walls and water', () => {
    expect(map.isWalkable(0, 1)).toBe(false);
    expect(map.isWalkable(2, 1)).toBe(false);
  });

  it('blocks a door even after it has been opened, so a patrol stays put', () => {
    const inv = new Inventory();
    inv.addKey('gold');
    map.openDoor(3, 1, inv);
    expect(map.get(3, 1).open).toBe(true);
    expect(map.isWalkable(3, 1)).toBe(false);
  });

  it('blocks a raised obstacle only while it is up', () => {
    const withSwitch = makeMap(['#####', '#@~G#', '#1.X#', '#####']);
    expect(withSwitch.isWalkable(3, 2)).toBe(false);
    withSwitch.pressSwitch(withSwitch.get(1, 2));
    expect(withSwitch.isWalkable(3, 2)).toBe(true);
  });
});

describe('the star', () => {
  /** The star's own mesh, out of holder -> spinner -> art. */
  function starArt() {
    const map = new TileMap(['###', '#*#', '###'], { build: true });
    return map.get(1, 1).spinner.children[0];
  }

  it('is a five-pointed star standing upright, not a gem', () => {
    const geometry = starArt().geometry;
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;

    // Ten rim points, each throwing a facet to the front ridge point and one to the
    // back: twenty triangles. A stock solid would be some other number entirely.
    expect(geometry.getAttribute('position').count).toBe(20 * 3);

    // It stands in the vertical plane: as tall as it is wide, and much thinner
    // through than either. A gem is the shape that is the same in all three.
    const height = max.y - min.y;
    const width = max.x - min.x;
    const depth = max.z - min.z;
    expect(height).toBeCloseTo(width, 1);
    expect(depth).toBeLessThan(height / 3);
  });

  it('points straight up, so it is never seen leaning', () => {
    const position = starArt().geometry.getAttribute('position');
    let top = { x: 0, y: -Infinity };
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > top.y) top = { x: position.getX(i), y: position.getY(i) };
    }
    // The highest point of the outline is a tip, and it is on the vertical axis.
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeGreaterThan(0.3);
  });
});

describe('retracted columns', () => {
  // Built with meshes, since where the stubs sit is the whole point.
  const built = (rows) => new TileMap(rows, { build: true });

  it('leaves a retracted column poking out of the floor', () => {
    const map = built(['#####', '#@1.#', '#x.X#', '#####']);
    const retracted = map.get(1, 2); // x, group B, starts down
    // Columns are 1.0 tall and centred on their group, so the top of the stub is
    // half a unit above the group's position. The floor's top is y = 0.
    const top = retracted.columns.position.y + 0.5;
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(0.15); // proud of the floor, not a trip hazard
  });

  it('keeps a raised column a full wall high', () => {
    const map = built(['#####', '#@1.#', '#x.X#', '#####']);
    const raised = map.get(3, 2); // X, group A, starts up
    expect(raised.columns.position.y + 0.5).toBeCloseTo(1);
  });

  it('still lets you walk onto the tile the stubs are on', () => {
    const map = built(['#####', '#@1.#', '#x.X#', '#####']);
    expect(map.canEnter(1, 2, new Inventory())).toBe(true);
  });
});

describe('openDoor', () => {
  const fresh = () => makeMap(['#####', '#@G.#', '#####']);

  it('spends exactly one key', () => {
    const map = fresh();
    const inv = new Inventory();
    inv.addKey('gold');
    inv.addKey('gold');
    expect(map.openDoor(2, 1, inv)).toBe(true);
    expect(inv.keyCount('gold')).toBe(1);
  });

  it('fails and spends nothing without a key', () => {
    const map = fresh();
    const inv = new Inventory();
    expect(map.openDoor(2, 1, inv)).toBe(false);
    expect(map.get(2, 1).open).toBeFalsy();
  });

  it('is a no-op on an already open door, so a second key is not wasted', () => {
    const map = fresh();
    const inv = new Inventory();
    inv.addKey('gold');
    inv.addKey('gold');
    map.openDoor(2, 1, inv);
    expect(map.openDoor(2, 1, inv)).toBe(false);
    expect(inv.keyCount('gold')).toBe(1);
  });

  it('ignores tiles that are not doors', () => {
    const map = fresh();
    expect(map.openDoor(3, 1, new Inventory())).toBe(false);
  });
});

describe('onEnter', () => {
  it('takes a key once', () => {
    const map = makeMap(['###', '#g#', '###']);
    const inv = new Inventory();
    map.onEnter(1, 1, inv);
    map.onEnter(1, 1, inv);
    expect(inv.keyCount('gold')).toBe(1);
    expect(map.get(1, 1).taken).toBe(true);
  });

  it('takes the tube once', () => {
    const map = makeMap(['###', '#O#', '###']);
    const inv = new Inventory();
    map.onEnter(1, 1, inv);
    expect(inv.hasTube).toBe(true);
  });

  it('wins on the star, and announces it exactly once', () => {
    const map = makeMap(['###', '#*#', '###']);
    const inv = new Inventory();
    const onWin = vi.fn();
    map.onWin = onWin;

    map.onEnter(1, 1, inv);
    map.onEnter(1, 1, inv);

    expect(inv.won).toBe(true);
    expect(onWin).toHaveBeenCalledTimes(1);
  });
});

describe('onEvent', () => {
  it('announces a pickup with what it was and where', () => {
    const map = makeMap(['###', '#g#', '###']);
    const onEvent = vi.fn();
    map.onEvent = onEvent;

    map.onEnter(1, 1, new Inventory());

    expect(onEvent).toHaveBeenCalledTimes(1);
    const [name, detail] = onEvent.mock.calls[0];
    expect(name).toBe('pickup');
    expect(detail.kind).toBe('key');
    expect(detail.color).toBe('gold');
    expect(detail.position).toMatchObject({ x: 0, z: 0 });
  });

  it('says nothing the second time a pickup is walked over', () => {
    const map = makeMap(['###', '#g#', '###']);
    const inv = new Inventory();
    map.onEnter(1, 1, inv);
    const onEvent = vi.fn();
    map.onEvent = onEvent;
    map.onEnter(1, 1, inv);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('announces doors and switches too', () => {
    const map = makeMap(['#####', '#@G1#', '#####']);
    const inv = new Inventory();
    inv.addKey('gold');
    const onEvent = vi.fn();
    map.onEvent = onEvent;

    map.openDoor(2, 1, inv);
    map.onEnter(3, 1, inv);

    expect(onEvent.mock.calls.map(([name]) => name)).toEqual(['door', 'switch']);
  });

  it('does not announce a door it failed to open', () => {
    const map = makeMap(['####', '#@G#', '####']);
    const onEvent = vi.fn();
    map.onEvent = onEvent;
    map.openDoor(2, 1, new Inventory());
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('switches', () => {
  const fresh = () => makeMap(['#####', '#1.2#', '#XxY#', '#####']);

  it('flips which group of its colour is raised', () => {
    const map = fresh();
    expect(map.isRaised(map.get(1, 2))).toBe(true); // X, red, group A
    expect(map.isRaised(map.get(2, 2))).toBe(false); // x, red, group B

    map.onEnter(1, 1, new Inventory()); // stand on the red switch

    expect(map.isRaised(map.get(1, 2))).toBe(false);
    expect(map.isRaised(map.get(2, 2))).toBe(true);
  });

  it('leaves other colours alone', () => {
    const map = fresh();
    map.onEnter(1, 1, new Inventory()); // red
    expect(map.isRaised(map.get(3, 2))).toBe(true); // Y, cyan, still group A
  });

  it('lets every other switch of the colour back up when one is pressed', () => {
    const map = makeMap(['#####', '#1.1#', '#Xx.#', '#####']);
    const first = map.get(1, 1);
    const second = map.get(3, 1);

    expect(map.pressSwitch(first)).toBe(true);
    expect(map.isPressed(first)).toBe(true);

    expect(map.pressSwitch(second)).toBe(true);
    expect(map.isPressed(first)).toBe(false);
    expect(map.isPressed(second)).toBe(true);
  });

  it('leaves switches of other colours down', () => {
    const map = makeMap(['######', '#1.2.#', '#Xx.Y#', '######']);
    const red = map.get(1, 1);
    const cyan = map.get(3, 1);

    map.pressSwitch(cyan);
    map.pressSwitch(red);

    expect(map.isPressed(cyan)).toBe(true);
    expect(map.isPressed(red)).toBe(true);
  });

  it('cannot press a switch that is already down', () => {
    const map = makeMap(['#####', '#1.1#', '#Xx.#', '#####']);
    const tile = map.get(1, 1);

    map.pressSwitch(tile);
    expect(map.pressSwitch(tile)).toBe(false);
    expect(map.isPressed(tile)).toBe(true);
  });

  it('does not let a second visit toggle the columns back', () => {
    const map = makeMap(['#####', '#1.1#', '#Xx.#', '#####']);
    const inv = new Inventory();

    map.onEnter(1, 1, inv);
    const afterFirst = map.isRaised(map.get(1, 2));
    map.onEnter(1, 1, inv); // stand on the same switch again

    expect(map.isRaised(map.get(1, 2))).toBe(afterFirst);
  });

  it('says nothing when a spent switch is stood on again', () => {
    const map = makeMap(['#####', '#1.1#', '#Xx.#', '#####']);
    const inv = new Inventory();
    map.onEnter(1, 1, inv);

    const onEvent = vi.fn();
    map.onEvent = onEvent;
    map.onEnter(1, 1, inv);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('presses a spent switch again once its partner has been used', () => {
    const map = makeMap(['#####', '#1.1#', '#Xx.#', '#####']);
    const inv = new Inventory();

    map.onEnter(1, 1, inv); // down
    map.onEnter(3, 1, inv); // its partner: lets the first back up
    expect(map.pressSwitch(map.get(1, 1))).toBe(true);
  });
});

describe('switches that start down', () => {
  // 4 is a red switch already held down; 1 is its partner, still up.
  const fresh = () => makeMap(['#####', '#4.1#', '#Xx.#', '#####']);

  it('reads as pressed from the start', () => {
    const map = fresh();
    expect(map.isPressed(map.get(1, 1))).toBe(true);
    expect(map.isPressed(map.get(3, 1))).toBe(false);
  });

  it('does not change what starts raised', () => {
    // Which columns start up is the map author's choice, made with X and x — a
    // switch starting down must not quietly flip it.
    const map = fresh();
    expect(map.isRaised(map.get(1, 2))).toBe(true); // X, group A
    expect(map.isRaised(map.get(2, 2))).toBe(false); // x, group B
  });

  it('cannot be pressed until its partner has been', () => {
    const map = fresh();
    expect(map.pressSwitch(map.get(1, 1))).toBe(false);

    map.pressSwitch(map.get(3, 1));

    expect(map.isPressed(map.get(1, 1))).toBe(false);
    expect(map.pressSwitch(map.get(1, 1))).toBe(true);
  });

  it('comes back down again on reset', () => {
    const map = fresh();
    map.pressSwitch(map.get(3, 1));
    expect(map.isPressed(map.get(1, 1))).toBe(false);

    map.reset();

    expect(map.isPressed(map.get(1, 1))).toBe(true);
    expect(map.isPressed(map.get(3, 1))).toBe(false);
  });
});

describe('no switch can seal the player in', () => {
  // The flood fill and the two-phase check live in src/reach.js, because
  // src/level-checks.js runs them over every stage — for the suite and the level
  // editor both. What is left here is the pair of cases that prove the check works.

  it('holds for every switch in a full-sized level', () => {
    const map = new TileMap(BIG_MAP, { build: false });
    for (const tile of map.tiles.flat().filter((t) => t.type === 'switch')) {
      expect(
        sealedIn(map, tile),
        `the ${tile.color} switch at ${tile.gx},${tile.gz} can be cut off from the spawn`,
      ).toEqual([]);
      map.reset();
    }
  });

  it('catches a switch walled in by its own colour', () => {
    // The check above is only worth having if it fails on a level like this one,
    // where the red switch sits behind the red column that gates it.
    const trap = makeMap(['#####', '#@X1#', '#####']);
    expect(sealedIn(trap, trap.get(3, 1))).toEqual(['A']);
  });
});

describe('reset', () => {
  it('restores taken pickups, opened doors and switch phase', () => {
    const map = makeMap(['######', '#@gG1#', '#X...#', '######']);
    const inv = new Inventory();

    map.onEnter(2, 1, inv); // take the key
    map.openDoor(3, 1, inv); // spend it
    map.onEnter(4, 1, inv); // press the red switch

    map.reset();

    expect(map.get(2, 1).taken).toBe(false);
    expect(map.get(3, 1).open).toBe(false);
    expect(map.isRaised(map.get(1, 2))).toBe(true);
    expect(map.isPressed(map.get(4, 1))).toBe(false);
  });
});

describe('what a chute is built from', () => {
  // Built with meshes, since where the stone sits relative to the ice is the whole
  // point. A chute is an ice bed tilted across the tile, rails down its flanks, and
  // stone underneath — and the stone is the part that was wrong: a flat-topped block
  // reaching up to the height of the *middle* of the tilted bed stands proud of it over
  // the entire downhill half, reading as a stair tread cut through the slide.
  const built = (rows) => new TileMap(rows, { build: true });

  /**
   * Every mesh `buildSlide` made, one tile at a time, reduced to the four numbers that
   * decide whether a piece is above the ice or below it.
   *
   * Per tile rather than per map: `buildSlide` makes one group for each tile of a
   * chute, and stone belongs under the tile it was built for. A map may hold chutes at
   * quite different heights — a stage with one on the ground and another two storeys
   * up is an ordinary stage — and holding the high one's soffit against the low one's
   * ice would fail it for being where it is supposed to be.
   *
   * @returns {Record<string, {y, tilt, halfHeight, halfLength}[]>[]} one per tile
   */
  function slideTiles(map) {
    const tiles = [];
    for (const group of map.group.children) {
      /** @type {Record<string, any[]>} */
      const parts = {};
      group.traverse((object) => {
        if (!object.isMesh || !object.name.startsWith('slide-')) return;
        const { height, depth } = object.geometry.parameters;
        (parts[object.name] ??= []).push({
          y: object.getWorldPosition(object.position.clone()).y,
          tilt: object.rotation.x,
          halfHeight: height / 2,
          halfLength: depth / 2,
        });
      });
      if (parts['slide-bed']) tiles.push(parts);
    }
    return tiles;
  }

  /** The same, flattened, for the tests that only count what was built. */
  function slideParts(map) {
    const parts = {};
    for (const tile of slideTiles(map)) {
      for (const [name, list] of Object.entries(tile)) (parts[name] ??= []).push(...list);
    }
    return parts;
  }

  // A slab tilted about x has its downhill end at local +z, so `end` is +1 downhill and
  // -1 uphill. Both of these have to be read at an *end* rather than at the middle:
  // reading the middle is precisely the mistake that put a step through the chute.

  /** The highest this part reaches at one end of the tile. */
  const topAt = (p, end) =>
    p.y - end * p.halfLength * Math.sin(p.tilt) + p.halfHeight * Math.cos(p.tilt);

  /** The underside of the ice at that same end. */
  const iceUnderAt = (bed, end) =>
    bed.y - end * bed.halfLength * Math.sin(bed.tilt) - bed.halfHeight * Math.cos(bed.tilt);

  /** Nothing made of stone may surface through the ice of the tile it was built for. */
  function expectStoneUnderIce(map, where) {
    const tiles = slideTiles(map);
    expect(tiles.length, `${where}: no chute was built`).toBeGreaterThan(0);
    for (const parts of tiles) {
      const [bed] = parts['slide-bed'];
      for (const name of ['slide-soffit', 'slide-plinth']) {
        for (const part of parts[name] ?? []) {
          for (const end of [-1, 1]) {
            expect(
              topAt(part, end),
              `${where}: ${name} surfaces through the ice at the ${end > 0 ? 'downhill' : 'uphill'} end`,
            ).toBeLessThanOrEqual(iceUnderAt(bed, end) + 1e-9);
          }
        }
      }
    }
  }

  // A one-tile chute from raised ground down to the floor: the shape every chute in
  // the game is made of. The raised ground at either end of it is plain floor on the
  // storey above, which is the only way a map says height.
  const CHUTE = [
    ['#####', '#@ .#', '# \\ #', '#...#', '#####'],
    ['', '  .', ' . .', '', ''],
  ];

  it('puts an ice bed and two rails on the tile', () => {
    const parts = slideParts(built(CHUTE));
    expect(parts['slide-bed']).toHaveLength(1);
    expect(parts['slide-rail']).toHaveLength(2);
    expect(parts['slide-bed'][0].tilt).toBeGreaterThan(0); // it descends
  });

  it('keeps every piece of stone below the ice, along the whole tile', () => {
    // The regression: `slide-plinth` used to top out at the bed's midpoint height,
    // which is above the ice everywhere past the middle of the tile.
    expectStoneUnderIce(built(CHUTE), 'a one-tile chute');
  });

  it('closes the underside with a soffit lying along the bed, not across it', () => {
    // Capping the plinth alone would leave a wedge of daylight under the uphill half.
    // The soffit fills it, which it can only do by sharing the bed's tilt.
    const parts = slideParts(built(CHUTE));
    expect(parts['slide-soffit']).toHaveLength(1);
    expect(parts['slide-soffit'][0].tilt).toBeCloseTo(parts['slide-bed'][0].tilt);
  });

  it('leaves the plinth out rather than turning it inside out', () => {
    // A box of negative height is a box inside out, and a chute falling to the floor
    // from barely above it leaves no room for one.
    for (const plinth of slideParts(built(CHUTE))['slide-plinth'] ?? []) {
      expect(plinth.halfHeight).toBeGreaterThan(0);
    }
  });

  it('holds for every chute in the shipped stages', () => {
    for (const stage of STAGES) {
      const map = new TileMap(stageLayers(stage), { build: true });
      if (slideTiles(map).length) expectStoneUnderIce(map, stage.id);
    }
  });
});

/**
 * Which storey a ramp is drawn on, and what a stair is made of.
 *
 * A ramp's stonework used to be built from the world floor plane up, however high the
 * ramp itself was — so a stair between the second floor and the third came out as a
 * column of masonry through the first, filling a room that had its own ground and its
 * own business going on in it. A ramp belongs to the storey it starts from.
 *
 * A stair goes further than that: it is four slabs floating in the air, with nothing
 * under them at all.
 */
describe('where a ramp is drawn', () => {
  const row = String.raw;
  const built = (rows) => new TileMap(rows, { build: true });

  /** Every mesh of one name, as the numbers that say where it is. Nothing is tilted. */
  function partsOf(map, name) {
    const parts = [];
    map.group.traverse((object) => {
      if (!object.isMesh || object.name !== name) return;
      const y = object.getWorldPosition(object.position.clone()).y;
      const { height } = object.geometry.parameters;
      parts.push({ top: y + height / 2, bottom: y - height / 2, material: object.material });
    });
    return parts.sort((a, b) => a.top - b.top);
  }

  /**
   * A ramp on the second storey, with a room of plain floor underneath it. The cell it
   * lands on is a hole in that ground: with floor there as well the ramp's column
   * would offer two heights at that end and it would refuse to guess.
   */
  const upstairs = (glyph) => [
    ['#####', '#.. #', '#####'],
    ['', ` .${glyph}`, ''],
    ['', '   .', ''],
  ];

  const GROUND_STAIR = [['#####', '#@/ #', '#####'], ['', '   .', '']];

  it('makes a stair out of four steps', () => {
    expect(partsOf(built(GROUND_STAIR), 'stair-tread')).toHaveLength(4);
  });

  it('draws every step in the same material', () => {
    // One step in a lighter grey than the rest reads as a different thing rather
    // than as the same staircase.
    const treads = partsOf(built(GROUND_STAIR), 'stair-tread');
    expect(new Set(treads.map((t) => t.material.uuid)).size).toBe(1);
  });

  it('floats the steps, and straddles the tile rather than starting at its floor', () => {
    const treads = partsOf(built(GROUND_STAIR), 'stair-tread');
    // Nothing reaches down to the floor the stair starts from: they hang in the air.
    for (const tread of treads) expect(tread.bottom).toBeGreaterThan(0);
    // And they are slabs, not blocks that grew taller the higher they climbed.
    const thickness = treads.map((t) => t.top - t.bottom);
    for (const t of thickness) expect(t).toBeCloseTo(thickness[0]);
    // Each step is at the height of the climb where it sits along the run, so the
    // flight clears the low landing by as much as it falls short of the high one.
    expect(LEVEL_RISE - treads.at(-1).top).toBeCloseTo(treads[0].top);
  });

  it('stands the player on a step, not in the gap between two', () => {
    // The clipping bug: the player stood at the flight's mean height, which with an
    // even number of steps falls on the seam between two of them — so the step just
    // ahead of the body rose a quarter of a level through the shins.
    const map = built(GROUND_STAIR);
    const stair = map.get(2, 1);
    const stand = map.surfaceOf(stair);
    const tops = partsOf(map, 'stair-tread').map((t) => t.top);

    expect(tops.some((top) => Math.abs(top - stand) < 1e-9)).toBe(true);
    // Above the height the camera follows, which is still the middle of the climb.
    expect(stand).toBeGreaterThan(map.heightOf(stair));
  });

  it('keeps an upstairs stair out of the room underneath it', () => {
    const treads = partsOf(built(upstairs('/')), 'stair-tread');
    expect(treads).toHaveLength(4);
    // The storey below is the whole band from the ground to LEVEL_RISE, and no part
    // of a stair on the floor above may be in it.
    for (const tread of treads) expect(tread.bottom).toBeGreaterThan(LEVEL_RISE);
    expect(treads.at(-1).top).toBeLessThan(2 * LEVEL_RISE);
  });

  it('keeps an upstairs chute out of it too', () => {
    // A chute is still stonework standing on a floor — just not on the bottom one.
    const [plinth] = partsOf(built(upstairs('\\')), 'slide-plinth');
    expect(plinth.bottom).toBeGreaterThan(0);
    expect(plinth.bottom).toBeLessThan(LEVEL_RISE);
  });

  it('still reaches the ground under a chute that lands there', () => {
    const ground = [['#####', row`# \.#`, '#####'], ['', ' .', '']];
    const [plinth] = partsOf(built(ground), 'slide-plinth');
    expect(plinth.bottom).toBeLessThan(0);
  });
});
