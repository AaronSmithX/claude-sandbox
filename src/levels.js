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
 * @property {string[]} rows  the ground layer, one string per row of the grid
 * @property {string[][]} [upper]  further layers above the ground, lowest first — a
 *   space means "nothing here". This is what a bridge needs: a deck in the same cell
 *   as the water it crosses.
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
 * Height. A stair is the only way up onto the walkway, the walkway is the only way
 * round to the chute, and the chute is the only way into the pen the star sits in —
 * so the stage cannot be finished without going up and coming back down. The ledge
 * at the bottom left is deliberate: it is plainly a step up, and plainly not one
 * you can take.
 *
 * @type {Stage}
 */
const UP_AND_OVER = {
  id: 'up-and-over',
  name: 'Up and Over',
  hint: 'A <b>stair</b> goes both ways. A <b>chute</b> only goes down.',
  rows: [
    '###########',
    "#@..#'''''#",
    "#.#.#'###'#",
    "#.#/#'#*#'#",
    "#.#'#'#\\#'#",
    "#..'''''''#",
    '###########',
  ],
};

/**
 * A bridge, which is the thing height on one layer cannot do: the deck and the water
 * under it are both there, and both usable. The river is the only way to the star and
 * the bridge is the only way to the tube, so the stage asks for the deck first and
 * the water second — and the swim runs right under the span.
 *
 * @type {Stage}
 */
const OVER_AND_UNDER = {
  id: 'over-and-under',
  name: 'Over and Under',
  hint: 'The <b>bridge</b> crosses the river. The river still goes under it.',
  rows: [
    '###########',
    '#@..~~~...#',
    "#./'~~~'/.#",
    '#...~~~...#',
    '#...~~~...#',
    '#...~~~.O.#',
    '#...~*~...#',
    '#...~~~...#',
    '###########',
  ],
  // The deck: one span at level 1, over water that stays water.
  upper: [
    ['           ', '           ', '    ...    ', '           ', '           ', '           ', '           ', '           ', '           '],
  ],
};

/**
 * An elevator, and the waiting that comes with it: the platform is the only way up
 * to the gantry the key sits on, and the only way back down to the door it opens. It
 * dwells at each end long enough to step on and off, and joins nothing at all while
 * it is moving.
 *
 * @type {Stage}
 */
const GOING_UP = {
  id: 'going-up',
  name: 'Going Up',
  hint: 'The <b>platform</b> runs on its own clock. Be standing there when it is.',
  rows: [
    '#########',
    '#@......#',
    '#.......#',
    '#...e...#',
    '#.#W#...#',
    '###*#####',
    '#########',
  ],
  // The gantry, and the key on it: over the floor, reachable only by platform.
  upper: [
    ['         ', '         ', '         ', '     ..w ', '         ', '         ', '         '],
  ],
};

/**
 * A crate, a plate and the gate it holds. You cannot hold the plate down yourself and
 * be at the gate at the same time, so the crate has to do it — five shoves east along
 * the top corridor, and not one more: past the plate there is nowhere to stand to push
 * it back, and the stage is over. That is the shape of every crate puzzle, and it is
 * why R exists.
 *
 * @type {Stage}
 */
const HEAVY_LIFTING = {
  id: 'heavy-lifting',
  name: 'Heavy Lifting',
  hint: 'A <b>crate</b> only moves away from you. A <b>plate</b> holds its gate open.',
  rows: [
    '###########',
    '#@.B....p.#',
    '#.#######.#',
    '#.........#',
    '#.###P###.#',
    '#####*#####',
    '###########',
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
export const STAGES = [
  FIRST_STEPS,
  LOCK_AND_KEY,
  THIN_ICE,
  UP_AND_OVER,
  OVER_AND_UNDER,
  GOING_UP,
  HEAVY_LIFTING,
  THE_GAUNTLET,
];

/**
 * The finale's map, which is also the level the game shipped as before there were
 * stages. Exported by name because several tests are written against it.
 */
export const DEFAULT_MAP = THE_GAUNTLET.rows;

/**
 * The grids a stage is made of, ground first — which is what `new TileMap(...)`
 * takes. Most stages are one grid deep; a stage with a bridge is two.
 *
 * @param {Stage} stage
 * @returns {string[][]}
 */
export function stageLayers(stage) {
  return [stage.rows, ...(stage.upper ?? [])];
}
