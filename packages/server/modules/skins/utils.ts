import type { Skin } from '../../types/api';
import type { SkinRow } from '../../types/database';

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

interface SkinTemplateInput {
  id?: string;
  name: string;
  version?: string;
  source?: string;
  terms?: Record<string, unknown>;
  background?: string;
  truth?: string;
  clues?: unknown[];
  noises?: unknown[];
  memoryExamples?: unknown[];
  memory_examples?: unknown[];
  enabled?: boolean;
}

function skinToRow(template: SkinTemplateInput): SkinRow {
  return {
    id: template.id || slugifyId(template.name),
    name: template.name,
    version: template.version || 'v3.2',
    source: template.source || 'admin',
    terms_json: toJson(template.terms || {}),
    background: template.background || '',
    truth: template.truth || '',
    clues_json: toJson(template.clues || []),
    noises_json: toJson(template.noises || []),
    memory_examples_json: toJson(template.memoryExamples || template.memory_examples || []),
    enabled: Number(template.enabled !== false),
    created_at: '',
    updated_at: '',
  };
}

function rowToSkin(row: SkinRow | undefined | null): Skin | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    source: row.source,
    terms: parseJson<Record<string, unknown>>(row.terms_json, {}),
    background: row.background,
    truth: row.truth,
    clues: parseJson<unknown[]>(row.clues_json, []),
    noises: parseJson<unknown[]>(row.noises_json, []),
    memoryExamples: parseJson<unknown[]>(row.memory_examples_json, []),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugifyId(text: string | undefined): string {
  const slug = String(text || 'skin').toLowerCase().replace(/\s+/g, '-').replace(/[^\w一-鿿-]/g, '');
  return `skin-${slug || Date.now()}`;
}

interface RawImportInput {
  id?: string;
  name?: string;
  version?: string;
  source?: string;
  terms?: Record<string, unknown>;
  background?: string;
  truth?: string;
  clues?: unknown[];
  noises?: unknown[];
  memoryExamples?: unknown[];
  memory_examples?: unknown[];
  enabled?: boolean;
  [key: string]: unknown;
}

function normalizeImportedSkin(raw: unknown): SkinTemplateInput {
  if (!raw || typeof raw !== 'object') throw new Error('皮肤导入失败：需要一个 JSON 对象。');
  const input = raw as RawImportInput;
  if (!input.name || !input.background || !input.truth || !Array.isArray(input.clues)) {
    throw new Error('皮肤导入失败：需要 name、background、truth、clues 字段。');
  }
  return {
    id: input.id || slugifyId(input.name),
    name: input.name,
    version: input.version || 'v3.2',
    source: input.source || 'json',
    terms: input.terms || {},
    background: input.background,
    truth: input.truth,
    clues: input.clues,
    noises: input.noises || [],
    memoryExamples: input.memoryExamples || input.memory_examples || [],
    enabled: input.enabled !== false,
  };
}

function getSkinImportTemplate(): Skin {
  return {
    id: 'skin-demo',
    name: '皮肤名称',
    version: 'v3.2',
    source: 'json',
    terms: {},
    background: '事件背景',
    truth: '真相',
    clues: [{ title: '线索标题', text: '线索内容' }],
    noises: [],
    memoryExamples: [],
    enabled: true,
    createdAt: '',
    updatedAt: '',
  };
}

export { toJson, parseJson, skinToRow, rowToSkin, slugifyId, normalizeImportedSkin, getSkinImportTemplate };
export type { SkinTemplateInput };
