import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Collapse, Descriptions, Empty, Table, Tag, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { GAME_LABELS } from '../../constants/adminConstants';
import { LlmCallCard } from '../../components/TraceComponents/LlmCallCard';

const { Title, Text, Paragraph } = Typography;

export function AgentTraceView() {
  const { id, playerId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await adminRequest(`/traces/${id}/player/${playerId}`);
        setData(result);
      } catch { setData(null); }
      finally { setLoading(false); }
    })();
  }, [id, playerId]);

  if (!loading && !data) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/traces/${id}`)}>返回 Trace</Button>
        <Empty description="暂无数据" style={{ marginTop: 48 }} />
      </div>
    );
  }

  const { trace, llmCalls = [], decisions = [], snapshots = [] } = data || {};
  const playerDecisions = decisions.filter((d) => String(d.player_id) === String(playerId));
  const playerLlmCalls = llmCalls.filter((c) => String(c.player_id) === String(playerId));
  const fallbackDecisions = playerDecisions.filter((d) => d.fallback_used);

  // Q4: Check vote validity against snapshots
  const voteDecisions = playerDecisions.filter((d) => d.decision_type === 'player-vote');
  const invalidVotes = voteDecisions.filter((d) => {
    if (!d.chosen_target) return false;
    // Find the closest snapshot to check if target was alive
    const snap = [...snapshots].reverse().find((s) => {
      try {
        const state = typeof s.snapshot_json === 'string' ? JSON.parse(s.snapshot_json) : s.snapshot_json;
        return state.players && state.players.some((p) => String(p.id) === String(d.chosen_target));
      } catch { return false; }
    });
    if (!snap) return false;
    try {
      const state = typeof snap.snapshot_json === 'string' ? JSON.parse(snap.snapshot_json) : snap.snapshot_json;
      const target = state.players?.find((p) => String(p.id) === String(d.chosen_target));
      return target && !target.alive;
    } catch { return false; }
  });

  // Extract persona from first LLM call's system message
  let personaText = '';
  if (playerLlmCalls.length) {
    try {
      const msgs = typeof playerLlmCalls[0].messages_json === 'string'
        ? JSON.parse(playerLlmCalls[0].messages_json)
        : playerLlmCalls[0].messages_json;
      if (Array.isArray(msgs)) {
        const sysMsg = msgs.find((m) => m.role === 'system');
        if (sysMsg) personaText = String(sysMsg.content || '').slice(0, 600);
      }
    } catch { /* ignore */ }
  }

  // Speech samples for Q6
  const speechDecisions = playerDecisions
    .filter((d) => d.response_text && d.response_text.length > 20)
    .slice(-8);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/traces/${id}`)}>返回 Trace</Button>
        <Title level={4} style={{ margin: 0 }}>
          玩家 {playerId} 号 — 行为分析
          {trace && <Tag style={{ marginLeft: 8 }}>{GAME_LABELS[trace.game_type] || trace.game_type}</Tag>}
        </Title>
      </div>

      <Card loading={loading}>
        {/* Q1: Why did agent say Y? */}
        <Title level={5}>Q1: 发言溯源</Title>
        <Paragraph type="secondary">
          展示该玩家每一次 LLM 调用的完整 Prompt 和 Response。
          点击展开可查看完整的 system prompt、对话历史、以及模型输出。
        </Paragraph>
        {playerLlmCalls.length ? (
          playerLlmCalls.map((call) => (
            <LlmCallCard key={call.id} call={call} defaultCollapsed />
          ))
        ) : (
          <Text type="secondary">暂无 LLM 调用记录</Text>
        )}

        {/* Q2: Information boundary check */}
        <Title level={5} style={{ marginTop: 24 }}>Q2: 信息边界检查</Title>
        <Paragraph type="secondary">
          检查该玩家的 Prompt 中是否包含不应知晓的信息。
          当前提示词前缀（前 600 字符）：
        </Paragraph>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
          {personaText || '(无法提取 system prompt)'}
        </pre>

        {/* Q3: Role alignment */}
        <Title level={5} style={{ marginTop: 24 }}>Q3: 角色行为画像</Title>
        <Table
          dataSource={[
            { type: '发言 (speech)', count: playerDecisions.filter((d) => d.decision_type === 'player-text').length },
            { type: '投票 (vote)', count: playerDecisions.filter((d) => d.decision_type === 'player-vote').length },
            { type: 'JSON 决策', count: playerDecisions.filter((d) => d.decision_type === 'player-json').length },
            { type: '回退 (fallback)', count: fallbackDecisions.length },
            { type: 'LLM 调用总计', count: playerLlmCalls.length },
          ]}
          rowKey="type" size="small" pagination={false}
          columns={[
            { title: '决策类型', dataIndex: 'type', key: 'type' },
            { title: '次数', dataIndex: 'count', key: 'count' },
          ]}
        />

        {/* Q4: Rule compliance */}
        <Title level={5} style={{ marginTop: 24 }}>Q4: 规则遵守</Title>
        {invalidVotes.length > 0 ? (
          <Table
            dataSource={invalidVotes} rowKey="id" size="small"
            columns={[
              { title: '决策', dataIndex: 'decision_type', key: 'type' },
              { title: '目标', dataIndex: 'chosen_target', key: 'target' },
              { title: '问题', key: 'issue', render: () => <Tag color="red">投票目标已死亡</Tag> },
            ]}
          />
        ) : (
          <Text>投票合法性检查通过，未发现无效投票。</Text>
        )}

        {fallbackDecisions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text type="warning">⚠ 该玩家有 {fallbackDecisions.length} 次决策触发了回退机制：</Text>
            <Table
              dataSource={fallbackDecisions} rowKey="id" size="small" style={{ marginTop: 8 }}
              columns={[
                { title: '决策类型', dataIndex: 'decision_type', key: 'type', width: 120 },
                { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 80 },
                { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
                { title: '回退原因', dataIndex: 'fallback_reason', key: 'reason' },
              ]}
            />
          </div>
        )}

        {/* Q5: Game progression */}
        <Title level={5} style={{ marginTop: 24 }}>Q5: 行动贡献时间线</Title>
        <Paragraph type="secondary">
          该玩家在游戏各阶段的决策和 LLM 调用时间线。
        </Paragraph>
        <Table
          dataSource={playerDecisions} rowKey="id" size="small"
          columns={[
            { title: '时间', dataIndex: 'created_at', key: 'time', width: 180, render: (t) => t ? new Date(t).toLocaleString() : '-' },
            { title: '决策类型', dataIndex: 'decision_type', key: 'type', width: 120, render: (t) => <Tag>{t}</Tag> },
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 80 },
            { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
            { title: '目标', dataIndex: 'chosen_target', key: 'target', width: 60 },
            {
              title: '输出摘要', dataIndex: 'response_text', key: 'response',
              render: (t) => t ? <Text ellipsis style={{ maxWidth: 300 }}>{t.slice(0, 80)}</Text> : '-'
            },
            { title: '回退', dataIndex: 'fallback_used', key: 'fallback', width: 60, render: (v) => v ? <Tag color="orange">是</Tag> : '' },
          ]}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [15, 20] }}
        />

        {/* Q6: Persona consistency */}
        <Title level={5} style={{ marginTop: 24 }}>Q6: 人设一致性</Title>
        <Paragraph type="secondary">
          对比玩家的 System Prompt 人设描述与实际发言风格。
        </Paragraph>
        <Card size="small" title="System Prompt 人设（前 600 字符）" style={{ marginBottom: 16 }}>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>
            {personaText || '(无 System Prompt)'}
          </pre>
        </Card>
        <Card size="small" title={`实际发言样本（最近 ${speechDecisions.length} 条）`}>
          {speechDecisions.length ? (
            speechDecisions.map((d, i) => (
              <div key={d.id} style={{ marginBottom: 12, padding: '8px 0', borderBottom: i < speechDecisions.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <Tag>{d.decision_type}</Tag>
                <Tag>{d.phase}</Tag>
                <span style={{ fontSize: 11, color: '#999' }}>Day {d.day}</span>
                <Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{d.response_text}</Paragraph>
              </div>
            ))
          ) : (
            <Text type="secondary">暂无发言记录可供分析</Text>
          )}
        </Card>
      </Card>
    </div>
  );
}
