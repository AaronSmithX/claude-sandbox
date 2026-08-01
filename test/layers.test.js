import { describe, it, expect } from 'vitest';
import { LEVEL_RISE, ELEVATOR_PERIOD } from '../src/tilemap.js';
import { Inventory } from '../src/inventory.js';
import { Enemies } from '../src/enemy.js';
import { makeMap, makeGame, advance, step, walk, at } from './helpers/level.js';

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

  it('gives a tile the level of the layer it is drawn on, however deep the stack', () => {
    const map = makeMap([
      ['####', '#@.#', '####'],
      ['', '', ''],
      ['', '  .', ''],
    ]);
    expect(map.get(2, 1, 2).level).toBe(2);
    expect(map.get(2, 1, 1)).toBe(null); // the storey between them is empty
  });

  it('counts every tile on every layer', () => {
    const map = makeMap(BRIDGE);
    expect(map.allTiles()).toHaveLength(4 * 5 + 1);
  });

  it('finds a tile by the layer it is on, not by where it sits in the column', () => {
    // A hole in the ground with a deck over it: the cell holds one tile, and that
    // tile is on layer 1. Counting into the column would answer with the deck for
    // layer 0 and with nothing for layer 1 — both wrong, and quietly so.
    const map = makeMap([
      ['#####', '#@. #', '#####'],
      ['     ', '   . ', '     '],
    ]);
    expect(map.column(3, 1)).toHaveLength(1);
    expect(map.get(3, 1)).toBe(null);
    expect(map.get(3, 1, 1).layer).toBe(1);
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

  it('lets an upper layer stop short, since it is mostly sky', () => {
    // The ground grid says how big the map is. An upper storey with one deck on it is
    // two characters and a lot of nothing, and typing the nothing out would be
    // busywork with a row-length error at the end of it.
    const map = makeMap([['###', '#@#', '###'], ['', ' .']]);
    expect(map.get(1, 1, 1).level).toBe(1);
  });

  it('rejects a layer bigger than the ground, which is a real mistake', () => {
    expect(() => makeMap([['###', '#@#', '###'], ['', '', '', '   ']])).toThrow(
      /layer 1 has 4 rows, more than the ground's 3/,
    );
    expect(() => makeMap([['###', '#@#', '###'], ['', '    ']])).toThrow(
      /wider than the ground's 3/,
    );
  });

  it('still holds the ground layer to its own shape', () => {
    expect(() => makeMap(['###', '#@', '###'])).toThrow(/is 2 characters, expected 3/);
  });
});

