import type { ReactNode } from 'react';
import './ResourceWorkspace.css';

interface Props {
  navigation: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function ResourceWorkspace({ navigation, title, action, children }: Props) {
  return <div className="resource-workspace">
    {navigation}
    <div className="resource-workspace-content">
      <header className="resource-workspace-heading">
        <strong>{title}</strong>
        {action}
      </header>
      <div className="resource-workspace-body">{children}</div>
    </div>
  </div>;
}
