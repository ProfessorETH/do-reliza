import { readdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = resolve(root, 'dist/demo-v05');
await stat(join(site, 'index.html'));
const records = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink cannot be published: ${path}`);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (entry.name.endsWith('.gz')) continue;
    const original = await readFile(path);
    await rm(`${path}.gz`, { force: true });
    let transferBytes = original.length;
    if (/\.(html|js|css|json|svg|glb)$/.test(extname(path))) {
      const compressed = gzipSync(original, { level: 9 });
      if (!gunzipSync(compressed).equals(original)) throw new Error(`Compression mismatch: ${path}`);
      if (compressed.length < original.length * .95 && original.length - compressed.length > 100) {
        await writeFile(`${path}.gz`, compressed);
        transferBytes = compressed.length;
      }
    }
    records.push({ path: relative(site, path).replaceAll('\\', '/'), bytes: original.length, transferBytes,
      sha256: createHash('sha256').update(original).digest('hex') });
  }
}
await walk(site);
records.sort((a, b) => a.path.localeCompare(b.path));
const receipt = {
  createdAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  files: records.length,
  originalBytes: records.reduce((sum, file) => sum + file.bytes, 0),
  transferBytes: records.reduce((sum, file) => sum + file.transferBytes, 0),
  note: 'Whole distribution totals, not first-page network measurements. Gzip requires configured hosting.',
  records,
};
await writeFile(resolve(root, 'dist/hosting-report.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ files: receipt.files, originalBytes: receipt.originalBytes, transferBytes: receipt.transferBytes }));
