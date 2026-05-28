import { useState, useCallback } from 'react';
import { Button, message, Tooltip } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import JsonView from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';

interface TraceJsonBlockProps {
  value: unknown;
}

export function TraceJsonBlock({ value }: TraceJsonBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = JSON.stringify(value ?? {}, null, 2);
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        message.success('已复制 JSON 数据');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        message.error('复制失败');
      }
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        message.success('已复制 JSON 数据');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        message.error('复制失败');
      }
      document.body.removeChild(textArea);
    }
  }, [value]);

  return (
    <div className="admin-trace-json-panel">
      <div className="admin-trace-json-toolbar">
        <Tooltip title="复制 JSON">
          <Button
            type="text"
            size="small"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopy}
          >
            {copied ? '已复制' : '复制'}
          </Button>
        </Tooltip>
      </div>
      <div className="admin-trace-json-content">
        <JsonView
          value={value ?? {}}
          style={lightTheme}
          collapsed={2}
          displayDataTypes={false}
          displayObjectSize={true}
          enableClipboard={false}
        />
      </div>
    </div>
  );
}
