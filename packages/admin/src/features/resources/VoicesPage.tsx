import type { VoiceDto, VoiceGender, VoiceInput, VoiceProvider } from '@battle/shared';
import { Typography } from 'antd';
import { voicesApi } from '../../services/resources';
import { PROVIDER_LABELS } from './constants';
import { ResourcePage } from './ResourcePage';
import { StatusTag } from './StatusTag';
import { enabledFilter, uniqueOptions, type ResourceFilter } from './utils';
import { VoiceImportButton, VoicePreviewButton } from './VoiceActions';
import { VoiceFormFields } from './VoiceFormFields';

interface Values {
  name: string;
  provider: VoiceProvider;
  voiceName: string;
  language: string;
  gender?: VoiceGender | null;
  style?: string;
  rate?: string;
  pitch?: string;
  sampleText?: string;
  description?: string;
  enabled: boolean;
}

const FILTERS: readonly ResourceFilter<VoiceDto>[] = [
  {
    key: 'provider',
    placeholder: '来源',
    options: (rows) => uniqueOptions(rows.map((row) => row.provider), (value) => PROVIDER_LABELS[value as VoiceProvider] ?? value),
    matches: (dto, value) => dto.provider === value,
  },
  { key: 'language', placeholder: '语言', options: (rows) => uniqueOptions(rows.map((row) => row.language)), matches: (dto, value) => dto.language === value },
  { key: 'gender', placeholder: '性别', options: (rows) => uniqueOptions(rows.map((row) => row.gender)), matches: (dto, value) => dto.gender === value },
  enabledFilter<VoiceDto>(),
];

export function VoicesPage() {
  return (
    <ResourcePage<VoiceDto, VoiceInput, Values>
      title="音色"
      api={voicesApi}
      searchPlaceholder="搜索名称、音色名、风格、说明"
      search={(dto) => [dto.name, dto.voiceName, dto.style, dto.description]}
      filters={FILTERS}
      rowActions={(dto) => <VoicePreviewButton voice={dto} />}
      headerExtra={(reload) => <VoiceImportButton reload={reload} />}
      columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '来源', dataIndex: 'provider', width: 110, render: (provider: VoiceProvider) => PROVIDER_LABELS[provider] },
        { title: '音色名', dataIndex: 'voiceName', ellipsis: true },
        { title: '语言', dataIndex: 'language', width: 110 },
        { title: '性别', dataIndex: 'gender', width: 70, render: (gender: VoiceGender | null) => gender ?? '—' },
        { title: '风格', dataIndex: 'style', ellipsis: true, render: (style: string) => (style ? <Typography.Text ellipsis={{ tooltip: style }}>{style}</Typography.Text> : '—') },
        { title: '状态', dataIndex: 'enabled', width: 80, render: (enabled: boolean) => <StatusTag enabled={enabled} /> },
      ]}
      defaults={{ provider: 'azure', language: 'zh-CN', rate: '0%', pitch: '0%', enabled: true }}
      toValues={(dto) => dto}
      toInput={(values) => ({ ...values, gender: values.gender ?? null })}
      fields={() => <VoiceFormFields />}
    />
  );
}
