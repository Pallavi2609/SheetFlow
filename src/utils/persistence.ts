import type { Cell } from '../types';
import { STORAGE_KEY, STORAGE_VERSION } from '../types';

export interface StoredSheet {
  version: number;
  cells: Record<string, Cell>;
}

export function sanitizeStoredSheet(data: unknown): StoredSheet | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.version !== STORAGE_VERSION) return null;
  const cells = record.cells;
  if (typeof cells !== 'object' || cells === null || Array.isArray(cells)) return null;
  const clean: Record<string, Cell> = {};
  for (const [key, value] of Object.entries(cells as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const raw = (value as Record<string, unknown>).raw;
    if (typeof raw !== 'string') continue;
    const format = (value as Record<string, unknown>).format;
    const cell: Cell = { raw };
    if (
      typeof format === 'object' &&
      format !== null &&
      (typeof (format as Record<string, unknown>).bold === 'boolean' ||
        typeof (format as Record<string, unknown>).italic === 'boolean' ||
        typeof (format as Record<string, unknown>).align === 'string')
    ) {
      cell.format = format as Cell['format'];
    }
    clean[key] = cell;
  }
  return { version: STORAGE_VERSION, cells: clean };
}

export function loadStoredSheet(): StoredSheet | null {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    return sanitizeStoredSheet(JSON.parse(text));
  } catch {
    return null;
  }
}

export function saveStoredSheet(cells: Record<string, Cell>): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, cells }));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredSheet(): boolean {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
