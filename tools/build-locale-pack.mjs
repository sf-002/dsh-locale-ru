// Build the Russian language-pack client plugin from the extracted dictionaries and translations.
//
//   node tools/build-locale-pack.mjs [--out <dir>] [--allow-partial]
//
// Inputs:
//   work/i18n/dictionaries.json   english source of every shipped namespace (extracted from app.asar)
//   work/i18n/ru/*.json           { "<pkg>|<namespace>": { "<key>": "<russian>" } }
// Output:
//   <out>/package.json, <out>/lib/index.js, <out>/lib/client.js, <out>/README.md
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'dist/dsh-locale-ru';
const allowPartial = args.includes('--allow-partial');
const PKG = '@local/dsh-locale-ru';
const LANG = { id: 'ru', label: 'Русский', fallback: 'en' };

const source = JSON.parse(fs.readFileSync('work/i18n/dictionaries.json', 'utf8'));

// merge translations
const ruByKey = {};
const ruDir = 'work/i18n/ru';
const files = fs.existsSync(ruDir) ? fs.readdirSync(ruDir).filter((f) => f.endsWith('.json')).sort() : [];
for (const file of files) {
  const parsed = JSON.parse(fs.readFileSync(path.join(ruDir, file), 'utf8'));
  for (const [nsKey, dict] of Object.entries(parsed)) {
    if (!source[nsKey]) {
      console.error(`!! ${file}: unknown namespace key ${nsKey}`);
      continue;
    }
    ruByKey[nsKey] = { ...(ruByKey[nsKey] ?? {}), ...dict };
  }
}

const problems = [];
const namespaces = {};
let translated = 0;
let missing = 0;
const missingList = [];
for (const [nsKey, record] of Object.entries(source)) {
  const ns = record.namespace;
  const en = record.en ?? {};
  const ru = ruByKey[nsKey] ?? {};
  const enKeys = Object.keys(en);
  const out = {};
  for (const key of enKeys) {
    const value = ru[key];
    if (typeof value === 'string' && value.length > 0) {
      out[key] = value;
      translated++;
    } else if (typeof value === 'string' && en[key] === '') {
      // an empty source (separator slots keep their empty value) needs no translation
      out[key] = '';
      translated++;
    } else {
      missing++;
      missingList.push(`${nsKey}\t${key}\t${en[key]}`);
    }
  }
  for (const key of Object.keys(ru)) {
    if (!(key in en)) problems.push(`${nsKey}: translation has unknown key "${key}"`);
  }
  if (Object.keys(out).length > 0) {
    namespaces[ns] = { ...(namespaces[ns] ?? {}), ...out };
  }
}

if (problems.length) {
  console.error('KEY PROBLEMS:');
  for (const p of problems) console.error('  ! ' + p);
}
console.log(`namespaces with translations: ${Object.keys(namespaces).length}/${Object.keys(source).length}`);
console.log(`translated strings: ${translated}, untranslated: ${missing}`);
if (missingList.length) {
  fs.mkdirSync('work/i18n', { recursive: true });
  fs.writeFileSync('work/i18n/missing.tsv', missingList.join('\n'));
}
if (missing > 0 && !allowPartial) {
  console.error('refusing to build: translations are incomplete (pass --allow-partial to build anyway)');
  process.exit(2);
}
if (problems.length) process.exit(3);

const packageJson = {
  name: PKG,
  version: '1.0.0',
  private: true,
  description: 'Russian language pack for the DeepSeek Harness web GUI',
  type: 'module',
  main: 'lib/index.js',
  exports: {
    '.': { default: './lib/index.js' },
    './client': { default: './lib/client.js' },
    './cordis.patch.yml': './cordis.patch.yml',
    './package.json': './package.json',
  },
  files: ['lib/index.js', 'lib/client.js', 'cordis.patch.yml'],
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: {
      platform: 'web',
      inject: ['@deepseek-ai/dsh-client-locale'],
    },
  },
};

// A bundle owns a Loader patch layer; this one inserts the pack's own row.
const bundlePatch = `# Russian language pack: one client row that registers the \`ru\` locale and
# its namespace dictionaries through the locale service.
- insert:
    - id: locale-ru
      name: '${PKG}'
`;

const hostHalf = `// Host half of the Russian language pack: it owns no Host-side behaviour, so the
// client half carries the whole contribution (language definition + dictionaries).
export function apply() {}
`;

const clientHalf = `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(PKG)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n\t\t//#region locale-ru dictionaries\n\t\t/** One language definition plus every translated namespace. */\n\t\tconst language = ${JSON.stringify(LANG, null, '\t').replace(/\n/g, '\n\t\t')};\n\t\tconst dictionaries = ${JSON.stringify(namespaces, null, '\t').replace(/\n/g, '\n\t\t')};\n\t\t//#endregion\n\t\t/** Required service: the web GUI locale registry. */\n\t\tconst inject = ["locale"];\n\t\t/**\n\t\t* Register the Russian language and its namespace dictionaries.\n\t\t* @param ctx - client root context.\n\t\t*/\n\t\tfunction apply(ctx) {\n\t\t\tctx.effect(() => ctx.locale.addLanguage(language), "locale-ru: language");\n\t\t\tfor (const [namespace, dictionary] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(namespace, language.id, dictionary), \`locale-ru: \${namespace}\`);\n\t\t}\n\t\texports.apply = apply;\n\t\texports.inject = inject;\n\t\treturn module.exports;\n\t}\n});\n`;

const readme = `# ${PKG}

Russian language pack for the DeepSeek Harness web GUI. Registers the \`ru\` language
(fallback \`en\`) through \`ctx.locale.addLanguage\` and one dictionary per shipped
namespace through \`ctx.locale.register(name, 'ru', dictionary)\`.

Generated by \`tools/build-locale-pack.mjs\`; do not edit by hand.
`;

fs.mkdirSync(path.join(outDir, 'lib'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'cordis.patch.yml'), bundlePatch);
fs.writeFileSync(path.join(outDir, 'lib', 'index.js'), hostHalf);
fs.writeFileSync(path.join(outDir, 'lib', 'client.js'), clientHalf);
fs.writeFileSync(path.join(outDir, 'README.md'), readme);
console.log(`wrote ${outDir} (client.js ${fs.statSync(path.join(outDir, 'lib', 'client.js')).size} bytes)`);
