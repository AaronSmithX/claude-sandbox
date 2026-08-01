import { describe, it, expect } from 'vitest';
import { Enemies } from '../src/enemy.js';
import { makeMap, makeGame, advance, step, walk, at, FRAME } from './helpers/level.js';

/**
 * Crates, the plates they hold down and the gates those open.
 *
 * A crate is the first thing in the game the player can move rather than collect, so
 * most of these are about what a shove may and may not do: it goes one tile, away from
 * you, and only onto ground that cannot be triggered or spent by a crate sitting on it.
 */

const crateOf = (game) => game.blocks.list[0];
const gateOf = (game) => game.tilemap.allTiles().find((t) => t.type === 'gate');
const plateOf = (game) => game.tilemap.allTiles().find((t) => t.type === 'plate');

describe('a crate', () => {
  it('starts on the floor tile it was authored on', () => {
    const game = makeGame(['#####', '#@B.#', '#####']);
    expect(game.blocks.list).toHaveLength(1);
    expect(crateOf(game).gx).toBe(2);
    expect(game.tilemap.get(2, 1).type).toBe('floor');
  });

  it('is shoved one tile by a step into it, and the step happens too', () => {
    const game = makeGame(['######', '#@B..#', '######']);
    expect(step(game, 1, 0)).toBe(true);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
    expect(crateOf(game).gx).toBe(3);
  });

  it('goes nowhere with a wall behind it, and nor does the player', () => {
    const game = makeGame(['#####', '#@B#', '#####'].map((r) => r.padEnd(5, '#')));
    expect(step(game, 1, 0)).toBe(false);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
    expect(crateOf(game).gx).toBe(2);
  });

  it('will not shove a second crate along with it', () => {
    const game = makeGame(['######', '#@BB.#', '######']);
    expect(step(game, 1, 0)).toBe(false);
    expect(game.blocks.list.map((b) => b.gx)).toEqual([2, 3]);
  });

  it('cannot be pushed into water, even by a player holding the tube', () => {
    const game = makeGame(['######', '#@B~.#', '######']);
    game.inventory.setTube(true);
    expect(step(game, 1, 0)).toBe(false);
  });

  it('cannot be pushed onto anything that would be spent or hidden by it', () => {
    // A switch held down for ever, a key buried, a star sat on: all refused.
    for (const row of ['#@B1.#', '#@Bg.#', '#@B*.#', '#@BO.#']) {
      const game = makeGame(['######', row, '######']);
      expect(step(game, 1, 0), `into ${row[3]}`).toBe(false);
    }
  });

  it('cannot be pushed onto a ramp or a platform', () => {
    const stair = makeGame([['######', '#@B/ #', '######'], ['', '    .', '']]);
    expect(step(stair, 1, 0)).toBe(false);

    const lift = makeGame([
      ['######', '#@Be.#', '######'],
      ['      ', '    . ', '      '],
    ]);
    expect(step(lift, 1, 0)).toBe(false);
  });

  it('can be pushed through a door that is already open, but not one that is shut', () => {
    const shut = makeGame(['######', '#@BG.#', '######']);
    shut.inventory.addKey('gold');
    expect(step(shut, 1, 0)).toBe(false); // a crate cannot spend your key

    const open = makeGame(['######', '#@BG.#', '######']);
    open.tilemap.get(3, 1).open = true;
    expect(step(open, 1, 0)).toBe(true);
    expect(crateOf(open).gx).toBe(3);
  });

  it('slides on ice until something stops it', () => {
    const game = makeGame(['########', '#@Biii.#', '########']);
    step(game, 1, 0);
    // One shove, and the crate carries on to the far end of the ice.
    expect(crateOf(game).gx).toBe(6);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
  });

  it('cannot be shoved while it is still sliding', () => {
    const game = makeGame(['#########', '#@Biiii.#', '#########']);
    game.player.tryMove(1, 0);
    advance(game, FRAME * 2); // the crate is away, the player mid-step
    game.player.tryMove(1, 0);
    advance(game, 1);
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
  });

  it('stops a slide rather than being shoved by one', () => {
    const game = makeGame(['#######', '#@iB..#', '#######']);
    step(game, 1, 0); // onto the ice, sliding east into the crate
    expect(at(game)).toEqual({ gx: 2, gz: 1 });
    expect(crateOf(game).gx).toBe(3);
  });

  it('is a wall to a patrol', () => {
    const map = makeMap(['#####', '#-B.#', '#####']);
    const enemies = new Enemies(map, { interval: 1, phase: 0 });
    const blocks = { list: [{ tile: map.get(2, 1), isMoving: false }] };
    map.occupants = () => blocks.list.map((b) => ({ tile: b.tile, isBlock: true }));

    expect(map.canPatrol(1, 1, 2, 1)).toBe(false);
    enemies.step();
    expect(enemies.list[0].gx).toBe(1); // turned round rather than walking through
  });

  it('can be shoved somewhere it can never come back from', () => {
    // The wedge every crate puzzle has: a crate against a wall cannot be pulled, and
    // there is nowhere to stand on the far side of it to push. R restarts the stage.
    const game = makeGame(['######', '#@B..#', '######']);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(crateOf(game).gx).toBe(4); // hard against the east wall

    expect(step(game, 1, 0)).toBe(false); // nothing left to give
    expect(at(game)).toEqual({ gx: 3, gz: 1 });
    // And no way round: the crate fills the only tile east of the player.
    expect(game.tilemap.get(5, 1).type).toBe('wall');
  });

  it('goes back where it started when the stage is retried', () => {
    const game = makeGame(['######', '#@B..#', '######']);
    step(game, 1, 0);
    expect(crateOf(game).gx).toBe(3);

    game.blocks.reset();
    expect(crateOf(game).gx).toBe(2);
  });

  it('hands its meshes back when the stage is unloaded', () => {
    const game = makeGame(['######', '#@B..#', '######']);
    expect(game.blocks.group.children.length).toBeGreaterThan(0);
    game.blocks.dispose();
    expect(game.blocks.group.children).toHaveLength(0);
    expect(game.blocks.list).toHaveLength(0);
  });
});

