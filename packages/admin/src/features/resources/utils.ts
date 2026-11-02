import type { FilterSelect, FilterValues } from '../../components/ListFilterBar';

export interface ResourceFilter<Dto> {
  readonly key: string;
  readonly placeholder: string;
  /** 下拉选项，可由当前数据推导 */
  readonly options: (rows: readonly Dto[]) => FilterSelect['options'];
  readonly matches: (dto: Dto, value: string) => boolean;
}

export type SearchFields<Dto> = (dto: Dto) => readonly (string | number | null | undefined)[];

/** 客户端筛选：所有下拉条件都满足，且关键字匹配任一搜索字段（不区分大小写） */
export function applyFilters<Dto>(
  rows: readonly Dto[],
  filters: readonly ResourceFilter<Dto>[],
  values: FilterValues,
  search?: SearchFields<Dto>,
): Dto[] {
  const query = (values.q ?? '').trim().toLowerCase();
  return rows.filter((dto) => {
    const selected = filters.every((filter) => {
      const value = values[filter.key];
      return !value || filter.matches(dto, value);
    });
    if (!selected) return false;
    if (!query || !search) return true;
    return search(dto).some((field) => String(field ?? '').toLowerCase().includes(query));
  });
}

export function uniqueOptions(values: readonly (string | null | undefined)[], label: (value: string) => string = (value) => value): FilterSelect['options'] {
  const unique = [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
  return unique.map((value) => ({ value, label: label(value) }));
}

export function enabledFilter<Dto extends { readonly enabled: boolean }>(): ResourceFilter<Dto> {
  return {
    key: 'enabled',
    placeholder: '状态',
    options: () => [{ value: 'true', label: '启用' }, { value: 'false', label: '停用' }],
    matches: (dto, value) => String(dto.enabled) === value,
  };
}

export function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '';
}
