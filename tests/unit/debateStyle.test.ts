import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildSystemPrompt } from '../../packages/server/modules/debate/prompts';
import { createDebateSkills } from '../../packages/server/modules/debate/skillRegistry';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('uses the approved cutout speaker and debate stage hooks', () => {
  const arena = read('packages/client/src/features/debate/components/DebateArena/index.tsx');
  const arenaCss = read('packages/client/src/features/debate-v2/DebateGameV2/index.css');
  const game = read('packages/client/src/features/debate/DebateGame/index.tsx');

  assert.match(arena, /className="debate-speaker-spotlight"/);
  assert.match(arena, /variant="cutout"/);
  assert.match(arenaCss, /\.debate-speaker-spotlight/);
  assert.match(game, /debate-stage-v2\.png/);
});

test('gives debate agents direct and phase-specific speaking rules', () => {
  const systemPrompt = buildSystemPrompt(
    {
      id: 1,
      nickname: '测试辩手',
      side: 'pro',
      sideIndex: 0,
      sideLabel: '正方',
      debateRole: 'captain',
      debateRoleLabel: '队长',
      personality: '直接、冷静',
    } as never,
    {
      title: 'AI 会让人类更自由，还是更依赖？',
      proPosition: 'AI 会让人类更自由',
      conPosition: 'AI 会让人类更依赖',
    },
    { id: 'opening', name: '立论环节', limit: 300 } as never,
  );
  const prompts = new Map(createDebateSkills().map((skill) => [skill.action, skill.prompt]));

  assert.match(systemPrompt, /先回应争点/);
  assert.match(systemPrompt, /真人现场发言/);
  assert.match(prompts.get('opening_argue') || '', /评判标准/);
  assert.match(prompts.get('free_speech') || '', /最新争点/);
  assert.match(prompts.get('crossfire_question') || '', /只问一个/);
  assert.match(prompts.get('crossfire_answer') || '', /第一句直接回答/);
  assert.match(prompts.get('closing_summary') || '', /不引入新的核心论点/);
  assert.match(prompts.get('judge_review') || '', /具体争点/);
});
