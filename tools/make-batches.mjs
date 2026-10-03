// Build translation batches from the extracted dictionaries.
// Writes work/i18n/batches.json, work/i18n/in/<batch>.json (english source) and a manifest.
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2] ?? 'work/i18n/dictionaries.json';
const outRoot = process.argv[3] ?? 'work/i18n';

const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const namespaces = Object.entries(data).map(([key, v]) => {
  const en = v.en ?? {};
  const chars = Object.values(en).reduce((n, s) => n + String(s).length, 0);
  return { key, namespace: v.namespace, pkg: v.pkg, en, entries: Object.keys(en).length, chars };
});
namespaces.sort((a, b) => b.chars - a.chars);

const MAX_CHARS = 4200;
const MAX_ENTRIES = 130;
const batches = [];
for (const ns of namespaces) {
  let target = batches.find((b) => b.chars + ns.chars <= MAX_CHARS && b.entries + ns.entries <= MAX_ENTRIES);
  if (!target) {
    target = { id: `batch-${String(batches.length + 1).padStart(2, '0')}`, namespaces: [], chars: 0, entries: 0 };
    batches.push(target);
  }
  target.namespaces.push({ key: ns.key, namespace: ns.namespace, pkg: ns.pkg });
  target.chars += ns.chars;
  target.entries += ns.entries;
}

fs.mkdirSync(path.join(outRoot, 'in'), { recursive: true });
fs.mkdirSync(path.join(outRoot, 'ru'), { recursive: true });

const manifest = [];
for (const b of batches) {
  const payload = {};
  for (const n of b.namespaces) payload[n.key] = data[n.key].en;
  const inFile = path.join(outRoot, 'in', `${b.id}.json`);
  const outFile = path.join(outRoot, 'ru', `${b.id}.json`);
  fs.writeFileSync(inFile, JSON.stringify(payload, null, 2));
  manifest.push({ ...b, inFile, outFile, strings: b.entries });
}

fs.writeFileSync(path.join(outRoot, 'batches.json'), JSON.stringify(manifest, null, 2));
console.log(`batches: ${manifest.length}`);
for (const b of manifest) {
  console.log(`${b.id}: ${b.namespaces.length} ns, ${b.entries} strings, ${b.chars} chars -> ${b.namespaces.map((n) => n.namespace).join(', ')}`);
}
