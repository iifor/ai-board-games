import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  cancelWorkflowAiTask,
  createWorkflowInterrupt,
  getWorkflowDebug,
  resolveWorkflowInterrupt,
  retryWorkflowAiTask,
  tickWorkflowMatch
} from '../../services/adminApi';

const { Text, Paragraph } = Typography;

interface DebugRecord {
  id?: string | number;
  seq?: number;
  type?: string;
  status?: string;
  stepId?: string;
  action?: string;
  actionType?: string;
  effectType?: string;
  interruptType?: string;
  payload?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

export function WorkflowDebugConsole() {
  const [matchId, setMatchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<Record<string, unknown> | null>(null);
  const [form] = Form.useForm();
  const data = debug || {};
  const match = data.match as Record<string, unknown> | undefined;

  async function load(id = matchId) {
    if (!id.trim()) return;
    setLoading(true);
    try {
      const next = await getWorkflowDebug(id.trim());
      setDebug(next);
      setMatchId(id.trim());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: () => Promise<unknown>) {
    try {
      await action();
      message.success('操作已提交');
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败');
    }
  }

  const tabs = useMemo(() => [
    tableTab('events', 'Events', data.events as DebugRecord[], eventColumns),
    tableTab('aiTasks', 'AI Tasks', data.aiTasks as DebugRecord[], aiTaskColumns(runAction)),
    tableTab('pendingActions', 'Pending Actions', data.pendingActions as DebugRecord[], basicColumns),
    tableTab('actionWindows', 'Action Windows', data.actionWindows as DebugRecord[], basicColumns),
    tableTab('effects', 'Effects', data.effects as DebugRecord[], effectColumns),
    tableTab('interrupts', 'Interrupts', data.interrupts as DebugRecord[], interruptColumns(runAction)),
    tableTab('snapshots', 'Snapshots', data.snapshots as DebugRecord[], basicColumns)
  ], [data]);

  return (
    <section>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card title="Workflow Debug Console" size="small">
          <Space.Compact style={{ width: '100%' }}>
            <Input value={matchId} onChange={(event) => setMatchId(event.target.value)} placeholder="match id" onPressEnter={() => load()} />
            <Button type="primary" loading={loading} onClick={() => load()}>加载</Button>
            <Button disabled={!matchId} onClick={() => runAction(() => tickWorkflowMatch(matchId))}>Tick</Button>
          </Space.Compact>
        </Card>

        {match ? (
          <Row gutter={[12, 12]}>
            <Col span={8}><StatCard title="Status" value={String(match.status || '-')} /></Col>
            <Col span={8}><StatCard title="Workflow" value={String(match.workflowId || '-')} /></Col>
            <Col span={8}><StatCard title="Step Index" value={String(match.currentStepIndex ?? '-')} /></Col>
          </Row>
        ) : <Alert type="info" message="输入 matchId 查看 workflow 运行态、事件、任务、效果和中断。" showIcon />}

        {match && (
          <Card title="Create Interrupt" size="small">
            <Form form={form} layout="inline" onFinish={(values) => runAction(() => createWorkflowInterrupt(matchId, {
              interruptType: values.interruptType || 'manual_debug',
              stepId: values.stepId || null,
              effectId: values.effectId || null,
              priority: values.priority || 0,
              payload: { note: values.note || '' }
            }))}>
              <Form.Item name="interruptType"><Input placeholder="interrupt type" /></Form.Item>
              <Form.Item name="stepId"><Input placeholder="step id" /></Form.Item>
              <Form.Item name="effectId"><Input placeholder="effect id" /></Form.Item>
              <Form.Item name="priority"><InputNumber placeholder="priority" /></Form.Item>
              <Form.Item name="note"><Input placeholder="note" /></Form.Item>
              <Button htmlType="submit">创建中断</Button>
            </Form>
          </Card>
        )}

        {match && <Tabs items={tabs} />}
      </Space>
    </section>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return <Card size="small"><Text type="secondary">{title}</Text><Paragraph strong style={{ marginBottom: 0 }}>{value}</Paragraph></Card>;
}

function tableTab(key: string, label: string, rows: DebugRecord[] = [], columns: ColumnsType<DebugRecord>) {
  return {
    key,
    label: `${label} (${rows.length})`,
    children: <Table size="small" rowKey={(row, index) => String(row.id ?? row.seq ?? index)} columns={columns} dataSource={rows} pagination={{ pageSize: 8 }} />
  };
}

const basicColumns: ColumnsType<DebugRecord> = [
  { title: 'ID', dataIndex: 'id', ellipsis: true },
  { title: 'Step', dataIndex: 'stepId', ellipsis: true },
  { title: 'Type', dataIndex: 'actionType', ellipsis: true },
  { title: 'Status', dataIndex: 'status', render: (value) => <Tag>{String(value || '-')}</Tag> },
  { title: 'Payload', render: (_, row) => <JsonCell value={row.payload || row.window || row.state || row.error} /> }
];

const eventColumns: ColumnsType<DebugRecord> = [
  { title: 'Seq', dataIndex: 'seq', width: 70 },
  { title: 'Type', dataIndex: 'type', ellipsis: true },
  { title: 'Step', dataIndex: 'stepId', ellipsis: true },
  { title: 'Payload', render: (_, row) => <JsonCell value={row.payload} /> }
];

const effectColumns: ColumnsType<DebugRecord> = [
  { title: 'ID', dataIndex: 'id', ellipsis: true },
  { title: 'Effect', dataIndex: 'effectType', ellipsis: true },
  { title: 'Status', dataIndex: 'status', render: (value) => <Tag color={value === 'applied' ? 'green' : 'default'}>{String(value || '-')}</Tag> },
  { title: 'Payload', render: (_, row) => <JsonCell value={row.payload} /> }
];

function aiTaskColumns(runAction: (action: () => Promise<unknown>) => Promise<void>): ColumnsType<DebugRecord> {
  return [
    { title: 'ID', dataIndex: 'id', ellipsis: true },
    { title: 'Action', dataIndex: 'action', ellipsis: true },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag>{String(value || '-')}</Tag> },
    { title: 'Error', render: (_, row) => <JsonCell value={row.error} /> },
    {
      title: 'Ops',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => runAction(() => retryWorkflowAiTask(String(row.id)))}>Retry</Button>
          <Button size="small" danger onClick={() => runAction(() => cancelWorkflowAiTask(String(row.id)))}>Cancel</Button>
        </Space>
      )
    }
  ];
}

function interruptColumns(runAction: (action: () => Promise<unknown>) => Promise<void>): ColumnsType<DebugRecord> {
  return [
    { title: 'ID', dataIndex: 'id', ellipsis: true },
    { title: 'Type', dataIndex: 'interruptType', ellipsis: true },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag>{String(value || '-')}</Tag> },
    { title: 'Payload', render: (_, row) => <JsonCell value={row.payload} /> },
    {
      title: 'Ops',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => runAction(() => resolveWorkflowInterrupt(String(row.id), { status: 'resolved', resolution: { manual: true } }))}>Resolve</Button>
          <Button size="small" onClick={() => runAction(() => resolveWorkflowInterrupt(String(row.id), { status: 'rejected', resolution: { manual: true } }))}>Reject</Button>
        </Space>
      )
    }
  ];
}

function JsonCell({ value }: { value: unknown }) {
  return <pre style={{ maxWidth: 420, maxHeight: 120, overflow: 'auto', margin: 0 }}>{JSON.stringify(value ?? null, null, 2)}</pre>;
}
