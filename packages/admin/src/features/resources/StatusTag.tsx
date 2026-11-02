import { Tag } from 'antd';

export function StatusTag({ enabled }: { readonly enabled: boolean }) {
  return enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>;
}
