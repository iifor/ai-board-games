import React from 'react';
import { Empty, Space, Tag, Typography } from 'antd';

const { Title } = Typography;

export function RelatedSection({ title, emptyText, children }) {
  const items = React.Children.toArray(children).filter(Boolean);

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

export function RelationItem({ title, tags = [], onClick }) {
  return (
    <button className="admin-trace-relation-item" type="button" onClick={onClick}>
      <span className="admin-trace-relation-title">{title || '-'}</span>
      <Space size={[4, 4]} wrap>
        {tags.filter(Boolean).map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </Space>
    </button>
  );
}
