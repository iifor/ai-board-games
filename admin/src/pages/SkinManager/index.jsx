import React, { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Upload } from 'antd';
import { CloudUploadOutlined, PlusOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { emptySkin } from '../../constants/adminConstants';
import { filterByQuery, uniqueOptions, booleanOptions, parseJsonField, normalizeSkinFormValues } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';

export function SkinManager() {
  const { message } = AntApp.useApp();
  const [skins, setSkins] = useState([]);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    adminRequest('/skins').then(setSkins).catch(() => {});
  }, []);

  const filteredSkins = filterByQuery(
    skins
      .filter((skin) => !filters.source || skin.source === filters.source)
      .filter((skin) => filters.enabled === undefined || skin.enabled === filters.enabled),
    filters.q,
    ['id', 'name', 'version', 'source', 'background', 'truth']
  );

  async function refresh() {
    adminRequest('/skins').then(setSkins).catch(() => {});
  }

  async function save(values) {
    const payload = {
      ...values,
      terms: parseJsonField(values.terms, {}),
      clues: parseJsonField(values.clues, []),
      noises: parseJsonField(values.noises, []),
      memoryExamples: parseJsonField(values.memoryExamples, [])
    };
    const path = editing?.id ? `/skins/${editing.id}` : '/skins';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(payload) });
    message.success('皮肤已保存');
    setEditing(null);
    await refresh();
  }

  async function remove(id) {
    await adminRequest(`/skins/${id}`, { method: 'DELETE' });
    message.success('皮肤已删除');
    await refresh();
  }

  const enabledTag = (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>;

  return (
    <>
      <Card
        title="皮肤管理"
        extra={(
          <Space>
            <Button icon={<CloudUploadOutlined />} onClick={() => setImporting(true)}>导入 JSON</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增皮肤</Button>
          </Space>
        )}
      >
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索皮肤、背景、真相"
          selects={[
            { key: 'source', placeholder: '来源', options: uniqueOptions(skins.map((skin) => skin.source)) },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredSkins} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '版本', dataIndex: 'version' },
          { title: '来源', dataIndex: 'source' },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          { title: '操作', width: 150, render: (_, record) => <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} /> }
        ]} />
      </Card>
      <SkinModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
      <ImportSkinModal open={importing} onCancel={() => setImporting(false)} onImported={async () => {
        setImporting(false);
        message.success('皮肤导入成功');
        await refresh();
      }} />
    </>
  );
}

function SkinModal({ open, initialValues, onCancel, onSave }) {
  const values = normalizeSkinFormValues(initialValues);
  return (
    <EntityModal open={open} width={820} title={initialValues?.id ? '编辑皮肤' : '新增皮肤'} initialValues={values} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
      <Form.Item name="version" label="版本"><Input /></Form.Item>
      <Form.Item name="source" label="来源"><Input /></Form.Item>
      <Form.Item name="background" label="背景"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="truth" label="真相"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="terms" label="术语 JSON"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="clues" label="线索 JSON"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="noises" label="噪声 JSON"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="memoryExamples" label="记忆示例 JSON"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function ImportSkinModal({ open, onCancel, onImported }) {
  const { message } = AntApp.useApp();
  const [raw, setRaw] = useState('');
  const [template, setTemplate] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) { setRaw(''); setTemplate(null); }
  }, [open]);

  async function beforeUpload(file) {
    setRaw(await file.text());
    setTemplate(null);
    return false;
  }

  async function submit() {
    setSubmitting(true);
    setTemplate(null);
    try {
      await adminRequest('/skins/import-json', { method: 'POST', body: JSON.stringify({ raw }) });
      await onImported();
    } catch (error) {
      setTemplate(error.template || null);
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      width={820}
      title="导入共识迷雾皮肤 JSON"
      onCancel={onCancel}
      onOk={submit}
      okText="校验并导入"
      okButtonProps={{ disabled: !raw.trim(), loading: submitting }}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} className="admin-full">
        <Upload accept=".json,application/json" showUploadList={false} beforeUpload={beforeUpload}>
          <Button icon={<CloudUploadOutlined />}>选择 JSON 文件</Button>
        </Upload>
        <Input.TextArea rows={12} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="粘贴皮肤 JSON" />
        {template && <pre className="admin-json-template">{JSON.stringify(template, null, 2)}</pre>}
      </Space>
    </Modal>
  );
}
