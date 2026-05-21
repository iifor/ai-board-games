import React from 'react';
import { Input, Select, Space } from 'antd';

export function ListFilterBar({ value = {}, onChange, searchPlaceholder = '搜索', selects = [] }) {
  const update = (patch) => onChange?.({ ...value, ...patch });
  return (
    <Space wrap className="admin-list-filters">
      <Input.Search
        allowClear
        value={value.q || ''}
        placeholder={searchPlaceholder}
        onChange={(event) => update({ q: event.target.value })}
        style={{ width: 260 }}
      />
      {selects.map((item) => (
        <Select
          key={item.key}
          allowClear
          value={value[item.key]}
          placeholder={item.placeholder}
          options={item.options}
          onChange={(next) => update({ [item.key]: next })}
          style={{ width: item.width || 160 }}
        />
      ))}
    </Space>
  );
}
