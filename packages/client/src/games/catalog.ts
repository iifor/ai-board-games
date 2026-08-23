export type GameRouteVersion = 'v1' | 'v2';
export type GameIconName = 'debate' | 'werewolf' | 'undercover' | 'avalon';

export interface ClientGameDefinition {
  key: string;
  title: string;
  subtitle: string;
  tone: string;
  icon: GameIconName;
  selection: {
    min: number;
    max: number;
    recommended: number;
    label: string;
  };
  versions: readonly GameRouteVersion[];
  historyTitle: (game: Record<string, unknown>) => string;
}

const CLIENT_GAME_DEFINITIONS = [
  {
    key: 'debate',
    title: 'AI 辩论赛',
    subtitle: '正反攻辩与评委点评',
    tone: 'debate',
    icon: 'debate',
    selection: { min: 8, max: 12, recommended: 12, label: '8-12 人' },
    versions: ['v1', 'v2'],
    historyTitle: (game) => {
      const topic = game.topic as Record<string, unknown> | undefined;
      return String(game.topicTitle || topic?.title || game.id || '辩论赛');
    },
  },
  {
    key: 'werewolf',
    title: 'AI 狼人杀',
    subtitle: '12人标准场与扩展模式',
    tone: 'wolf',
    icon: 'werewolf',
    selection: { min: 12, max: 12, recommended: 12, label: '固定 12 人' },
    versions: ['v1', 'v2'],
    historyTitle: (game) => {
      const event = game.event as Record<string, unknown> | undefined;
      const mode = event?.werewolfMode as Record<string, unknown> | undefined;
      return String(game.modeName || mode?.name || game.mode || '标准局');
    },
  },
  {
    key: 'undercover',
    title: 'AI 谁是卧底',
    subtitle: '6人语言推理局',
    tone: 'undercover',
    icon: 'undercover',
    selection: { min: 6, max: 6, recommended: 6, label: '固定 6 人' },
    versions: ['v1', 'v2'],
    historyTitle: (game) => String(game.modeName || '标准 6 人局'),
  },
  {
    key: 'avalon',
    title: 'AI 阿瓦隆',
    subtitle: '组队、密投与梅林刺杀',
    tone: 'avalon',
    icon: 'avalon',
    selection: { min: 5, max: 5, recommended: 5, label: '固定 5 人' },
    versions: ['v1', 'v2'],
    historyTitle: (game) => String(game.modeName || '标准 5 人局'),
  },
] as const satisfies readonly ClientGameDefinition[];

export type GameKey = (typeof CLIENT_GAME_DEFINITIONS)[number]['key'];

const definitionByKey = new Map<string, (typeof CLIENT_GAME_DEFINITIONS)[number]>(
  CLIENT_GAME_DEFINITIONS.map((definition) => [definition.key, definition]),
);

function getClientGameDefinition(gameKey: string): (typeof CLIENT_GAME_DEFINITIONS)[number] | null {
  return definitionByKey.get(gameKey) || null;
}

function isClientGameRoute(gameKey: string, version: GameRouteVersion): boolean {
  return getClientGameDefinition(gameKey)?.versions.includes(version) === true;
}

function isValidGameSelection(gameKey: string, playerIds: number[]): boolean {
  const selection = getClientGameDefinition(gameKey)?.selection;
  return Boolean(selection && playerIds.length >= selection.min && playerIds.length <= selection.max);
}

export {
  CLIENT_GAME_DEFINITIONS,
  getClientGameDefinition,
  isClientGameRoute,
  isValidGameSelection,
};
