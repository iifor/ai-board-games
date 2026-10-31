import type { Seat, Visibility } from '@battle/engine';

// 状态字段的可见性工具：只让对应角色或对应座位看到私密信息。

/** 只有这些角色本人能看到 */
export function roleOnly(...roles: readonly string[]): Visibility {
  return { project: (value: unknown, viewer: Seat) => (roles.includes(viewer.role) ? value : undefined) };
}

/** 按座位号索引的对象中属于 viewer 的那一项；没有时为空列表（模板可以直接 #if / #each） */
function ownEntry(value: unknown, viewer: Seat): unknown {
  if (value === null || typeof value !== 'object') return [];
  return (value as Record<string, unknown>)[String(viewer.seat)] ?? [];
}

/** 每个座位只看到自己那一项 */
export const ownList: Visibility = { project: ownEntry };

/** 预言家只能看到自己的查验记录；还没查验时为空列表 */
export const ownChecks: Visibility = {
  project: (value: unknown, viewer: Seat) => (viewer.role === 'seer' ? ownEntry(value, viewer) : undefined),
};
