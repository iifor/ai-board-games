import type { TraceKind } from '@battle/shared';

export const KIND_LABELS: Record<TraceKind, string> = {
  phase: '阶段开始', request: '请求', decision: '决策', settlement: '规则结算',
  stage: '舞台事件', log: '内部事件', control: '控制', failure: '失败',
};

const LABELS: Readonly<Record<string, string>> = {
  speak: '发言', vote: '投票', act: '角色行动', judge: '评委判定',
  phase_started: '阶段播报', speech: '玩家发言', narration: '主持播报', action: '角色行动',
  vote_tallied: '计票', judgement: '评委点评', seat_eliminated: '玩家出局',
  revealed: '信息揭示', fallback: '兜底', game_over: '终局', step: '单步', run: '连续运行', skip: '跳过', continue: '继续',
};

export const traceLabel = (label: string) => LABELS[label] ?? label;

const PHASE_LABELS: Readonly<Record<string, string>> = {
  night_blocks: '夜间技能封锁播报',
  night_reset: '夜间状态重置', night_resolve: '夜间结算',
  witch_save: '使用解药', witch_poison: '使用毒药',
  sheriff_resolve: '警长选举结算', speech_direction: '指定发言顺序',
};

export const phaseLabel = (id: string | null) => id ? PHASE_LABELS[id] ?? id : '对局';