describe('a bridge', () => {
  it('carries the player over the water, with no tube in hand', () => {
    //  landings at level 1, a river between them, and a deck spanning it
    const game = makeGame([
      ['#####', '#   #', '#~~~#', '#   #', '#####'],
      ['', ' ...', '  .', ' ...', ''],
    ]);
    standOn(game, 2, 1, 1); // on the north landing

    expect(step(game, 0, 1)).toBe(true); // onto the deck
    expect(at(game)).toEqual({ gx: 2, gz: 2 });
    expect(game.player.layer).toBe(1);
    expect(game.player.tile.type).toBe('floor'); // the deck, not the water below it

    expect(step(game, 0, 1)).toBe(true); // and off onto the far landing
    expect(at(game)).toEqual({ gx: 2, gz: 3 });
    expect(game.player.layer).toBe(1);
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
      ['#####', '#@ .#', '#.~.#', '#####'],
      ['', '  .', '  .', ''],
    ]);
    const landing = map.get(2, 1, 1); // level 1
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

  it('hands the player what they walk onto up there, hole underneath or not', () => {
    // Arriving is what triggers a pickup, and arriving asks the map for the tile by
    // coordinates and layer. With nothing on the ground beneath it the star used to
    // be walked onto and stood on with the stage never noticing.
    const game = makeGame([
      ['######', '#@/  #', '######'],
      ['', '   .*', ''],
    ]);
    expect(step(game, 1, 0)).toBe(true); // the stair
    expect(step(game, 1, 0)).toBe(true); // the landing at level 1
    expect(step(game, 1, 0)).toBe(true); // out onto the star, over the hole

    expect(game.player.tile.type).toBe('star');
    expect(game.inventory.won).toBe(true);
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

describe('a third layer', () => {
  /**
   * Nothing caps the stack at two. A layer is a storey, a tile's `level` is the layer
   * it is drawn on, and every question the game asks — what joins what,
   * what you are standing on, what happens when you get there — is asked about a tile
   * rather than about a storey. So the third layer needs no code of its own, and this
   * is the test that says so.
   *
   * Two stairs up the ground layer, and a star on the second floor with nothing at all
   * beneath it: the cell holds one tile, and that tile is on layer 2.
   */
  const TOWER = [
    ['#########', '#@/ /  ##', '#########'],
    ['', '   .', ''],
    ['', '     .*', ''],
  ];

  it('puts a tile two storeys up, and finds it there', () => {
    const map = makeMap(TOWER);
    expect(map.column(6, 1)).toHaveLength(1);
    expect(map.get(6, 1, 2).type).toBe('star');
    expect(map.get(6, 1, 2).level).toBe(2);
    expect(map.get(6, 1, 1)).toBe(null);
    expect(map.get(6, 1)).toBe(null);
  });

  it('clears the stage from a star on the second floor', () => {
    const game = makeGame(TOWER);
    // Stair, landing, stair, landing, and out onto the star over the hole.
    expect(walk(game, Array.from({ length: 5 }, () => [1, 0]))).toBe(true);

    expect(at(game)).toEqual({ gx: 6, gz: 1 });
    expect(game.player.layer).toBe(2);
    expect(game.inventory.won).toBe(true);
  });
});

/**
 * A ramp reads its ends on its own layer, and looks up and down the column only where
 * its own layer has nothing to say. That is what lets a stair join two ordinary `.`
 * tiles a storey apart: the cell it climbs into is a hole on the ground, so the ramp
 * finds the deck over it. Neither end has to be spelled as raised ground, and neither
 * end has to be on the ramp's own layer.
 */
describe('a ramp between storeys', () => {
  // String.raw, because a map full of backslashes is unreadable escaped.
  const row = String.raw;

  it('climbs from plain floor to the plain deck above it', () => {
    const map = makeMap([
      ['#####', '#@/ #', '#####'],
      ['     ', '   . ', '     '],
    ]);
    const stair = map.get(2, 1);
    expect(stair.run).toBe('x');
    expect(stair.joins).toEqual([0, 1]);
    expect(stair.up).toEqual([1, 0]); // the deck is the high end
    expect(map.isConnected(stair, map.get(3, 1, 1))).toBe(true);
  });

  it('is walked up, and lands the player on the layer above', () => {
    const game = makeGame([
      ['#####', '#@/ #', '#####'],
      ['     ', '   * ', '     '],
    ]);
    expect(walk(game, [[1, 0], [1, 0]])).toBe(true);
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
    expect(game.player.layer).toBe(1);
    expect(game.inventory.won).toBe(true);
  });

  it('falls the same way: a chute off a plain deck onto plain floor', () => {
    const game = makeGame([
      ['#######', row`#@/ \.#`, '#######'],
      ['       ', '   .   ', '       '],
    ]);
    const chute = game.tilemap.get(4, 1);
    expect(chute.dir).toEqual([1, 0]); // downhill, off the deck
    expect(chute.level).toBeCloseTo(0.5);

    // Up the stair, out onto the deck, and off the end of it in one press.
    expect(walk(game, [[1, 0], [1, 0]])).toBe(true);
    expect(game.player.layer).toBe(1);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 5, gz: 1 });
    expect(game.player.layer).toBe(0);
  });

  it('climbs to the deck even when there is ground under it too', () => {
    // The cell at the top of the stair holds both the deck and the floor beneath it,
    // so the stair's own layer answers at both ends and answers level — no ramp at
    // all. It reads the columns instead, and the deck is the landing.
    const map = makeMap([['@../..'], ['    .*']]);
    const stair = map.get(3, 0);
    expect(stair.joins).toEqual([0, 1]);
    expect(stair.up).toEqual([1, 0]);
    expect(map.column(4, 0)).toHaveLength(2); // floor and deck, both real
  });

  it('walks that map to the star, arriving on the deck and not under it', () => {
    // The regression the pair above guards: with a ramp joined to *either* of its
    // ends, climbing arrived on the ground floor under the landing and went nowhere.
    const game = makeGame([['@../..'], ['    .*']]);
    expect(walk(game, [[1, 0], [1, 0], [1, 0], [1, 0]])).toBe(true);
    expect(at(game)).toEqual({ gx: 4, gz: 0 });
    expect(game.player.layer).toBe(1);

    expect(step(game, 1, 0)).toBe(true);
    expect(game.inventory.won).toBe(true);
  });

  it('comes back down the same stair onto the ground', () => {
    const game = makeGame([['@../..'], ['    ..']]);
    walk(game, [[1, 0], [1, 0], [1, 0], [1, 0]]);
    expect(game.player.layer).toBe(1);

    expect(walk(game, [[-1, 0], [-1, 0]])).toBe(true);
    expect(at(game)).toEqual({ gx: 2, gz: 0 });
    expect(game.player.layer).toBe(0);
  });

  it('will not let you on to that stair from the floor under its landing', () => {
    // The deck is the stair's top. The ground floor in the same cell is a storey
    // below it and has no business joining the stair at all.
    const map = makeMap([['@../..'], ['    .*']]);
    expect(map.isConnected(map.get(4, 0), map.get(3, 0))).toBe(false);
    expect(map.isConnected(map.get(4, 0, 1), map.get(3, 0))).toBe(true);
  });

  it('still prefers its own layer at an end that has one', () => {
    // The foot of this stair is ordinary ground with a second-storey deck floating
    // over it, so its column offers two heights. The stair takes the one on its own
    // layer; reading the whole column there would leave it choosing between climbing
    // to the deck ahead and dropping from the one overhead, and it would refuse.
    const map = makeMap([
      ['#####', '#@/ #', '#####'],
      ['', '   .', ''], // the landing, a storey up
      ['', ' .', ''], // and something else again, two storeys over the foot
    ]);
    expect(map.column(1, 1)).toHaveLength(2);
    expect(map.get(2, 1).joins).toEqual([0, 1]);
  });

  it('refuses when the column leaves it a real choice', () => {
    // Nothing on the stair's own layer at either end, and two storeys standing over
    // both — so it cannot know which pair is meant, and says so rather than picking.
    expect(() =>
      makeMap([
        ['#####', '# / #', '#####'],
        ['     ', ' . . ', '     '],
        ['     ', ' . . ', '     '],
      ]),
    ).toThrow(/could join more than one pair of floors/);
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
