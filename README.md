# SheetFlow

A lightweight, professional mini spreadsheet built with React and TypeScript. SheetFlow runs entirely in the browser — no backend, no accounts, no API keys. Your data is stored locally and restored after every refresh.

## Features

### Core

- 100 × 26 grid (A–Z columns, numbered rows) with sticky headers
- Cell selection by mouse (click, double-click, drag) and keyboard
- In-cell editing and formula-bar editing, kept in sync
- Keyboard navigation: arrows, Enter, Tab, Shift variants, F2, Escape, Delete
- Single-cell and multi-cell range copy/paste (in-app clipboard + system clipboard best effort)
- Formula engine: `=A1+B1`, `=A1-B1`, `=A1*B1`, `=A1/B1`, `=A1*2`, `=(A1+B1)*2`, `=2^3`
- Range functions: `=SUM(A1:A5)`, `=MIN(A1:A5)`, `=MAX(A1:A5)`, `=AVERAGE(A1:A5)`
- Automatic recalculation of dependent cells on every edit
- Error handling: `#ERROR!`, `#REF!`, `#DIV/0!`, `#CYCLE!`, `#VALUE!`, `#NAME?`
- Circular reference detection — cycles display `#CYCLE!` and never freeze the app
- Undo/redo (100-step history, buttons + `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`)
- Clear cell contents (`Delete` / `Backspace` or the Clear button)
- Raw input is stored separately from the calculated display value
- LocalStorage persistence with versioned payloads and corruption recovery
- Reset with confirmation dialog
- Responsive desktop interface with a modern blue theme (`#2563EB`)

### Advanced

- Range selection via Shift+arrows or click-drag, with a live status-bar summary (count, sum, average)
- Row and column resizing via drag handles (min/max clamped), double-click-free and non-destructive
- Fill handle: drag the bottom-right square of a selection to copy values, text, or formulas; relative A1 references are shifted by the drag distance
- CSV import (RFC 4180-style quoting) and CSV export of the used rectangle
  - **Safe export (default):** values beginning with `=`, `+`, `-`, `@`, TAB or CR are prefixed with an apostrophe so the file cannot execute formulas when opened in Excel/Sheets (CSV formula-injection defence)
  - **Raw export:** a second button exports formulas verbatim for lossless backup / round-trip
- Cell formatting: bold, italic, left/center/right alignment
- Accessible grid: `role="grid"`, a focusable grid element with `aria-activedescendant`, per-cell `aria-selected`, a polite `role="status"` save indicator, and a focus-trapped shortcuts dialog
- Responsive, desktop-first layout that stays usable down to 320px wide
- Keyboard shortcut help dialog
- Save-status indicator (saving / saved / storage error)

## Technology stack

| Concern        | Choice                                    |
| -------------- | ----------------------------------------- |
| Framework      | React 19                                  |
| Language       | TypeScript (strict)                       |
| Build          | Vite 8                                    |
| Styling        | Tailwind CSS 4 (via `@tailwindcss/vite`)  |
| State          | Zustand 5 (single store, sparse cells)    |
| Icons          | Lucide React                              |
| Tests          | Vitest 5 + React Testing Library; Playwright 1 (system Chrome) for E2E |
| Lint / Format  | ESLint 10 (typescript-eslint) + Prettier  |

## Installation

```bash
npm install
```

## Local development

```bash
npm run dev
```

Vite prints the local URL (default `http://localhost:5173`).

## Testing

```bash
npm run test          # unit/component tests (Vitest, jsdom) — single run
npm run test:watch    # watch mode
npm run build         # required before E2E (tests run against the production preview)
npm run test:e2e      # real-browser end-to-end tests (Playwright + system Chrome)
```

The unit suite (137 tests across 3 files) covers the formula engine, the store (editing, recalculation, dependencies, cycles, undo/redo, clipboard, CSV security, formatting, fill, sizing, persistence, reset), and full-app component behaviour (keyboard navigation, formula bar, dialogs, accessibility).

The Playwright suite (20 browser tests) drives the **production preview build** in real Chrome: loading, editing, formulas, dependency recalculation, undo/redo, errors, cycles, SUM, keyboard navigation, clipboard, real page reloads, reset, CSV import/export, the fill handle, column resizing, responsive widths (320–1920px), accessibility focus management, and a performance measurement pass.

