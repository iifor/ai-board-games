import type { DebugCommandRequest, MatchDetailDto } from '@battle/shared';
import { App, Button, Space, Tooltip } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../../services/http';
import { sendDebugCommand } from '../../../services/matches';

const COMMANDS: readonly { command: DebugCommandRequest['command']; label: string; hint: string }[] = [
  { command: 'step', label: '单步', hint: '执行当前阶段，停在下一个阶段之前' },
  { command: 'continue', label: '继续', hint: '运行到下一个断点' },
  { command: 'skip', label: '跳过', hint: '不执行当前阶段，直接按跳转规则前往下一阶段' },
  { command: 'run', label: '连续运行', hint: '不再在断点暂停' },
];

/** 调试指令：只有调试局在暂停时可用 */
export function DebugControls({ detail, onChanged }: { readonly detail: MatchDetailDto; readonly onChanged: () => void }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const enabled = detail.debug && detail.status === 'paused';
  const run = async (command: DebugCommandRequest['command']) => {
    setBusy(true);
    try {
      await sendDebugCommand(detail.id, command);
      onChanged();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Space wrap>
      {COMMANDS.map(({ command, label, hint }) => (
        <Tooltip key={command} title={hint}>
          <Button disabled={!enabled || busy} onClick={() => void run(command)}>{label}</Button>
        </Tooltip>
      ))}
      {!detail.debug ? <span>非调试局不能下调试指令</span> : null}
    </Space>
  );
}
