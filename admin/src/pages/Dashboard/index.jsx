import React, { useEffect, useState } from 'react';
import { Card, Space, Statistic } from 'antd';
import { adminRequest } from '../../services/adminApi';

export function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    adminRequest('/stats').then(setStats).catch(() => {});
  }, []);

  return (
    <Space direction="vertical" size={16} className="admin-full">
      <div className="admin-stat-grid">
        <Card><Statistic title="对局" value={stats?.games || 0} /></Card>
        <Card><Statistic title="玩家" value={stats?.players || 0} /></Card>
        <Card><Statistic title="模型" value={stats?.models || 0} /></Card>
        <Card><Statistic title="语音包" value={stats?.voicePackages || 0} /></Card>
        <Card><Statistic title="启用皮肤" value={stats?.enabledSkins || 0} /></Card>
      </div>
    </Space>
  );
}
