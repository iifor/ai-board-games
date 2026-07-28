import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolvePlayerPoster } from '../../packages/client/src/components/PlayerPosterSpotlight/posters';


const EXPECTED_POSTERS = [
  'chatgpt.webp',
  'claude-code.webp',
  'deepseek.webp',
  'doubao.webp',
  'gemini.webp',
  'grok.webp',
  'kimi.webp',
  'meta.webp',
  'qwen.webp',
  'wenxin.webp',
  'xinghuo.webp',
  'yuanbao.webp',
  'zhipu.webp',
];

test('resolves built-in player aliases to stable public poster paths', () => {
  const cases = [
    ['豆包', 'doubao'],
    ['Grok', 'grok'],
    ['文心一言', 'wenxin'],
    ['Gemini', 'gemini'],
    ['Kimi', 'kimi'],
    ['DeepSeek', 'deepseek'],
    ['千问', 'qwen'],
    ['元宝', 'yuanbao'],
    ['讯飞星火', 'xinghuo'],
    ['智谱清言', 'zhipu'],
    ['  ChatGPT  ', 'chatgpt'],
    ['CLAUDE CODE', 'claude-code'],
    ['Meta AI', 'meta'],
  ] as const;

  for (const [nickname, slug] of cases) {
    assert.equal(resolvePlayerPoster({ nickname }), `/player-posters/${slug}.webp`);
  }
  assert.equal(resolvePlayerPoster({ nickname: '自定义玩家' }), null);
});

test('resolves transparent cutout paths without changing default poster paths', () => {
  const player = { nickname: 'Claude Code' };
  assert.equal(resolvePlayerPoster(player), '/player-posters/claude-code.webp');
  assert.equal(resolvePlayerPoster(player, 'cutout'), '/player-poster-cutouts/claude-code.webp');
  assert.equal(resolvePlayerPoster({ nickname: '自定义玩家' }, 'cutout'), null);
});

test('ships the exact 13 optimized poster assets', () => {
  const posterDir = path.join(process.cwd(), 'packages', 'client', 'public', 'player-posters');
  const posterFiles = fs.readdirSync(posterDir).filter((file) => file.endsWith('.webp')).sort();
  assert.deepEqual(posterFiles, EXPECTED_POSTERS);
  for (const file of posterFiles) {
    assert.ok(fs.statSync(path.join(posterDir, file)).size > 50_000, `${file} should contain a real poster`);
  }
});

test('scopes poster spotlight wiring to v2 game routes', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const debateGame = read('packages/client/src/features/debate/DebateGame/index.tsx');
  const werewolfArena = read('packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx');
  const undercoverGame = read('packages/client/src/features/undercover/UndercoverGame/index.tsx');
  const app = read('packages/client/src/App.tsx');

  assert.match(debateGame, /variant = 'classic'/);
  assert.match(debateGame, /showPlayerPoster=\{variant === 'v2'\}/);
  assert.match(werewolfArena, /<PlayerPosterSpotlight/);
  assert.match(undercoverGame, /variant = 'classic'/);
  assert.match(undercoverGame, /showPlayerPoster=\{variant === 'v2'\}/);
  assert.match(app, /variant=\{route\.version === 'v2' \? 'v2' : 'classic'\}/);
});

test('keeps the spotlight accessible and resilient', () => {
  const component = fs.readFileSync(
    path.join(process.cwd(), 'packages', 'client', 'src', 'components', 'PlayerPosterSpotlight', 'index.tsx'),
    'utf8',
  );

  assert.match(component, /aria-live="polite"/);
  assert.match(component, /正在发言/);
  assert.match(component, /onError=/);
  assert.match(component, /player-poster-spotlight__backdrop/);
  assert.match(component, /player-poster-spotlight__card/);
});
