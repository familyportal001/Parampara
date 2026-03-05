#!/usr/bin/env node
/**
 * Parampara i18n Coverage Checker
 * 
 * Usage:
 *   node i18n-checker.js [path/to/index.html]
 * 
 * Exits with code 1 if any coverage issues are found.
 * Exits with code 0 if all languages are fully covered.
 * 
 * Checks:
 *   1. Keys in STRINGS.en but missing from other languages (untranslated)
 *   2. Keys used in app (t('key') + data-i18n="key") but not defined in any language
 *   3. Keys defined in non-English languages but not in en (orphaned)
 *   4. Keys defined in en but never used anywhere (dead weight)
 *   5. Per-language coverage percentage
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const filePath = process.argv[2] || path.join(__dirname, 'index.html');
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(2);
}

const src = fs.readFileSync(filePath, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Extract all language blocks from STRINGS
// ─────────────────────────────────────────────────────────────────────────────
function extractLangKeys(lang) {
  // Match: `  langCode: {` ... `},` followed by next lang or closing brace
  // Use a greedy block match then parse key: value pairs
  const startPattern = new RegExp(`\\n  ${lang}:\\s*\\{`);
  const start = src.search(startPattern);
  if (start === -1) return { keys: new Set(), values: {} };

  // Find the matching closing brace
  let depth = 0, i = src.indexOf('{', start);
  const blockStart = i;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  const block = src.slice(blockStart + 1, i);

  // Extract key: 'value' pairs (handles both ' and " delimiters, multi-word values)
  const keys = new Set();
  const values = {};
  for (const m of block.matchAll(/\b(\w+)\s*:\s*(['"`])([\s\S]*?)\2/g)) {
    keys.add(m[1]);
    values[m[1]] = m[3];
  }
  return { keys, values };
}

// Find all language codes present in STRINGS
const langCodes = [...src.matchAll(/\n  ([a-z]{2,3}):\s*\{/g)].map(m => m[1]);
if (!langCodes.includes('en')) {
  console.error('Could not find STRINGS.en — is this the right file?');
  process.exit(2);
}

const langs = {};
for (const lang of langCodes) {
  langs[lang] = extractLangKeys(lang);
}

const enKeys  = langs.en.keys;
const enVals  = langs.en.values;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Extract all keys actually used in the app
// ─────────────────────────────────────────────────────────────────────────────
// t('key') calls in JS
const tCallKeys = new Set(
  [...src.matchAll(/\bt\('([^']+)'\)/g)].map(m => m[1])
);

// data-i18n, data-i18n-ph, data-i18n-tip attributes in HTML
// Exclude false positives from comments — only match inside tag-like context
const htmlAttrKeys = new Set(
  [...src.matchAll(/data-i18n(?:-ph|-tip)?="([a-zA-Z][a-zA-Z0-9_]*)"/g)]
    .map(m => m[1])
    .filter(k => k !== 'key') // filter out the comment example "data-i18n="key""
);

const usedKeys = new Set([...tCallKeys, ...htmlAttrKeys]);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Analyse and report
// ─────────────────────────────────────────────────────────────────────────────
let issues = 0;

const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

console.log(`\n${BOLD}══ Parampara i18n Coverage Checker ══════════════════════════${RESET}`);
console.log(`${DIM}   File: ${filePath}${RESET}\n`);

// ── Per-language coverage ──────────────────────────────────────────
console.log(`${CYAN}Languages found:${RESET} ${langCodes.join(', ')}`);
console.log(`${CYAN}Keys in STRINGS.en:${RESET} ${enKeys.size}`);
console.log(`${CYAN}Keys used in app:${RESET} ${usedKeys.size}\n`);

for (const lang of langCodes.filter(l => l !== 'en')) {
  const { keys } = langs[lang];
  const missing = [...enKeys].filter(k => !keys.has(k));
  const extra   = [...keys].filter(k => !enKeys.has(k));
  const covered = enKeys.size - missing.length;
  const pct     = Math.round((covered / enKeys.size) * 100);
  const bar     = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
  const color   = pct === 100 ? GREEN : pct >= 80 ? YELLOW : RED;
  console.log(`${color}${lang.toUpperCase()}  ${bar} ${pct}% (${covered}/${enKeys.size})${RESET}`);

  if (missing.length) {
    issues += missing.length;
    console.log(`  ${RED}✗ Missing ${missing.length} key(s):${RESET}`);
    missing.forEach(k => {
      console.log(`      ${k}${DIM} — en: "${enVals[k] || '?'}"${RESET}`);
    });
  }
  if (extra.length) {
    console.log(`  ${YELLOW}⚠ ${extra.length} key(s) in ${lang} but not in en (orphaned):${RESET}`);
    extra.forEach(k => console.log(`      ${k}`));
  }
}

// ── Keys used in app but not defined anywhere ──────────────────────
const undefinedKeys = [...usedKeys].filter(k => !enKeys.has(k)).sort();
if (undefinedKeys.length) {
  issues += undefinedKeys.length;
  console.log(`\n${RED}✗ Used in app but not defined in any language (${undefinedKeys.length}):${RESET}`);
  undefinedKeys.forEach(k => {
    // Show where it's used
    const inT    = tCallKeys.has(k) ? 't()' : '';
    const inHtml = htmlAttrKeys.has(k) ? 'data-i18n' : '';
    const where  = [inT, inHtml].filter(Boolean).join(', ');
    console.log(`  ${RED}  ${k}${RESET}${DIM} (${where})${RESET}`);
  });
}

// ── Dead keys ──────────────────────────────────────────────────────
const deadKeys = [...enKeys].filter(k => !usedKeys.has(k)).sort();
if (deadKeys.length) {
  console.log(`\n${YELLOW}⚠ Defined in en but never used in app (${deadKeys.length} dead keys):${RESET}`);
  deadKeys.forEach(k => console.log(`  ${YELLOW}  ${k}${DIM} — "${enVals[k] || '?'}"${RESET}`));
}

// ── Summary ────────────────────────────────────────────────────────
console.log(`\n${BOLD}══ Summary ═══════════════════════════════════════════════════${RESET}`);
if (issues === 0 && deadKeys.length === 0) {
  console.log(`${GREEN}${BOLD}✅ All languages fully covered. No issues found.${RESET}\n`);
  process.exit(0);
} else if (issues === 0) {
  console.log(`${GREEN}✅ All languages fully covered.${RESET}`);
  console.log(`${YELLOW}   ${deadKeys.length} dead key(s) can be cleaned up (see above).${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}✗ ${issues} coverage issue(s) found.${RESET}`);
  if (deadKeys.length) console.log(`${YELLOW}  ${deadKeys.length} dead key(s) also found.${RESET}`);
  console.log(`${DIM}  Fix missing keys before shipping a new language.${RESET}\n`);
  process.exit(1);
}
