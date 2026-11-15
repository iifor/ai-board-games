import type { ReplayGame } from '@battle/shared';
import { Button, Modal, Radio, Space } from 'antd';
import { useState } from 'react';
import { replayTemplate } from './examples';

export function ReplayTemplateViewer() {
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState<ReplayGame>('werewolf');
  const [example, setExample] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>查看模板</Button>
    <Modal title="对局 JSON 模板" open={open} onCancel={() => setOpen(false)} footer={null} width={720}>
      <Space wrap>
        <Radio.Group aria-label="模板玩法" value={game} onChange={e => setGame(e.target.value)}
          options={[{ value: 'werewolf', label: '狼人杀' }, { value: 'debate', label: '辩论赛' }]} />
        <Radio.Group aria-label="预览内容" optionType="button" value={example} onChange={e => setExample(e.target.value)}
          options={[{ value: false, label: '模板' }, { value: true, label: '完整示例' }]} />
      </Space>
      <pre tabIndex={0} aria-label="JSON 内容" className="replay-template">{JSON.stringify(replayTemplate(game, example), null, 2)}</pre>
    </Modal>
  </>;
}
