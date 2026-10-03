// Load the built client half the way the browser module loader does, then run its
// plugin body against a stub locale service and check every registered dictionary.
import fs from 'node:fs';

const pack = process.argv[2] ?? 'dist/dsh-locale-ru';
const code = fs.readFileSync(`${pack}/lib/client.js`, 'utf8');
const expected = JSON.parse(fs.readFileSync('work/i18n/dictionaries.json', 'utf8'));

let definition;
const window = { __ModuleLoader__: { load: (def) => { if (definition) throw new Error('loaded twice'); definition = def; } } };
new Function('window', code)(window);
if (!definition) throw new Error('bundle did not call window.__ModuleLoader__.load');
const pkgName = JSON.parse(fs.readFileSync(`${pack}/package.json`, 'utf8')).name;
if (definition.id !== pkgName) throw new Error(`bundle id ${definition.id} != package name ${pkgName}`);
if (typeof definition.factory !== 'function') throw new Error('bundle has no factory');

const plugin = definition.factory((specifier) => { throw new Error(`unexpected require("${specifier}")`); });
if (!plugin || typeof plugin.apply !== 'function') throw new Error('factory did not return a plugin with apply()');
if (!Array.isArray(plugin.inject) || !plugin.inject.includes('locale')) throw new Error('plugin does not inject "locale"');

const languages = [];
const dictionaries = new Map();
const effects = [];
const ctx = {
  effect(fn) { effects.push(fn()); },
  locale: {
    addLanguage(input) { languages.push(input); return () => {}; },
    register(ns, lang, dict) { dictionaries.set(`${ns}|${lang}`, dict); return () => {}; },
  },
};
plugin.apply(ctx);

const problems = [];
if (languages.length !== 1) problems.push(`addLanguage called ${languages.length} times`);
const [lang] = languages;
if (lang?.id !== 'ru') problems.push(`language id ${lang?.id}`);
if (!lang?.label) problems.push('language label missing');
if (lang?.fallback !== 'en') problems.push(`language fallback ${lang?.fallback}`);
if (effects.length !== languages.length + dictionaries.size) problems.push('effect count mismatch');

let checked = 0;
for (const [nsKey, record] of Object.entries(expected)) {
  const ru = dictionaries.get(`${record.namespace}|ru`);
  if (!ru) { problems.push(`namespace ${record.namespace} was not registered`); continue; }
  const enKeys = Object.keys(record.en);
  const ruKeys = Object.keys(ru);
  if (enKeys.length !== ruKeys.length) problems.push(`${record.namespace}: ${ruKeys.length} keys vs ${enKeys.length} expected`);
  for (const key of enKeys) {
    const value = ru[key];
    if (typeof value !== 'string') { problems.push(`${record.namespace}/${key}: not a string`); continue; }
    if (value.length === 0 && record.en[key].length > 0) { problems.push(`${record.namespace}/${key}: empty`); continue; }
    checked++;
  }
}

console.log(`bundle: ${definition.id}`);
console.log(`languages: ${JSON.stringify(languages)}`);
console.log(`namespaces registered: ${dictionaries.size}`);
console.log(`strings verified: ${checked}`);
console.log(`problems: ${problems.length}`);
for (const p of problems.slice(0, 20)) console.log('  ! ' + p);
process.exit(problems.length ? 1 : 0);
