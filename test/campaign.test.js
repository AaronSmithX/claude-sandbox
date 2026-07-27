import { describe, it, expect, vi } from 'vitest';
import { Campaign } from '../src/campaign.js';

/** Three stand-in stages: the flow does not care what is in them. */
const STAGES = [
  { id: 'one', name: 'One', hint: '', rows: ['###', '#@#', '###'] },
  { id: 'two', name: 'Two', hint: '', rows: ['###', '#@#', '###'] },
  { id: 'three', name: 'Three', hint: '', rows: ['###', '#@#', '###'] },
];

const fresh = () => new Campaign(STAGES);

describe('Campaign', () => {
  it('refuses to exist without a stage to play', () => {
    expect(() => new Campaign([])).toThrow(/at least one stage/);
  });

  it('opens on the title screen, with the first stage ready', () => {
    const campaign = fresh();
    expect(campaign.phase).toBe('title');
    expect(campaign.isPlaying).toBe(false);
    expect(campaign.stage.id).toBe('one');
    expect(campaign.total).toBe(3);
  });

  it('starts the first stage', () => {
    const campaign = fresh();
    campaign.start();
    expect(campaign.phase).toBe('playing');
    expect(campaign.isPlaying).toBe(true);
    expect(campaign.index).toBe(0);
  });

  it('pauses on the stage-clear panel, and only then moves on', () => {
    const campaign = fresh();
    campaign.start();
    campaign.completeStage();

    expect(campaign.phase).toBe('stage-clear');
    // Still on the stage just finished, which is whose name the panel shows.
    expect(campaign.stage.id).toBe('one');

    campaign.next();
    expect(campaign.phase).toBe('playing');
    expect(campaign.stage.id).toBe('two');
  });

  it('finishes the game after the last stage rather than looking for another', () => {
    const campaign = fresh();
    campaign.start();
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
    const campaign = fresh();
    campaign.start();
    campaign.completeStage();
    campaign.next();

    campaign.die();
    expect(campaign.phase).toBe('dead');

    campaign.retry();
    expect(campaign.phase).toBe('playing');
    expect(campaign.stage.id).toBe('two');
  });

  it('restarts a wedged stage without a death first', () => {
    const campaign = fresh();
    campaign.start();
    campaign.retry();
    expect(campaign.phase).toBe('playing');
    expect(campaign.index).toBe(0);
  });

  it('goes back to the title with the run rewound', () => {
    const campaign = fresh();
    campaign.start();
    campaign.completeStage();
    campaign.next();
    campaign.restart();

    expect(campaign.phase).toBe('title');
    expect(campaign.index).toBe(0);
    expect(campaign.stage.id).toBe('one');
  });

  it('ignores what cannot happen from the phase it is in', () => {
    const campaign = fresh();
    // Nothing has been started, so nothing can be cleared or died on.
    campaign.completeStage();
    campaign.die();
    expect(campaign.phase).toBe('title');

    campaign.start();
    // `next` belongs to the stage-clear panel; mid-stage it must not skip a stage.
    campaign.next();
    expect(campaign.index).toBe(0);
    expect(campaign.phase).toBe('playing');
  });

  it('announces every phase change, with the stage it applies to', () => {
    const campaign = fresh();
    const onPhase = vi.fn();
    campaign.onPhase = onPhase;

    campaign.start();
    campaign.completeStage();
    campaign.next();

    expect(onPhase.mock.calls.map(([phase, stage]) => [phase, stage.id])).toEqual([
      ['playing', 'one'],
      ['stage-clear', 'one'],
      ['playing', 'two'],
    ]);
  });
});
