import React, { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { WEREWOLF_FACTION_OPTIONS, WEREWOLF_ROLE_TYPE_OPTIONS } from '../../constants/adminConstants';
import { filterByQuery, booleanOptions, parseJsonField } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';

const { Text } = Typography;

export function WerewolfRoleManager() {
  const { message } = AntApp.useApp();
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    adminRequest('/werewolf-roles').then(setRoles).catch(() => {});
  }, []);

  const filteredRoles = filterByQuery(
    roles.filter((role) => filters.enabled === undefined || role.enabled === filters.enabled),
    filters.q,
    ['id', 'name', 'responsibility', 'ability', 'keyInfo', 'playStyleAdvice']
  );

  async function refresh() {
    adminRequest('/werewolf-roles').then(setRoles).catch(() => {});
  }

  async function save(values) {
    const payload = { ...values, rule: parseJsonField(values.rule, {}) };
    const path = editing?.id ? `/werewolf-roles/${editing.id}` : '/werewolf-roles';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(payload) });
    message.success('角色已保存');
    setEditing(null);
    await refresh();
  }

  async function remove(id) {
    await adminRequest(`/werewolf-roles/${id}`, { method: 'DELETE' });
    message.success('角色已删除');
    await refresh();
  }

  const enabledTag = (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>;

  return (
    <>
      <Card title="狼人杀角色" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增角色</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索角色、职责、能力、打法建议"
          selects={[{ key: 'enabled', placeholder: '状态', options: booleanOptions() }]}
        />
        <Table rowKey="id" dataSource={filteredRoles} columns={[
          { title: '角色', dataIndex: 'name', render: (value, record) => <Space><strong>{value}</strong><Text type="secondary">{record.id}</Text></Space> },
          { title: '阵营', dataIndex: 'faction', render: (value) => value === 'wolves' ? <Tag color="red">狼人</Tag> : <Tag color="blue">好人</Tag> },
          { title: '类型', dataIndex: 'roleType', render: (value) => WEREWOLF_ROLE_TYPE_OPTIONS.find((item) => item.value === value)?.label || value },
          { title: '能力', dataIndex: 'ability', ellipsis: true },
          { title: '打法建议', dataIndex: 'playStyleAdvice', ellipsis: true },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          { title: '操作', width: 150, render: (_, record) => <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} /> }
        ]} />
      </Card>
      <WerewolfRoleModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

function WerewolfRoleModal({ open, initialValues, onCancel, onSave }) {
  const values = {
    faction: 'good',
    roleType: 'villager',
    enabled: true,
    playStyleAdvice: '',
    rule: JSON.stringify({ actions: [] }, null, 2),
    ...(initialValues || {})
  };
  if (typeof values.rule !== 'string') values.rule = JSON.stringify(values.rule || { actions: [] }, null, 2);
  return (
    <EntityModal open={open} width={760} title={initialValues?.id ? '编辑角色' : '新增角色'} initialValues={values} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="id" label="角色 ID" rules={[{ required: true, message: '请输入角色 ID' }]}><Input disabled={Boolean(initialValues?.id)} /></Form.Item>
      <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}><Input /></Form.Item>
      <Form.Item name="faction" label="阵营"><Select options={WEREWOLF_FACTION_OPTIONS} /></Form.Item>
      <Form.Item name="roleType" label="角色类型"><Select options={WEREWOLF_ROLE_TYPE_OPTIONS} /></Form.Item>
      <Form.Item name="responsibility" label="责任"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="ability" label="能力"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="keyInfo" label="关键信息"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="playStyleAdvice" label="打法建议"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="rule" label="规则 DSL JSON" extra="启用角色只允许 kill、inspectFaction、save、poison、guard、shootOnDeath、surviveExileOnce、voteOnly、speakOnly。"><Input.TextArea rows={8} /></Form.Item>
      <Form.Item name="sortOrder" label="排序"><InputNumber min={0} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}
