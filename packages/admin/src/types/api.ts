export interface AdminRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export class AdminApiError extends Error {
  template: unknown;
  payload: unknown;

  constructor(message: string, template?: unknown, payload?: unknown) {
    super(message);
    this.name = 'AdminApiError';
    this.template = template ?? null;
    this.payload = payload ?? null;
  }
}

export interface SelectOption {
  value: string | number | boolean;
  label: string;
  disabled?: boolean;
}

export interface FilterState {
  q?: string;
  [key: string]: unknown;
}

export interface AdminApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
  template?: unknown;
}
