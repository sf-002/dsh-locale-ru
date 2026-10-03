// v2: extract locale dictionaries from built client bundles with a tolerant object-literal parser.
// Output: work/i18n/dictionaries.json -> { "<pkg>|<namespace>": { pkg, namespace, zh, en, file } }
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'work/pkgs/dsh/node_modules/@deepseek-ai';
const outFile = process.argv[3] ?? 'work/i18n/dictionaries.json';

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const isIdentStart = (c) => /[A-Za-z_$]/.test(c);
const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);

// Skip a JS value starting at `i`; returns the index just past it.
function skipValue(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  const c = text[i];
  if (c === '{' || c === '[' || c === '(') return skipBalanced(text, i);
  if (c === '"' || c === "'" || c === '`') return skipString(text, i);
  // literal / identifier / member expression / call / arrow body: read until a top-level , or } at depth 0
  let depth = 0;
  let inStr = null;
  let j = i;
  while (j < text.length) {
    const ch = text[j];
    if (inStr) {
      if (ch === '\\') { j += 2; continue; }
      if (ch === inStr) inStr = null;
      j++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; j++; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      if (depth === 0) break;
      depth--;
    } else if (ch === ',' && depth === 0) break;
    j++;
  }
  return j;
}

function skipString(text, i) {
  const q = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === q) return j + 1;
    j++;
  }
  return j;
}

function skipBalanced(text, start) {
  const open = text[start];
  const close = open === '(' ? ')' : open === '{' ? '}' : ']';
  let depth = 0;
  let i = start;
  let inStr = null;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return i;
}

// Parse `{...}` into { key: valueDescriptor, ...spreads: [] }
function parseObject(text, start) {
  const end = skipBalanced(text, start);
  const inner = text.slice(start + 1, end - 1);
  const entries = [];
  const spreads = [];
  let i = 0;
  const base = start + 1;
  while (i < inner.length) {
    while (i < inner.length && /[\s,]/.test(inner[i])) i++;
    if (i >= inner.length) break;
    if (inner.startsWith('...', i)) {
      let j = i + 3;
      let name = '';
      while (j < inner.length && isIdent(inner[j])) name += inner[j++];
      spreads.push(name);
      i = j;
      continue;
    }
    let key = null;
    if (inner[i] === '"' || inner[i] === "'") {
      const k = skipString(inner, i);
      key = evalString(inner.slice(i, k));
      i = k;
    } else if (isIdentStart(inner[i])) {
      let j = i;
      let name = '';
      while (j < inner.length && isIdent(inner[j])) name += inner[j++];
      key = name;
      i = j;
    } else if (/[0-9]/.test(inner[i])) {
      let j = i;
      while (j < inner.length && /[0-9.]/.test(inner[j])) j++;
      key = inner.slice(i, j);
      i = j;
    } else {
      i++;
      continue;
    }
    while (i < inner.length && /\s/.test(inner[i])) i++;
    let value;
    if (inner[i] === ':') {
      i++;
      while (i < inner.length && /\s/.test(inner[i])) i++;
      value = parseValue(inner, i, base);
      i = value.end;
    } else {
      value = { kind: 'ref', name: key, end: i };
    }
    entries.push({ key, value });
  }
  return { kind: 'obj', entries, spreads, end };
}

function parseArray(text, start) {
  const end = skipBalanced(text, start);
  const inner = text.slice(start + 1, end - 1);
  const items = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /[\s,]/.test(inner[i])) i++;
    if (i >= inner.length) break;
    const v = parseValue(inner, i, start + 1);
    items.push(v);
    i = v.end;
  }
  // optional .join("sep")
  let suffix = '';
  let cursor = end;
  const tail = text.slice(end, end + 200);
  const joinMatch = /^\s*\.join\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\)/.exec(tail);
  if (joinMatch) {
    suffix = evalString(joinMatch[1]);
    cursor = end + joinMatch[0].length;
  }
  return { kind: 'array', items, join: suffix || null, end: cursor };
}

function parseValue(text, i, base) {
  const c = text[i];
  if (c === '{') {
    const obj = parseObject(text, i);
    return { ...obj, end: obj.end };
  }
  if (c === '[') return parseArray(text, i);
  if (c === '"' || c === "'") {
    const end = skipString(text, i);
    return { kind: 'str', value: evalString(text.slice(i, end)), end };
  }
  if (c === '`') {
    const end = skipString(text, i);
    return { kind: 'template', raw: text.slice(i, end), end };
  }
  // identifier / member / call / number / other expression
  const end = skipValue(text, i);
  const raw = text.slice(i, end).trim();
  if (/^[A-Za-z_$][\w$]*$/.test(raw)) return { kind: 'ref', name: raw, end };
  return { kind: 'other', raw, end };
}

