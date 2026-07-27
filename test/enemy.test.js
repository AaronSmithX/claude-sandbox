import { describe, it, expect } from 'vitest';
import { Enemy, Enemies, PATTERNS } from '../src/enemy.js';
import { makeMap, makeGame, advance } from './helpers/level.js';

/** An enemy on a miniature map, paced one step per second starting immediately. */
function makeEnemy(rows, options = { interval: 1, phase: 0 }) {
  const tilemap = makeMap(rows);
  return new Enemy(tilemap, tilemap.enemySpawns[0], options);
}

/**
 * Negating a zero component yields -0, which is arithmetically identical to 0
 * everywhere a heading is used but not identical to assertions. Flatten it.
 */
const heading = ([dx, dz]) => [dx + 0, dz + 0];

describe('patterns', () => {
  it('reverses along a line', () => {
    expect(heading(PATTERNS.vertical.turn([0, 1]))).toEqual([0, -1]);
    expect(heading(PATTERNS.horizontal.turn([1, 0]))).toEqual([-1, 0]);
  });

  it('turns a quarter circle each way', () => {
    expect(heading(PATTERNS.clockwise.turn([1, 0]))).toEqual([0, 1]);
    expect(heading(PATTERNS.clockwise.turn([0, 1]))).toEqual([-1, 0]);
    expect(heading(PATTERNS.counterclockwise.turn([1, 0]))).toEqual([0, -1]);
    expect(heading(PATTERNS.counterclockwise.turn([0, -1]))).toEqual([-1, 0]);
  });

  it('rejects a pattern it does not know', () => {
    const tilemap = makeMap(['###', '#.#', '###']);
    expect(() => new Enemy(tilemap, { gx: 1, gz: 1, pattern: 'sideways' })).toThrow(
      /Unknown enemy pattern/,
    );
  });
});

describe('stepping', () => {
  it('carries straight on when the way is clear', () => {
    const enemy = makeEnemy(['#####', '#-..#', '#####']);
    enemy.step();
    expect([enemy.gx, enemy.gz]).toEqual([2, 1]);
  });

  it('bounces off the end of a corridor without losing a turn', () => {
    const enemy = makeEnemy(['####', '#-.#', '####']);
    enemy.step(); // 1 -> 2
    enemy.step(); // blocked by the wall, so it turns and moves the same step
    expect([enemy.gx, enemy.gz]).toEqual([1, 1]);
    expect(heading(enemy.dir)).toEqual([-1, 0]);
  });

  it('walks the perimeter of a room when turning clockwise', () => {
    const enemy = makeEnemy([
      '#####',
      '#)..#',
      '#...#',
      '#...#',
      '#####',
    ]);
    const path = [];
    for (let i = 0; i < 8; i++) {
      enemy.step();
      path.push([enemy.gx, enemy.gz]);
    }
    expect(path).toEqual([
      [2, 1],
      [3, 1],
      [3, 2],
      [3, 3],
      [2, 3],
      [1, 3],
      [1, 2],
      [1, 1],
    ]);
  });

  it('cannot cross water', () => {
    const enemy = makeEnemy(['####', '#-~#', '####']);
    enemy.step();
    expect([enemy.gx, enemy.gz]).toEqual([1, 1]); // turned around instead
  });

  it('holds position when walled in on all four sides', () => {
    const enemy = makeEnemy(['###', '#|#', '###']);
    enemy.step();
    expect([enemy.gx, enemy.gz]).toEqual([1, 1]);
  });
});

