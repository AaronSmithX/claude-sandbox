/**
 * The stages, in the order they are played.
 *
 * Level *content* lives here; the rules that give the characters meaning live in
 * `src/tilemap.js` (see LEGEND there for what each one means). Keeping them apart
 * means a new stage is a data change, and a new mechanic is a code change, and the
 * two never have to happen in the same file.
 *
 * Each stage teaches one thing and then asks for it once more. The last one is the
 * whole vocabulary at once — everything the earlier stages introduced, on a single
 * map with patrols on it.
 *
 * @typedef {object} Stage
 * @property {string} id      stable slug, used by tests and save data
 * @property {string} name    shown on the stage-clear panel and in the HUD
 * @property {string} hint    one line of guidance, shown until the player moves
 * @property {string[]} rows  the map, one string per row of the grid
 */

/**
 * Movement only: a long opening corridor, which is where holding a direction
 * first pays off, and two dead ends so the way is a choice rather than a hallway.
 *
 * @type {Stage}
 */
const FIRST_STEPS = {
  id: 'first-steps',
  name: 'First Steps',
  hint: 'Reach the <b>star</b>. Hold a direction to keep walking.',
  rows: [
    '#########',
    '#@......#',
    '#.#####.#',
    '#.#...#.#',
    '#...#.*.#',
    '#########',
  ],
};

/**
 * Keys and doors, forced into order: the gold key sits one tile past the only way
 * down, the gold door is the only way to the violet key, and the violet door is
 * the only way to the star. Neither key can be skipped and neither door can be
 * walked around.
 *
 * @type {Stage}
 */
const LOCK_AND_KEY = {
  id: 'lock-and-key',
  name: 'Lock and Key',
  hint: 'A <b>key</b> opens a door of its own colour, and is spent doing so.',
  rows: [
    '###########',
    '#@.......g#',
    '########.##',
    '#...v..G..#',
    '#.#########',
    '#..V...*###',
    '###########',
  ],
};

/**
 * Three ice runs, one per leg, each the only way on: east across the top, west
 * along the middle, and east again into the star, so the last slide finishes the
 * stage. Every run ends on floor, so none of them can strand you.
 *
 * @type {Stage}
 */
const THIN_ICE = {
  id: 'thin-ice',
  name: 'Thin Ice',
  hint: 'Step onto <b>ice</b> and you keep going until something stops you.',
  rows: [
    '##########',
    '#@..iiii.#',
    '########.#',
    '#.iiii...#',
    '#.########',
    '#..iiiii*#',
    '##########',
  ],
};

/**
 * The original single-level game, kept whole as the finale: nine rooms on a 16x16
 * grid, chained so every mechanic sits on the critical path — ice corridor ->
 * gold door -> inner tube -> red switch -> pink switch -> white key -> violet
 * door -> cyan switch -> water crossing -> star.
 *
 * @type {Stage}
 */
const THE_GAUNTLET = {
  id: 'the-gauntlet',
  name: 'The Gauntlet',
  hint: 'Everything at once — and the floor is not empty this time.',
  rows: [
    '################',
    '#@...#1...#...##',
    '#....G....X..Zw#',
    '#..g.#.O..#...##',
    '#.i..#x..3#..z.#',
    '##i#############',
    '#2i|.#....#....#',
    '#....#~~~~.....#',
    '#....#~~~~#-...#',
    '#...v#....#....#',
    '##.####Y####W###',
    '#.iy.#)...#(...#',
    '#.i..V....#....#',
    '#.iii#....#..*.#',
    '#....#....#....#',
    '################',
  ],
};

/** Every stage, in play order. @type {Stage[]} */
export const STAGES = [FIRST_STEPS, LOCK_AND_KEY, THIN_ICE, THE_GAUNTLET];

/**
 * The finale's map, which is also the level the game shipped as before there were
 * stages. Exported by name because several tests are written against it.
 */
export const DEFAULT_MAP = THE_GAUNTLET.rows;
