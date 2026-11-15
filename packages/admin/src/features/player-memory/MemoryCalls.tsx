import type { MemoryCallStatus } from '@battle/shared';
import { Alert, Button, Empty, Pagination, Spin } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { memoryReviewCalls } from '../../services/playerMemory';
import { formatTime } from '../../utils/format';

const statuses: Record<MemoryCallStatus, string> = {
  started: '尚无响应记录', received: '已收到回复，尚无保存结果', saved: '复盘完成',
  superseded: '本次领取已失效', call_failed: '模型调用失败', invalid_reply: '回复无效', save_failed: '保存失败',
};

export function MemoryCalls({ owner }: { owner: number }) {
  const [page, setPage] = useState(1);
  const size = 10;
  const result = useAsync(() => memoryReviewCalls(owner, (page - 1) * size, size), [owner, page]);
  if (result.status === 'loading') return <Spin aria-label="读取复盘调用" />;
  if (result.status === 'error') return <Alert type="error" title={result.message} action={<Button onClick={result.reload}>重试</Button>} />;
  return <>
    <Button size="small" onClick={result.reload}>刷新调用记录</Button>
    {result.data.records.map(call => <article key={call.id} className="memory-record">
      <small>{formatTime(call.createdAt)} · <Link to={'/matches/' + encodeURIComponent(call.matchId)}>查看对局</Link>
        {' · '}{call.seat} 号 · 第 {call.jobAttempt} 次领取</small>
      <p>{call.isBackup ? '备用模型' : '主模型'} · {call.model} · {statuses[call.status]}</p>
      {call.detail && <p>{call.detail}</p>}
      <small>耗时 {call.latencyMs === null ? '—' : call.latencyMs + ' ms'} · 输入 {call.promptTokens ?? '—'} / 输出 {call.completionTokens ?? '—'} tokens</small>
    </article>)}
    {!result.data.total && <Empty description="暂无复盘调用记录" />}
    <Pagination hideOnSinglePage current={page} pageSize={size} total={result.data.total} showSizeChanger={false} onChange={setPage} />
  </>;
}
