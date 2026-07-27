/**
 * Where you are in the run of stages: the title screen, a stage in progress, the
 * panel between two stages, a death, or the end of the game.
 *
 * Deliberately free of Three.js and the DOM, like inventory.js — this is the part
 * that decides what happens next, and the shell in main.js is what draws it. The
 * tests drive this class directly, so the flow they check is the flow that ships.
 *
 * @typedef {'title'|'playing'|'stage-clear'|'dead'|'complete'} Phase
 */
export class Campaign {
  /** @param {import('./levels.js').Stage[]} stages in play order; must not be empty */
  constructor(stages) {
    if (!stages.length) throw new Error('A campaign needs at least one stage');
    this.stages = stages;

    /**
     * Called with (phase, stage) whenever the phase changes, including the first
     * time. The shell listens to this and nothing else.
     * @type {((phase: Phase, stage: import('./levels.js').Stage) => void) | null}
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

  /** Which stage is loaded — during 'title' and 'complete' this is the first one. */
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

  /** Leaves the title screen for the first stage. */
  start() {
    this._index = 0;
    this._go('playing');
  }

  /**
   * The star has been reached. The last stage finishes the game; any other one
   * pauses on the stage-clear panel, so `next()` is what actually loads the
   * following stage.
   */
  completeStage() {
    if (this._phase !== 'playing') return;
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
   * wedged — which is why this is reachable at any time, not only after dying.
   */
  retry() {
    this._go('playing');
  }

  /** Back to the title screen, ready to play the whole run again. */
  restart() {
    this._index = 0;
    this._go('title');
  }

  /** @param {Phase} phase */
  _go(phase) {
    this._phase = phase;
    this.onPhase?.(phase, this.stage);
  }
}
