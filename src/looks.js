/**
 * How a tile is drawn, which is not what a tile is.
 *
 * A tile's `type` decides everything it *does* — whether you can walk onto it, how
 * tall it stands, what happens when you arrive. This file decides what it looks like
 * while doing it, and the two are deliberately separate axes. A `wall` is the thing
 * that blocks you; whether it reads as a grey block, a mossy rock or a tree is a
 * different question, and one no rule is allowed to ask. That is the whole point:
 * `src/reach.js` routes around `type === 'wall'`, `src/level-checks.js` counts walls
 * to know a door has something to span, and both keep working when a wall is drawn
 * as a tree, without either of them being told that trees exist.
 *
 * Two fields carry it, and a tile may have either, both or neither:
 *
 *   look     the tile's own body — the block a wall is drawn as, the card a tree is
 *   ground   the slab underneath it, chosen independently of what stands on it, so
 *            a switch can sit on stone while the floor beside it is grass
 *
 * A look is *data*, not a builder function, and that is load-bearing. `src/tilemap.js`
 * shares one geometry per distinct wall height and one material per kind across a
 * whole map; a function returning fresh meshes would defeat that sharing, and a
 * function that didn't would need the caches, the height and the position handed to
 * it — a descriptor with a closure round it and a worse type signature. Data also
 * survives being a string at rest, which is what a look is everywhere except here:
 * in `LEGEND`, in a stage's own legend, and in a saved level file.
 *
 * @typedef {object} Look
 * @property {'block'|'slab'|'billboard'} shape  what kind of thing to draw
 * @property {number} color      what is drawn before — or instead of — a texture. Every
 *   look must read correctly on colour alone: that is what the first frame shows while
 *   an image is still loading, and what a headless `{build: true}` test sees forever.
 * @property {number} [roughness]
 * @property {number} [metalness]
 * @property {number} [emissive]
 * @property {string} [texture]  key into `src/textures.js`; absent means colour only
 * @property {number[]} [variants]  tints picked per tile from its coordinates, so a
 *   wide floor is patterned rather than flat without anything being authored
 * @property {'checker'|'scatter'} [vary]  how `variants` are chosen. Default 'checker':
 *   strict alternation, which is what the floor has always done and is worth keeping,
 *   because a countable grid is how a player plans a route three tiles ahead. 'scatter'
 *   picks by a hash of the coordinates, for surfaces meant to read as mottled rather
 *   than as tiles — rock, dirt, sand.
 * @property {number} [tall]  billboard height, in tiles
 * @property {number} [wide]  billboard width, in tiles
 * @property {boolean} [internal]  a look the vocabulary offers no tile name for. Either
 *   something already named another way, or something that would read as a promise the
 *   tile cannot keep — see `ice` below.
 */

/**
 * Every look there is, by name.
 *
 * The numbers here are not new: they are the materials `src/tilemap.js` used to build
 * inline at the top of `_build`, moved out so that the thing choosing them can be a
 * lookup rather than a chain of conditionals.
 *
 * @type {Record<string, Look>}
 */
