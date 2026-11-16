import { playerExpression, type CompiledGame } from '@battle/engine';
import { makePlayers, runToEnd } from '@battle/engine/testing';
import { describe, expect, it } from 'vitest';
import { GAMES } from '../src';
import { DEBATE_SPEECH_MAX_CHARS, WEREWOLF_SPEECH_MAX_CHARS } from '../src/speechLimits';

const MAX_CHARS_TAG = '{{turn.maxChars}}';

describe.each(GAMES.map((game): [string, CompiledGame] => [game.spec.key, game]))('%s prompt length limits', (_key, game) => {
  const limit = game.spec.key === 'debate' ? DEBATE_SPEECH_MAX_CHARS : WEREWOLF_SPEECH_MAX_CHARS;
  it('never hardcodes a character count in templates', () => {
    for (const template of game.prompts.values()) expect(template.source, template.name).not.toMatch(/\d+\s*字/);
  });

  it('lets every speak and judge phase read turn.maxChars', () => {
    for (const [id, phase] of Object.entries(game.spec.phases)) {
      if (phase.kind !== 'speak' && phase.kind !== 'judge') continue;
      expect(phase.prompt.source, id).toContain(MAX_CHARS_TAG);
      if (phase.kind === 'speak') {
        expect(phase.output.safeParse({ speech: '字'.repeat(limit) }).success, id).toBe(true);
        expect(phase.output.safeParse({ speech: '字'.repeat(limit + 1) }).success, id).toBe(true);
      } else expect(phase.commentMax, id).toBe(limit);
    }
  });

  it('uses each seat’s suggested length in spoken prompts only', () => {
    const players = makePlayers(game.spec.players.max).map((player, index) => ({
      ...player,
      speechSettings: { speechMaxChars: index % 2 === 0 ? 80 : 350, temperature: 0.6, maxTokens: 3072 },
    }));
    const run = runToEnd(game, { seed: 1, players, maxAdvances: 2000 });
    const requests = run.requests.map(({ request }) => request).filter((request) => request.action === 'speak' || request.action === 'judge');
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      const field = request.action === 'speak' ? 'speech' : 'comment';
      expect(request.outputSchema).not.toHaveProperty(['properties', field, 'maxLength']);
      expect(request.prompt.instruction, request.id).toContain(`建议 ${players[request.seat - 1]!.speechSettings.speechMaxChars} 字以内`);
    }
  });

  it('includes the player expression guide exactly once for spoken turns across games', () => {
    const { requests } = runToEnd(game, { seed: 1, maxAdvances: 2000 });
    const cue = '朗读标记清单';
    for (const { request } of requests) {
      const spoken = request.action === 'speak' || request.action === 'judge';
      if (spoken) expect(request.prompt.identity, request.id).toContain(playerExpression);
      const layers = Object.values(request.prompt).join('\n');
      expect(layers.split(cue).length - 1, request.id).toBe(spoken ? 1 : 0);
    }
  });
});
