import type { AiCallDto } from '@battle/shared';
import { Collapse, Empty, Space, Switch, Tag, Typography } from 'antd';
import { useState } from 'react';

const LAYERS: readonly [string, string][] = [
  ['platform', 'L1 平台契约'],
  ['rules', 'L2 游戏规则'],
  ['identity', 'L3 身份与人设'],
  ['history', 'L4 可见历史'],
  ['instruction', 'L5 阶段指令'],
  ['output', 'L6 输出契约'],
];

function Block({ title, text }: { readonly title: string; readonly text: string }) {
  return (
    <div className="trace-block">
      <Typography.Text type="secondary">{title}</Typography.Text>
      <pre>{text}</pre>
    </div>
  );
}

/** AI 调用记录：按 L1–L6 分层查看提示词，以及原始响应、解析结果与错误 */
export function TracePanel({ calls }: { readonly calls: readonly AiCallDto[] }) {
  const [errorsOnly, setErrorsOnly] = useState(false);
  const shown = errorsOnly ? calls.filter((call) => call.error) : calls;
  if (!calls.length) return <Empty description="没有模型调用记录（脚本化对局不调用模型）" />;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <label><Switch size="small" checked={errorsOnly} onChange={setErrorsOnly} /> 只看失败的调用</label>
      <Collapse
        items={shown.map((call) => ({
          key: call.id,
          label: (
            <Space wrap>
              <Tag>{call.seat}号</Tag>
              <span>{call.requestId}</span>
              <Tag color="geekblue">{call.modelName}</Tag>
              <span>{call.latencyMs} ms</span>
              {call.error ? <Tag color="red">失败</Tag> : <Tag color="green">成功</Tag>}
            </Space>
          ),
          children: (
            <div className="trace-detail">
              {LAYERS.map(([key, title]) => <Block key={key} title={title} text={call.prompt[key] ?? ''} />)}
              {call.rawResponse ? <Block title="原始响应" text={call.rawResponse} /> : null}
              {call.output !== null ? <Block title="解析结果" text={JSON.stringify(call.output, null, 2)} /> : null}
              {call.error ? <Block title="错误" text={call.error} /> : null}
            </div>
          ),
        }))}
      />
    </Space>
  );
}
