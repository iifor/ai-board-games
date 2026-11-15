import type { SkillKind } from './skillCatalog';

export interface SkillCue {
  readonly kind: SkillKind;
  readonly title: string;
  readonly actor: number | null;
  readonly targets: readonly number[];
  readonly sources?: readonly number[];
  readonly thaw?: readonly number[];
  readonly stage?: 'cast' | 'result';
  readonly route?: 'swap' | 'reflect' | 'redirect' | 'area' | 'gift' | 'learn' | 'shatter';
  /** 只能来自当前可见事件的结果文字，不能从 AudienceSeat.role 推导。 */
  readonly feedback?: string;
  readonly tone?: 'good' | 'evil' | 'neutral';
}

export interface SeatAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SkillMark {
  readonly seat: number;
  readonly kind: SkillKind;
  readonly label: string;
}
