import { describe, it, expect } from 'vitest';
import { LEVEL_RISE, WATER_SINK } from '../src/tilemap.js';
import { Inventory } from '../src/inventory.js';
import { Enemies } from '../src/enemy.js';
import { makeMap, makeGame, advance, step, at, FRAME } from './helpers/level.js';

/**
 * Height on one layer: raised floors, the stairs that join them and the chutes that
 * fall between them. Two tiles at different heights are not neighbours unless a
 * ramp says so, and a chute is a one-way street.
 */

describe('parsing elevation', () => {
  it('reads a level off the floor character', () => {
    const map = makeMap(["#####", "#@.'#", '#####']);
    expect(map.get(1, 1).level).toBe(0);
    expect(map.get(3, 1).level).toBe(1);
  });

  it('stacks two levels for a double mark', () => {
    const map = makeMap(['####', '#@"#', '####']);
    expect(map.get(2, 1).level).toBe(2);
  });

  it('puts a tile at level times the rise, and water below its own ground', () => {
    const map = makeMap(["######", "#@.'~#", '######']);
    expect(map.tileHeight(1, 1)).toBe(0);
    expect(map.tileHeight(3, 1)).toBe(LEVEL_RISE);
    expect(map.surfaceY(3, 1)).toBe(LEVEL_RISE);
    expect(map.surfaceY(4, 1)).toBe(-WATER_SINK);
    // Off the map is level ground, as it was before there was elevation.
    expect(map.surfaceY(-1, -1)).toBe(0);
  });
});

describe('a stair', () => {
  const LEVEL = ["#####", "#@/'#", '#####'];

  it('works out its run, its ends and its own half-way height', () => {
    const stair = makeMap(LEVEL).get(2, 1);
    expect(stair.run).toBe('x');
    expect(stair.low).toBe(0);
    expect(stair.high).toBe(1);
    expect(stair.level).toBe(0.5);
    expect(stair.up).toEqual([1, 0]);
  });

  it('reads the same climb authored the other way round', () => {
    const stair = makeMap(["#####", "#'/@#", '#####']).get(2, 1);
    expect(stair.up).toEqual([-1, 0]);
    expect(stair.level).toBe(0.5);
  });

  it('can be climbed and come back down', () => {
    const game = makeGame(LEVEL);
    expect(step(game, 1, 0)).toBe(true); // onto the stair
    expect(step(game, 1, 0)).toBe(true); // up onto the raised floor
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
    expect(step(game, -1, 0)).toBe(true);
    expect(step(game, -1, 0)).toBe(true);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
  });

  it('lifts the player as it is climbed', () => {
    const game = makeGame(LEVEL);
    const ground = game.player.mesh.position.y;
    step(game, 1, 0);
    expect(game.player.mesh.position.y).toBeCloseTo(ground + LEVEL_RISE / 2);
    step(game, 1, 0);
    expect(game.player.mesh.position.y).toBeCloseTo(ground + LEVEL_RISE);
  });

  it('cannot be stepped onto from the side', () => {
    //   the stair runs east-west, so its north and south faces are its flanks
    const game = makeGame(["#####", "#.@.#", "#./'#", '#####']);
    expect(step(game, 0, 1)).toBe(false);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
  });

  it('refuses to exist where it joins nothing', () => {
    expect(() => makeMap(['#####', '#@/.#', '#####'])).toThrow(/joins nothing/);
  });

  it('refuses to span more than one level', () => {
    expect(() => makeMap(['#####', '#@/"#', '#####'])).toThrow(/joins floors exactly one level apart/);
  });

  it('refuses to be ambiguous about which way it runs', () => {
    expect(() => makeMap(["#####", "#.'.#", "#'/.#", "#...#", '#####'])).toThrow(
      /could run either way/,
    );
  });
});

describe('a ledge', () => {
  it('is a wall you can see over', () => {
    const game = makeGame(["#####", "#@'.#", '#####']);
    expect(step(game, 1, 0)).toBe(false);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
  });

  it('stops a walk that is already running rather than dropping the player off', () => {
    const game = makeGame(["######", "#@..'#", '######']);
    game.player.press(1, 0);
    advance(game, 1);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
    expect(game.player.isMoving).toBe(false);
  });
});

