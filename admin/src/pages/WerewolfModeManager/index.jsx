import React, { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, InputNumber, Select, Space, Switch, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { WEREWOLF_WIN_OPTIONS } from '../../constants/adminConstants';
import { filterByQuery, booleanOptions, summarizeWerewolfRoles } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';

export function WerewolfModeManager() {
  const { message } = AntApp.useApp();
  const [modes, setModes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    Promise.all([
      adminRequest('/werewolf-modes'),
      adminRequest('/werewolf-roles')
    ]).then(([m, r]) => {
      setModes(m);
      setRoles(r);
    }).catch(() => {});
  }, []);

  const filteredModes = filterByQuery(
    modes.filter((mode) => filters.enabled === undefined || mode.enabled === filters.enabled),
    filters.q,
    ['id', 'name', 'description']
  );

  async function refresh() {
    const [m, r] = await Promise.all([
      adminRequest('/werewolf-modes'),
      adminRequest('/werewolf-roles')
    ]);
    setModes(m);
    setRoles(r);
  }

  async function save(values) {
    const path = editing?.id ? `/werewolf-modes/${editing.id}` : '/werewolf-modes';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(values) });
    message.success('模式已保存');
    setEditing(null);
    await refresh();
  }

  async function remove(id) {
    await adminRequest(`/werewolf-modes/${id}`, { method: 'DELETE' });
    message.success('模式已删除');
    await refresh();
  }

  const enabledTag = (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>;

  return (
    <>
      <Card title="狼人杀模式" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ roles: [], sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 }, winCondition: 'side' })}>新增模式</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索模式、说明"
          selects={[{ key: 'enabled', placeholder: '状态', options: booleanOptions() }]}
        />
        <Table rowKey="id" dataSource={filteredModes} columns={[
          { title: '模式', dataIndex: 'name' },
          { title: '人数', dataIndex: 'playerCount', width: 90 },
          { title: '胜利条件', dataIndex: 'winCondition', render: (value) => WEREWOLF_WIN_OPTIONS.find((item) => item.value === value)?.label || value },
          { title: '阵容', dataIndex: 'roles', render: (items = []) => summarizeWerewolfRoles(items, roles) },
          { title: '说明', dataIndex: 'description', ellipsis: true },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          { title: '操作', width: 150, render: (_, record) => <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} /> }
        ]} />
      </Card>
      <WerewolfModeModal open={editing !== null} initialValues={editing} roles={roles} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

function WerewolfModeModal({ open, initialValues, roles = [], onCancel, onSave }) {
  const roleOptions = roles.filter((role) => role.enabled).map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }));
  const values = {
    enabled: true, winCondition: 'side',
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    roles: [],
    ...(initialValues || {})
  };
  return (
    <EntityModal open={open} width={860} title={initialValues?.id ? '编辑模式' : '新增模式'} initialValues={values} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="id" label="模式 ID" rules={[{ required: true, message: '请输入模式 ID' }]}><Input disabled={Boolean(initialValues?.id)} /></Form.Item>
      <Form.Item name="name" label="模式名称" rules={[{ required: true, message: '请输入模式名称' }]}><Input /></Form.Item>
      <Form.Item name="description" label="说明"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="winCondition" label="胜利条件"><Select options={WEREWOLF_WIN_OPTIONS} /></Form.Item>
      <Card size="small" title="角色阵容" className="admin-nested-card">
        <Form.List name="roles">
          {(fields, { add, remove }) => (
            <Space direction="vertical" style={{ width: '100%' }}>
              {fields.map((field) => (
                <Space key={field.key} align="baseline" wrap>
                  <Form.Item {...field} name={[field.name, 'roleId']} rules={[{ required: true, message: '请选择角色' }]}>
                    <Select style={{ width: 260 }} options={roleOptions} placeholder="选择角色" />
                  </Form.Item>
                  <Form.Item {...field} name={[field.name, 'count']} rules={[{ required: true, message: '请输入数量' }]}>
                    <InputNumber min={1} max={20} placeholder="数量" />
                  </Form.Item>
                  <Button danger onClick={() => remove(field.name)}>删除</Button>
                </Space>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => add({ roleId: roleOptions[0]?.value, count: 1 })}>添加角色</Button>
            </Space>
          )}
        </Form.List>
      </Card>
      <Card size="small" title="警徽流" className="admin-nested-card">
        <Form.Item name={['sheriff', 'enabled']} label="启用警徽流" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name={['sheriff', 'firstDayElection']} label="首日竞选" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name={['sheriff', 'voteWeight']} label="警长票权重"><InputNumber min={1} max={3} step={0.5} /></Form.Item>
      </Card>
      <Form.Item name="sortOrder" label="排序"><InputNumber min={0} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}
