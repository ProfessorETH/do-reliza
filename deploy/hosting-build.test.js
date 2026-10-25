import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderStartScreen } from '../assets/start-screen.js';
import { createHash } from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(resolve(root,'dist/build-manifest.json'),'utf8'));
const html=await readFile(resolve(root,'dist/demo-v05/index.html'),'utf8');

test('production entry and eager preloads exclude Three.js and physical office', () => {
  const outputs=manifest.outputs, eager=new Set();
  function visit(path) {
    if(eager.has(path)) return;
    eager.add(path);
    for(const i of outputs[path].imports) if(i.kind!=='dynamic-import'&&!i.external) visit(i.path);
  }
  visit(Object.keys(outputs).find(p=>outputs[p].entryPoint==='app.js'));
  const inputs=[...eager].flatMap(p=>Object.keys(outputs[p].inputs));
  assert(!inputs.some(p=>p.startsWith('vendor/three/')||p.startsWith('vendor/meshopt/')||p==='office-world.js'));
  assert(Object.values(outputs).some(o=>Object.keys(o.inputs).includes('office-world.js')));
  assert.equal(inputs.filter(p=>p==='assets/office-runtime.js').length,1);
});

test('HTML references existing versioned files and only one stylesheet', async () => {
  assert.match(manifest.prefix,/^static\/[a-f0-9]{24}\/$/);
  assert.equal([...html.matchAll(/rel="stylesheet"/g)].length,1);
  assert(!html.includes('importmap'));
  for(const [,path] of html.matchAll(/(?:src|href)="(static\/[^"]+)"/g)) {
    assert(path.startsWith(manifest.prefix));
    assert((await stat(resolve(root,'dist/demo-v05',path))).isFile());
  }
  assert.match(html,/media="\(max-width:760px\)"/);
  assert.match(html,/media="\(min-width:761px\)"/);
});

test('mobile background is materially smaller; dynamically loaded assets remain in bundle root', async () => {
  const dir=resolve(root,'dist/demo-v05',manifest.prefix);
  assert((await stat(resolve(root,'assets/office-mobile.webp'))).size < (await stat(resolve(root,'assets/office.webp'))).size / 4);
  for(const path of ['models/office.glb','models/office-upgrades.glb','onboarding/nika-avatar.webp']) {
    assert((await stat(resolve(dir,'assets',path))).size>0);
  }
  assert((await stat(resolve(dir,'THREE-LICENSE.txt'))).size>0);
});

test('the accepted start audio portrait uses the module asset root, not the HTML root', () => {
  const markup=renderStartScreen({difficulty:'calm',saved:null,demo:false,logo:()=>'',icon:()=>'',money:String,soundButton:'',soundEnabled:true,soundPreviewed:false});
  assert(!markup.includes('src="assets/'));
  assert.match(markup,/src="[^"]+\/assets\/onboarding\/nika-avatar\.webp"/);
});

test('public character workshop uses versioned local modules and all seven accepted models', async () => {
  const gallery=await readFile(resolve(root,'dist/demo-v05/characters.html'),'utf8');
  assert.match(gallery,/data-characters="7"/);
  assert(!gallery.includes('importmap'));
  for(const [,path] of gallery.matchAll(/(?:src|href)="(static\/[^"]+)"/g)) {
    assert(path.startsWith(manifest.prefix));
    assert((await stat(resolve(root,'dist/demo-v05',path))).isFile());
  }
  for(const id of ['mira','pixel','nord','iskra','saga','echo','nika']) {
    const bytes=await readFile(resolve(root,'dist/demo-v05',manifest.prefix,'assets/models',`${id}.glb`));
    const report=JSON.parse(await readFile(resolve(root,'dist/character-transfer-report.json'),'utf8'));
    const receipt=report.records.find(r=>r.id===id);
    const hash=b=>createHash('sha256').update(b).digest('hex');
    assert.equal(hash(bytes),receipt.outputSha256);
    assert.equal(hash(await readFile(resolve(root,'assets/models',`${id}.glb`))),receipt.sourceSha256);
    assert(receipt.outputGzipBytes<receipt.sourceGzipBytes*.5);
    assert.equal(receipt.nodeTransformError,0);
  }
  assert((await stat(resolve(root,'dist/demo-v05',manifest.prefix,'MESHOPT-LICENSE.md'))).size>0);
});
