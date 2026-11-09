#!/usr/bin/env node
/**
 * Trump Offers — local project checker.
 *
 * Verifies that every relative href, src, poster, srcset candidate and CSS
 * url() reference points at a real file, and that in-page anchors resolve to
 * an id on the target page.
 *
 * External URLs, mailto:, tel:, data:, blob: and javascript: links are not
 * fetched. Run with: npm run check
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const checked = new Set();

function walk(dir, filter, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const pages = [
  ...readdirSync(root)
    .filter((name) => name.endsWith('.html'))
    .map((name) => join(root, name)),
  ...walk(join(root, 'admin'), (file) => extname(file) === '.html'),
];

const htmlFiles = new Set(pages);
const idCache = new Map();

function idsFor(file) {
  if (idCache.has(file)) return idCache.get(file);
  const text = readFileSync(file, 'utf8');
  const ids = new Set();
  for (const match of text.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
    ids.add(match[1]);
  }
  for (const match of text.matchAll(/\bname\s*=\s*["']([^"']+)["']/g)) {
    ids.add(match[1]);
  }
  idCache.set(file, ids);
  return ids;
}

function isExternal(value) {
  return (
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) ||
    value.startsWith('#') ||
    value.startsWith('?')
  );
}

function isSkippableScheme(value) {
  return /^(?:mailto:|tel:|data:|blob:|javascript:)/i.test(value);
}

function report(file, value, message) {
  problems.push({
    file: relative(root, file) || file,
    value,
    message,
  });
}

function splitTarget(value) {
  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  let end = value.length;
  if (hashIndex !== -1) end = Math.min(end, hashIndex);
  if (queryIndex !== -1) end = Math.min(end, queryIndex);
  const pathPart = value.slice(0, end);
  const fragment = hashIndex === -1 ? '' : value.slice(hashIndex + 1);
  return { pathPart, fragment };
}

function checkReference(sourceFile, value, kind) {
  const raw = value.trim();
  if (!raw || isExternal(raw) || isSkippableScheme(raw)) return;

  const { pathPart, fragment } = splitTarget(raw);
  if (!pathPart) {
    // Same-page fragment only.
    if (fragment && htmlFiles.has(sourceFile) && !idsFor(sourceFile).has(decodeURIComponent(fragment))) {
      report(sourceFile, raw, `missing #${fragment} on this page`);
    }
    return;
  }

  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    report(sourceFile, raw, 'invalid percent-encoding');
    return;
  }

  const target = decoded.startsWith('/')
    ? resolve(root, `.${decoded}`)
    : resolve(dirname(sourceFile), decoded);

  const key = `${sourceFile}::${target}::${kind}`;
  if (checked.has(key)) return;
  checked.add(key);

  if (!target.startsWith(root + sep) && target !== root) {
    report(sourceFile, raw, 'resolves outside the project');
    return;
  }

  if (!existsSync(target)) {
    report(sourceFile, raw, 'target does not exist');
    return;
  }

  let stats;
  try {
    stats = statSync(target);
  } catch {
    report(sourceFile, raw, 'target is not readable');
    return;
  }

  if (stats.isDirectory()) {
    if (!existsSync(join(target, 'index.html'))) {
      report(sourceFile, raw, 'directory has no index.html');
    }
    return;
  }

  if (fragment && htmlFiles.has(target)) {
    const id = decodeURIComponent(fragment);
    if (id && !idsFor(target).has(id)) {
      report(sourceFile, raw, `missing #${fragment} in ${relative(root, target)}`);
    }
  }
}

/* ------------------------------------------------------------------ HTML */

const attrPattern = /\b(href|src|poster)\s*=\s*["']([^"']*)["']/gi;
const srcsetPattern = /\bsrcset\s*=\s*["']([^"']*)["']/gi;

for (const file of pages) {
  const text = readFileSync(file, 'utf8');

  for (const match of text.matchAll(attrPattern)) {
    checkReference(file, match[2], match[1].toLowerCase());
  }

  for (const match of text.matchAll(srcsetPattern)) {
    for (const candidate of match[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) checkReference(file, url, 'srcset');
    }
  }
}

/* ------------------------------------------------------------------- CSS */

const cssFiles = walk(join(root, 'css'), (file) => extname(file) === '.css');
const cssUrlPattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

for (const file of cssFiles) {
  const text = readFileSync(file, 'utf8');
  // Strip data: URLs first so nested url(#filter) fragments inside inline SVG
  // are not mistaken for local files.
  const source = text.replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/gi, 'url()');
  for (const match of source.matchAll(cssUrlPattern)) {
    const value = match[2].trim();
    if (!value || /^data:/i.test(value) || /^https?:/i.test(value)) continue;
    checkReference(file, value, 'css url()');
  }
}

/* --------------------------------------------------------------- reports */

if (problems.length) {
  console.error(`\n✖ ${problems.length} unresolved reference${problems.length === 1 ? '' : 's'}:\n`);
  for (const problem of problems) {
    console.error(`  ${problem.file}\n    ${problem.value}\n    → ${problem.message}\n`);
  }
  process.exit(1);
}

console.log(
  `✔ ${pages.length} HTML pages, ${cssFiles.length} stylesheets and all local references are valid.`
);
