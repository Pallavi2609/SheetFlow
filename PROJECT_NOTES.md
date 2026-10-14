# SheetFlow — Project Notes

Engineering notes for maintainers: how state flows, how recalculation works, and which parts are hand-rolled versus library-provided.

## State model

The Zustand store (`src/store/sheetStore.ts`) separates sources of truth deliberately:

| Slice        | Shape                          | Role                                                                  |
| ------------ | ------------------------------ | --------------------------------------------------------------------- |
| `cells`      | `Record<string, Cell>`         | Sparse map of **raw user input** — the only persisted data            |
| `computed`   | `Record<string, EvalResult>`   | Derived: calculated value/error per key, rebuilt on every data change |
| `deps`       | `Record<string, string[]>`     | Derived: keys a cell's formula reads                                  |
| `revDeps`    | `Record<string, string[]>`     | Derived: keys whose formulas read this cell                           |
| `selection`  | `{ anchor, focus }`            | Transient UI state; anchor ≠ focus means a range is selected          |
| `editing`    | `{ key, draft, source } \| null` | Transient: in-progress edit (cell or formula bar)                   |
| `clipboard`  | `ClipboardPayload \| null`     | In-app clipboard (raw rows, row-major)                                |
| `history`    | `{ past, future }`             | Undo/redo snapshots of `cells` (max 100 steps)                        |
| `saveStatus` | `'saved' \| 'saving' \| 'error'` | Debounced LocalStorage write indicator                              |

Key invariants:

- `Cell.raw` is exactly what the user typed; the calculated value never lives in `cells`.
- Derived slices (`computed`, `deps`, `revDeps`) are never written by components — only by `recalculate()` inside commit paths.
- `Cell` objects are treated as immutable; every write creates new objects so history snapshots stay cheap and correct.
- Empty raw content deletes the key entirely (sparse storage — an empty grid stores `{}`).

## Formula pipeline

```
raw input → tokenizer → parser (AST) → evaluator (with EvalContext) → EvalResult
                └──────────── dependency refs collected from AST ────────────┘
```

- **No `eval()`, no `new Function()`.** The tokenizer produces a flat token list; a recursive-descent parser builds a small AST (`num`, `ref`, `range`, `bin`, `unary`, `call`); the evaluator walks it. Operator precedence: unary → power (`^`) → multiplicative → additive.
- Parsed ASTs are cached by formula text (LRU-ish, 1000 entries) so identical formulas share parse work.
- Errors are `FormulaError` instances carrying a displayable code (`#ERROR!`, `#REF!`, `#DIV/0!`, `#CYCLE!`, `#VALUE!`, `#NAME?`). `evaluateRaw` never throws — parse and evaluation failures become error results, so one bad cell can't break the grid.
- Numbers are rounded to 12 significant digits (`roundNumber`) to eliminate float noise: `0.1+0.2` displays `0.3`.

## Recalculation strategy

Every committed change (edit, paste, clear, import, undo/redo, reset) triggers one **full recalculation pass** over the sparse cell map:

1. `recalculate(cells)` walks all stored keys.
2. Each formula cell evaluates through an `EvalContext` whose `get(key)` recursively evaluates the referenced cell first (depth-first, memoized in `computed`).
3. `deps`/`revDeps` are recorded during evaluation for introspection and future incremental use.

Trade-off: a full pass is O(cells + edges) per commit. At 100×26 with sparse storage this is comfortably instant, and it makes correctness trivial to reason about (no stale-cache invalidation). The `deps`/`revDeps` maps are already maintained so an incremental topological recalculation can be added later without changing the public API.

## Circular dependency handling

Cycle safety comes from the evaluator's `visiting` set:

- Before evaluating a cell it is added to `visiting`; afterwards it is removed.
- If `get(key)` re-enters a key that is currently `visiting`, that lookup returns `#CYCLE!` immediately instead of recursing.
- The error propagates upward: every cell in the cycle (and cells depending on it) displays `#CYCLE!`. Termination is guaranteed because the recursion is bounded by the number of cells.
- No special "break the cycle" edge is needed: once the user overwrites one cell in the cycle, the next recalculation succeeds normally (covered by the "recovers after the cycle is broken" test).