describe('a plate and its gate', () => {
  //  the player can reach the plate, and the gate is the only way to the star
  const LEVEL = ['#######', '#@..p.#', '#.#####', '#P#####', '#*#####'];

  it('is held down by the player standing on it', () => {
    const game = makeGame(LEVEL);
    expect(plateOf(game).pressed).toBe(false);

    step(game, 1, 0);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(at(game)).toEqual({ gx: 4, gz: 1 });
    expect(plateOf(game).pressed).toBe(true);
    expect(gateOf(game).open).toBe(true);
  });

  it('lets go again the moment the player steps off', () => {
    const game = makeGame(LEVEL);
    step(game, 1, 0);
    step(game, 1, 0);
    step(game, 1, 0);
    step(game, 1, 0); // off the plate, onto the floor beyond it

    expect(plateOf(game).pressed).toBe(false);
    expect(gateOf(game).open).toBe(false);
  });

  it('is held down by a crate, which is the point of a crate', () => {
    const game = makeGame(['#######', '#@B.p.#', '#######']);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(crateOf(game).gx).toBe(4);
    expect(plateOf(game).pressed).toBe(true);
  });

  it('blocks the way while it is shut', () => {
    const game = makeGame(['#####', '#@P.#', '#####']);
    expect(step(game, 1, 0)).toBe(false);
    expect(at(game)).toEqual({ gx: 1, gz: 1 });
  });

  it('opens only for its own colour', () => {
    const game = makeGame(['#######', '#@..p.#', '#Q#####', '#######']);
    step(game, 1, 0);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(plateOf(game).pressed).toBe(true);
    expect(gateOf(game).open).toBe(false); // a cyan gate, a red plate
  });

  it('cannot shut on whoever is standing in it', () => {
    //  the plate is the tile above the gateway, so stepping off the plate *is* the
    //  step into the gate
    const game = makeGame(['#####', '#@p.#', '##P##', '##.##', '#####']);
    step(game, 1, 0);
    expect(plateOf(game).pressed).toBe(true);
    expect(gateOf(game).open).toBe(true);

    expect(step(game, 0, 1)).toBe(true); // into the gateway, letting the plate up
    expect(at(game)).toEqual({ gx: 2, gz: 2 });
    expect(plateOf(game).pressed).toBe(false);
    expect(gateOf(game).open).toBe(true); // held by the player standing in it

    expect(step(game, 0, 1)).toBe(true); // and out the far side
    expect(gateOf(game).open).toBe(false); // which is when it finally shuts
  });

  it('is not a way through for a patrol, open or shut', () => {
    const map = makeMap(['#####', '#-P.#', '#####']);
    expect(map.isWalkable(2, 1)).toBe(false);
    map.get(2, 1).open = true;
    expect(map.isWalkable(2, 1)).toBe(false);
  });

  it('drops its bars into the floor while it is open, and raises them when it shuts', () => {
    //  the same level as the first test, built this time: a gate the player can see
    const game = makeGame(LEVEL, { build: true });
    const shut = gateOf(game).bars.position.y;

    walk(game, [
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
    expect(gateOf(game).open).toBe(true);
    advance(game, 0.5);
    // Well clear of the gateway, not merely somewhere between the two heights.
    expect(gateOf(game).bars.position.y).toBeLessThan(shut - 0.9);

    step(game, -1, 0); // off the plate again
    expect(gateOf(game).open).toBe(false);
    advance(game, 0.5);
    expect(gateOf(game).bars.position.y).toBeCloseTo(shut, 2);
  });

  it('sinks its plate face while the plate is held', () => {
    const game = makeGame(LEVEL, { build: true });
    const up = plateOf(game).plateTop.position.y;

    walk(game, [
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
    advance(game, 0.5);
    expect(plateOf(game).plateTop.position.y).toBeLessThan(up - 0.02);

    step(game, -1, 0);
    advance(game, 0.5);
    expect(plateOf(game).plateTop.position.y).toBeCloseTo(up, 2);
  });

  it('comes back shut when the stage is retried', () => {
    const game = makeGame(['#######', '#@..p.#', '#P#####']);
    step(game, 1, 0);
    step(game, 1, 0);
    step(game, 1, 0);
    expect(gateOf(game).open).toBe(true);

    game.tilemap.reset();
    expect(gateOf(game).open).toBe(false);
    expect(plateOf(game).pressed).toBe(false);
  });
});
