import type { AccessCodeDto, AccessCodeInput, AccessCodeSecret } from '@battle/shared';
import { http } from './http';

const path = '/api/admin/access-codes';

export const accessCodesApi = {
  list: () => http.get<AccessCodeDto[]>(path),
  create: (input: AccessCodeInput) => http.post<AccessCodeSecret>(path, input),
  update: (id: number, input: AccessCodeInput) => http.put<AccessCodeDto>(`${path}/${id}`, input),
  regenerate: (id: number) => http.post<AccessCodeSecret>(`${path}/${id}/regenerate`, {}),
  remove: (id: number) => http.del<null>(`${path}/${id}`),
};
