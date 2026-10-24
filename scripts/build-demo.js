import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = resolve(root, 'dist/demo-v05');
if (!target.startsWith(resolve(root, 'dist') + sep)) throw new Error('Build must stay inside dist');
await mkdir(target, {recursive:true});
// Keep the directory itself: a Windows preview server may use it as its cwd.
// Clean only verified children so deleted source assets cannot linger in a build.
for (const name of await readdir(target)) {
  const entry = resolve(target, name);
  if (!entry.startsWith(target + sep)) throw new Error('Cleanup must stay inside the demo directory');
  await rm(entry, {recursive:true, force:true, maxRetries:3, retryDelay:100});
}
// Explicit allowlist: never copy .git, Blender sources, local logs or credentials.
const files = ['index.html','app.js','demo.js','engine.js','data.js','style.css','office.css','office.js','office-world.js','office-camera-fit.js','office-actors.js','office-pose.js','office-skeleton.js','office-layout.js','office-screens.js'];
for (const file of files) await cp(join(root,file), join(target,file));
for (const folder of ['assets','vendor']) await cp(join(root,folder),join(target,folder),{recursive:true});
const pkg = JSON.parse(await readFile(join(root,'package.json'),'utf8'));
await writeFile(join(target,'version.json'), JSON.stringify({ version:pkg.version, buildDate:new Date().toISOString(), demo:'?demo=1' },null,2));
console.log(`Static demo ${pkg.version}: ${target}\nOpen through HTTP. Quick start: /?demo=1. No backend, account or npm install required.`);
