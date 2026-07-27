import { Progress } from './progress.js';

/**
 * Where you are in the run of stages: the title screen, the level list, a stage in
 * progress, the prompt that asks before abandoning one, the panel between two
 * stages, a death, or the end of the game.
 *
 * Deliberately free of Three.js and the DOM, like inventory.js — this is the part
 * that decides what happens next, and the shell in main.js is what draws it. That
 * includes the level list: `levels()` returns rows to render, question marks and
 * all, so what a locked stage is called never reaches the page in the first place.
 * The tests drive this class directly, so the flow they check is the flow that
 * ships.
 *
 * @typedef {'title'|'levels'|'playing'|'confirm-exit'|'stage-clear'|'dead'|'complete'} Phase
 */

/**
 * One row of the level list.
 *
 * @typedef {object} LevelEntry
 * @property {number} index      where it sits in the run
 * @property {string} name       the stage's name, or '???' while it is locked
 * @property {boolean} locked    not reachable yet, and not clickable
 * @property {boolean} completed cleared at some point, in this session or a past one
 */

/** What a stage is called before it has been unlocked. */
export const LOCKED_NAME = '???';

export class Campaign {
  /**
   * @param {import('./levels.js').Stage[]} stages in play order; must not be empty
   * @param {Progress} [progress] where clearing a stage is remembered; defaults to
   *   local storage, and the tests pass one over a fake store instead.
   */
  constructor(stages, progress = new Progress()) {
    if (!stages.length) throw new Error('A campaign needs at least one stage');
    this.stages = stages;
    this.progress = progress;

    /**
     * Called with (phase, stage, detail) whenever the phase changes, including the
     * first time. `detail.resumed` marks the one 'playing' that is not a stage
     * starting from the top — backing out of the exit prompt returns you to the
     * stage as you left it, so the shell must not reload it. The shell listens to
     * this and nothing else.
     * @type {((phase: Phase, stage: import('./levels.js').Stage,
     *   detail: {resumed: boolean}) => void) | null}
     */
    this.onPhase = null;

    /** @type {Phase} */
    this._phase = 'title';
    this._index = 0;
  }

  /** @returns {Phase} */
  get phase() {
    return this._phase;
  }

  /** Which stage is loaded — on the title and level screens, the one played last. */
  get stage() {
    return this.stages[this._index];
  }

  get index() {
    return this._index;
  }

  get total() {
    return this.stages.length;
  }

  get isLastStage() {
    return this._index === this.stages.length - 1;
  }

  /** True while the player has control, which is the only time input matters. */
  get isPlaying() {
    return this._phase === 'playing';
  }

  /** True while a stage is loaded and paused behind the exit prompt. */
  get isPaused() {
    return this._phase === 'confirm-exit';
  }

  /**
   * Whether a stage should be on the screen at all. The title screen, the level list
   * and the win panel are whole screens in their own right and have nothing behind
   * them; the rest are panels over a stage that is still loaded — the one you just
   * cleared, the one that just killed you, or the one you are being asked whether to
   * abandon, which has to survive being asked.
   */
  get hasStage() {
    return STAGE_PHASES.has(this._phase);
  }

  /**
   * Whether a stage can be picked from the list. The first always can; the rest
   * open up as the one before them is cleared. A stage already cleared stays open
   * whatever happened to its neighbour, so a list edited between visits can never
   * take a level back off someone.
   * @param {number} index
   */
  isUnlocked(index) {
    if (index < 0 || index >= this.stages.length) return false;
    if (index === 0) return true;
    return (
      this.progress.has(this.stages[index - 1].id) ||
      this.progress.has(this.stages[index].id)
    );
  }

  /** @param {number} index */
  isCompleted(index) {
    const stage = this.stages[index];
    return stage ? this.progress.has(stage.id) : false;
  }

  /**
   * The level list, ready to render. A locked stage gives up its name here rather
   * than in the markup: the point of the padlock is that you do not yet know what
   * is behind it.
   * @returns {LevelEntry[]}
   */
  levels() {
    return this.stages.map((stage, index) => {
      const locked = !this.isUnlocked(index);
      return {
        index,
        name: locked ? LOCKED_NAME : stage.name,
        locked,
        completed: this.progress.has(stage.id),
      };
    });
  }

  /**
   * Opens the level list — from the title screen, and from every panel that ends a
   * stage. Not from a stage in play: that goes through the exit prompt.
   */
  showLevels() {
    if (this._phase === 'playing') return;
    this._go('levels');
  }

  /**
   * Back to the title screen. Only ever a look back at it: the level list is the
   * way into a stage, so there is nothing here to rewind.
   */
  showTitle() {
    if (this._phase === 'playing') return;
    this._go('title');
  }

  /**
   * Plays a stage picked from the list. A locked stage is refused rather than
   * clamped, so a stale list on the page cannot skip anyone ahead.
   * @param {number} index
   * @returns {boolean} whether the stage was started
   */
  selectStage(index) {
    if (this._phase !== 'levels') return false;
    if (!this.isUnlocked(index)) return false;
    this._index = index;
    this._go('playing');
    return true;
  }

  /**
   * The star has been reached. The stage is written down as cleared — which is what
   * unlocks the next one, whether or not the player goes on to it now. The last
   * stage finishes the game; any other one pauses on the stage-clear panel, so
   * `next()` is what actually loads the following stage.
   */
  completeStage() {
    if (this._phase !== 'playing') return;
    this.progress.complete(this.stage.id);
    this._go(this.isLastStage ? 'complete' : 'stage-clear');
  }

  /** Moves on from the stage-clear panel. */
  next() {
    if (this._phase !== 'stage-clear') return;
    this._index += 1;
    this._go('playing');
  }

  /** Caught by a patrol. The stage stays loaded; `retry()` is what restarts it. */
  die() {
    if (this._phase !== 'playing') return;
    this._go('dead');
  }

  /**
   * Plays the current stage again, from a death or from a stage the player has
   * wedged — which is why this is reachable mid-stage, not only after dying. There
   * is nothing to retry on the title, the level list or the end panels.
   */
  retry() {
    if (!RETRYABLE.has(this._phase)) return;
    this._go('playing');
  }

  /**
   * Asks before abandoning a stage: quitting is one key away, and the stage you
   * are halfway through is worth a confirmation. The stage stays loaded and
   * paused behind the prompt.
   */
  requestExit() {
    if (this._phase !== 'playing') return;
    this._go('confirm-exit');
  }

  /** Backs out of the prompt, into the stage exactly as it was left. */
  cancelExit() {
    if (this._phase !== 'confirm-exit') return;
    this._go('playing', true);
  }

  /**
   * @param {Phase} phase
   * @param {boolean} [resumed] true only for the 'playing' that returns to a stage
   *   already in progress, which must not be reloaded under the player
   */
  _go(phase, resumed = false) {
    this._phase = phase;
    this.onPhase?.(phase, this.stage, { resumed });
  }
}

/** The phases with a stage loaded that restarting means something for. */
const RETRYABLE = new Set(['playing', 'dead', 'confirm-exit']);

/** The phases with a stage loaded at all — a superset of the above. */
const STAGE_PHASES = new Set(['playing', 'confirm-exit', 'stage-clear', 'dead']);
