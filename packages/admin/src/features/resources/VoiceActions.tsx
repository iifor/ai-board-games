import type { VoiceDto } from '@battle/shared';
import { App, Button, Popconfirm } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../services/http';
import { voiceActions } from '../../services/resources';
import { DEFAULT_SAMPLE_TEXT } from './constants';
import { playAudio, speakInBrowser } from './playback';

/** 试听：云端音色由服务端合成后播放，浏览器音色直接在本地朗读 */
export function VoicePreviewButton({ voice }: { readonly voice: VoiceDto }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);

  const preview = async () => {
    setBusy(true);
    try {
      if (voice.provider === 'browser') {
        speakInBrowser(voice, voice.sampleText || DEFAULT_SAMPLE_TEXT);
      } else {
        const { url } = await voiceActions.preview(voice.id);
        await playAudio(url);
      }
      message.success('已开始试听');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return <Button size="small" loading={busy} onClick={preview}>试听</Button>;
}

/** 导入内置音色目录（旧版默认语音包），已存在的跳过 */
export function VoiceImportButton({ reload }: { readonly reload: () => void }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await voiceActions.importDefaults();
      message.success(`已导入 ${result.created} 个音色，跳过 ${result.skipped} 个已存在的`);
      reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popconfirm title="导入 Azure、Mimo 与浏览器的内置音色目录？已存在的会跳过。" onConfirm={run}>
      <Button loading={busy}>导入默认音色</Button>
    </Popconfirm>
  );
}
