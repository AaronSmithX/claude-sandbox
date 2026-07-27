import { describe, it, expect } from 'vitest';
import { LEVEL_RISE, ELEVATOR_PERIOD } from '../src/tilemap.js';
import { Inventory } from '../src/inventory.js';
import { Enemies } from '../src/enemy.js';
import { makeMap, makeGame, advance, step, at } from './helpers/level.js';

/**
 * Two tiles in one cell — which is the thing elevation on a single layer cannot do.
 * A bridge is a deck in the same cell as the water it crosses, and both are real: you
 * walk over the top and swim underneath, and which one a step lands on depends on the
 * height you set out from.
 *
 * An elevator is the other half of it: ground whose height moves, joined to a storey
 * only while it is level with one.
 */

/** A river running north-south, crossed by a one-tile deck at z=1. */
const BRIDGE = [
  ['#####', '#@~.#', '#.~.#', '#####'],
  ['     ', '  .  ', '     ', '     '],
];

/** Stands the player on a tile the map cannot spawn them on, like a landing. */
function standOn(game, gx, gz, layer = 0) {
  game.player.gx = gx;
  game.player.gz = gz;
  game.player.tile = game.tilemap.get(gx, gz, layer);
  game.player._snapToGrid();
}

describe('parsing layers', () => {
  it('stacks the cells that have something above them', () => {
    const map = makeMap(BRIDGE);
    expect(map.column(2, 1)).toHaveLength(2);
    expect(map.column(1, 1)).toHaveLength(1);
    expect(map.get(2, 1).type).toBe('water'); // the ground layer is still the ground
    expect(map.get(2, 1, 1).type).toBe('floor'); // and the deck is above it
    expect(map.get(2, 1, 1).layer).toBe(1);
  });

  it('puts an upper layer one level up per layer', () => {
    const map = makeMap(BRIDGE);
    expect(map.get(2, 1, 1).level).toBe(1);
    expect(map.heightOf(map.get(2, 1, 1))).toBe(LEVEL_RISE);
  });

  it('lets a character add its own level on top of the layer it is on', () => {
    const map = makeMap([
      ['####', '#@.#', '####'],
      ['    ', "  ' ", '    '],
    ]);
    expect(map.get(2, 1, 1).level).toBe(2);
  });

  it('counts every tile on every layer', () => {
    const map = makeMap(BRIDGE);
    expect(map.allTiles()).toHaveLength(4 * 5 + 1);
  });

  it('treats a space as nothing at all, which on the ground is a hole', () => {
    const map = makeMap(['#####', '#@ .#', '#####']);
    expect(map.get(2, 1)).toBe(null);
    expect(map.column(2, 1)).toHaveLength(0);
    expect(map.canEnter(2, 1, new Inventory())).toBe(false);
  });

  it('cannot be walked into, hole or not', () => {
    const game = makeGame(['#####', '#@ .#', '#####']);
    expect(step(game, 1, 0)).toBe(false);
  });

  it('rejects a layer that is not the same size as the ground', () => {
    expect(() => makeMap([['###', '#@#', '###'], ['   ', '   ']])).toThrow(
      /layer 1 has 2 rows, expected 3/,
    );
    expect(() => makeMap([['###', '#@#', '###'], ['   ', '  ', '   ']])).toThrow(
      /expected 3/,
    );
  });
});

describe('a bridge', () => {
  it('carries the player over the water, with no tube in hand', () => {
    //  landings at level 1, a river between them, and a deck spanning it
    const game = makeGame([
      ['#####', "#'''#", '#~~~#', "#'''#", '#####'],
      ['     ', '     ', '  .  ', '     ', '     '],
    ]);
    standOn(game, 2, 1); // on the north landing

    expect(step(game, 0, 1)).toBe(true); // onto the deck
    expect(at(game)).toEqual({ gx: 2, gz: 2 });
    expect(game.player.layer).toBe(1);
    expect(game.player.tile.type).toBe('floor'); // the deck, not the water below it

    expect(step(game, 0, 1)).toBe(true); // and off onto the far landing
    expect(at(game)).toEqual({ gx: 2, gz: 3 });
    expect(game.player.layer).toBe(0);
    expect(game.inventory.hasTube).toBe(false);
  });

  it('has water under it that still refuses a player with no tube', () => {
    const game = makeGame([
      ['#####', '#@..#', '#.~.#', '#####'],
      ['     ', '     ', '  .  ', '     '],
    ]);
    expect(step(game, 0, 1)).toBe(true); // to 1,2
    expect(step(game, 1, 0)).toBe(false); // the water under the deck, and no tube
  });

  it('lands on the tile at the height you set out from', () => {
    const map = makeMap([
      ['#####', "#@'.#", '#.~.#', '#####'],
      ['     ', '     ', '  .  ', '     '],
    ]);
    const landing = map.get(2, 1); // level 1
    const deck = map.get(2, 2, 1); // level 1
    const water = map.get(2, 2); // level 0

    expect(map.stepTarget(landing, 0, 1)).toBe(deck);
    expect(map.stepTarget(map.get(1, 2), 1, 0)).toBe(water);
    expect(map.isConnected(deck, water)).toBe(false);
  });

  it('leaves the water under it crossable with the tube', () => {
    const game = makeGame([
      ['######', '#@O~.#', '######'],
      ['      ', '   .  ', '      '],
    ]);
    step(game, 1, 0); // the tube
    expect(step(game, 1, 0)).toBe(true); // into the water, under the deck
    expect(game.player.layer).toBe(0);
    expect(game.player.tile.type).toBe('water');
  });

  it('keeps a patrol underneath from catching the player on top', () => {
    const map = makeMap([
      ['#####', '#@-.#', '#####'],
      ['     ', '  .  ', '     '],
    ]);
    const enemies = new Enemies(map, { interval: 0.1, phase: 0 });
    const patrol = enemies.list[0];
    const onDeck = { gx: patrol.gx, gz: patrol.gz, prevGx: patrol.gx, prevGz: patrol.gz, layer: 1 };
    const onFloor = { ...onDeck, layer: 0 };

    expect(enemies.hits(onDeck)).toBe(null);
    expect(enemies.hits(onFloor)).toBe(patrol);
  });
});

