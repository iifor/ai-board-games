import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  getHostPosterPlayer,
  isVisualQaHostEnabled,
  resolvePlayerPoster,
} from '../../packages/client/src/components/PlayerPosterSpotlight/posters';


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

const EXPECTED_CUTOUTS = [
  'chatgpt.webp',
  'claude-code.webp',
  'deepseek.webp',
  'doubao.webp',
  'gemini.webp',
  'grok.webp',
  'host.webp',
  'kimi.webp',
  'meta.webp',
  'qwen.webp',
  'wenxin.webp',
  'xinghuo.webp',
  'yuanbao.webp',
  'zhipu.webp',
];

test('enables the host visual QA switch only for the exact development query', () => {
  assert.equal(isVisualQaHostEnabled('?visualQaHost=1', true), true);
  assert.equal(isVisualQaHostEnabled('?visualQaHost=1', false), false);
  assert.equal(isVisualQaHostEnabled('', true), false);
  assert.equal(isVisualQaHostEnabled('?visualQaHost=0', true), false);
  assert.equal(isVisualQaHostEnabled('%', true), false);
});

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

test('resolves a real default host cutout and preserves assigned host identity', () => {
  const fallback = getHostPosterPlayer();
  assert.equal(fallback.nickname, '主持人');
  assert.equal(fallback.avatar, '/player-poster-cutouts/host.webp');

  const assigned = getHostPosterPlayer({
    id: 7,
    nickname: '千问',
    avatar: '/avatars/qwen.png',
  });
  assert.equal(assigned.id, 7);
  assert.equal(resolvePlayerPoster(assigned, 'cutout'), '/player-poster-cutouts/qwen.webp');

  const malformed = getHostPosterPlayer({
    id: {},
    nickname: 123,
    name: false,
    avatar: {},
    avatarUrl: [],
    avatar_url: 5,
  });
  assert.equal(malformed.id, 'default-host');
  assert.equal(malformed.nickname, '主持人');
  assert.equal(malformed.avatar, '/player-poster-cutouts/host.webp');
});

test('ships the exact 13 optimized poster assets', () => {
  const posterDir = path.join(process.cwd(), 'packages', 'client', 'public', 'player-posters');
  const posterFiles = fs.readdirSync(posterDir).filter((file) => file.endsWith('.webp')).sort();
  assert.deepEqual(posterFiles, EXPECTED_POSTERS);
  for (const file of posterFiles) {
    assert.ok(fs.statSync(path.join(posterDir, file)).size > 50_000, `${file} should contain a real poster`);
  }
});

test('ships the exact 14 transparent speaker cutouts', () => {
  const cutoutDir = path.join(process.cwd(), 'packages', 'client', 'public', 'player-poster-cutouts');
  const cutoutFiles = fs.readdirSync(cutoutDir).filter((file) => file.endsWith('.webp')).sort();
  assert.deepEqual(cutoutFiles, EXPECTED_CUTOUTS);
  for (const file of cutoutFiles) {
    assert.ok(fs.statSync(path.join(cutoutDir, file)).size > 20_000, `${file} should contain a real cutout`);
  }
});

test('scopes poster spotlight wiring to v2 game routes', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const debateGame = read('packages/client/src/features/debate/DebateGame/index.tsx');
  const werewolfPlayback = read('packages/client/src/features/werewolf/hooks/useWerewolfSpeechPlayback.ts');
  const werewolfArena = read('packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx');
  const werewolfCss = read('packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css');
  const undercoverGame = read('packages/client/src/features/undercover/UndercoverGame/index.tsx');
  const app = read('packages/client/src/App.tsx');

  assert.match(debateGame, /variant = 'classic'/);
  assert.match(debateGame, /showPlayerPoster=\{variant === 'v2'\}/);
  assert.match(werewolfPlayback, /speakerRole:\s*event\?\.subtitle\?\.speakerRole \|\| ''/);
  assert.match(werewolfArena, /<PlayerPosterSpotlight/);
  assert.match(werewolfArena, /variant="cutout"/);
  assert.match(werewolfArena, /const hostSpeaking = props\.activeSpeech\?\.speakerRole === 'host'/);
  assert.match(werewolfArena, /getHostPosterPlayer\(props\.game\.host\)/);
  assert.match(werewolfArena, /data-speech-active=\{foregroundSpeech \|\| hostSpeaking/);
  assert.match(werewolfCss, /object-fit:\s*contain/);
  assert.match(
    werewolfCss,
    /\[data-speech-active='true'\]\s+\.interaction-stage\s*\{\s*display:\s*none;/,
  );
  assert.match(
    werewolfCss,
    /\.werewolf-v2-speaker-backdrop\s+\.player-poster-spotlight__card::after\s*\{\s*content:\s*none;/,
  );
  assert.doesNotMatch(werewolfCss, /player-poster-spotlight__backdrop/);
  assert.match(undercoverGame, /variant = 'classic'/);
  assert.match(undercoverGame, /showPlayerPoster=\{variant === 'v2'\}/);
  assert.match(app, /variant=\{route\.version === 'v2' \? 'v2' : 'classic'\}/);
});

test('keeps the spotlight accessible and resilient', () => {
  const component = fs.readFileSync(
    path.join(process.cwd(), 'packages', 'client', 'src', 'components', 'PlayerPosterSpotlight', 'index.tsx'),
    'utf8',
  );

  assert.match(component, /aria-live=\{decorative \? undefined : 'polite'\}/);
  assert.match(component, /正在发言/);
  assert.match(component, /onError=/);
  assert.match(component, /player-poster-spotlight__backdrop/);
  assert.match(component, /player-poster-spotlight__card/);
  assert.match(component, /variant = 'poster'/);
  assert.match(component, /resolvePlayerPoster\(player, variant\)/);
  assert.match(component, /variant === 'cutout'/);
  assert.match(component, /is-cutout/);
});

test('supports an empty stage instead of initials when a host image fails', () => {
  const component = fs.readFileSync(
    path.join(process.cwd(), 'packages', 'client', 'src', 'components', 'PlayerPosterSpotlight', 'index.tsx'),
    'utf8',
  );
  assert.match(component, /fallback = 'initials'/);
  assert.match(component, /!imageSource && fallback === 'none'/);
  assert.match(component, /aria-hidden=\{decorative \|\| undefined\}/);
});
