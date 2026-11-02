interface GameIconProps {
  readonly gameKey: string;
}

/** 游戏入口图标：狼人杀用月亮，辩论赛用对话气泡，其余用棋盘 */
export function GameIcon({ gameKey }: GameIconProps) {
  const common = { width: 40, height: 40, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  if (gameKey === 'werewolf') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
        <path d="M16 3l.8 1.8L18.6 5.6 16.8 6.4 16 8.2 15.2 6.4 13.4 5.6 15.2 4.8Z" />
      </svg>
    );
  }
  if (gameKey === 'debate') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4 5h9a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8l-4 3V5Z" />
        <path d="M11 13h7a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3l-3 2.5V13Z" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}