export const LOOKS = {
  // `internal`, because the name `wall` already says this: it is what a wall is drawn
  // as when nothing else is asked for, and `wall:wall` would be a second way to spell
  // a thing that already has a spelling.
  wall: { shape: 'block', color: 0x5a6270, roughness: 0.8, internal: true },
  // Two greens in strict alternation — the checkerboard the floor has always had. It
  // is not decoration: it is what lets a player count squares to a door.
  grass: { shape: 'slab', color: 0x2f5d3a, roughness: 0.9, variants: [0x2f5d3a, 0x356a42] },
  // Ice reads as ice by being the one bright, glossy thing on the floor: pale, almost
  // no roughness, and faintly lit so it stands out against the grass.
  //
  // `internal`, and this one matters. Being slippery is `type: 'ice'` and always will
  // be; this is only how ice looks. Offering `floor:ice` would let an author draw a
  // tile that promises a slide and then holds firm underfoot — the exact lie that
  // keeping appearance off the type axis is meant to make impossible. A stage that
  // genuinely wants frozen-looking solid ground can still say so with an inline def,
  // which is a deliberate sentence rather than a character that looks innocent.
  ice: {
    shape: 'slab',
    color: 0xcfe8f5,
    roughness: 0.06,
    metalness: 0.35,
    emissive: 0x24485c,
    internal: true,
  },
  // Stone for the sides of raised ground and the frame of a chute, so height reads as
  // built rather than as grass floating in the air.
  stone: { shape: 'slab', color: 0x4a5361, roughness: 0.85 },

  // --- Walls that are not grey blocks ---------------------------------------

  // Scattered rather than checkered: a rock face should not look like it was laid.
  rock: {
    shape: 'block',
    color: 0x6b6f76,
    roughness: 1,
    variants: [0x6b6f76, 0x767b83, 0x5f636a],
    vary: 'scatter',
    texture: 'rock',
  },
  brick: { shape: 'block', color: 0x8a4a3c, roughness: 0.9, texture: 'brick' },

  // --- Floors that are not grass --------------------------------------------

  flagstone: {
    shape: 'slab',
    color: 0x5b6068,
    roughness: 0.8,
    variants: [0x5b6068, 0x646a73],
    texture: 'flagstone',
  },
  sand: { shape: 'slab', color: 0xb5a678, roughness: 1, variants: [0xb5a678, 0xbfb083] },

  // --- Things that stand on a tile ------------------------------------------

  // A wall you cannot see over the top of, because it is a tree. White, so the image
  // shows its own colours rather than being tinted by the material under it. Taller
  // than a storey on purpose: at exactly 1.0 it reads as a bush.
  tree: { shape: 'billboard', color: 0xffffff, texture: 'tree', tall: 1.9, wide: 1.3 },
  dirt: {
    shape: 'slab',
    color: 0x6b4f3a,
    roughness: 1,
    variants: [0x6b4f3a, 0x745643, 0x634733],
    vary: 'scatter',
  },
};

/**
 * What a look may be called.
 *
 * The leading letter is not style, it is a collision guard. `tileDef` in
 * `src/tilemap.js` resolves `floor:N` — floor N levels up — with a regex, but only
 * *after* it has failed to find the name in `LEGEND`. Since looks generate
 * `floor:<name>` entries, a look called `2` would put `floor:2` in `LEGEND` and
 * silently shadow elevation 2 for every map in the game. A name that must start with a
 * letter can never be a number, so the two families cannot meet.
 */
const LOOK_NAME = /^[a-z][a-z0-9-]*$/;

// Checked when this module is imported rather than when a map uses one, so a bad name
// fails the whole suite on the first run instead of one stage at load time. There is
// no good moment later: by the time a map is being parsed, `LEGEND` has already been
// generated and the shadowing has already happened.
for (const name of Object.keys(LOOKS)) {
  if (!LOOK_NAME.test(name)) {
    throw new Error(`"${name}" is not a look name: looks must start with a letter`);
  }
}

/**
 * The look a name describes, or null if there is no such look.
 *
 * @param {string} name
 * @returns {Look|null}
 */
export function lookOf(name) {
  return LOOKS[name] ?? null;
}

/**
 * A tile's own number, derived from where it is.
 *
 * Deterministic on purpose. Two loads of a stage have to look the same, or a
 * `{build: true}` test asserting on a material would pass and fail at random, and a
 * player who restarts a level would watch the floor reshuffle under them.
 */
function hash(gx, gz) {
  return ((gx * 73856093) ^ (gz * 19349663)) >>> 0;
}

/**
 * Which tint this tile of a look wears. Looks with nothing to vary answer with their
 * one colour, which is most of them.
 *
 * @param {Look} look
 * @param {number} gx
 * @param {number} gz
 * @returns {number}
 */
export function variantOf(look, gx, gz) {
  const variants = look.variants;
  if (!variants || variants.length === 0) return look.color;
  const n = look.vary === 'scatter' ? hash(gx, gz) : gx + gz;
  return variants[n % variants.length];
}