describe('an elevator', () => {
  //  a platform between the floor at 0 and a gantry at 1
  const LIFT = [
    ['#####', '#@e.#', '#####'],
    ['     ', '   . ', '     '],
  ];

  it('works out the storeys it serves from the floors beside it', () => {
    const lift = makeMap(LIFT).get(2, 1);
    expect(lift.low).toBe(0);
    expect(lift.high).toBe(1);
    expect(lift.level).toBe(0); // `e` starts at the bottom
  });

  it('starts at the top when authored as E', () => {
    const lift = makeMap([
      ['#####', '#@E.#', '#####'],
      ['     ', '   . ', '     '],
    ]).get(2, 1);
    expect(lift.level).toBe(1);
  });

  it('refuses to exist where it has nowhere to go', () => {
    expect(() => makeMap(['#####', '#@e.#', '#####'])).toThrow(/goes nowhere/);
  });

  it('dwells at each end and joins that storey while it does', () => {
    const map = makeMap(LIFT);
    const lift = map.get(2, 1);
    const floor = map.get(1, 1);
    const gantry = map.get(3, 1, 1);

    expect(map.isConnected(floor, lift)).toBe(true); // parked at the bottom
    expect(map.isConnected(lift, gantry)).toBe(false);

    map.update(ELEVATOR_PERIOD / 2); // half a cycle on: parked at the top
    expect(lift.level).toBe(1);
    expect(map.isConnected(floor, lift)).toBe(false);
    expect(map.isConnected(lift, gantry)).toBe(true);
  });

  it('joins nothing at all while it is moving', () => {
    const map = makeMap(LIFT);
    const lift = map.get(2, 1);
    map.update(ELEVATOR_PERIOD * 0.375); // mid-rise

    expect(lift.level).toBeGreaterThan(0);
    expect(lift.level).toBeLessThan(1);
    expect(map.isConnected(map.get(1, 1), lift)).toBe(false);
    expect(map.isConnected(lift, map.get(3, 1, 1))).toBe(false);
  });

  it('cannot be boarded while it is moving', () => {
    const game = makeGame(LIFT);
    advance(game, ELEVATOR_PERIOD * 0.375); // mid-rise
    expect(step(game, 1, 0)).toBe(false);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
  });

  it('carries the player up, and puts them down on the gantry', () => {
    const game = makeGame(LIFT);
    const ground = game.player.mesh.position.y;

    expect(step(game, 1, 0)).toBe(true); // aboard while it is parked at the bottom
    expect(game.player.tile.type).toBe('elevator');

    advance(game, ELEVATOR_PERIOD / 2); // ride it up
    expect(game.player.mesh.position.y).toBeCloseTo(ground + LEVEL_RISE);
    expect(game.player.elevation).toBeCloseTo(LEVEL_RISE);

    expect(step(game, 1, 0)).toBe(true); // off onto the gantry
    expect(game.player.layer).toBe(1);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
  });

  it('will not let the player step off in mid-air', () => {
    const game = makeGame(LIFT);
    step(game, 1, 0); // aboard
    advance(game, ELEVATOR_PERIOD * 0.375); // and away
    expect(step(game, 1, 0)).toBe(false);
    expect(step(game, -1, 0)).toBe(false);
    expect(game.player.tile.type).toBe('elevator');
  });

  it('is not for patrols', () => {
    const map = makeMap(LIFT);
    expect(map.isWalkable(2, 1)).toBe(false);
    expect(map.canPatrol(1, 1, 2, 1)).toBe(false);
  });

  it('goes back to where it started when the stage is retried', () => {
    const map = makeMap(LIFT);
    map.update(ELEVATOR_PERIOD / 2);
    expect(map.get(2, 1).level).toBe(1);

    map.reset();
    expect(map.get(2, 1).level).toBe(0);
  });
});
