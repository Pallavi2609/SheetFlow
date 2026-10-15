// TEMPORARY TOOL — deleted after the scan. Not part of the application.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
};
['src', 'e2e'].forEach(walk);

const kindOf = (f) =>
  f.endsWith('.tsx') ? ts.ScriptKind.TSX : f.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
const parse = (f, text) => ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kindOf(f));

const counts = new Map();
const sources = new Map();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  sources.set(f, text);
  const sf = parse(f, text);
  const visit = (node) => {
    if (ts.isIdentifier(node)) counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const exported = [];
for (const f of files) {
  const text = sources.get(f);
  const sf = parse(f, text);
  const visit = (node) => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (isExport && node.name && ts.isIdentifier(node.name)) {
      exported.push({ name: node.name.text, file: f, kind: ts.SyntaxKind[node.kind] });
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        exported.push({ name: el.name.text, file: f, kind: 'reexport' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const candidates = exported
  .map((e) => ({ ...e, refs: counts.get(e.name) ?? 0 }))
  .filter((e) => e.refs <= 1)
  .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));

console.log(`scannedFiles=${files.length} exportedNames=${exported.length} unusedCandidates=${candidates.length}`);
for (const c of candidates) console.log(`${c.refs}\t${c.kind}\t${c.name}\t${c.file}`);
