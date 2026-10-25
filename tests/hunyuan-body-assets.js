import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {parseGLB} from '../scripts/attach-portrait-head.js';

const asset=id=>new URL(`../assets/models/${id}.glb`,import.meta.url);
const accepted=id=>new URL(`../art/characters/body-v5/assembled/${id}-quality.glb`,import.meta.url);
export const BODY_IDS=['mira','pixel','nord','echo','iskra','saga'];
if(existsSync(asset('nika'))||existsSync(accepted('nika')))BODY_IDS.push('nika');

// Always inspect the deployable v5 asset. The accepted quality candidate is
// allowed only while that character's older production body is being staged.
export async function loadHunyuanBodyBytes(id){
  try{
    const bytes=await readFile(asset(id));
    if(parseGLB(bytes).json.asset.extras?.hunyuanBodyVersion===5)return bytes;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const bytes=await readFile(accepted(id));
  if(parseGLB(bytes).json.asset.extras?.hunyuanBodyVersion!==5)throw new Error(`${id}: accepted body candidate is not v5`);
  return bytes;
}
