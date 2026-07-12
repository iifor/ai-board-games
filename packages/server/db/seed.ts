import { DEFAULT_MODELS } from '../modules/models/constants';
import { DEFAULT_PLAYERS } from '../modules/players/constants';
import { DEFAULT_WEREWOLF_MODES, DEFAULT_WEREWOLF_ROLES } from '../modules/werewolf-config/constants';

const DEFAULT_VOICE_PACKAGES = [
  {
    name: 'Default Chinese Female',
    provider: 'browser',
    voiceId: 'zh-CN-female',
    language: 'zh-CN',
    description: 'Browser Chinese female voice fallback',
    enabled: true,
  },
  {
    name: 'Default Chinese Male',
    provider: 'browser',
    voiceId: 'zh-CN-male',
    language: 'zh-CN',
    description: 'Browser Chinese male voice fallback',
    enabled: true,
  },
];

const DEFAULT_AZURE_VOICE_PACKAGES: Record<string, unknown>[] = [];
const DEFAULT_MIMO_VOICE_PACKAGES: Record<string, unknown>[] = [];

const EXECUTABLE_WEREWOLF_ACTIONS = new Set([
  'kill',
  'inspectFaction',
  'save',
  'poison',
  'guard',
  'selfDestruct',
  'shootOnDeath',
  'surviveExileOnce',
  'chooseMaster',
  'silence',
  'duel',
  'hug',
  'stalk',
  'charm',
  'inspectRoleType',
  'fear',
  'dream',
  'swap',
  'mark',
  'soloKill',
  'curse',
  'blackMerchantGift',
  'treeSurviveWolfHit',
  'youngerBrotherKill',
  'freeze',
  'foxInspect',
  'bearRoar',
  'blastVoters',
  'loseTailOnGoodDeath',
  'infect',
  'inspectRole',
  'request',
  'demonHunterHunt',
  'spiritWolfLearn',
  'spiritWolfInspect',
  'spiritWolfGuard',
  'spiritWolfAntidote',
  'wolfWitchCurse',
  'illusion',
  'hunterHunt',
  'voteOnly',
  'speakOnly',
]);

export {
  DEFAULT_PLAYERS,
  DEFAULT_MODELS,
  DEFAULT_VOICE_PACKAGES,
  DEFAULT_AZURE_VOICE_PACKAGES,
  DEFAULT_MIMO_VOICE_PACKAGES,
  DEFAULT_WEREWOLF_MODES,
  DEFAULT_WEREWOLF_ROLES,
  EXECUTABLE_WEREWOLF_ACTIONS,
};
