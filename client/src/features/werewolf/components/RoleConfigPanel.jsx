import React from 'react';
import { Users } from 'lucide-react';
import { classNames } from '../../../utils/classNames';
import { getRoleConfigGroups } from '../werewolfUtils';
import { PanelHeader } from './PanelHeader';

export function RoleConfigPanel({ players, mode, showRoles }) {
  const groups = getRoleConfigGroups(players, mode, showRoles);
  return (
    <section className="werewolf-panel werewolf-role-panel">
      <PanelHeader icon={<Users size={18} />} title="角色配置" />
      <div className="werewolf-role-list">
        {groups.map((group) => (
          <article className="werewolf-role-group" key={group.id}>
            <span className={classNames('werewolf-role-icon', group.id === 'wolves' && 'wolf')}>
              {group.icon}
            </span>
            <div>
              <strong>{group.name}<em>x{group.count}</em></strong>
              {group.details.length > 0 && (
                <p>{group.details.map((role) => `${role.name}x${role.count}`).join(' · ')}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