describe('a chute', () => {
  // String.raw, because a map full of backslashes is unreadable escaped.
  const row = String.raw;

  /** Puts the player on a tile the map cannot spawn them on, like a plateau. */
  function standOn(game, gx, gz) {
    game.player.gx = gx;
    game.player.gz = gz;
    game.player._snapToGrid();
  }

  it('descends, and knows which way', () => {
    const map = makeMap(['#####', row`#'\.#`, '#####']);
    const slide = map.get(2, 1);
    expect(slide.run).toBe('x');
    expect(slide.dir).toEqual([1, 0]);
    expect(slide.level).toBe(0.5);
  });

  it('spreads a longer drop evenly across its tiles', () => {
    // Two levels down over three tiles: four equal steps of half a level.
    const map = makeMap(['#######', row`#"\\\.#`, '#######']);
    expect(map.get(1, 1).level).toBe(2);
    expect(map.get(2, 1).level).toBeCloseTo(1.5);
    expect(map.get(3, 1).level).toBeCloseTo(1);
    expect(map.get(4, 1).level).toBeCloseTo(0.5);
    expect(map.get(5, 1).level).toBe(0);
  });

  it('runs downhill whichever way round it was authored', () => {
    // Authored low end first this time: the chute still falls towards the low end.
    const downhill = makeMap(['#######', row`#.\\\"#`, '#######']);
    expect(downhill.get(2, 1).dir).toEqual([-1, 0]);
    expect(downhill.get(2, 1).level).toBeCloseTo(0.5);
    expect(downhill.get(4, 1).level).toBeCloseTo(1.5);
  });

  it('counts as slippery, so the ride is the ice ride', () => {
    const map = makeMap(['#####', row`#'\.#`, '#####']);
    expect(map.isSlippery(2, 1)).toBe(true);
  });

  it('carries the player to the bottom in one press', () => {
    const game = makeGame(['######', row`#'\\.#`, '######']);
    standOn(game, 1, 1);

    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 4, gz: 1 });
    expect(game.player.isSliding).toBe(false);
  });

  it('cannot be climbed', () => {
    const game = makeGame(['#####', row`#'\@#`, '#####']);
    expect(step(game, -1, 0)).toBe(false);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('cannot be entered from the side', () => {
    const game = makeGame(['#####', '#.@.#', row`#'\.#`, '#####']);
    expect(step(game, 0, 1)).toBe(false);
  });

  it('refuses to exist where it joins nothing', () => {
    expect(() => makeMap(['#####', row`#@'\#`, '#####'])).toThrow(/joins nothing/);
  });

  it('refuses to exist without floor at the end of its run', () => {
    expect(() => makeMap(['#####', row`#'\\#`, '#####'])).toThrow(/does not land/);
  });

  it('refuses to be level, since a slide has to go down', () => {
    expect(() => makeMap(['#####', row`#.\\.#`, '#####'])).toThrow(/expected 5/);
    expect(() => makeMap(['######', row`#.\\.#`, '######'])).toThrow(/is level/);
  });

  it('refuses to bend', () => {
    expect(() => makeMap(['#####', row`#'\\#`, row`#.\.#`, '#####'])).toThrow(/bends/);
  });

  it('hands the player straight onto ice at the bottom', () => {
    const game = makeGame(['#######', row`#'\ii.#`, '#######']);
    standOn(game, 1, 1);

    step(game, 1, 0); // chute, then two tiles of ice, then floor
    expect(at(game)).toEqual({ gx: 5, gz: 1 });
  });
});

describe('what the camera follows', () => {
  it('rises with the ground and ignores the bob on the way', () => {
    const game = makeGame(["#####", "#@/'#", '#####']);
    expect(game.player.elevation).toBe(0);

    game.player.tryMove(1, 0);
    advance(game, FRAME); // one frame into the climb
    expect(game.player.elevation).toBeGreaterThan(0);
    expect(game.player.elevation).toBeLessThan(LEVEL_RISE / 2);

    advance(game, 0.2);
    expect(game.player.elevation).toBeCloseTo(LEVEL_RISE / 2);
    step(game, 1, 0);
    expect(game.player.elevation).toBeCloseTo(LEVEL_RISE);
  });

  it('stays put when the player wades, which is not a change of ground', () => {
    const game = makeGame(['#####', '#@O~#', '#####']);
    const dry = game.player.mesh.position.y;
    step(game, 1, 0);
    step(game, 1, 0); // into the water, riding the tube

    expect(game.player.mesh.position.y).toBeCloseTo(dry - WATER_SINK);
    expect(game.player.elevation).toBe(0);
  });
});

describe('patrols and height', () => {
  it('will not take a stair', () => {
    const map = makeMap(["#####", "#-/'#", '#####']);
    expect(map.canPatrol(1, 1, 2, 1)).toBe(false);
    expect(map.isWalkable(2, 1)).toBe(false);
  });

  it('will not take a chute either', () => {
    const map = makeMap(["#####", "#'\\-#", '#####']);
    expect(map.isWalkable(2, 1)).toBe(false);
  });

  it('stops at a ledge instead of walking up it', () => {
    const map = makeMap(["#####", "#-.'#", '#####']);
    expect(map.canPatrol(2, 1, 3, 1)).toBe(false);
  });

  it('rides at the height of the ground it spawned on', () => {
    // The legend has no raised patrol spawn — `-` and friends are level-0 floor —
    // so the level is set by hand here. Patrols never change level, so this is the
    // whole of what elevation means to an enemy: where its mesh sits.
    const map = makeMap(['#####', '#@-.#', '#####']);
    map.get(2, 1).level = 1;
    map.get(3, 1).level = 1;

    const enemies = new Enemies(map, { interval: 0.1, phase: 0 });
    expect(enemies.list[0].mesh.position.y).toBeCloseTo(LEVEL_RISE);

    enemies.step();
    expect(enemies.list[0].gx).toBe(3); // along the raised pair, not down the ledge
    enemies.update(0.2);
    expect(enemies.list[0].mesh.position.y).toBeCloseTo(LEVEL_RISE);
  });
});

describe('taking a step', () => {
  it('still asks what the tile itself allows', () => {
    const map = makeMap(['#####', '#@~.#', '#####']);
    const empty = new Inventory();
    const stocked = new Inventory();
    stocked.setTube(true);

    const from = map.get(1, 1);
    expect(map.stepFrom(from, 1, 0, empty)).toBe(null);
    expect(map.stepFrom(from, 1, 0, stocked)).toBe(map.get(2, 1));
  });

  it('says no to a tile off the map', () => {
    const map = makeMap(['###', '#@#', '###']);
    expect(map.stepFrom(map.get(1, 1), 0, -1, new Inventory())).toBe(null);
    expect(map.isConnected(map.get(1, 1), null)).toBe(false);
  });

  it('says no to a tile that is not next door', () => {
    const map = makeMap(['####', '#@.#', '#..#', '####']);
    expect(map.isConnected(map.get(1, 1), map.get(2, 2))).toBe(false);
    expect(map.isConnected(map.get(1, 1), map.get(1, 1))).toBe(false);
  });
});