## Production build

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm run test          # vitest run
npm run build         # tsc --noEmit && vite build
npm run preview       # serve the production build locally
```

## Keyboard shortcuts

| Keys                    | Action                                  |
| ----------------------- | --------------------------------------- |
| ↑ ↓ ← →                 | Move the active cell                    |
| Shift + ↑ ↓ ← →         | Extend the selection                    |
| Enter                   | Start editing / commit and move down    |
| Shift + Enter           | Commit and move up                      |
| Tab / Shift + Tab       | Move right / left                       |
| F2                      | Edit the selected cell                  |
| Escape                  | Cancel editing                          |
| Delete / Backspace      | Clear selected cells                    |
| Ctrl or ⌘ + C           | Copy selection (including formulas)     |
| Ctrl or ⌘ + V           | Paste at the selection start            |
| Ctrl or ⌘ + Z           | Undo                                    |
| Ctrl or ⌘ + Shift + Z   | Redo                                    |
| Ctrl + Y                | Redo                                    |
| Type any character      | Start editing the selected cell         |

Shortcuts are inert while focus is inside an input, so they never interfere with typing.

## Supported formulas

```
=A1+B1        =A1-B1        =A1*B1        =A1/B1
=A1*2         =(A1+B1)*2    =2^3
=SUM(A1:A5)   =MIN(A1:A5)   =MAX(A1:A5)   =AVERAGE(A1:A5)
```

- Operator precedence and parentheses are respected; `^` is exponentiation.
- Empty cells count as `0` in arithmetic; text in arithmetic yields `#VALUE!`.
- Division by zero yields `#DIV/0!`; unknown functions yield `#NAME?`; references outside the grid yield `#REF!`; malformed formulas yield `#ERROR!`.
- Circular references yield `#CYCLE!` instead of hanging.
- Results are rounded to 12 significant digits so `0.1+0.2` displays `0.3`.

## Project structure

```
SheetFlow/
├── index.html
├── package.json
├── vite.config.ts            # Vite + Vitest config (jsdom, setup file)
├── playwright.config.ts      # Real-browser E2E config (system Chrome, production preview)
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── .github/workflows/ci.yml  # typecheck + lint + unit + build + E2E
├── public/favicon.svg
├── e2e/                      # Playwright specs (functional + performance)
└── src/
    ├── main.tsx              # React entry
    ├── App.tsx               # Shell: header, toolbar, formula bar, grid, status bar
    ├── index.css             # Tailwind theme (#2563EB brand)
    ├── components/
    │   ├── layout/Header.tsx         # Logo + save status
    │   ├── toolbar/Toolbar.tsx       # Undo/redo, clipboard, format, CSV, reset, help
    │   ├── toolbar/ToolButton.tsx    # Accessible icon button
    │   └── spreadsheet/
    │       ├── Grid.tsx              # Sticky headers, 100×26 table
    │       ├── CellView.tsx          # Cell display + in-cell editor
    │       ├── FormulaBar.tsx        # Address + raw-input editor
    │       ├── StatusBar.tsx         # Active cell + selection summary
    │       └── ShortcutsHelp.tsx     # Shortcut dialog
    ├── formulas/             # Safe formula engine (no eval / no Function)
    │   ├── tokenizer.ts      # Lexer
    │   ├── parser.ts         # Recursive-descent parser -> AST
    │   ├── evaluator.ts      # AST evaluator + built-in functions
    │   ├── errors.ts         # FormulaError with displayable codes
    │   ├── shift.ts          # Reference shifting for the fill handle
    │   └── index.ts          # Public API, parse cache, dependency collection
    ├── store/sheetStore.ts   # Zustand store: cells, derived state, history, clipboard
    ├── hooks/useGridKeyboard.ts      # Global keyboard handling
    ├── utils/
    │   ├── address.ts        # A1-style addresses, ranges
    │   ├── csv.ts            # CSV/TSV parse + serialize
    │   ├── display.ts        # Value formatting, alignment classes
    │   ├── clipboard.ts      # System clipboard helpers
    │   └── persistence.ts    # Versioned LocalStorage read/write
    ├── types/index.ts        # Shared types and grid constants
    └── tests/                # Vitest suites (engine, store, app)
```

## Deployment (Vercel)

1. Push the repository to GitHub (see below).
2. Import the repo in Vercel — the framework preset is **Vite**.
3. Build command: `npm run build`, output directory: `dist`.
4. Deploy. Any static host works the same way (`dist/` is fully static).

## GitHub submission steps

```bash
git init                     # if not already initialized
git add .
git commit -m "SheetFlow: mini spreadsheet"
git remote add origin <your-repo-url>
git push -u origin main
```

## Known limitations

- Grid is fixed at 100 rows × 26 columns (no dynamic row/column insertion).
- All cells are rendered (memoized) rather than virtualized. Measured in Chrome: 2,600 cells, ~5,700 DOM nodes, ~63 ms load and ~26 MB heap, so virtualization was deliberately deferred — see `REPORT.md` §16.
- Pasted formulas keep their literal references (no relative-reference rewriting like Excel). The **fill handle** does shift references; plain paste does not — documented, tested behaviour.
- Custom row/column sizes are per-session (not persisted across refresh).
- Fill copies values/formulas; it does not generate numeric or date series.
- CSV import replaces the current sheet contents rather than inserting at a cursor.
- Undo history tracks cell data (not selection or formatting-only focus changes) and is capped at 100 steps.
- Safe CSV export prefixes dangerous leading characters with `'`, so a safe-exported file re-imported into SheetFlow keeps that apostrophe (use raw export for lossless round-trips).
- Reset uses the browser's native `window.confirm` dialog and is intentionally not undoable.
- System clipboard cut/copy/paste depends on browser permissions; the in-app clipboard always works as a fallback.
