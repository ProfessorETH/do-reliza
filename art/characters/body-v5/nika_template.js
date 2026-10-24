/** Reuse only the neutral office rig as a temporary mentor donor.
 * This is not a hireable character or a finished visible Nika model.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {parseGLB,packGLB,recoverPortraitBase,attachPortraitHead} from '../../../scripts/attach-portrait-head.js';
import {recoverHunyuanBodyBase} from '../../../scripts/attach-hunyuan-body.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
function rename(value){
  if(typeof value==='string')return value==='mira'||/^(?:mira_|DR_mira|Skin_mira|Team3D_mira|Mira)/.test(value)?value.replaceAll('mira','nika').replaceAll('Mira','Nika'):value;
  if(Array.isArray(value))return value.map(rename);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,rename(v)]));
  return value;
}
export function mentorRig(bytes){const base=parseGLB(recoverPortraitBase(bytes));return packGLB(rename(base.json),base.bin);}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2)opts[args[i].replace(/^--/,'')]=args[i+1];
  const source=recoverHunyuanBodyBase(await readFile(resolve(ROOT,'assets/models/mira.glb')));
  const template=mentorRig(source);
  const out=resolve(ROOT,'work/body-v5-nika-rig.glb');
  await mkdir(dirname(out),{recursive:true});
  try{const existing=await readFile(out);if(!existing.equals(template))throw new Error('Existing mentor donor differs; preserve it before a new donor');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(out,template,{flag:'wx'});}
  if(opts.head){
    const head=await readFile(resolve(ROOT,opts.head));
    const options={id:'nika',eyeRatio:Number(opts['eye-ratio']??.515),chinRatio:Number(opts['chin-ratio']??.8),blink:false};
    if(opts.scale!==undefined)options.scale=Number(opts.scale);
    if(opts['target-eye-y']!==undefined)options.targetEyeY=Number(opts['target-eye-y']);
    if(opts['target-chin-y']!==undefined)options.targetChinY=Number(opts['target-chin-y']);
    const result=attachPortraitHead(template,head,options);
    const target=resolve(ROOT,'art/characters/body-v5/nika/portrait-base.glb');
    await writeFile(target,result.bytes,{flag:'wx'});
    await writeFile(target.replace('.glb','.receipt.json'),JSON.stringify({mentorOnly:true,rigSourceSha256:createHash('sha256').update(source).digest('hex'),...result.receipt},null,2)+'\n');
  }
  console.log('MENTOR_RIG_READY',out);
}
