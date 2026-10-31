import type { ModelDto, ModelInput, PlayerDto, PlayerInput, ProviderDto, ProviderInput, VoiceDto, VoiceInput } from '@battle/shared';
import { http } from './http';

export interface ResourceApi<Dto, Input> {
  list(): Promise<Dto[]>;
  create(input: Input): Promise<Dto>;
  update(id: number, input: Input): Promise<Dto>;
  remove(id: number): Promise<null>;
}

function resource<Dto, Input>(path: string): ResourceApi<Dto, Input> {
  return {
    list: () => http.get<Dto[]>(path),
    create: (input) => http.post<Dto>(path, input),
    update: (id, input) => http.put<Dto>(`${path}/${id}`, input),
    remove: (id) => http.del<null>(`${path}/${id}`),
  };
}

export const providersApi = resource<ProviderDto, ProviderInput>('/api/admin/providers');
export const modelsApi = resource<ModelDto, ModelInput>('/api/admin/models');
export const voicesApi = resource<VoiceDto, VoiceInput>('/api/admin/voices');
export const playersApi = resource<PlayerDto, PlayerInput>('/api/admin/players');