## Undo / redo

- History stores whole `cells` snapshots (structural sharing: untouched `Cell` objects are reused), bounded to 100 steps.
- Undo pushes the current map onto `future`; redo pushes it back onto `past`; any new commit clears `future`.
- A commit with unchanged content records no history entry.
- Reset intentionally clears both stacks (a reset is its own boundary).
- Undo/redo also persist to LocalStorage, so history navigation is never lost to a refresh.

## Persistence

- Versioned payload `{ version, cells }` under the key `sheetflow:spreadsheet`.
- `hydrate()` runs once at module load so a refresh restores data before first paint; `sanitizeStoredSheet` drops malformed cells, rejects unknown versions, and never throws — corrupted storage degrades to an empty sheet.
- Writes are synchronous but debounced for UI feedback ("Saving…" → "All changes saved"); a failing write (private mode, quota) surfaces as the "Could not save" status without losing in-memory work.
- Reset clears the storage key directly and does **not** write an empty payload back.

## Libraries used

- **React 19** — rendering; cells are `memo`ized so selection drags don't re-render unrelated cells.
- **Zustand 5** — single flat store; selectors per cell keep renders granular.
- **Tailwind CSS 4** — styling via the Vite plugin; brand color `#2563EB` defined in `index.css` `@theme`. Note: class names must appear literally in source for Tailwind's scanner (cell alignment goes through literal strings in `display.ts`, not template interpolation).
- **Lucide React** — toolbar/header icons.
- **Vitest + React Testing Library + jsdom** — tests.
- **ESLint (typescript-eslint) + Prettier** — hygiene.

## Recent fixes and features (post-audit pass)

- **Mouse selection of populated cells (real-world bug).** The cell `onMouseDown`/`onDoubleClick` guards ignored any event whose target was not the `<td>` itself. Because a populated cell renders its value in an inner `<div>`, clicking a *non-empty* cell did not select it, and double-clicking its text did not open the editor. The guards now ignore only the editor `<input>`. This was found by real-browser (Playwright) testing, not by jsdom, because the jsdom tests dispatch events directly on the `<td>`.
- **Direct-typing first keystroke — real-browser bug.** The in-cell editor called `select()` on focus, so a draft seeded by the first typed character was replaced by the second keystroke (`"10"` became `"0"`). The editor now selects all only when editing existing content (F2 / double-click) and otherwise places the caret at the end.
- **Whitespace preservation (was ISS-05).** `commitEdit` no longer trims the draft; text cells keep leading/trailing spaces. An empty string still clears the cell.
- **Async paste targeting (was ISS-04).** `paste()` re-reads the store after any `await` so the paste lands on the selection that is current when the clipboard resolves.
- **Clipboard precedence (was ISS-11).** Paste now prefers the system clipboard (so a copy made in another app is honoured) and falls back to the in-app clipboard.
- **Atomic formatting (was ISS-08).** `applyFormat` computes the next map and commits once (no nested `set`).
- **CSV formula-injection policy (was ISS-07).** Export neutralises leading `=`, `+`, `-`, `@`, TAB and CR with an apostrophe by default; a second toolbar button exports raw formulas for lossless backup.
- **StatusBar performance (was ISS-01).** Narrow selectors plus `useMemo`; it no longer re-renders on every draft keystroke.
- **Accessibility (was ISS-03).** `role="grid"` focusable element with `aria-activedescendant`, per-cell `id`/`aria-selected`, a polite `role="status"` save indicator, and a focus-trapped shortcuts dialog that restores focus to the grid.
- **New optional features.** Row/column drag-resizing and a fill handle with relative-reference shifting.
- **Favicon.** Added `public/favicon.svg` to remove a 404 in the console.

## Self-implemented functionality

Everything spreadsheet-specific is hand-written on purpose (assignment requirement and keeps the dependency surface tiny):

