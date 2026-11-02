import { Input, Select, Space } from 'antd';

/** 筛选值：键 q 为关键字，其余为下拉筛选；空值表示不筛选 */
export type FilterValues = Readonly<Record<string, string | undefined>>;

export interface FilterSelect {
  readonly key: string;
  readonly placeholder: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

interface Props {
  readonly value: FilterValues;
  readonly onChange: (next: FilterValues) => void;
  readonly searchPlaceholder: string;
  readonly selects?: readonly FilterSelect[] | undefined;
}

/** 列表筛选栏：关键字搜索 + 若干下拉筛选 */
export function ListFilterBar({ value, onChange, searchPlaceholder, selects = [] }: Props) {
  const set = (key: string, next: string | undefined) => onChange({ ...value, [key]: next || undefined });
  return (
    <Space wrap style={{ marginBottom: 12 }}>
      <Input.Search
        allowClear
        placeholder={searchPlaceholder}
        style={{ width: 260 }}
        value={value.q ?? ''}
        onChange={(event) => set('q', event.target.value)}
      />
      {selects.map((select) => {
        const selected = value[select.key];
        return (
          <Select<string>
            key={select.key}
            allowClear
            placeholder={select.placeholder}
            style={{ minWidth: 150 }}
            {...(selected === undefined ? {} : { value: selected })}
            options={[...select.options]}
            onChange={(next) => set(select.key, next)}
          />
        );
      })}
    </Space>
  );
}
