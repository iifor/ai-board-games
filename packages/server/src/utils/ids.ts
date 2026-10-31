import { z } from 'zod';
import { parseWith } from './validate';

export const idSchema = z.coerce.number().int().positive();

export function parseId(value: string | undefined): number {
  return parseWith(idSchema, value);
}
