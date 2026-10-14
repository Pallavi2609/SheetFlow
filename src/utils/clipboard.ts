import type { ClipboardPayload } from '../types';
import { toTsv } from './csv';

export function clipboardText(payload: ClipboardPayload): string {
  return toTsv(payload.rows);
}

export async function writeSystemClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or unsupported — the in-app clipboard is the fallback.
  }
  return false;
}
