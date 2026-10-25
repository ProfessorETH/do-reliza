import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGLB} from '../scripts/attach-portrait-head.js';
import {BODY_IDS,loadHunyuanBodyBytes} from './hunyuan-body-assets.js';

test('deployable bodies retain the accepted linear anatomical fit and one-millimetre sole target',async()=>{
  for(const id of BODY_IDS){
    const {json}=parseGLB(await loadHunyuanBodyBytes(id));
    const fit=json.asset.extras.hunyuanBodyStage.config;
    assert.equal(fit.height_interpolation??'linear','linear',`${id}: research interpolation must not replace the accepted fit`);
    assert.equal(fit.target_sole_y,.001,`${id}: preserved clip floor calibration`);
    assert.equal(fit.surface_smooth_iterations??0,0,`${id}: already smoothed painted geometry must not be smoothed again`);
    const order=['source_sole_y','source_ankle_y','source_knee_y','source_hip_y','source_shoulder_y','source_neck_y'];
    order.forEach((name,i)=>assert.ok(Number.isFinite(fit[name])&&(!i||fit[name]>fit[order[i-1]]),`${id}: anatomical anchors keep their measured order`));
  }
});
