/**
 * The stages, in the order they are played.
 *
 * Level *content* lives here; the rules live in `src/tilemap.js` (LEGEND there is the
 * vocabulary — every kind of tile there is, by name) and the characters that stand for
 * them in `src/glyphs.js`. Keeping them apart means a new stage is a data change, and a
 * new mechanic is a code change, and the two never have to happen in the same file.
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
 * @property {import('./types.js').Legend} [legend]  characters this stage binds for
 *   itself, merged over the default dialect in `src/glyphs.js`. A stage needs one only
 *   when it wants something the dialect has no character for — `{ k: 'key:rust' }` —
 *   or when a different character would read better on this particular map.
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
    "#@.#  ########",
    "#..#  ../'''/.",
    "#..#  #.     /",
    "#.#.....  .* '",
    "#.#ii# .#... /",
    "#..ii.###.   .",
    "###...###./'/.",
    "##############"
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
    '###..*..##',
    '###.....##',
    '####G#####',
    '#@..iiii.#',
    '####iii#.#',
    '#.iiii...#',
    '#.#i.#####',
    '#..i.ii..#',
    '#####g...#',
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
    "#.#/#'   '#",
    "#.#'#'   '#",
    "#.#\\#'   '#",
    "#.../'    #",
    '###########',
  ],
  upper: [
    [
      '###########',
      '#         #',
      '#         #',
      "#      '  #",
      '#      /  #',
      '#      ...#',
      '###########',
    ],
    [
      '###########',
      '#         #',
      '#      *  #',
      '#         #',
      '#         #',
      '#         #',
      '###########',
    ],
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
    '#~~~*.~~###',
    '#~~~..~~###',
    '#~~~~~~~###',
    '###~~~~####',
    '####~~~####',
    '#@.#~~~#..#',
    "#./'~~~'/.#",
    '#...~~~...#',
    '#...~~~...#',
    '~~~~~~~...#',
    '#..O~~~...#',
    "#./'~~~'/.#",
    '#...~~~...#',
    '###########',
  ],
  upper: [
    [
      '           ',
      '           ',
      '           ',
      '           ',
      '           ',
      '           ',
      '    ...    ',
      '           ',
      '           ',
      '           ',
      '           ',
      '    ...    ',
      '           ',
      '           ',
    ],
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
 * A crate, a plate and the gate it holds.
 *
 * The corridor is a dead end one tile past the plate on purpose. Holding a direction
 * is what a player actually does, and with floor beyond the plate that shoves the crate
 * straight over it and off the far side — the plate then reads as held only because the
 * player is standing on it, and the gate shuts the moment they walk away. Walling the
 * end means the obvious action parks the crate exactly where it belongs.
 *
 * The crate also starts between the player and the plate, so the plate cannot be
 * reached on foot at all: the crate is the only thing that can hold this gate.
 *
 * @type {Stage}
 */
const HEAVY_LIFTING = {
  id: 'heavy-lifting',
  name: 'Heavy Lifting',
  hint: 'A <b>crate</b> only moves away from you. A <b>plate</b> holds its gate open.',
  rows: [
    '###########',
    '#@.B....p##',
    '#.#########',
    '#.........#',
    '#.###P#####',
    '#####*#####',
    '###########',
  ],
};

/**
 * Teleport pads, which are the only way into the room the key is in — and the only way
 * out of it again, since the pad you arrive on will take you back the moment you step
 * off it and on again. So the pair is used twice, in both directions, and the white
 * door on the far side of the map is what makes the trip worth taking.
 *
 * @type {Stage}
 */
const TWO_PLACES = {
  id: 'two-places',
  name: 'Two Places at Once',
  hint: 'A <b>pad</b> takes you to the one wearing its colour. Both ways.',
  rows: [
    '###########',
    '#@..a#..wa#',
    '#....#....#',
    '#....#....#',
    '#.#########',
    '#.........#',
    '####W######',
    '####*######',
    '###########',
  ],
};

/**
 * Three storeys, which is the thing one deck cannot say: that a layer is not a special
 * case of the ground but just another floor, and that there is no last one.
 *
 * The room is a single open hall, and the climb spirals up over it. A stair in the
 * south-east corner puts you on the east deck; the east deck runs north and the north
 * deck runs west, both of them over floor you have already walked; a second stair — this
 * one authored on the deck, not on the ground — lifts you again, and the top deck runs
 * back east over the north deck to the star. So the cell the star sits in holds three
 * tiles at once: floor, deck, and the deck above that.
 *
 * Nothing is locked and nothing is timed. What the stage asks is that you look up,
 * find the way on above your head, and walk back over where you have been to reach it.
 *
 * @type {Stage}
 */
const THREE_STOREYS = {
  id: 'three-storeys',
  name: 'Three Storeys',
  hint: 'A <b>deck</b> can carry another. The way on is over where you have been.',
  rows: [
    '###########',
    '#@........#',
    '#.........#',
    '#.........#',
    '#.........#',
    "#......./'#",
    '###########',
  ],
  // The east and north decks at level 1, with the stair up to the top storey on the
  // deck itself; then the top deck at level 2, running back over the north one.
  upper: [
    ['           ', " '/....... ", '         . ', '         . ', '         . ', '           ', '           '],
    ['           ', '           ', ' ........* ', '           ', '           ', '           ', '           '],
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
    '#. ..G....X..Zw#',
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

/** @type {Stage} */
const KEYS = {
  id: 'keys',
  name: 'Keys',
  hint: 'Reach the <b>star</b>.',
  rows: [
    '#########################',
    '#@.i.iiiii#...#.........#',
    '#..iiii#ii#.*.#......g..#',
    '#ii.iiiiiiG...#.........#',
    '#iii#iii.i#...#.........#',
    '#ii.iiii.i#########R#####',
    '#i.iiiiiii#...~~~~~.~~~~~',
    '#i.iiiiiiiV...~~~~~.~~~~~',
    '#iiiiiiiii#-..~.........#',
    '#####..~###...~.r.#..B#.#',
    '#...|..~.O~..-~.........#',
    '#.v....~..~.......#...#.#',
    '#......~~~~...~.........#',
    '#######~~~~###~##########',
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
  TWO_PLACES,
  THREE_STOREYS,
  KEYS,
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
