import React, { useCallback, useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminRequest } from '../../services/adminApi';
import { GAME_LABELS } from '../../constants/adminConstants';

const { Title } = Typography;

const STATUS_MAP = { recording: '进行中', completed: '已完成', error: '错误' };
const STATUS_COLORS = { recording: 'processing', completed: 'success', error: 'error' };

export function TraceExplorer() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gameType, setGameType] = useState(null);
  const [status, setStatus] = useState(null);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (gameType) params.set('gameType', gameType);
      if (status) params.set('status', status);
      params.set('limit', '100');
      const data = await adminRequest(`/traces?${params.toString()}`);
      setTraces(Array.isArray(data) ? data : []);
    } catch { setTraces([]); }
    finally { setLoading(false); }
  }, [gameType, status]);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  function confirmRemove(trace) {
    Modal.confirm({
      title: '删除观测数据',
      content: `确认删除 Trace「${trace.id}」吗？相关 Span、LLM 调用、Agent 决策、快照和事件数据会一并删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          await adminRequest(`/traces/${trace.id}`, { method: 'DELETE' });
          message.success('观测数据已删除');
          await fetchTraces();
        } catch (error) {
          message.error(error.message);
        }
      }
    });
  }

  const columns = [
    {
      title: 'Trace ID', dataIndex: 'id', key: 'id', width: 280,
      render: (id) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
    },
    {
      title: '类型', dataIndex: 'game_type', key: 'game_type', width: 100,
      render: (type) => <Tag>{GAME_LABELS[type] || type}</Tag>
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s) => <Tag color={STATUS_COLORS[s] || 'default'}>{STATUS_MAP[s] || s}</Tag>
    },
    { title: 'LLM 调用', dataIndex: 'llm_call_count', key: 'llm_call_count', width: 90 },
    { title: '决策数', dataIndex: 'agent_decision_count', key: 'agent_decision_count', width: 80 },
    { title: '事件数', dataIndex: 'event_count', key: 'event_count', width: 80 },
    {
      title: '耗时', dataIndex: 'duration_ms', key: 'duration_ms', width: 100,
      render: (ms) => ms ? `${(ms / 1000).toFixed(1)}s` : '-'
    },
    {
      title: '时间', dataIndex: 'created_at', key: 'created_at', width: 180,
      render: (t) => t ? new Date(t).toLocaleString() : '-'
    },
    {
      title: '操作', key: 'actions', width: 160, fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/traces/${record.id}`);
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              confirmRemove(record);
            }}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div className="admin-trace-page">
      <Title level={3}>AI 对局观测</Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Select
            allowClear placeholder="游戏类型" style={{ width: 140 }}
            value={gameType} onChange={setGameType}
            options={[
              { value: 'werewolf', label: '狼人杀' },
              { value: 'debate', label: '辩论赛' }
            ]}
          />
          <Select
            allowClear placeholder="状态" style={{ width: 120 }}
            value={status} onChange={setStatus}
            options={[
              { value: 'completed', label: '已完成' },
              { value: 'error', label: '错误' }
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchTraces}>查询</Button>
        </Space>
      </Card>
      <Table
        className="admin-trace-table"
        rowKey="id" columns={columns} dataSource={traces}
        loading={loading} size="small" scroll={{ x: 1160, y: 'calc(100vh - 260px)' }}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [15, 20] }}
        rowClassName="admin-trace-row"
        onRow={(record) => ({ onClick: () => navigate(`/traces/${record.id}`) })}
      />
    </div>
  );
}
