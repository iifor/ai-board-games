import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Select, Space, Table, Tag, Typography } from 'antd';
import { EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminRequest } from '../../services/adminApi';
import { GAME_LABELS } from '../../constants/adminConstants';

const { Title } = Typography;

const STATUS_MAP = { recording: '进行中', completed: '已完成', error: '错误' };
const STATUS_COLORS = { recording: 'processing', completed: 'success', error: 'error' };

export function TraceExplorer() {
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
      title: '操作', key: 'actions', width: 120, fixed: 'right',
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/traces/${record.id}`)}>
          查看
        </Button>
      )
    }
  ];

  return (
    <div>
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
        rowKey="id" columns={columns} dataSource={traces}
        loading={loading} size="small" scroll={{ x: 1100 }}
        pagination={{ pageSize: 30, showSizeChanger: false }}
      />
    </div>
  );
}
