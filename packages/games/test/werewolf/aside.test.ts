import { describe, expect, it } from 'vitest';
import { entries, first, play, requestsIn, type Override } from './helpers';

const SEED = 1;
const seer = first(SEED, 'seer');
const ASIDE = '首夜先验左手边，他发言最像在演';

/** 预言家第一夜查验时附带心里话 */
function seerAside(aside: string): Override {
  return (request) => {
    if (request.phaseId !== 'seer_check' || request.seat !== seer) return undefined;
    const target = request.legalTargets?.[0];
    return { targets: target === undefined ? [] : [target], aside };
  };
}

describe('key-action asides', () => {
  it('offers the optional aside only on key actions', () => {
    const run = play(SEED);
    const contract = (phaseId: string) => JSON.stringify(requestsIn(run, phaseId)[0]?.prompt ?? {});
    expect(contract('seer_check')).toContain('aside');
    expect(contract('exile_vote')).not.toContain('aside');
  });

  it('logs the aside before the action on the spectator channel, and keeps it out of every prompt', () => {
    const run = play(SEED, seerAside(ASIDE));
    const [aside] = entries(run, 'speech', 'seer_check');
    expect(aside).toMatchObject({ seat: seer, purpose: 'aside', text: ASIDE, channel: 'spectator' });
    const [action] = entries(run, 'action', 'seer_check');
    expect(aside!.seq).toBeLessThan(action!.seq);
    // 包括说话者本人在内，之后的任何请求都看不到这句心里话
    const prompts = run.requests.map(({ request }) => JSON.stringify(request.prompt));
    expect(prompts.some((prompt) => prompt.includes(ASIDE))).toBe(false);
  });

  it('writes nothing when the aside is blank, and rejects one that is too long', () => {
    const blank = play(SEED, seerAside('   '));
    expect(entries(blank, 'speech', 'seer_check')).toHaveLength(0);
    const long = play(SEED, seerAside('很'.repeat(61)));
    const retried = requestsIn(long, 'seer_check').filter((request) => request.seat === seer && request.attempt > 1);
    expect(retried.length).toBeGreaterThan(0);
  });
});
