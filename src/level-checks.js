import { TileMap, KEY_COLORS } from './tilemap.js';
import { stageLayers } from './levels.js';
import { reachableFrom, sealedIn, tileKey, tilesOfType } from './reach.js';

/**
 * The checks a stage has to pass, as data rather than as assertions.
 *
 * These are the mistakes that are easy to make while authoring a map and impossible
 * to see by reading it: a star behind a wall, a door with no key anywhere, a switch
 * that seals you in, a door with no wall to fill. They are not a solver — a stage
 * that passes them can still be a bad stage; a stage that fails one cannot be
 * finished at all.
 *
 * The reason they are a function returning strings rather than a test file full of
 * `expect` calls is that two callers want them. `test/levels.test.js` runs them over
 * the shipped stages in CI, and the level editor runs them over a half-typed draft
 * on every keystroke. One copy means the editor cannot bless a level the suite will
 * later reject.
 *
 * @typedef {object} Check
 * @property {string} label what the stage is being asked, phrased so it reads as a
 *   test name: "can be walked from the spawn to the star".
 * @property {string[]} problems empty when the stage passes; otherwise one sentence
 *   per offending tile, naming where it is.
 */

/**
 * Exactly how `StageScene` loads one, so a stage that binds characters of its own is
 * held to the same checks as the rest.
 *
 * @param {import('./levels.js').Stage} stage
 * @param {boolean} [build] also construct the meshes
 */
const parse = (stage, build = false) =>
  new TileMap(stageLayers(stage), { build, legend: stage.legend });

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Runs every check over one stage.
 *
 * A map that does not parse cuts the list short: every check after the first needs a
 * `TileMap` to ask about, and a list of nine failures all caused by one bad character
 * tells the author less than the one error the parser gave.
 *
 * @param {import('./levels.js').Stage} stage
 * @returns {Check[]}
 */
export function checkStage(stage) {
  /** @type {TileMap} */
  let map;
  try {
    map = parse(stage);
  } catch (error) {
    return [{ label: 'parses', problems: [message(error)] }];
  }

  /** @type {Check[]} */
  const checks = [{ label: 'parses', problems: [] }];

  // The headless checks below never touch the mesh code, so this is what says a
  // stair, a chute or a raised floor can actually be put on the screen.
  checks.push({
    label: 'builds its meshes',
    problems: attempt(() => parse(stage, true)),
  });

  const spawns = tilesOfType(map, 'spawn');
  checks.push({
    label: 'has exactly one spawn',
    problems:
      spawns.length === 1
        ? []
        : [`${spawns.length} spawns — a stage starts the player in one place`],
  });

  const stars = tilesOfType(map, 'star');
  checks.push({
    label: 'has a star to find',
    problems: stars.length > 0 ? [] : ['no star — there is nothing to reach'],
  });

  const reachable = reachableFrom(map);
  checks.push({
    label: 'can be walked from the spawn to the star',
    problems: stars
      .filter((star) => !reachable.has(tileKey(star)))
      .map((star) => `the star at ${star.gx},${star.gz} is walled off from the spawn`),
  });

  checks.push({
    label: 'has a key somewhere for every door',
    problems: Object.keys(KEY_COLORS).flatMap((color) => {
      const doors = tilesOfType(map, 'door').filter((t) => t.color === color);
      const keys = tilesOfType(map, 'key').filter((t) => t.color === color);
      return keys.length >= doors.length
        ? []
        : [`${doors.length} ${color} door(s) but ${keys.length} ${color} key(s)`];
    }),
  });

  checks.push({
    label: 'has a plate somewhere for every gate',
    problems: tilesOfType(map, 'gate')
      .filter((gate) => !tilesOfType(map, 'plate').some((p) => p.color === gate.color))
      .map(
        (gate) => `the ${gate.color} gate at ${gate.gx},${gate.gz} has no plate to hold it`,
      ),
  });

  const solid = (gx, gz) => {
    const t = map.get(gx, gz);
    return !t || t.type === 'wall';
  };
  checks.push({
    label: 'gives every door and gate a wall to span',
    problems: [...tilesOfType(map, 'door'), ...tilesOfType(map, 'gate')]
      .filter(
        (door) =>
          !(solid(door.gx - 1, door.gz) && solid(door.gx + 1, door.gz)) &&
          !(solid(door.gx, door.gz - 1) && solid(door.gx, door.gz + 1)),
      )
      .map((door) => `the door at ${door.gx},${door.gz} stands in the open`),
  });

  /** @type {string[]} */
  const sealing = [];
  for (const tile of tilesOfType(map, 'switch')) {
    if (sealedIn(map, tile).length > 0) {
      sealing.push(
        `the ${tile.color} switch at ${tile.gx},${tile.gz} can be cut off from the spawn`,
      );
    }
    // `sealedIn` drives the map's phases to ask its question; every switch after
    // this one has to start from a pristine level.
    map.reset();
  }
  checks.push({ label: 'has no switch that can seal the player in', problems: sealing });

  return checks;
}

/**
 * Runs something for its exceptions alone.
 * @param {() => void} fn
 * @returns {string[]}
 */
function attempt(fn) {
  try {
    fn();
    return [];
  } catch (error) {
    return [message(error)];
  }
}
