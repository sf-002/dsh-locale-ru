// Print every locale.register(...) call shape found in extracted client bundles.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'work/pkgs/dsh/node_modules/@deepseek-ai';

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function balanced(text, start) {
  // start points at the opening delimiter
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
      if (depth === 0) return text.slice(start, i + 1);
    }
    i++;
  }
  return text.slice(start);
}

for (const file of walk(root)) {
  if (!file.endsWith('client.js')) continue;
  const text = fs.readFileSync(file, 'utf8');
  const re = /locale\.register\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const args = balanced(text, open);
    const pkg = file.split(path.sep).slice(-3)[0];
    console.log(`### ${pkg}`);
    console.log(args.replace(/\s+/g, ' ').slice(0, 400));
  }
}
