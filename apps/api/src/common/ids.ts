import { CloudNoteError } from './cloudnote-error';

export function parsePositiveInt(value: unknown, label = 'ID'): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw CloudNoteError.badRequest('VALIDATION_FAILED', `${label} is invalid.`);
  }
  return parsed;
}

export function parseOptionalPositiveInt(value: unknown, label = 'ID'): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === '') return undefined;
  return parsePositiveInt(raw, label);
}
