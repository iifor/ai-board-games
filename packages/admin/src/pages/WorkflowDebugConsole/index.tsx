import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  cancelWorkflowAiTask,
  controlUndercoverDebugMatch,
  createWorkflowInterrupt,
  deleteWorkflowMatch,
  getWorkflowDebug,
  resolveWorkflowInterrupt,
  retryWorkflowAiTask,
  tickWorkflowMatch
} from '../../services/adminApi';
import {
  getNightResolutionAuditRows,
  summarizeNightResolutionAudits
} from './nightResolutionAudit';
import type { NightResolutionAuditRow, NightResolutionAuditStatus } from './nightResolutionAudit';

const { Text, Paragraph } = Typography;
const DELETABLE_MATCH_STATUSES = new Set(['completed', 'failed', 'paused_debug']);

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
  const [loadedMatchId, setLoadedMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<Record<string, unknown> | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [form] = Form.useForm();
  const data = debug || {};
  const match = data.match as Record<string, unknown> | undefined;
  const matchConfig = (match?.config || {}) as Record<string, unknown>;
  const isUndercoverDebug = match?.gameType === 'undercover' && matchConfig.debugMode === true;
  const interrupts = Array.isArray(data.interrupts) ? data.interrupts as DebugRecord[] : [];
  const currentUndercoverBreakpoint = isUndercoverDebug && matchId === loadedMatchId
    ? interrupts.find((interrupt) =>
      interrupt.interruptType === 'undercover_debug_breakpoint'
      && interrupt.status === 'pending'
    )
    : undefined;
  const currentUndercoverBreakpointId = typeof currentUndercoverBreakpoint?.id === 'string'
    ? currentUndercoverBreakpoint.id
    : undefined;
  const canSkipCurrentUndercoverBreakpoint = (
    currentUndercoverBreakpoint?.payload as Record<string, unknown> | undefined
  )?.stepType === 'undercover.speech';
  const loadedStatus = typeof match?.status === 'string' ? match.status : '';
  const canDeleteLoadedMatch = Boolean(
    match
    && loadedMatchId
    && loadedMatchId === matchId.trim()
    && DELETABLE_MATCH_STATUSES.has(loadedStatus)
  );
  const deleteDisabledReason = loadedMatchId !== matchId.trim()
    ? 'Match ID 已变更，请重新加载'
    : DELETABLE_MATCH_STATUSES.has(loadedStatus)
      ? ''
      : '进行中的 Match 不可删除';
  const auditRows = useMemo(() => getNightResolutionAuditRows(data.events as DebugRecord[]), [data.events]);
  const auditSummary = useMemo(() => summarizeNightResolutionAudits(auditRows), [auditRows]);

  async function load(id = matchId) {
    if (!id.trim()) return;
    setLoading(true);
    try {
      const next = await getWorkflowDebug(id.trim());
      const loadedMatch = next.match as Record<string, unknown> | undefined;
      setDebug(next);
      setLoadedMatchId(typeof loadedMatch?.id === 'string' ? loadedMatch.id : id.trim());
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

  async function deleteLoadedMatch(): Promise<void> {
    if (!canDeleteLoadedMatch || !loadedMatchId || deleteConfirmation !== loadedMatchId) return;
    setDeleting(true);
    try {
      const result = await deleteWorkflowMatch(loadedMatchId);
      setDebug(null);
      setLoadedMatchId(null);
      setMatchId('');
      setDeleteOpen(false);
      setDeleteConfirmation('');
      message.success(
        `已删除 Match；历史对局 ${result.deleted.game ? 1 : 0} 条，Trace ${result.deleted.traces} 条`
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  const tabs = useMemo(() => [
    tableTab('events', '事件', data.events as DebugRecord[], eventColumns),
    tableTab('aiTasks', 'AI 任务', data.aiTasks as DebugRecord[], aiTaskColumns(runAction)),
    tableTab('pendingActions', '待处理行动', data.pendingActions as DebugRecord[], basicColumns),
    tableTab('actionWindows', '行动窗口', data.actionWindows as DebugRecord[], basicColumns),
    tableTab('effects', '效果', data.effects as DebugRecord[], effectColumns),
    tableTab('interrupts', '中断', data.interrupts as DebugRecord[], interruptColumns(runAction)),
    tableTab('snapshots', '快照', data.snapshots as DebugRecord[], basicColumns)
  ], [data]);

  return (
    <section>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card title="工作流调试控制台" size="small">
          <Space.Compact style={{ width: '100%' }}>
            <Input value={matchId} onChange={(event) => setMatchId(event.target.value)} placeholder="输入 Match ID" onPressEnter={() => load()} />
            <Button type="primary" loading={loading} onClick={() => load()}>加载</Button>
            <Button disabled={!matchId} onClick={() => runAction(() => tickWorkflowMatch(matchId))}>推进</Button>
            {match && (
              <Button
                danger
                disabled={!canDeleteLoadedMatch}
                title={deleteDisabledReason}
                onClick={() => setDeleteOpen(true)}
              >
                彻底删除对局数据
              </Button>
            )}
            {currentUndercoverBreakpointId && (
              <>
                <Button onClick={() => runAction(() => controlUndercoverDebugMatch(matchId, currentUndercoverBreakpointId, 'continue'))}>继续一步</Button>
                {canSkipCurrentUndercoverBreakpoint && (
                  <Button onClick={() => runAction(() => controlUndercoverDebugMatch(matchId, currentUndercoverBreakpointId, 'skip'))}>跳过当前步骤</Button>
                )}
                <Button onClick={() => runAction(() => controlUndercoverDebugMatch(matchId, currentUndercoverBreakpointId, 'continuous'))}>连续运行</Button>
              </>
            )}
          </Space.Compact>
        </Card>

        {match ? (
          <Row gutter={[12, 12]}>
            <Col span={8}><StatCard title="状态" value={String(match.status || '-')} /></Col>
            <Col span={8}><StatCard title="工作流" value={String(match.workflowId || '-')} /></Col>
            <Col span={8}><StatCard title="当前步骤" value={String(match.currentStepIndex ?? '-')} /></Col>
          </Row>
        ) : <Alert type="info" message="输入 matchId 查看 workflow 运行态、事件、任务、效果和中断。" showIcon />}

        {match && <NightResolutionAuditCard rows={auditRows} summary={auditSummary} />}

        {match && (
          <Card title="创建中断" size="small">
            <Form form={form} layout="inline" onFinish={(values) => runAction(() => createWorkflowInterrupt(matchId, {
              interruptType: values.interruptType || 'manual_debug',
              stepId: values.stepId || null,
              effectId: values.effectId || null,
              priority: values.priority || 0,
              payload: { note: values.note || '' }
            }))}>
              <Form.Item name="interruptType"><Input placeholder="中断类型" /></Form.Item>
              <Form.Item name="stepId"><Input placeholder="步骤 ID" /></Form.Item>
              <Form.Item name="effectId"><Input placeholder="效果 ID" /></Form.Item>
              <Form.Item name="priority"><InputNumber placeholder="优先级" /></Form.Item>
              <Form.Item name="note"><Input placeholder="备注" /></Form.Item>
              <Button htmlType="submit">创建中断</Button>
            </Form>
          </Card>
        )}

        {match && <Tabs items={tabs} />}
      </Space>
      <Modal
        title="彻底删除对局数据"
        open={deleteOpen}
        okText="确认彻底删除"
        cancelText="取消"
        okButtonProps={{
          danger: true,
          disabled: deleteConfirmation !== loadedMatchId,
        }}
        confirmLoading={deleting}
        onOk={deleteLoadedMatch}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteConfirmation('');
        }}
      >
        <Alert
          type="error"
          showIcon
          message="此操作不可恢复"
          description="将删除该 Match 的工作流、历史回放、AI 观测数据和专属音频；不会删除跨局玩家记忆。"
        />
        <Paragraph style={{ marginTop: 16 }}>
          请输入完整 Match ID：<Text code>{loadedMatchId}</Text>
        </Paragraph>
        <Input
          value={deleteConfirmation}
          onChange={(event) => setDeleteConfirmation(event.target.value)}
          placeholder="输入完整 Match ID"
        />
      </Modal>
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

function NightResolutionAuditCard({
  rows,
  summary,
}: {
  rows: NightResolutionAuditRow[];
  summary: ReturnType<typeof summarizeNightResolutionAudits>;
}) {
  const alert = getAuditAlert(summary);
  return (
    <Card title="Night Resolution Shadow Audit" size="small">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert type={alert.type} message={alert.message} showIcon />
        <Row gutter={[12, 12]}>
          <Col span={4}><StatCard title="Total" value={String(summary.total)} /></Col>
          <Col span={4}><StatCard title="Matched" value={String(summary.matched)} /></Col>
          <Col span={4}><StatCard title="Mismatched" value={String(summary.mismatched)} /></Col>
          <Col span={4}><StatCard title="Failed" value={String(summary.auditFailed)} /></Col>
          <Col span={4}><StatCard title="Unknown" value={String(summary.unknown)} /></Col>
          <Col span={4}><StatCard title="Latest" value={summary.latestStatus} /></Col>
        </Row>
        <Table
          size="small"
          rowKey="key"
          columns={nightResolutionAuditColumns}
          dataSource={rows}
          pagination={{ pageSize: 5 }}
        />
      </Space>
    </Card>
  );
}

function getAuditAlert(summary: ReturnType<typeof summarizeNightResolutionAudits>): { type: 'success' | 'warning' | 'error' | 'info'; message: string } {
  if (!summary.total) return { type: 'info', message: 'No night resolution shadow audit events found.' };
  if (summary.auditFailed) return { type: 'error', message: 'Night resolution shadow audit failed in at least one event.' };
  if (summary.mismatched || summary.unknown) return { type: 'warning', message: 'Night resolution shadow audit has mismatched or unknown events.' };
  return { type: 'success', message: 'All night resolution shadow audits matched the legacy resolver.' };
}

function statusColor(status: NightResolutionAuditStatus): string {
  if (status === 'matched') return 'green';
  if (status === 'mismatched') return 'orange';
  if (status === 'audit_failed') return 'red';
  return 'default';
}

const nightResolutionAuditColumns: ColumnsType<NightResolutionAuditRow> = [
  { title: 'Seq', dataIndex: 'seq', width: 72 },
  { title: 'Day', dataIndex: 'day', width: 72 },
  { title: 'Status', dataIndex: 'status', width: 130, render: (value: NightResolutionAuditStatus) => <Tag color={statusColor(value)}>{value}</Tag> },
  { title: 'Mismatch', render: (_, row) => row.mismatchFields.length ? row.mismatchFields.join(', ') : '-' },
  { title: 'Legacy deaths', render: (_, row) => <JsonCell value={row.legacyDeaths} /> },
  { title: 'Engine deaths', render: (_, row) => <JsonCell value={row.engineDeaths} /> },
  { title: 'Details', render: (_, row) => <JsonCell value={row.payload} /> }
];

const basicColumns: ColumnsType<DebugRecord> = [
  { title: 'ID', dataIndex: 'id', ellipsis: true },
  { title: '步骤', dataIndex: 'stepId', ellipsis: true },
  { title: '类型', dataIndex: 'actionType', ellipsis: true },
  { title: '状态', dataIndex: 'status', render: (value) => <Tag>{String(value || '-')}</Tag> },
  { title: '数据', render: (_, row) => <JsonCell value={row.payload || row.window || row.state || row.error} /> }
];

const eventColumns: ColumnsType<DebugRecord> = [
  { title: '序号', dataIndex: 'seq', width: 70 },
  { title: '类型', dataIndex: 'type', ellipsis: true },
  { title: '步骤', dataIndex: 'stepId', ellipsis: true },
  { title: '数据', render: (_, row) => <JsonCell value={row.payload} /> }
];

const effectColumns: ColumnsType<DebugRecord> = [
  { title: 'ID', dataIndex: 'id', ellipsis: true },
  { title: '效果', dataIndex: 'effectType', ellipsis: true },
  { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'applied' ? 'green' : 'default'}>{String(value || '-')}</Tag> },
  { title: '数据', render: (_, row) => <JsonCell value={row.payload} /> }
];

function aiTaskColumns(runAction: (action: () => Promise<unknown>) => Promise<void>): ColumnsType<DebugRecord> {
  return [
    { title: 'ID', dataIndex: 'id', ellipsis: true },
    { title: '行动', dataIndex: 'action', ellipsis: true },
    { title: '状态', dataIndex: 'status', render: (value) => <Tag>{String(value || '-')}</Tag> },
    { title: '错误', render: (_, row) => <JsonCell value={row.error} /> },
    {
      title: '操作',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => runAction(() => retryWorkflowAiTask(String(row.id)))}>重试</Button>
          <Button size="small" danger onClick={() => runAction(() => cancelWorkflowAiTask(String(row.id)))}>取消</Button>
        </Space>
      )
    }
  ];
}

function interruptColumns(runAction: (action: () => Promise<unknown>) => Promise<void>): ColumnsType<DebugRecord> {
  return [
    { title: 'ID', dataIndex: 'id', ellipsis: true },
    { title: '类型', dataIndex: 'interruptType', ellipsis: true },
    { title: '状态', dataIndex: 'status', render: (value) => <Tag>{String(value || '-')}</Tag> },
    { title: '数据', render: (_, row) => <JsonCell value={row.payload} /> },
    {
      title: '操作',
      render: (_, row) => row.interruptType === 'undercover_debug_breakpoint' ? null : (
        <Space>
          <Button size="small" onClick={() => runAction(() => resolveWorkflowInterrupt(String(row.id), { status: 'resolved', resolution: { manual: true } }))}>通过</Button>
          <Button size="small" onClick={() => runAction(() => resolveWorkflowInterrupt(String(row.id), { status: 'rejected', resolution: { manual: true } }))}>拒绝</Button>
        </Space>
      )
    }
  ];
}

function JsonCell({ value }: { value: unknown }) {
  return <pre style={{ maxWidth: 420, maxHeight: 120, overflow: 'auto', margin: 0 }}>{JSON.stringify(value ?? null, null, 2)}</pre>;
}
