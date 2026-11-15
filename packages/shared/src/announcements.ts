export interface AnnouncementDefinition {
  readonly key: string;
  readonly title: string;
  readonly group: string;
  readonly audience: 'public' | 'private';
  readonly defaultText: string;
  /** 此句允许并要求保留的变量，值用于编辑器示例。 */
  readonly examples: Readonly<Record<string, string>>;
}

export interface AnnouncementItem extends AnnouncementDefinition {
  /** 双花括号引擎模板使用公开对局上下文在服务端预览。 */
  readonly engineTemplate?: true;
  readonly customText: string | null;
  readonly revision: number;
}

export interface AnnouncementUpdate {
  readonly text: string | null;
  readonly revision: number;
}

export const ANNOUNCEMENT_MAX_LENGTH = 300;
export const ANNOUNCEMENT_TEMPLATE_MAX_LENGTH = 8000;
const placeholder = /\{([^{}]+)\}/g;

export function announcementProblem(text: string, examples: AnnouncementDefinition['examples']): string | null {
  if (!text.trim()) return '请输入播报内容';
  if (text.length > ANNOUNCEMENT_MAX_LENGTH) return `最多输入 ${ANNOUNCEMENT_MAX_LENGTH} 个字符`;
  if (/[{}]/.test(text.replace(placeholder, ''))) return '请检查变量两侧的花括号';
  const used = new Set(Array.from(text.matchAll(placeholder), match => match[1]!));
  for (const name of used) if (!Object.hasOwn(examples, name)) return `此条播报不能使用 {${name}}`;
  for (const name of Object.keys(examples)) if (!used.has(name)) return `请保留 {${name}}，用于播报实际结果`;
  return null;
}

export function formatAnnouncement(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(placeholder, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`播报缺少变量 {${key}}`);
    return String(values[key]);
  });
}
