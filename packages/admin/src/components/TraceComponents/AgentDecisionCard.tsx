import { Card, Descriptions, Tag, Typography } from 'antd';
import type { AgentDecision } from '../../types/trace';

const { Text } = Typography;

interface AgentDecisionCardProps {
  decision: AgentDecision;
}

export function AgentDecisionCard({ decision }: AgentDecisionCardProps) {
  if (!decision) return null;

  return (
    <Card size="small" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Tag color="purple">{decision.decision_type}</Tag>
        {decision.player_id && <Tag>玩家 {decision.player_id}</Tag>}
        {decision.player_role && <Tag color="blue">{decision.player_role}</Tag>}
        {decision.phase && <Tag>{decision.phase}</Tag>}
        {decision.day != null && <Text type="secondary">Day {decision.day}</Text>}
        {decision.fallback_used ? <Tag color="orange">回退</Tag> : null}
        {decision.skill_id && <Tag color="green">{decision.skill_id}</Tag>}
        {decision.chosen_target != null && <Tag>目标: {decision.chosen_target}</Tag>}
      </div>

      {decision.fallback_reason && (
        <Text type="warning" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          回退原因: {decision.fallback_reason}
        </Text>
      )}

      <Descriptions size="small" column={2}>
        {decision.prompt_text && (
          <Descriptions.Item label="Prompt" span={2}>
            <pre style={{ background: '#fafafa', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
              {String(decision.prompt_text).slice(0, 500)}
            </pre>
          </Descriptions.Item>
        )}
        {decision.response_text && (
          <Descriptions.Item label="Response" span={2}>
            <pre style={{ background: '#f6ffed', padding: 8, borderRadius: 4, maxHeight: 100, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
              {String(decision.response_text).slice(0, 400)}
            </pre>
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  );
}