- Tokenizer, parser, and evaluator for the formula language (no spreadsheet or expression library).
- A1-style address handling (`colToLabel`, `parseKey`, range normalization/expansion) and reference shifting for the fill handle (`shiftFormulaRefs`).
- CSV/TSV serialization and RFC 4180-style parsing (quotes, escaped quotes, CRLF).
- Sparse-storage model, dependency tracking, cycle detection, undo/redo history.
- Keyboard navigation layer (window-level listener that defers to typing targets).
- LocalStorage persistence with sanitization.

## Testing strategy

Three unit suites, **137 tests total**, plus a **20-test Playwright** browser suite:

1. **`formulaEngine.test.ts`** — engine in isolation: tokenizer failures, precedence, unary/power, every supported function, error codes (`#DIV/0!`, `#VALUE!`, `#NAME?`, `#REF!`, `#ERROR!`), float rounding, dependency collection, cycle detection, and `shiftFormulaRefs` (fill-handle reference shifting).
2. **`store.test.ts`** — store behavior end to end: editing lifecycle, the A1=10/B1=20/C1=`=A1+B1` → 30 then A1=50 → 70 scenario, multi-level dependency chains, `deps`/`revDeps` shape, cycles and recovery, undo/redo, clear, copy/paste (single + range + formula preservation), async paste targeting, whitespace preservation, selection clamping, formatting, fill (values + shifted formulas + single undo entry), column/row clamping, CSV round-trips and formula-injection neutralisation, persistence (save/restore/corruption/version mismatch/quota failure), reset, sparse-storage invariants.
3. **`app.test.tsx`** — full-app RTL tests driving real user paths: layout presence, typing to edit, Enter/Tab commit movement, double-click editing, Escape cancel, formula-bar raw-vs-calculated separation, arrow/Tab/Shift navigation, selection summary, Ctrl+C/V and toolbar copy/paste, undo/redo buttons and shortcuts, formatting buttons with `aria-pressed`, shortcuts dialog, reset confirmation (both branches), simulated-refresh persistence, and accessibility (`aria-activedescendant`, live status, dialog focus trap/restore, fill-handle and resize-handle presence).
4. **`e2e/` (Playwright, real Chrome, production build)** — 19 functional tests plus 1 performance-measurement test covering the full mandatory feature set and the responsive/accessibility requirements.

Setup (`src/tests/setup.ts`) adds jest-dom matchers plus the two jsdom polyfills the app needs: `scrollIntoView` and `URL.createObjectURL`. Tests reset the store and LocalStorage in `beforeEach` for isolation.

This test suite caught one real bug during development: while editing from the formula bar, `CellView` also mounted an `autoFocus` in-cell input, which would steal focus from the formula bar in a real browser. Formula-bar edits now render the live draft as plain text inside the cell, and only cell-sourced edits mount an input.

## Architectural trade-offs

- **Full recalculation per commit** over incremental topological sort: chosen for simplicity and provable correctness at this grid size; `deps`/`revDeps` keep the upgrade path open.
- **Whole-map undo snapshots** over command-pattern inverses: snapshots are cheap with structural sharing and make undo/redo + persistence trivially consistent.
- **Global window keyboard listener** over per-cell handlers: one listener keeps shortcut semantics uniform and makes "don't interfere with typing" a single early-return check (`isTypingTarget`). The cost is a "heal stale edit" branch for edits left open by focus changes.
- **Full grid rendering** over virtualization: 2,600 memoized cells render quickly; virtualization would complicate sticky headers and tests for little gain at 100×26. Documented as a limitation for larger grids.
- **System clipboard first, in-app clipboard as fallback**: paste prefers `navigator.clipboard.readText()` so copies made in other apps are honoured, and falls back to the always-available in-app payload when permission is denied or the API is missing. The in-app payload is still mirrored to the system clipboard on copy.
- **Formula references paste literally** (no relative rewriting): simpler and predictable, but differs from Excel's behavior; documented in README limitations.