describe('timers', () => {
  it('steps when its interval comes round, and not before', () => {
    const enemy = makeEnemy(['#####', '#-..#', '#####']);
    let stepped = false;
    for (let frame = 0; frame < 59; frame++) stepped ||= enemy.update(1 / 60);
    expect(stepped).toBe(false); // 0.983s elapsed, interval is 1s
    expect(enemy.update(1 / 60)).toBe(true);
  });

  it('starts part-way through its cycle when given a phase', () => {
    const enemy = makeEnemy(['#####', '#-..#', '#####'], { interval: 1, phase: 0.9 });
    expect(enemy.update(0.11)).toBe(true); // 0.9 + 0.11 > 1
  });

  it('never banks steps, however long the frame was', () => {
    const enemy = makeEnemy(['#####', '#-..#', '#####']);
    enemy.update(5); // e.g. a backgrounded tab
    expect([enemy.gx, enemy.gz]).toEqual([2, 1]);
  });

  it('takes no step, and does not accumulate time, while frozen', () => {
    const enemy = makeEnemy(['#####', '#-..#', '#####']);
    for (let t = 0; t < 3; t += 1 / 60) enemy.update(1 / 60, true);
    expect([enemy.gx, enemy.gz]).toEqual([1, 1]);
    // Unfreezing must not immediately fire a backlogged step.
    expect(enemy.update(1 / 60)).toBe(false);
  });

  it('restores tile, heading and phase on reset', () => {
    const enemy = makeEnemy(['#####', '#-..#', '#####'], { interval: 1, phase: 0.25 });
    enemy.update(1.5);
    enemy.reset();
    expect([enemy.gx, enemy.gz]).toEqual([1, 1]);
    expect(enemy.dir).toEqual([1, 0]);
    expect(enemy._timer).toBeCloseTo(0.25);
  });

  it('drifts out of phase when two enemies keep different time', () => {
    const tilemap = makeMap(['######', '#-...#', '#-...#', '######']);
    const slow = new Enemy(tilemap, tilemap.enemySpawns[0], { interval: 1, phase: 0 });
    const quick = new Enemy(tilemap, tilemap.enemySpawns[1], { interval: 0.6, phase: 0 });
    for (let t = 0; t < 3; t += 1 / 60) {
      slow.update(1 / 60);
      quick.update(1 / 60);
    }
    expect(slow.gx).not.toBe(quick.gx);
  });

  it('gives each enemy of a level a different period', () => {
    // Production pacing: neighbouring spawns must not march in lockstep.
    const tilemap = makeMap(['######', '#-.-.#', '#-.-.#', '######']);
    const enemies = new Enemies(tilemap);
    const periods = enemies.list.map((e) => e.interval);
    expect(new Set(periods).size).toBe(periods.length);
    for (const period of periods) expect(period).toBeGreaterThan(0.5);
  });
});

describe('catching the player', () => {
  it('catches the player by standing on their tile', () => {
    const game = makeGame(['#####', '#@.-#', '#####'], {
      enemies: { interval: 0.2, phase: 0 },
    });
    advance(game, 2);
    expect(game.inventory.dead).toBe(true);
  });

  it('does not catch a player in another room', () => {
    const game = makeGame(
      ['#######', '#@#.-.#', '#######'],
      { enemies: { interval: 0.2, phase: 0 } },
    );
    advance(game, 3);
    expect(game.inventory.dead).toBe(false);
  });

  it('catches the player when the two swap tiles', () => {
    // Player at 1, enemy at 2, both stepping into each other's tile. Without the
    // pass-through check they would walk straight through one another.
    const game = makeGame(['#####', '#@-.#', '#####'], {
      enemies: { interval: 10, phase: 0 },
    });
    game.enemies.list[0].dir = [-1, 0]; // heading at the player
    game.player.tryMove(1, 0);
    game.enemies.step();

    expect(game.player.gx).toBe(2);
    expect(game.enemies.list[0].gx).toBe(1);
    expect(game.enemies.hits(game.player)).toBe(game.enemies.list[0]);
  });

  it('leaves the player alone once the level is won', () => {
    const game = makeGame(['#####', '#@*-#', '#####'], {
      enemies: { interval: 0.2, phase: 0 },
    });
    game.player.tryMove(1, 0);
    advance(game, 2);
    expect(game.inventory.won).toBe(true);
    expect(game.inventory.dead).toBe(false);
  });

  it('reports the death exactly once', () => {
    const game = makeGame(['#####', '#@.-#', '#####'], {
      enemies: { interval: 0.2, phase: 0 },
    });
    const deaths = advance(game, 3).filter((e) => e.died);
    expect(deaths).toHaveLength(1);
  });
});
