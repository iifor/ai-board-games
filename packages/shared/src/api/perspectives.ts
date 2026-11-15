import type { Channel } from '../stage';

export interface PrivateActionTemplate {
  phase: string;
  role: string;
  title: string;
  template: string;
  callKeys: string[];
}

export interface PerspectiveMatch {
  id: string;
  title: string;
  createdAt: string;
}

export interface PerspectiveEvent {
  seq: number;
  round: number;
  phase: string;
  phaseTitle: string;
  channel: Channel;
  label: string;
  text: string;
  aiHistoryText: string | null;
  spoken: string | null;
  voice: string | null;
  aiSeats: number[];
  playerSeats: number[];
  /** 身份取自该条事件发生时。 */
  roles: Record<number, string | null>;
}

export interface PerspectiveRequest {
  id: string;
  round: number;
  phase: string;
  seat: number;
  instruction: string;
  targets: number[] | null;
}

export interface PerspectivePrompt {
  platform: string;
  rules: string;
  identity: string;
  history: string;
  instruction: string;
  output: string;
}

export interface PerspectiveRecord {
  seats: { seat: number; name: string }[];
  events: PerspectiveEvent[];
  requests: PerspectiveRequest[];
  requestsAvailable: boolean;
}
