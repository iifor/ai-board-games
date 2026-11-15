import { Button, Popover } from 'antd';

export function HistoryEntryPopover({ text }: { text: string }) {
  const entries = text.split(/\r\n|\n|\r/).filter(line => line.trim());
  if (!entries.length) return null;

  return <Popover title="历史条目" trigger={['hover', 'click']} placement="topLeft" destroyOnHidden
    content={<ul className="perspective-history-list" tabIndex={0} aria-label="历史条目内容">
      {entries.map((entry, index) => <li key={index}>{entry}</li>)}
    </ul>}>
    <Button type="link" size="small" className="perspective-history-trigger">历史条目</Button>
  </Popover>;
}
