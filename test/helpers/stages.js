/**
 * The levels the tests play, and the only ones they may.
 *
 * No test that plays a level reads `src/levels.js`. A test that walks a route is a
 * test about the rules — that a key opens the door of its colour, that a slide carries
 * you on until something stops you, that a deck and the water under it are both real —
 * and the level it walks is only the smallest arrangement that puts the question.
 * Reading those routes out of the game's own stages tied the two together the wrong way
 * round: redrawing a stage broke tests that were never about that stage, and the stages
 * are playtested by a person, which is the only way a level is ever really judged.
 *
 * (One file still reads the game's stages, and deliberately: `test/levels.test.js`
 * runs the authoring checks over them, which say whether a stage is loadable and
 * finishable at all and nothing whatever about how it plays. It has no route in it to
 * go stale, so it never stands in the way of an edit — it only speaks up when a stage
 * is broken.)
 *
 * So these are copies, taken from the stages as they stood, and they are meant to sit
 * still. A stage in the game can be redrawn, renamed, reordered or dropped and nothing
 * here notices. A fixture changes only when the rule it asks about changes — and then
 * the route below it changes in the same commit, which is exactly the coupling you do
 * want.
 *
 * They are named for what they are made of rather than for the stage they came from,
 * since the stage is free to become something else tomorrow.
 *
 * @typedef {object} Fixture
 * @property {string} id
 * @property {string} name
 * @property {string} hint
 * @property {string[]} rows        the ground layer
 * @property {string[][]} [upper]   further layers, lowest first
 */

/**
 * A fixture as `new TileMap` wants it: the ground grid first, then anything over it.
 * The same shape `stageLayers` makes of a stage, kept here so `test/` needs nothing
 * from the game's level file at all.
 *
 * @param {Fixture} fixture
 * @returns {string[][]}
 */
export const layersOf = (fixture) => [fixture.rows, ...(fixture.upper ?? [])];

/** Movement and nothing else: a corridor with two dead ends. @type {Fixture} */
export const CORRIDOR = {
  id: 'corridor',
  name: 'Corridor',
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

/** Two keys and two doors, forced into order. @type {Fixture} */
export const TWO_DOORS = {
  id: 'two-doors',
  name: 'Two Doors',
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

/** Three ice runs, one per leg, the last of them ending on the star. @type {Fixture} */
export const ICE_RUNS = {
  id: 'ice-runs',
  name: 'Ice Runs',
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

/** Height: a stair up, a walkway round, and a chute down into a pen. @type {Fixture} */
export const WALKWAY = {
  id: 'walkway',
  name: 'Walkway',
  hint: 'A <b>stair</b> goes both ways. A <b>chute</b> only goes down.',
  rows: [
    '###########',
    '#@..#     #',
    '#.#.# ### #',
    '#.#/# #*# #',
    '#.# # #\\# #',
    '#..       #',
    '###########',
  ],
  upper: [
    [
      '',
      '     .....',
      '     .   .',
      '     .   .',
      '   . .   .',
      '   .......',
    ],
  ],
};

/** A deck and the river under it, both real and both used. @type {Fixture} */
export const BRIDGE = {
  id: 'bridge',
  name: 'Bridge',
  hint: 'The <b>bridge</b> crosses the river. The river still goes under it.',
  rows: [
    '###########',
    '#@..~~~...#',
    '#./ ~~~ /.#',
    '#...~~~...#',
    '#...~~~...#',
    '#...~ ~...#',
    '#...~/~.O.#',
    '#...~*~...#',
    '#...~~~...#',
    '###########',
  ],
  upper: [
    ['', '', '   .....', '', '', '     .'],
  ],
};

/** A platform on its own clock, and a gantry only it can reach. @type {Fixture} */
export const LIFT = {
  id: 'lift',
  name: 'Lift',
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
  upper: [
    ['         ', '         ', '         ', '     ..w ', '         ', '         ', '         '],
  ],
};

/** A crate, the plate it has to be parked on, and the gate that holds. @type {Fixture} */
export const CRATE_AND_PLATE = {
  id: 'crate-and-plate',
  name: 'Crate and Plate',
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

/** A pair of pads, used in both directions. @type {Fixture} */
export const PAD_PAIR = {
  id: 'pad-pair',
  name: 'Pad Pair',
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
 * Nine rooms with every mechanic in them and patrols on the floor. Big enough to be
 * the one fixture worth asking "does a whole level still hold together" of.
 * @type {Fixture}
 */
export const EVERYTHING = {
  id: 'everything',
  name: 'Everything',
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

/** The grid of `EVERYTHING`, for the tests that only want a big map. */
export const BIG_MAP = EVERYTHING.rows;

/** Every fixture, for the tests that want to sweep the lot. @type {Fixture[]} */
export const FIXTURES = [
  CORRIDOR,
  TWO_DOORS,
  ICE_RUNS,
  WALKWAY,
  BRIDGE,
  LIFT,
  CRATE_AND_PLATE,
  PAD_PAIR,
  EVERYTHING,
];
