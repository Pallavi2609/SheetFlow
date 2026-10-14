import { useEffect } from 'react';

import { useSheetStore } from '../store/sheetStore';
import { clipboardText, writeSystemClipboard } from '../utils/clipboard';

const isModifier = (event: KeyboardEvent): boolean => event.ctrlKey || event.metaKey;

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TYPING_TAGS.has(target.tagName)) return true;
  return target.isContentEditable;
}

export function useGridKeyboard(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;

      // Never hijack keys while a modal dialog (e.g. shortcuts help) is open.
      if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) return;

      let store = useSheetStore.getState();
      const typing = isTypingTarget(event.target);

      if (isModifier(event)) {
        if (typing) return;
        const key = event.key.toLowerCase();
        if (key === 'c') {
          event.preventDefault();
          const payload = store.copy();
          if (payload) void writeSystemClipboard(clipboardText(payload));
          return;
        }
        if (key === 'v') {
          event.preventDefault();
          void store.paste();
          return;
        }
        if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) store.redo();
          else store.undo();
          return;
        }
        if (key === 'y') {
          event.preventDefault();
          store.redo();
          return;
        }
        return;
      }

      if (typing) return;
      if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') {
        if (event.key === 'Enter' || event.key === ' ') return;
      }

      if (store.editing) {
        store.commitEdit(null);
        store = useSheetStore.getState();
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          store.moveFocus(-1, 0, event.shiftKey);
          return;
        case 'ArrowDown':
          event.preventDefault();
          store.moveFocus(1, 0, event.shiftKey);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          store.moveFocus(0, -1, event.shiftKey);
          return;
        case 'ArrowRight':
          event.preventDefault();
          store.moveFocus(0, 1, event.shiftKey);
          return;
        case 'Enter':
          event.preventDefault();
          if (event.shiftKey) store.moveFocus(-1, 0);
          else store.beginEdit('cell');
          return;
        case 'Tab':
          event.preventDefault();
          store.moveFocus(0, event.shiftKey ? -1 : 1);
          return;
        case 'Escape':
          return;
        case 'F2':
          event.preventDefault();
          store.beginEdit('cell');
          return;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          store.clearSelectionRange();
          return;
        default:
          break;
      }

      if (event.key.length === 1 && !event.altKey) {
        event.preventDefault();
        store.beginEdit('cell', event.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
