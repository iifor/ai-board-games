import { useEffect, useState } from 'react';
import { Card, Switch, Typography, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';

export function PublicSettings() {
  const [spectatorMode, setSpectatorMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    adminRequest<{ spectatorMode: boolean }>('/settings/spectator-mode')
      .then((res) => setSpectatorMode(res.spectatorMode))
      .catch(() => {});
  }, []);

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      const res = await adminRequest<{ spectatorMode: boolean }>('/settings/spectator-mode', {
        method: 'PUT',
        body: JSON.stringify({ enabled: checked }),
      });
      setSpectatorMode(res.spectatorMode);
      messageApi.success(res.spectatorMode ? '已开启观战模式，C端无法新建游戏' : '已关闭观战模式，C端可正常游戏');
    } catch {
      messageApi.error('设置失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Card title="公共设置" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Typography.Text strong>
              <EyeOutlined style={{ marginRight: 8 }} />
              观战模式
            </Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              开启后C端只能查看历史回放，无法开始新游戏
            </Typography.Text>
          </div>
          <Switch
            checked={spectatorMode}
            onChange={handleToggle}
            loading={loading}
            checkedChildren="开启"
            unCheckedChildren="关闭"
          />
        </div>
      </Card>
    </>
  );
}
