// Minimal Electron ASAR reader: list / cat / extract / pack helpers.
// Usage:
//   node asar.mjs list <asar> [prefixFilter]
//   node asar.mjs cat <asar> <internalPath>
//   node asar.mjs extract <asar> <destDir> [prefixFilter]
//   node asar.mjs pack <srcDir> <outAsar>
import fs from 'node:fs';
import path from 'node:path';

function readHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, 0);
  const headerSize = sizeBuf.readUInt32LE(4);
  const headerBuf = Buffer.alloc(headerSize);
  fs.readSync(fd, headerBuf, 0, headerSize, 8);
  // Pickle: uint32 payload size, then string length uint32, then utf8 json
  const jsonLen = headerBuf.readUInt32LE(4);
  const json = headerBuf.subarray(8, 8 + jsonLen).toString('utf8');
  fs.closeSync(fd);
  return { header: JSON.parse(json), dataOffset: 8 + headerSize };
}

function walk(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (entry.files) walk(entry, p, out);
    else out.push({ path: p, size: entry.size, offset: Number(entry.offset), unpacked: !!entry.unpacked, link: entry.link });
  }
  return out;
}

const [cmd, asarPath, ...rest] = process.argv.slice(2);
if (!cmd) {
  console.error('need a command');
  process.exit(1);
}

if (cmd === 'list') {
  const { header } = readHeader(asarPath);
  const filter = rest[0] || '';
  const files = walk(header, '', []);
  for (const f of files) {
    if (!filter || f.path.startsWith(filter)) console.log(`${f.size}\t${f.path}`);
  }
  console.error(`total: ${files.length} entries`);
} else if (cmd === 'cat') {
  const { header, dataOffset } = readHeader(asarPath);
  const target = rest[0];
  const parts = target.split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    node = node.files?.[part];
    if (!node) { console.error('not found: ' + target); process.exit(2); }
  }
  if (node.files) { console.error('is a directory'); process.exit(2); }
  const fd = fs.openSync(asarPath, 'r');
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, dataOffset + Number(node.offset));
  fs.closeSync(fd);
  process.stdout.write(buf);
} else if (cmd === 'extract') {
  const destDir = rest[0];
  const filter = rest[1] || '';
  const { header, dataOffset } = readHeader(asarPath);
  const files = walk(header, '', []);
  const fd = fs.openSync(asarPath, 'r');
  let n = 0;
  for (const f of files) {
    if (filter && !f.path.startsWith(filter)) continue;
    const outPath = path.join(destDir, f.path);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (f.unpacked || f.link) continue;
    const buf = Buffer.alloc(f.size);
    if (f.size > 0) fs.readSync(fd, buf, 0, f.size, dataOffset + f.offset);
    fs.writeFileSync(outPath, buf);
    n++;
  }
  fs.closeSync(fd);
  console.error(`extracted ${n} files to ${destDir}`);
} else if (cmd === 'extractMatch') {
  const destDir = rest[0];
  const re = new RegExp(rest[1]);
  const { header, dataOffset } = readHeader(asarPath);
  const files = walk(header, '', []);
  const fd = fs.openSync(asarPath, 'r');
  let n = 0;
  for (const f of files) {
    if (!re.test(f.path)) continue;
    const outPath = path.join(destDir, f.path);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (f.unpacked || f.link) continue;
    const buf = Buffer.alloc(f.size);
    if (f.size > 0) fs.readSync(fd, buf, 0, f.size, dataOffset + f.offset);
    fs.writeFileSync(outPath, buf);
    n++;
  }
  fs.closeSync(fd);
  console.error(`extracted ${n} files to ${destDir}`);
} else if (cmd === 'pack') {
  const srcDir = asarPath;
  const outAsar = rest[0];
  const header = { files: {} };
  const body = [];
  let offset = 0;
  const addDir = (absDir, node) => {
    for (const name of fs.readdirSync(absDir).sort()) {
      const abs = path.join(absDir, name);
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) {
        node.files[name] = { files: {} };
        addDir(abs, node.files[name]);
      } else if (st.isSymbolicLink()) {
        node.files[name] = { link: fs.readlinkSync(abs) };
      } else {
        const data = fs.readFileSync(abs);
        node.files[name] = { size: data.length, offset: String(offset) };
        body.push(data);
        offset += data.length;
      }
    }
  };
  addDir(srcDir, header);
  const jsonBuf = Buffer.from(JSON.stringify(header), 'utf8');
  const jsonLen = jsonBuf.length;
  const headerSize = 8 + jsonLen + (4 - (jsonLen % 4)) % 4;
  const headerBuf = Buffer.alloc(headerSize);
  headerBuf.writeUInt32LE(headerSize - 4, 0);
  headerBuf.writeUInt32LE(jsonLen, 4);
  jsonBuf.copy(headerBuf, 8);
  const sizeBuf = Buffer.alloc(8);
  sizeBuf.writeUInt32LE(4, 0);
  sizeBuf.writeUInt32LE(headerSize, 4);
  fs.writeFileSync(outAsar, Buffer.concat([sizeBuf, headerBuf, ...body]));
  console.error(`packed ${body.length} files -> ${outAsar}`);
}
