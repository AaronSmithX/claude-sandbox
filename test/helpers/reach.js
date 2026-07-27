/**
 * Reachability over a parsed map, for the checks that ask whether a stage can be
 * finished at all rather than what happens on any one tile.
 *
 * Doors, water and pickups are treated as passable: keys and the tube are on the
 * critical path, and whether you can carry them is a question about the route, not
 * about the grid. What these functions are for is the two ways a map can be broken
 * outright — a star walled off, and a switch that seals you in.
 */

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const key = (gx, gz) => `${gx},${gz}`;

/**
 * Flood fill from the spawn.
 *
 * @param {object} map a TileMap
 * @param {?string} [color] the colour whose raised obstacles block. Every other
 *   colour's obstacles are treated as passable, so one colour's puzzle cannot mask
 *   another's. The default, `null`, ignores obstacles altogether — which is what
 *   you want when asking whether the star can be got to at all, since a switch can
 *   always move the columns.
 * @returns {Set<string>} `"gx,gz"` for every tile reachable from the spawn
 */
export function reachableFrom(map, color = null) {
  const start = map.findSpawn();
  const seen = new Set([key(start.gx, start.gz)]);
  const queue = [[start.gx, start.gz]];

  const passable = (t) => {
    if (!t || t.type === 'wall') return false;
    if (t.type === 'obstacle' && color !== null) {
      return t.color === color ? !map.isRaised(t) : true;
    }
    return true;
  };

  while (queue.length) {
    const [x, z] = queue.shift();
    for (const [dx, dz] of DIRECTIONS) {
      const t = map.get(x + dx, z + dz);
      if (!passable(t) || seen.has(key(t.gx, t.gz))) continue;
      seen.add(key(t.gx, t.gz));
      queue.push([t.gx, t.gz]);
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
 * @returns {string[]} the offending phases, empty when the switch is always safe
 */
export function sealedIn(map, tile) {
  return ['A', 'B'].filter((phase) => {
    map.phase[tile.color] = phase;
    return !reachableFrom(map, tile.color).has(key(tile.gx, tile.gz));
  });
}

/** Every tile of a given type, in row-major order. */
export function tilesOfType(map, type) {
  return map.tiles.flat().filter((t) => t.type === type);
}
