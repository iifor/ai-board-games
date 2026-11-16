import { Alert, App, Button, Modal, Space, Typography } from 'antd';
import { formatTime } from '../../utils/format';
import type { RevealedSecret } from './types';
import { shareText } from './utils';

interface Props {
  readonly revealed: RevealedSecret;
  readonly onClose: () => void;
}

/** 明文码只展示这一次：关闭后无法再查看，只能重新生成 */
export function AccessCodeSecretModal({ revealed, onClose }: Props) {
  const { message } = App.useApp();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制');
    } catch {
      message.error('复制失败，请手动选中复制');
    }
  };
  return (
    <Modal open title={`${revealed.username} 的身份码`} onCancel={onClose} maskClosable={false}
      footer={<Button type="primary" onClick={onClose}>我已保存</Button>}>
      <Alert type="warning" showIcon title="身份码只显示这一次，关闭后无法再查看。遗失请重新生成。" />
      <div className="access-code-secret">
        <Typography.Text code copyable={false}>{revealed.secret}</Typography.Text>
      </div>
      <p className="access-code-secret-expiry">有效期至 {formatTime(revealed.expiresAt)}</p>
      <Space>
        <Button onClick={() => void copy(revealed.secret)}>复制身份码</Button>
        <Button onClick={() => void copy(shareText(revealed.username, revealed.secret, revealed.expiresAt, formatTime))}>复制发送文案</Button>
      </Space>
    </Modal>
  );
}
