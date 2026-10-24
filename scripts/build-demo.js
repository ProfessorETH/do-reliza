import { cp, mkdir, readFile, writeFile, rm, readdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

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
const stage = join(target, 'staging');
await mkdir(stage);
// Only game assets and the required license; no source art, logs or secrets.
await cp(join(root, 'assets'), join(stage, 'assets'), {recursive:true,filter:path=>!(/\.(?:js|css|png)$/.test(path))});
// These images are emitted by the CSS file loader with content hashes.
for (const file of ['agents.webp','office.webp','office-mobile.webp','onboarding/nika-portrait.webp']) await rm(join(stage,'assets',file),{force:true});
await cp(join(root, 'vendor/three/LICENSE'), join(stage, 'THREE-LICENSE.txt'));
const js = await build({
  absWorkingDir: root, entryPoints: ['app.js'], outdir: stage,
  entryNames:'[name]-[hash]', chunkNames:'chunk-[hash]',
  bundle:true, splitting:true, format:'esm', platform:'browser', target:'es2022',
  minify:true, metafile:true, legalComments:'eof',
  alias: {three:join(root,'vendor/three/three.module.js')},
  plugins:[{name:'canonical-source-modules', setup(api) {
    // Source-preview cache tags must not create duplicate runtime singletons.
    api.onResolve({filter:/\.js\?/}, args => ({path:resolve(args.resolveDir,args.path.split('?')[0])}));
  }}],
});
let html = await readFile(join(root,'index.html'),'utf8');
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)[^"]*">/g)].map(x=>x[1]);
const css = await build({
  absWorkingDir:root, stdin:{contents:styles.map(path=>`@import "./${path}";`).join('\n'),resolveDir:root,sourcefile:'styles.css',loader:'css'},
  outdir:stage,entryNames:'styles-[hash]',assetNames:'media/[name]-[hash]',
  bundle:true,minify:true,metafile:true,loader:{'.webp':'file'},target:['chrome100','safari15.4'],
});
// Cache by the contents of the entire directory, including late-loaded media.
async function files(directory) {
  const found=[];
  for(const e of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,e.name);
    if(e.isSymbolicLink()) throw new Error('Symlink cannot be published');
    if(e.isDirectory()) found.push(...await files(path)); else found.push(path);
  }
  return found.sort();
}
const hash=createHash('sha256');
for(const path of await files(stage)) hash.update(relative(stage,path).replaceAll('\\','/')).update(await readFile(path));
const assetVersion=hash.digest('hex').slice(0,24), prefix=`static/${assetVersion}/`;
await mkdir(join(target,'static'));
await rename(stage,join(target,'static',assetVersion));
const outputs={...js.metafile.outputs,...css.metafile.outputs};
const name=path=>relative(stage,resolve(root,path)).replaceAll('\\','/');
const app=Object.keys(js.metafile.outputs).find(path=>js.metafile.outputs[path].entryPoint==='app.js');
const style=Object.keys(css.metafile.outputs).find(path=>path.endsWith('.css'));
const preloads=new Set();
function visit(path) {
  for(const dependency of outputs[path]?.imports || []) {
    if(dependency.kind==='dynamic-import'||dependency.external) continue;
    if(!preloads.has(dependency.path)) {preloads.add(dependency.path);visit(dependency.path);}
  }
}
visit(app);
const mobileBackground=Object.keys(css.metafile.outputs).find(path=>css.metafile.outputs[path].inputs['assets/office-mobile.webp']);
const desktopBackground=Object.keys(css.metafile.outputs).find(path=>css.metafile.outputs[path].inputs['assets/office.webp']);
html=html.replace(/\s*<link rel="stylesheet"[^>]*>/g,'')
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/,'')
  .replace(/href="assets\/favicon.svg"/,`href="${prefix}assets/favicon.svg"`)
  .replace(/<script type="module"[^>]*><\/script>/, [
    `<link rel="stylesheet" href="${prefix}${name(style)}">`,
    `<link rel="preload" as="image" media="(max-width:760px)" href="${prefix}${name(mobileBackground)}">`,
    `<link rel="preload" as="image" media="(min-width:761px)" href="${prefix}${name(desktopBackground)}">`,
    ...[...preloads].map(path=>`<link rel="modulepreload" href="${prefix}${name(path)}">`),
    `<script type="module" src="${prefix}${name(app)}"></script>`,
  ].join('\n  '));
await writeFile(join(target,'index.html'),html);
const pkg = JSON.parse(await readFile(join(root,'package.json'),'utf8'));
await writeFile(join(target,'version.json'),JSON.stringify({version:pkg.version,assetVersion,buildDate:new Date().toISOString(),demo:'?demo=1'},null,2));
const agentsImage=Object.keys(css.metafile.outputs).find(path=>css.metafile.outputs[path].inputs['assets/agents.webp']);
await writeFile(join(root,'dist/build-manifest.json'),JSON.stringify({assetVersion,prefix,app:prefix+name(app),css:prefix+name(style),images:{desktop:prefix+name(desktopBackground),mobile:prefix+name(mobileBackground),agents:prefix+name(agentsImage)},preloads:[...preloads].map(path=>prefix+name(path)),outputs:js.metafile.outputs},null,2));
console.log(`Static demo ${pkg.version}: ${target}\nAssets: ${assetVersion}. No runtime backend, account or npm install required.`);
