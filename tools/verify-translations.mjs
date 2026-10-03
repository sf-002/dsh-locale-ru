// Verify the Russian translations against the English source dictionaries.
import fs from 'node:fs';
import path from 'node:path';

const source = JSON.parse(fs.readFileSync('work/i18n/dictionaries.json', 'utf8'));
const ruDir = 'work/i18n/ru';
const files = fs.readdirSync(ruDir).filter((f) => f.endsWith('.json')).sort();

const problems = [];
const stats = { checked: 0, identical: 0, noCyrillic: 0, placeholderMismatch: 0, missingKeys: 0, extraKeys: 0 };
const identical = [];
const noCyr = [];

const seen = new Set();
for (const file of files) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(ruDir, file), 'utf8'));
  } catch (error) {
    problems.push(`${file}: invalid JSON (${error.message})`);
    continue;
  }
  for (const [nsKey, dict] of Object.entries(parsed)) {
    if (!source[nsKey]) { problems.push(`${file}: unknown namespace ${nsKey}`); continue; }
    if (seen.has(nsKey)) problems.push(`${file}: namespace ${nsKey} translated twice`);
    seen.add(nsKey);
    const en = source[nsKey].en;
    for (const key of Object.keys(en)) {
      if (!(key in dict)) { problems.push(`${nsKey}: missing key ${key}`); stats.missingKeys++; continue; }
    }
    for (const key of Object.keys(dict)) {
      if (!(key in en)) { problems.push(`${nsKey}: extra key ${key}`); stats.extraKeys++; continue; }
      const src = en[key];
      const dst = dict[key];
      stats.checked++;
      if (typeof dst !== 'string') { problems.push(`${nsKey}/${key}: non-string translation`); continue; }
      if (dst.trim() === '') { problems.push(`${nsKey}/${key}: empty translation`); continue; }
      const tokens = (s) => (String(s).match(/\{[A-Za-z0-9_.]+\}/g) ?? []).sort().join(',');
      if (tokens(src) !== tokens(dst)) {
        problems.push(`${nsKey}/${key}: placeholder mismatch [${tokens(src)}] vs [${tokens(dst)}]`);
        stats.placeholderMismatch++;
      }
      if (dst === src) {
        stats.identical++;
        identical.push(`${nsKey}\t${key}\t${src}`);
      }
      if (!/[А-Яа-яЁё]/.test(dst)) {
        stats.noCyrillic++;
        noCyr.push(`${nsKey}\t${key}\t${src}\t=>\t${dst}`);
      }
    }
  }
}
for (const nsKey of Object.keys(source)) if (!seen.has(nsKey)) problems.push(`namespace never translated: ${nsKey}`);

console.log(`files: ${files.length}`);
console.log(`strings checked: ${stats.checked}`);
console.log(`identical to English: ${stats.identical}`);
console.log(`without Cyrillic: ${stats.noCyrillic}`);
console.log(`placeholder mismatches: ${stats.placeholderMismatch}`);
console.log(`missing keys: ${stats.missingKeys}, extra keys: ${stats.extraKeys}`);
console.log(`problems: ${problems.length}`);
for (const p of problems.slice(0, 40)) console.log('  ! ' + p);
fs.writeFileSync('work/i18n/verify-identical.tsv', identical.join('\n'));
fs.writeFileSync('work/i18n/verify-nocyrillic.tsv', noCyr.join('\n'));
