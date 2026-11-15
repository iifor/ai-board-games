import { Alert, Button, Collapse, Drawer, Empty, Pagination, Select, Space, Spin } from 'antd';
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { playerMemory } from '../../services/playerMemory';
import { playersApi } from '../../services/resources';
import { fetchCatalog } from '../../services/matches';
import { MemoryRecord } from './MemoryRecord';
import { ForgetMemoryButton } from './ForgetMemoryButton';
import { MemoryCalls } from './MemoryCalls';
import { playerLabel } from '../resources/playerLabel';
import './playerMemory.css';

export function PlayerMemoryDrawer({ id, name, close }: { id: number; name: string; close: () => void }) {
  const [page, setPage] = useState(1);
  const [game, setGame] = useState<string>();
  const [subject, setSubject] = useState<number>();
  const players = useAsync(playersApi.list, []);
  const catalog = useAsync(fetchCatalog, []);
  const result = useAsync(() => playerMemory(id, (page - 1) * 10, game, subject), [id, page, game, subject]);
  const data = result.status === 'ready' ? result.data : null;
  function afterForget() {
    setPage(1);
    result.invalidate();
  }
  return <Drawer open size={700} onClose={close} title={name + '的跨局记忆'} extra={<Space>
    <Button onClick={result.reload}>刷新</Button>
    <ForgetMemoryButton owner={id} name={name} onForgotten={afterForget} />
  </Space>}>
    <Collapse size="small" items={[{ key: 'calls', label: '复盘模型调用记录', children: <MemoryCalls key={id} owner={id} /> }]} />
    <Space wrap>
      <Select placeholder="全部玩法" aria-label="按玩法筛选" allowClear value={game} style={{ width: 130 }}
        onChange={v => { setGame(v); setPage(1); }} options={catalog.status === 'ready' ? catalog.data.map(g => ({ value: g.key, label: g.title })) : []} />
      <Select placeholder="全部相关玩家" aria-label="按相关玩家筛选" allowClear showSearch={{ optionFilterProp: 'label' }}
        value={subject} style={{ width: 180 }} onChange={v => { setSubject(v); setPage(1); }}
        options={players.status === 'ready' ? players.data.map(p => ({ value: p.id, label: playerLabel(p) })) : []} />
    </Space>
    {result.status === 'loading' && <Spin aria-label="读取记忆" />}
    {result.status === 'error' && <Alert type="error" title={result.message} action={<Button onClick={result.reload}>重试</Button>} />}
    {data && <>{(data.pending > 0 || data.failed > 0) && <p role="status">待完成复盘 {data.pending} 局 · 复盘失败 {data.failed} 局</p>}
      {data.records.length ? data.records.map(item => <MemoryRecord key={item.id} item={item}
        action={<ForgetMemoryButton owner={id} name={name} memoryId={item.id} onForgotten={afterForget} />} />)
        : <Empty description="尚无符合条件的跨局记忆" />}
      <Pagination hideOnSinglePage current={page} total={data.total} pageSize={10} showSizeChanger={false} onChange={setPage} />
    </>}
  </Drawer>;
}
