import type { VoiceDto, VoiceInput, VoiceProvider } from '@battle/shared';
import type { AsyncState } from '../../hooks/useAsync';
import { voicesApi } from '../../services/resources';
import { ResourceList } from './ResourcePage';
import { StatusTag } from './StatusTag';
import { enabledFilter, uniqueOptions, type ResourceFilter } from './utils';
import { VoicePreviewButton } from './VoiceActions';
import { VoiceFormFields } from './VoiceFormFields';
import { voiceStyleLabel } from './voiceStyles';
import './SourceVoices.css';

interface Values {
  name: string;
  provider: VoiceProvider;
  voiceName: string;
  language: string;
  style?: string;
  rate?: string;
  pitch?: string;
  sampleText?: string;
  description?: string;
  enabled: boolean;
}

const FILTERS: readonly ResourceFilter<VoiceDto>[] = [
  { key: 'language', placeholder: '语言', options: (rows) => uniqueOptions(rows.map((row) => row.language)), matches: (dto, value) => dto.language === value },
  enabledFilter<VoiceDto>(),
];

interface Props {
  readonly provider: VoiceProvider;
  readonly list: AsyncState<VoiceDto[]> & { readonly reload: () => void };
}

export function SourceVoices({ provider, list }: Props) {
  return (
    <ResourceList<VoiceDto, VoiceInput, Values>
      title="音色"
      list={list}
      fitTableToPage
      actionsWidth={224}
      tableMinWidth={0}
      api={voicesApi}
      searchPlaceholder="搜索名称、音色名、风格、说明"
      search={(dto) => [dto.name, dto.voiceName, dto.style, dto.provider === 'azure' ? voiceStyleLabel(dto.style) : '', dto.description]}
      filters={FILTERS}
      rowActions={(dto) => <VoicePreviewButton voice={dto} />}
      columns={[
        { title: '音色', key: 'voice', render: (_, voice) => (
          <div className="source-voice-info">
            <span className="resource-ellipsis" title={voice.name}>{voice.name}</span>
            <small className="resource-ellipsis" title={voice.voiceName}>{voice.voiceName}</small>
            <small className="source-voice-details">{[voice.language, voice.provider === 'azure' ? voiceStyleLabel(voice.style) : voice.style].filter(Boolean).join(' · ')}</small>
            <span className="source-voice-details"><StatusTag enabled={voice.enabled} /></span>
          </div>
        ) },
        { title: '语言', dataIndex: 'language', width: 122, responsive: ['lg'] },
        { title: '风格', dataIndex: 'style', width: '18%', ellipsis: true,
          render: (style: string, voice) => voice.provider === 'azure' ? voiceStyleLabel(style) : style || '—' },
        { title: '状态', dataIndex: 'enabled', width: 80, responsive: ['lg'],
          render: (enabled: boolean) => <StatusTag enabled={enabled} /> },
      ]}
      defaults={{ provider, language: 'zh-CN', rate: '0%', pitch: '0%', enabled: true }}
      toValues={(dto) => dto}
      toInput={(values) => values}
      fields={(editing) => <VoiceFormFields lockProvider={!editing} />}
    />
  );
}
