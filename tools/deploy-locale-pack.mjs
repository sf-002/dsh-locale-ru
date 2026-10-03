// Install the built Russian language pack into a DSH profile.
//
//   node tools/deploy-locale-pack.mjs [--profile <dir>] [--source <builtPackDir>]
//
// What it does, idempotently:
//   1. copies the built package into <DSH_HOME>/plugins/dsh-locale-ru   (the durable source)
//   2. copies it into <profile>/node_modules/@local/dsh-locale-ru      (profile-visible)
//   3. records the file: dependency and appends the bundle to dsh.profile.bundles
//   4. removes a hand-written `locale-ru` insert from the profile patch, if present
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dshHome = process.env.DSH_HOME ?? path.join(process.env.USERPROFILE ?? '', '.dsh');
const profileDir = path.resolve(opt('--profile', path.join(dshHome, 'profiles', 'desktop')));
const source = path.resolve(opt('--source', 'dist/dsh-locale-ru'));
const PKG = '@local/dsh-locale-ru';
const PKG_NAME = 'dsh-locale-ru';

if (!fs.existsSync(path.join(source, 'package.json'))) {
  console.error(`no built package at ${source}; run tools/build-locale-pack.mjs first`);
  process.exit(2);
}
if (!fs.existsSync(path.join(profileDir, 'package.json'))) {
  console.error(`no profile manifest at ${profileDir}`);
  process.exit(2);
}

const copyTree = (from, to) => {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
};

// 1 + 2. stage the package
const durable = path.join(dshHome, 'plugins', PKG_NAME);
copyTree(source, durable);
const inProfile = path.join(profileDir, 'node_modules', '@local', PKG_NAME);
copyTree(source, inProfile);
console.log(`staged ${durable}`);
console.log(`staged ${inProfile}`);

// 3. profile manifest: dependency + bundle entry
const manifestPath = path.join(profileDir, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
manifest.dependencies ??= {};
const relativeSpec = `file:${path.relative(profileDir, durable).split(path.sep).join('/')}`;
manifest.dependencies[PKG] = relativeSpec;
manifest.dsh ??= {};
manifest.dsh.profile ??= {};
manifest.dsh.profile.bundles ??= [];
if (!manifest.dsh.profile.bundles.includes(PKG)) manifest.dsh.profile.bundles.push(PKG);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`updated ${manifestPath} (dependency ${relativeSpec}, bundle appended)`);

// 4. drop a hand-written row insert for this package from the profile patch
const patchPath = path.join(profileDir, 'cordis.patch.yml');
if (fs.existsSync(patchPath)) {
  const lines = fs.readFileSync(patchPath, 'utf8').split(/\r?\n/);
  const out = [];
  let removed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '- insert:') { out.push(lines[i]); continue; }
    // collect the block: following lines indented deeper than the `- insert:` key
    let end = i + 1;
    while (end < lines.length && (lines[end].trim() === '' || /^[ \t]/.test(lines[end]))) end++;
    const block = lines.slice(i, end);
    const onlyOurRow = block.some((l) => l.includes(`name: '${PKG}'`) || l.includes(`name: "${PKG}"`))
      && block.every((l) => /^\s*(?:-\s*insert:|-\s*id:\s*\S+|id:\s*\S+|name:\s*\S+|#.*)?\s*$/.test(l));
    if (!onlyOurRow) { out.push(lines[i]); continue; }
    // also drop the comment block that introduced it
    while (out.length && out[out.length - 1].trim().startsWith('#')) out.pop();
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    removed++;
    i = end - 1;
    out.push('');
  }
  if (removed > 0) {
    fs.writeFileSync(patchPath, out.join('\n').replace(/\n{3,}/g, '\n\n'));
    console.log(`removed ${removed} hand-written locale-ru insert(s) from ${patchPath}`);
  }
  if (/locale-ru/.test(fs.readFileSync(patchPath, 'utf8'))) {
    console.warn('warning: the profile patch still mentions locale-ru — check it by hand');
  }
}

console.log('done. Restart DeepSeek Harness (or let HMR recompose) and pick «Русский» in Settings → General.');
