import { VOICE_PROVIDERS } from '@battle/shared';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { voicesApi } from '../../services/resources';
import { PROVIDER_LABELS } from './constants';
import { SourceVoices } from './SourceVoices';
import { VoiceImportButton } from './VoiceActions';
import { ResourceNavigation } from './ResourceNavigation';
import { ResourceWorkspace } from './ResourceWorkspace';

export function VoicesPage() {
  const voices = useAsync(voicesApi.list, []);
  const navigate = useNavigate();
  const { provider: pathProvider } = useParams();
  const [params] = useSearchParams();
  const selected = VOICE_PROVIDERS.find(provider => provider === pathProvider);
  const legacy = VOICE_PROVIDERS.find(provider => provider === params.get('provider'));
  if (!selected) {
    const next = new URLSearchParams(params);
    next.delete('provider');
    return <Navigate replace to={{ pathname: `/voices/${legacy ?? VOICE_PROVIDERS[0]}`, search: next.toString() }} />;
  }

  const sources = VOICE_PROVIDERS.map(provider => ({
    key: provider,
    label: PROVIDER_LABELS[provider],
    detail: `${voices.status === 'ready' ? voices.data.filter(voice => voice.provider === provider).length : '—'} 个音色`,
  }));

  return <section className="source-voices" aria-label="音色管理">
    <ResourceWorkspace title={`${PROVIDER_LABELS[selected]} · 音色列表`}
      navigation={<ResourceNavigation label="音色来源" searchPlaceholder="查找来源"
        items={sources} selected={selected} onSelect={provider => navigate('/voices/' + provider)}
        tools={<VoiceImportButton reload={voices.reload} />} />}>
      <div className="resource-workspace-scroll">
        <SourceVoices key={selected} provider={selected} list={voices.status === 'ready'
          ? { ...voices, data: voices.data.filter(voice => voice.provider === selected) }
          : voices} />
      </div>
    </ResourceWorkspace>
  </section>;
}
