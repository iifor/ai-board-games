import type { Channel, PerspectiveEvent, PerspectiveRequest } from '@battle/shared';
import { Alert, Button, Drawer, Empty, Spin, Table } from 'antd';
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { perspectives } from '../../services/perspectives';
import { HistoryEntryPopover } from './HistoryEntryPopover';

interface Props {
  matchId: string;
  events: PerspectiveEvent[];
  requests: PerspectiveRequest[];
  allSeats: number[];
  viewer: number;
  available: boolean;
}

function channelName(channel: Channel) {
  if (channel === 'public') return '全桌公开';
  if (channel === 'spectator') return '上帝专属';
  if (channel.startsWith('private:')) return channel.slice(8) + '号私讯';
  if (channel === 'team:werewolf') return '狼队频道';
  if (channel === 'team:ghost_bride') return '新娘阵营频道';
  return channel;
}

function recipients(seats: number[], all: number[]) {
  if (seats.length === 0) return '无';
  return seats.length === all.length ? '全桌' : seats.map(n => n + '号').join('、');
}

function PromptRecord({ matchId, request, close }: { matchId: string; request: PerspectiveRequest; close: () => void }) {
  const detail = useAsync(() => perspectives.prompt(matchId, request.id), [matchId, request.id]);
  return <Drawer open title={request.seat + '号 · 当次请求'} onClose={close} size="min(820px, 95vw)">
    {detail.status === 'loading' ? <Spin /> : detail.status === 'error' ?
      <Alert type="error" title={detail.message} action={<Button onClick={detail.reload}>重试</Button>} /> :
      <div className="perspective-prompt">{([
        ['当次指令','instruction'], ['身份与私密信息','identity'], ['当时可见的历史','history'],
        ['游戏规则','rules'], ['平台约定','platform'], ['输出要求','output'],
      ] as const).map(([label,key]) => <details key={key} open={key === 'instruction'}><summary>{label}</summary><pre>{detail.data[key]}</pre></details>)}</div>}
  </Drawer>;
}

export function PerspectiveTimeline({ matchId, events, requests, allSeats, viewer, available }: Props) {
  const [request, inspect] = useState<PerspectiveRequest | null>(null);
  const god = viewer === -1;
  const relevant = events.filter(e => viewer <= 0 || e.aiSeats.includes(viewer) || e.playerSeats.includes(viewer));
  const incoming = requests.filter(r => viewer === 0 || r.seat === viewer);
  const pagination = { pageSize: 12, showSizeChanger: false, hideOnSinglePage: true };
  return <>
    <h3>事件与接收范围</h3>
    <p>上帝视角可见此阶段全部舞台事件。朗读列按播放器规则展示台词，静音观战仍可看字幕。</p>
    <Table<PerspectiveEvent> rowKey="seq" size="small" dataSource={relevant} pagination={pagination} scroll={{x:820}}
      locale={{ emptyText: <Empty description="该视角暂无已记录事件" /> }}
      columns={[
        { title:'事件', width:145, render:(_,e) => <>{e.label}<small>#{e.seq} · {channelName(e.channel)}</small></> },
        { title:'记录内容', dataIndex:'text' },
        { title:'AI 角色可见', hidden:god, width:160, render:(_,e) => <>
          {viewer ? (e.aiSeats.includes(viewer) ? '可见' : '不可见') : recipients(e.aiSeats,allSeats)}
          {e.aiHistoryText && (viewer ? e.aiSeats.includes(viewer) : e.aiSeats.length > 0) &&
            <HistoryEntryPopover text={e.aiHistoryText} />}
        </> },
        { title:'跟随玩家可见', hidden:god, width:155, render:(_,e) => viewer ? (e.playerSeats.includes(viewer) ? '可见' : '不可见') : recipients(e.playerSeats,allSeats) },
        { title:'舞台朗读', width:170, render:(_,e) => !e.spoken ? '仅展示' : <>{e.voice}朗读
          <small>{god ? '上帝可听' : viewer ? (e.playerSeats.includes(viewer) ? '上帝、该座位可听' : '该座位不可听') :
            (e.playerSeats.length ? '上帝及可见座位可听' : '仅上帝可听')}</small></> },
      ]} />
    {!god && <><h3>法官发出的私密请求</h3>
    {!available ? <p>本局暂无可读取的请求记录。</p> :
      <Table<PerspectiveRequest> rowKey="id" size="small" dataSource={incoming} pagination={pagination}
        locale={{emptyText:'该范围没有已记录的行动请求'}} columns={[
          { title:'接收人', width:90, render:(_,r) => r.seat + '号' },
          { title:'实际指令', dataIndex:'instruction' },
          { title:'可选目标', width:150, render:(_,r) => r.targets?.length ? r.targets.map(s => s + '号').join('、') : '—' },
          { title:'上下文', width:95, render:(_,r) => <Button type="link" onClick={() => inspect(r)}>查看请求</Button> },
        ]} />}</>}
    {request && <PromptRecord matchId={matchId} request={request} close={() => inspect(null)} />}
  </>;
}
