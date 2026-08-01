/**
 * Shared shapes, for the type checker.
 *
 * This file holds no code. It exists because the game's central object — a tile — is
 * a plain bag of fields built by spreading a legend entry, and a bag is exactly the
 * thing a checker cannot infer: `tile.run` is a stair's business, `tile.taken` a
 * pickup's, `tile.platform` an elevator's, and nothing that reads one of those can be
 * sure the field is there. Writing the shape down once means a typo in a field name
 * is an error rather than an `undefined` that quietly does nothing.
 *
 * Everything optional is optional because most tiles are not that kind of tile.
 */

/**
 * A grid direction: one step along x or z, never both.
 * @typedef {[number, number]} Direction
 */

/**
 * One tile of one stage — a cell of the map on a given layer.
 *
 * @typedef {object} Tile
 * @property {string} type      'wall' | 'floor' | 'water' | 'ice' | 'stair' | 'slide'
 *   | 'elevator' | 'door' | 'key' | 'tube' | 'star' | 'switch' | 'obstacle' | 'spawn'
 * @property {number} gx        column
 * @property {number} gz        row
 * @property {number} layer     0 is the ground, 1 a deck above it
 * @property {number} level     height in levels; fractional on a ramp, moving on a
 *   platform
 *
 * @property {string} [color]   which key, door, switch or obstacle this is
 * @property {string} [group]   'A' or 'B', for obstacles of one colour
 *
 * Appearance, and nothing else. Both name a look in `src/looks.js`, and no rule
 * anywhere reads either: a wall drawn as a rock blocks you exactly as a wall does,
 * which is the point of them being separate from `type`.
 * @property {string} [look]    how this tile's own body is drawn
 * @property {string} [ground]  how the slab beneath it is drawn, chosen independently
 *   of whatever stands on it
 *
 * @property {string} [enemy]   patrol pattern, when the tile is a spawn for one
 * @property {boolean} [startPressed]  a switch that begins held down
 * @property {boolean} [startUp]       a platform that begins at the top
 * @property {boolean} [block]         a crate stands here when the stage loads
 *
 * @property {boolean} [taken]   a pickup that has been collected
 * @property {boolean} [open]    a door that has been opened
 * @property {boolean} [pressed] a switch that is currently down
 *
 * @property {'x'|'z'} [run]     the axis a ramp may be taken along
 * @property {number} [low]      the lower storey a ramp or platform serves
 * @property {number} [high]     the upper one
 * @property {Direction} [up]    towards the higher end
 * @property {Direction} [dir]   the way a slide falls, or a stair descends
 * @property {number[]} [joins]  the levels at a ramp's two ends
 * @property {number} [phase]    where a platform starts in its cycle, 0..1
 * @property {Tile} [partner]    the other end of a teleport pad
 *
 * @property {number} baseY      the height everything on this tile is placed from
 * @property {any} [mesh]        the tile's own object, if it has one
 * @property {any} [swing]       a door's hinged group
 * @property {any} [columns]     an obstacle's four posts
 * @property {any} [button]      a switch's button
 * @property {any} [platform]    an elevator's moving plate
 * @property {any} [bars]        a gate's bars, which drop into the floor when open
 * @property {any} [plateTop]    a pressure plate's face
 * @property {any} [spinner]     a pickup's turning group
 * @property {number} [bobBase]  the height a pickup bobs about
 * @property {any} [idleColor]
 * @property {any} [downColor]
 * @property {any} [idleEmissive]
 * @property {any} [downEmissive]
 */

/**
 * What a legend character says a tile is: the kind of thing it makes, and none of
 * where it is — the parser fills that in.
 * @typedef {Omit<Partial<Tile>, 'type'> & {type: string}} TileDef
 */

/**
 * What the characters of a map mean: each one bound to a name from the vocabulary in
 * `src/tilemap.js`, or to a def written out in full for a one-off that isn't worth a
 * name. `src/glyphs.js` holds the dialect every map starts from; a stage's own legend
 * is merged over it.
 * @typedef {Record<string, string | TileDef>} Legend
 */

/**
 * One simulation step's worth of world: what `tickWorld` is handed. The tilemap and
 * the enemies are swapped when a stage changes; the rest live for the whole run.
 *
 * @typedef {object} World
 * @property {import('./tilemap.js').TileMap} tilemap
 * @property {import('./player.js').Player} player
 * @property {import('./enemy.js').Enemies} enemies
 * @property {import('./inventory.js').Inventory} inventory
 * @property {import('./particles.js').Particles} [particles]
 * @property {import('./blocks.js').Blocks} [blocks]
 */

export {};
