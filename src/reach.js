/**
 * Reachability over a parsed map, for the checks that ask whether a stage can be
 * finished at all rather than what happens on any one tile.
 *
 * Doors, water and pickups are treated as passable: keys and the tube are on the
 * critical path, and whether you can carry them is a question about the route, not
 * about the grid. What these functions are for is the two ways a map can be broken
 * outright — a star walled off, and a switch that seals you in.
 *
 * The fill walks *tiles*, not cells, so it understands layers and heights: it asks
 * the map which tile a step lands on, which makes a ledge a closed edge and a chute
 * a one-way one.
 *
 * This lives under `src/` rather than with the tests because the level editor asks
 * the same questions while a map is being typed, and the answer a stage is held to
 * in CI had better be the answer the editor gave. Nothing the game itself imports
 * reaches it, so it stays out of the game's bundle.
 */

/** @type {import('./types.js').Direction[]} */
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * How a tile is named in the returned set: a cell plus which layer of it.
 * @param {import('./types.js').Tile} tile
 */
export const tileKey = (tile) => `${tile.gx},${tile.gz},${tile.layer}`;

/**
 * A platform is joined to every storey it serves, however it happens to be parked
 * when the map is parsed — over the course of a stage it visits all of them.
 *
 * @param {import('./types.js').Tile} a
 * @param {import('./types.js').Tile} b
 */
function servedByElevator(a, b) {
  const lift = a.type === 'elevator' ? a : b.type === 'elevator' ? b : null;
  if (!lift) return false;
  const other = lift === a ? b : a;
  if (other.type === 'stair' || other.type === 'slide') return false;
  // A platform gets its travel from `_deriveElevators`, which refuses a lift that
  // goes nowhere — so an elevator without one has not been derived, and serves
  // nothing yet.
  if (lift.low === undefined || lift.high === undefined) return false;
  return other.level >= lift.low - 1e-6 && other.level <= lift.high + 1e-6;
}

/**
 * Flood fill from the spawn.
 *
 * @param {import('./tilemap.js').TileMap} map
 * @param {?string} [color] the colour whose raised obstacles block. Every other
 *   colour's obstacles are treated as passable, so one colour's puzzle cannot mask
 *   another's. The default, `null`, ignores obstacles altogether — which is what
 *   you want when asking whether the star can be got to at all, since a switch can
 *   always move the columns.
 * @returns {Set<string>} a `tileKey` for every tile reachable from the spawn
 */
export function reachableFrom(map, color = null) {
  const start = map.findSpawn();
  const first = map.get(start.gx, start.gz);
  // An unparsed map has no spawn tile to stand on, and nothing is reachable from
  // nowhere. The editor asks this of maps that are still being typed.
  if (!first) return new Set();

  const seen = new Set([tileKey(first)]);
  const queue = [first];

  /** @param {?import('./types.js').Tile} t */
  const passable = (t) => {
    if (!t || t.type === 'wall') return false;
    if (t.type === 'obstacle' && color !== null) {
      return t.color === color ? !map.isRaised(t) : true;
    }
    return true;
  };

  while (queue.length) {
    const tile = /** @type {import('./types.js').Tile} */ (queue.shift());

    // A pad is an edge to the far side of the map, not to a neighbour.
    if (tile.type === 'pad' && tile.partner && !seen.has(tileKey(tile.partner))) {
      seen.add(tileKey(tile.partner));
      queue.push(tile.partner);
    }

    for (const [dx, dz] of DIRECTIONS) {
      for (const to of map.column(tile.gx + dx, tile.gz + dz)) {
        if (!passable(to) || seen.has(tileKey(to))) continue;
        if (!map.isConnected(tile, to) && !servedByElevator(tile, to)) continue;
        seen.add(tileKey(to));
        queue.push(to);
      }
    }
  }
  return seen;
}

/**
 * Which phases of a switch's own colour leave that switch cut off from the spawn.
 *
 * A switch must be reachable in *both* phases. Checking only the phase a press
 * leads to from a pristine level is not enough: the trap this guards against needs
 * two presses — one to open the way in, and then the one inside, which closes it
 * again. Since either phase can be the one you arrive at, both have to be safe.
 *
 * @param {import('./tilemap.js').TileMap} map
 * @param {import('./types.js').Tile} tile
 * @returns {string[]} the offending phases, empty when the switch is always safe
 */
export function sealedIn(map, tile) {
  return ['A', 'B'].filter((phase) => {
    map.phase[tile.color ?? ''] = phase;
    return !reachableFrom(map, tile.color).has(tileKey(tile));
  });
}

/**
 * Every tile of a given type, on every layer, in row-major order.
 * @param {import('./tilemap.js').TileMap} map
 * @param {string} type
 */
export function tilesOfType(map, type) {
  return map.allTiles().filter((t) => t.type === type);
}
