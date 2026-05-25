import { Children, type ReactNode } from 'react';
import { Empty, Space, Tag, Typography } from 'antd';

const { Title } = Typography;

interface RelatedSectionProps {
  title: string;
  emptyText: string;
  children: ReactNode;
}

export function RelatedSection({ title, emptyText, children }: RelatedSectionProps) {
  const items = Children.toArray(children).filter(Boolean);

  return (
    <section className="admin-trace-related-section">
      <Title level={5}>{title}</Title>
      {items.length ? (
        <div className="admin-trace-related-list">{items}</div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      )}
    </section>
  );
}

interface RelationItemProps {
  title: string;
  tags?: Array<string | null | undefined>;
  onClick?: () => void;
}

export function RelationItem({ title, tags = [], onClick }: RelationItemProps) {
  return (
    <button className="admin-trace-relation-item" type="button" onClick={onClick}>
      <span className="admin-trace-relation-title">{title || '-'}</span>
      <Space size={[4, 4]} wrap>
        {tags.filter(Boolean).map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </Space>
    </button>
  );
}