function evalString(literal) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${literal});`)();
  } catch {
    return literal.slice(1, -1);
  }
}

function flatten(desc, objects, strings) {
  // returns Map<string, string|string[]>
  const out = new Map();
  const visit = (d, prefix, seen) => {
    if (!d) return;
    if (d.kind === 'str') { out.set(prefix, d.value); return; }
    if (d.kind === 'template') { out.set(prefix, d.raw); return; }
    if (d.kind === 'array') {
      const parts = d.items.map((item) => {
        if (item.kind === 'str') return item.value;
        if (item.kind === 'ref') return strings.get(item.name) ?? `\u0000UNRESOLVED:${item.name}`;
        return `\u0000OTHER:${JSON.stringify(item).slice(0, 80)}`;
      });
      out.set(prefix, d.join === null ? parts : parts.join(d.join));
      return;
    }
    if (d.kind === 'obj') {
      for (const s of d.spreads) {
        if (seen.has(s)) continue;
        seen.add(s);
        const target = objects.get(s);
        if (target) visit(target, prefix, seen);
      }
      for (const e of d.entries) {
        const key = prefix ? `${prefix}.${e.key}` : e.key;
        if (e.value.kind === 'ref') {
          if (strings.has(e.value.name)) { out.set(key, strings.get(e.value.name)); continue; }
          const target = objects.get(e.value.name);
          if (target) { visit(target, key, seen); continue; }
          out.set(key, `\u0000UNRESOLVED:${e.value.name}`);
          continue;
        }
        visit(e.value, key, seen);
      }
      return;
    }
    out.set(prefix, `\u0000OTHER:${d.raw}`);
  };
  visit(desc, '', new Set());
  return out;
}

function mapToObject(map) {
  const o = {};
  for (const [k, v] of map) o[k] = v;
  return o;
}

const result = {};
const problems = [];

for (const file of walk(root)) {
  if (!file.endsWith('client.js')) continue;
  const pkg = file.split(path.sep).slice(-3)[0];
  const text = fs.readFileSync(file, 'utf8');

  // collect top-level const/let/var declarations with object or string values
  const objects = new Map();
  const strings = new Map();
  const arrays = new Map();
  const declRe = /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  let dm;
  while ((dm = declRe.exec(text))) {
    const name = dm[1];
    const valueStart = dm.index + dm[0].length;
    const c = text[valueStart];
    if (c === '{') {
      const obj = parseObject(text, valueStart);
      objects.set(name, obj);
    } else if (c === '[') {
      arrays.set(name, parseArray(text, valueStart));
    } else if (c === '"' || c === "'") {
      const end = skipString(text, valueStart);
      strings.set(name, evalString(text.slice(valueStart, end)));
    }
  }

  const resolveNs = (expr) => {
    expr = expr.trim();
    if (/^".*"$/.test(expr) || /^'.*'$/.test(expr)) return evalString(expr);
    if (strings.has(expr)) return strings.get(expr);
    // fallback: any assignment `expr = "..."` anywhere in the file
    const assignRe = new RegExp(`\\b${expr}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`);
    const am = assignRe.exec(text);
    if (am) return evalString(am[1]);
    return null;
  };

  const regRe = /locale\.register\(/g;
  let rm;
  while ((rm = regRe.exec(text))) {
    const open = rm.index + rm[0].length - 1;
    const argsEnd = skipBalanced(text, open);
    const inner = text.slice(open + 1, argsEnd - 1);
    const args = [];
    let i = 0;
    while (i < inner.length) {
      while (i < inner.length && /[\s,]/.test(inner[i])) i++;
      if (i >= inner.length) break;
      const end = skipValue(inner, i);
      args.push(inner.slice(i, end).trim());
      i = end;
    }
    const ns = resolveNs(args[0] ?? '');
    if (!ns) { problems.push(`${pkg}: unresolved namespace from "${args[0]}"`); continue; }
    const key = `${pkg}|${ns}`;
    const record = result[key] ?? (result[key] = { pkg, namespace: ns, zh: null, en: null, file: path.relative(root, file) });

    if (args.length === 2) {
      const objText = args[1];
      let desc = null;
      if (objText.startsWith('{')) {
        // shorthand form { zh, en } or inline literal
        const inline = parseObject(objText, 0);
        const onlyShorthand = inline.entries.every((e) => e.value.kind === 'ref' && e.key === e.value.name) && inline.spreads.length === 0;
        if (onlyShorthand && inline.entries.length > 0) {
          for (const e of inline.entries) {
            const target = objects.get(e.value.name);
            if (!target) { problems.push(`${pkg}/${ns}: shorthand ${e.key} -> ${e.value.name} not found`); continue; }
            record[e.key] = mapToObject(flatten(target, objects, strings));
          }
          continue;
        }
        desc = inline;
      } else {
        desc = objects.get(objText) ?? null;
        if (!desc) { problems.push(`${pkg}/${ns}: dictionary object ${objText} not found`); continue; }
      }
      // typed inline literal: keys zh/en
      const inlineMap = flatten(desc, objects, strings);
      const zhKeys = [...inlineMap.keys()].filter((k) => k === 'zh' || k.startsWith('zh.'));
      const enKeys = [...inlineMap.keys()].filter((k) => k === 'en' || k.startsWith('en.'));
      if (zhKeys.length) {
        record.zh = {};
        for (const k of zhKeys) record.zh[k.replace(/^zh\.?/, '')] = inlineMap.get(k);
      }
      if (enKeys.length) {
        record.en = {};
        for (const k of enKeys) record.en[k.replace(/^en\.?/, '')] = inlineMap.get(k);
      }
      if (!zhKeys.length && !enKeys.length) problems.push(`${pkg}/${ns}: no zh/en keys in object ${objText}`);
    } else if (args.length === 3) {
      const lang = resolveNs(args[1]);
      const dictName = args[2];
      const desc = objects.get(dictName) ?? (dictName.startsWith('{') ? parseObject(dictName, 0) : null);
      if (!lang || !desc) {
        // `for (const [lang, dict] of pairs) ctx.locale.register(ns, lang, dict)`
        let handled = false;
        for (const arr of arrays.values()) {
          if (arr.items.length === 0) continue;
          const pairs = arr.items.every((item) => item.kind === 'array' && item.items.length === 2);
          if (!pairs) continue;
          for (const pair of arr.items) {
            const langDesc = pair.items[0];
            const dictDesc = pair.items[1];
            const langName = langDesc.kind === 'str' ? langDesc.value : null;
            if (!langName || dictDesc.kind !== 'obj') continue;
            record[langName] = mapToObject(flatten(dictDesc, objects, strings));
          }
          handled = true;
          break;
        }
        if (handled) continue;
      }
      if (!lang) { problems.push(`${pkg}/${ns}: unresolved language from "${args[1]}"`); continue; }
      if (!desc) { problems.push(`${pkg}/${ns}: per-locale dictionary ${dictName} not found`); continue; }
      record[lang] = mapToObject(flatten(desc, objects, strings));
    } else {
      problems.push(`${pkg}: unexpected register arity ${args.length}: ${inner.slice(0, 120)}`);
    }
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

let total = 0;
let missingEn = [];
let missingZh = [];
let unresolved = 0;
let mismatched = [];
for (const [key, v] of Object.entries(result)) {
  if (!v.en) missingEn.push(key);
  if (!v.zh) missingZh.push(key);
  const en = v.en ?? {};
  const zh = v.zh ?? {};
  total += Object.keys(en).length;
  const a = Object.keys(en).sort();
  const b = Object.keys(zh).sort();
  if (a.join('\u0001') !== b.join('\u0001')) mismatched.push(`${key} (en=${a.length} zh=${b.length})`);
  for (const s of Object.values(en)) if (String(s).startsWith('\u0000UNRESOLVED') || String(s).startsWith('\u0000OTHER')) unresolved++;
  for (const s of Object.values(zh)) if (String(s).startsWith('\u0000UNRESOLVED') || String(s).startsWith('\u0000OTHER')) unresolved++;
}
console.log(`namespaces: ${Object.keys(result).length}`);
console.log(`english strings: ${total}`);
console.log(`missing en: ${missingEn.length} ${missingEn.join(', ')}`);
console.log(`missing zh: ${missingZh.length} ${missingZh.join(', ')}`);
console.log(`key-set mismatches: ${mismatched.length} ${mismatched.join(' | ')}`);
console.log(`non-string values: ${unresolved}`);
console.log(`problems: ${problems.length}`);
for (const p of problems) console.log('  ! ' + p);
