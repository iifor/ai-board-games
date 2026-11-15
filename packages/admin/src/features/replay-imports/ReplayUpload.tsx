import type { ReplayGame } from '@battle/shared';
import { UploadOutlined } from '@ant-design/icons';
import { App, Button, Modal, Radio, Upload } from 'antd';
import { useState } from 'react';

interface Props {
  busy: boolean;
  onImport: (file: File, game: ReplayGame) => void;
}

export function ReplayUpload({ busy, onImport }: Props) {
  const { message } = App.useApp();
  const [pending, setPending] = useState<File | null>(null);
  const [game, setGame] = useState<ReplayGame | null>(null);

  function choose(file: File) {
    if (!/\.(json|txt|md|docx)$/i.test(file.name) || file.size > 4 * 1024 * 1024) {
      message.error('请选择 4 MiB 以内的 JSON、TXT、MD 或 DOCX 文件');
    } else if (/\.json$/i.test(file.name)) {
      // JSON 使用文件内的 gameKey，表单玩法仅影响普通文档。
      onImport(file, 'werewolf');
    } else {
      setGame(null);
      setPending(file);
    }
    return Upload.LIST_IGNORE;
  }

  return <>
    <Upload accept=".json,.txt,.md,.docx" maxCount={1} multiple={false}
      beforeUpload={choose} disabled={busy} showUploadList={false}>
      <Button type="primary" icon={<UploadOutlined />} disabled={busy}>上传对局文件</Button>
    </Upload>
    <Modal title="选择对局玩法" open={!!pending} onCancel={() => setPending(null)}
      okText="开始解析" okButtonProps={{ disabled: !game || busy }}
      onOk={() => {
        if (pending && game) {
          onImport(pending, game);
          setPending(null);
        }
      }}>
      <p className="replay-filename">{pending?.name}</p>
      <Radio.Group aria-label="对局玩法" value={game} onChange={e => setGame(e.target.value)}
        options={[{ value: 'werewolf', label: '狼人杀' }, { value: 'debate', label: '辩论赛' }]} />
    </Modal>
  </>;
}
