import type { TraceModelSettings } from './traces';
import type { PromptTrial } from './promptComparison';

export interface PromptCatalogItem {
  group: string;
  groupTitle: string;
  key: string;
  title: string;
  kind: '阶段任务' | '角色身份' | '游戏规则' | '平台契约' | '工具指令';
  usage: string[];
  variables: string[];
  pilot: boolean;
}

export type PromptExampleRef =
  | { kind: 'example'; index: number }
  | { kind: 'history'; matchId: string; requestId: string };

export interface PromptCatalogDetail {
  item: PromptCatalogItem;
  source: string;
  revision: number;
  defaultSource: string;
  examples: { label: string; ref: PromptExampleRef }[];
}

export interface CatalogPreview {
  source: string | null;
  rendered: string;
  draft: string | null;
  layers?: Readonly<Record<string, string>>;
}

export interface CatalogComparison {
  settings: TraceModelSettings;
  original: PromptTrial;
  modified: PromptTrial;
  rendered: string;
  draft: string;
}
