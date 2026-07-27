import { describe, it, expect, vi } from 'vitest';
import { Campaign, LOCKED_NAME } from '../src/campaign.js';
import { Progress } from '../src/progress.js';

/** Three stand-in stages: the flow does not care what is in them. */
const STAGES = [
  { id: 'one', name: 'One', hint: '', rows: ['###', '#@#', '###'] },
  { id: 'two', name: 'Two', hint: '', rows: ['###', '#@#', '###'] },
  { id: 'three', name: 'Three', hint: '', rows: ['###', '#@#', '###'] },
];

/** A store that lives only as long as the test, so no run leaks into the next. */
function memoryStorage(data = new Map()) {
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** A campaign with nothing cleared. Pass a storage to share it with another one. */
const fresh = (storage = memoryStorage()) => new Campaign(STAGES, new Progress(storage));

/** Onto a stage, the way a player gets there: title -> list -> pick one. */
function playing(campaign, index = 0) {
  campaign.showLevels();
  campaign.selectStage(index);
  return campaign;
}

/** Clears every stage up to and including `index`, leaving the run on the list. */
function clearThrough(campaign, index) {
  for (let i = 0; i <= index; i++) {
    campaign.showLevels();
    campaign.selectStage(i);
    campaign.completeStage();
  }
  campaign.showLevels();
  return campaign;
}

describe('Campaign', () => {
  it('refuses to exist without a stage to play', () => {
    expect(() => new Campaign([], new Progress(null))).toThrow(/at least one stage/);
  });

  it('opens on the title screen, with the first stage ready', () => {
    const campaign = fresh();
    expect(campaign.phase).toBe('title');
    expect(campaign.isPlaying).toBe(false);
    expect(campaign.stage.id).toBe('one');
    expect(campaign.total).toBe(3);
  });

  it('goes from the title to the level list rather than into a stage', () => {
    const campaign = fresh();
    campaign.showLevels();
    expect(campaign.phase).toBe('levels');
    expect(campaign.isPlaying).toBe(false);
  });

  it('starts the stage picked from the list', () => {
    const campaign = fresh();
    campaign.showLevels();

    expect(campaign.selectStage(0)).toBe(true);
    expect(campaign.phase).toBe('playing');
    expect(campaign.isPlaying).toBe(true);
    expect(campaign.index).toBe(0);
  });

  it('pauses on the stage-clear panel, and only then moves on', () => {
    const campaign = playing(fresh());
    campaign.completeStage();

    expect(campaign.phase).toBe('stage-clear');
    // Still on the stage just finished, which is whose name the panel shows.
    expect(campaign.stage.id).toBe('one');

    campaign.next();
    expect(campaign.phase).toBe('playing');
    expect(campaign.stage.id).toBe('two');
  });

  it('finishes the game after the last stage rather than looking for another', () => {
    const campaign = playing(fresh());
    campaign.completeStage();
    campaign.next();
    campaign.completeStage();
    campaign.next();

    expect(campaign.stage.id).toBe('three');
    expect(campaign.isLastStage).toBe(true);

    campaign.completeStage();
    expect(campaign.phase).toBe('complete');
    expect(campaign.isPlaying).toBe(false);
  });

  it('retries the stage it died on, not the first one', () => {
    const campaign = playing(fresh());
    campaign.completeStage();
    campaign.next();

    campaign.die();
    expect(campaign.phase).toBe('dead');

    campaign.retry();
    expect(campaign.phase).toBe('playing');
    expect(campaign.stage.id).toBe('two');
  });

  it('restarts a wedged stage without a death first', () => {
    const campaign = playing(fresh());
    campaign.retry();
    expect(campaign.phase).toBe('playing');
    expect(campaign.index).toBe(0);
  });

  it('has nothing to retry on a screen with no stage in play', () => {
    const campaign = fresh();
    campaign.retry();
    expect(campaign.phase).toBe('title');

    campaign.showLevels();
    campaign.retry();
    expect(campaign.phase).toBe('levels');
  });

  it('ignores what cannot happen from the phase it is in', () => {
    const campaign = fresh();
    // Nothing has been started, so nothing can be cleared or died on.
    campaign.completeStage();
    campaign.die();
    expect(campaign.phase).toBe('title');

    playing(campaign);
    // `next` belongs to the stage-clear panel; mid-stage it must not skip a stage.
    campaign.next();
    expect(campaign.index).toBe(0);
    expect(campaign.phase).toBe('playing');
  });

  it('announces every phase change, with the stage it applies to', () => {
    const campaign = fresh();
    const onPhase = vi.fn();
    campaign.onPhase = onPhase;

    campaign.showLevels();
    campaign.selectStage(0);
    campaign.completeStage();
    campaign.next();

    expect(onPhase.mock.calls.map(([phase, stage]) => [phase, stage.id])).toEqual([
      ['levels', 'one'],
      ['playing', 'one'],
      ['stage-clear', 'one'],
      ['playing', 'two'],
    ]);
  });
});

describe('Campaign: the level list', () => {
  it('locks everything past the first stage on a first visit', () => {
    expect(fresh().levels()).toEqual([
      { index: 0, name: 'One', locked: false, completed: false },
      { index: 1, name: LOCKED_NAME, locked: true, completed: false },
      { index: 2, name: LOCKED_NAME, locked: true, completed: false },
    ]);
  });

  it('withholds the name of a locked stage', () => {
    // The point of the padlock is not knowing what is behind it, so the name must
    // not reach the page at all — not even hidden in the markup.
    const names = fresh()
      .levels()
      .filter((level) => level.locked)
      .map((level) => level.name);
    expect(names).toEqual([LOCKED_NAME, LOCKED_NAME]);
  });

  it('unlocks the next stage, and stars the one just cleared', () => {
    const campaign = playing(fresh());
    campaign.completeStage();
    campaign.showLevels();

    expect(campaign.levels()).toEqual([
      { index: 0, name: 'One', locked: false, completed: true },
      { index: 1, name: 'Two', locked: false, completed: false },
      { index: 2, name: LOCKED_NAME, locked: true, completed: false },
    ]);
  });

  it('unlocks on clearing a stage, not on moving past the panel', () => {
    // Quitting from the stage-clear panel must not cost the unlock it just earned.
    const campaign = playing(fresh());
    campaign.completeStage();
    expect(campaign.isUnlocked(1)).toBe(true);
  });

  it('refuses a locked stage rather than clamping to one that is open', () => {
    const campaign = fresh();
    campaign.showLevels();

    expect(campaign.selectStage(1)).toBe(false);
    expect(campaign.phase).toBe('levels');
    expect(campaign.index).toBe(0);
  });

  it('refuses a stage that is not on the list', () => {
    const campaign = fresh();
    campaign.showLevels();

    expect(campaign.selectStage(9)).toBe(false);
    expect(campaign.selectStage(-1)).toBe(false);
    expect(campaign.phase).toBe('levels');
  });

  it('replays a cleared stage without taking the clear back', () => {
    const campaign = clearThrough(fresh(), 1);

    expect(campaign.selectStage(0)).toBe(true);
    campaign.die();
    campaign.showLevels();

    expect(campaign.isCompleted(0)).toBe(true);
    expect(campaign.isUnlocked(2)).toBe(true);
  });

  it('only starts a stage from the list, not from a panel over one', () => {
    const campaign = playing(clearThrough(fresh(), 1), 1);
    campaign.die();

    expect(campaign.selectStage(0)).toBe(false);
    expect(campaign.phase).toBe('dead');
  });

  it('remembers what was cleared into the next visit', () => {
    const storage = memoryStorage();
    clearThrough(fresh(storage), 0);

    // A second Campaign over the same store is the next time the page is opened.
    const later = fresh(storage);
    expect(later.phase).toBe('title');
    expect(later.isCompleted(0)).toBe(true);
    expect(later.isUnlocked(1)).toBe(true);
    expect(later.isUnlocked(2)).toBe(false);
  });

  it('keeps a cleared stage open even with the one before it unfinished', () => {
    // A run saved against an older list, or one edited since. Progress may stall,
    // but a level someone has already earned is never taken back off them.
    const progress = new Progress(memoryStorage());
    progress.complete('three');
    const campaign = new Campaign(STAGES, progress);

    expect(campaign.isUnlocked(1)).toBe(false);
    expect(campaign.isUnlocked(2)).toBe(true);
  });
});

describe('Campaign: whether there is a stage on the screen', () => {
  /** The screens that stand on their own, with nothing loaded behind them. */
  it('has no stage on the title screen or the level list', () => {
    const campaign = fresh();
    expect(campaign.hasStage).toBe(false);

    campaign.showLevels();
    expect(campaign.hasStage).toBe(false);
  });

  it('has a stage while one is being played', () => {
    expect(playing(fresh()).hasStage).toBe(true);
  });

  it('keeps the stage behind the panels that end it', () => {
    // The one you just cleared, and the one that just killed you: both panels sit
    // over a stage that is still worth looking at.
    const campaign = playing(fresh());
    campaign.completeStage();
    expect(campaign.phase).toBe('stage-clear');
    expect(campaign.hasStage).toBe(true);

    campaign.next();
    campaign.die();
    expect(campaign.hasStage).toBe(true);
  });

  it('keeps the stage behind the exit prompt, which has to hand it back', () => {
    const campaign = playing(fresh());
    campaign.requestExit();

    expect(campaign.hasStage).toBe(true);
    campaign.cancelExit();
    expect(campaign.hasStage).toBe(true);
  });

  it('drops the stage on winning the game', () => {
    const campaign = clearThrough(fresh(), 1);
    campaign.selectStage(2);
    campaign.completeStage();

    expect(campaign.phase).toBe('complete');
    expect(campaign.hasStage).toBe(false);
  });

  it('drops the stage on the way out to the level list', () => {
    const campaign = playing(fresh());
    campaign.requestExit();
    campaign.showLevels();

    expect(campaign.hasStage).toBe(false);
  });
});

describe('Campaign: leaving a stage', () => {
  it('asks before abandoning a stage in play', () => {
    const campaign = playing(fresh());
    campaign.requestExit();

    expect(campaign.phase).toBe('confirm-exit');
    expect(campaign.isPlaying).toBe(false);
    expect(campaign.isPaused).toBe(true);
  });

  it('hands the stage back untouched when the prompt is dismissed', () => {
    const campaign = playing(clearThrough(fresh(), 1), 1);
    const onPhase = vi.fn();
    campaign.onPhase = onPhase;

    campaign.requestExit();
    campaign.cancelExit();

    expect(campaign.phase).toBe('playing');
    expect(campaign.index).toBe(1);
    // `resumed` is what tells the shell not to rebuild the stage under the player.
    expect(onPhase.mock.calls.map(([phase, , detail]) => [phase, detail.resumed])).toEqual(
      [
        ['confirm-exit', false],
        ['playing', true],
      ],
    );
  });

  it('marks a stage starting from the top as not resumed', () => {
    const campaign = fresh();
    const onPhase = vi.fn();
    campaign.onPhase = onPhase;

    campaign.showLevels();
    campaign.selectStage(0);
    campaign.retry();
    campaign.completeStage();
    campaign.next();

    const resumed = onPhase.mock.calls
      .filter(([phase]) => phase === 'playing')
      .map(([, , detail]) => detail.resumed);
    expect(resumed).toEqual([false, false, false]);
  });

  it('goes to the list once the prompt is answered', () => {
    const campaign = playing(fresh());
    campaign.requestExit();
    campaign.showLevels();

    expect(campaign.phase).toBe('levels');
  });

  it('leaves a half-played stage uncleared', () => {
    const campaign = playing(fresh());
    campaign.requestExit();
    campaign.showLevels();

    expect(campaign.isCompleted(0)).toBe(false);
    expect(campaign.isUnlocked(1)).toBe(false);
  });

  it('will not skip the prompt out of a stage in play', () => {
    const campaign = playing(fresh());
    campaign.showLevels();

    expect(campaign.phase).toBe('playing');
  });

  it('has no prompt to raise or dismiss off a stage', () => {
    const campaign = fresh();
    campaign.requestExit();
    expect(campaign.phase).toBe('title');

    campaign.showLevels();
    campaign.cancelExit();
    expect(campaign.phase).toBe('levels');
  });

  it('restarts the stage from the prompt, rather than resuming it', () => {
    // R on the prompt means what R means everywhere else: this stage, from the top.
    const campaign = playing(fresh());
    const onPhase = vi.fn();
    campaign.onPhase = onPhase;

    campaign.requestExit();
    campaign.retry();

    expect(campaign.phase).toBe('playing');
    expect(onPhase.mock.lastCall[2].resumed).toBe(false);
  });

  it('goes back to the title from the list, and forward again', () => {
    const campaign = fresh();
    campaign.showLevels();
    campaign.showTitle();
    expect(campaign.phase).toBe('title');

    campaign.showLevels();
    expect(campaign.phase).toBe('levels');
  });

  it('will not leave a stage in play for the title screen', () => {
    const campaign = playing(fresh());
    campaign.showTitle();
    expect(campaign.phase).toBe('playing');
  });
});
