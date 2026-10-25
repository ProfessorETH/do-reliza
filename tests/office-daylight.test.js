import test from 'node:test';
import assert from 'node:assert/strict';
import { officeDaylight, paintDaylightWindow } from '../assets/office-daylight.js';
import { shiftMinutes, shiftTime, advanceShiftClock } from '../assets/shift-clock.js';
const at=hour=>({time:hour-9,clockFraction:0});

test('office follows the same shift clock through evening, midnight and next morning',()=>{
  for(const [elapsed,phase,clock] of [[0,'morning','09:00'],[4,'day','13:00'],[9,'evening','18:00'],[14,'night','23:00'],[15,'night','00:00 · день 2'],[22,'morning','07:00 · день 2']]){
    const game={time:elapsed,deadline:32};assert.equal(officeDaylight(game).phase,phase);assert.equal(shiftTime(game).now,clock);assert.equal(officeDaylight(game).minute,shiftMinutes(game));
  }
});
test('day, sunset and night have distinct skies and night brings up warm office lamps',()=>{
  const day=officeDaylight(at(13)),sunset=officeDaylight(at(18)),night=officeDaylight(at(23));
  assert.equal(day.night,0);assert.equal(night.night,1);assert.ok(sunset.night>day.night&&sunset.night<night.night);
  assert.notEqual(day.horizon,sunset.horizon);assert.notEqual(night.top,sunset.top);assert.ok(night.lampPower>day.lampPower);assert.ok(night.ambientPower>=.6);assert.ok(night.keyPower>=1);
});
test('fractional auto time is smooth; pauses freeze daylight without a real-world clock',()=>{
  const game={time:8,clockFraction:0,autoPlay:true,stage:'work'},before=officeDaylight(game);
  advanceShiftClock(game,400,true);assert.deepEqual(officeDaylight(game),before);
  advanceShiftClock(game,400,false);const after=officeDaylight(game);assert.ok(after.minute>before.minute);assert.notEqual(after.horizon,before.horizon);
  const copy=JSON.parse(JSON.stringify(game));assert.deepEqual(officeDaylight(copy),after);assert.deepEqual(game,copy);
});
test('the cycle repeats on long projects and has no jump at midnight',()=>{
  for(let hour=9;hour<80;hour+=.25){const a=officeDaylight(at(hour)),b=officeDaylight(at(hour+24));for(const key of ['top','horizon','city','night','lampPower','phase'])assert.equal(a[key],b[key]);}
  assert.equal(officeDaylight(at(23.999)).top,officeDaylight(at(24.001)).top);
});
test('window painter reuses a deterministic skyline with day/night alpha and restores canvas state',()=>{
  function draw(state){const calls=[],ctx={canvas:{width:1024,height:344},globalAlpha:1,createLinearGradient:()=>({addColorStop(){}}),fillRect(...v){calls.push([typeof this.fillStyle==='string'?this.fillStyle:'gradient',this.globalAlpha,...v]);},beginPath(){},arc(){},fill(){}};paintDaylightWindow(ctx,state);assert.equal(ctx.globalAlpha,1);return calls;}
  const day=draw(officeDaylight(at(13))),night=draw(officeDaylight(at(23)));
  const buildings=calls=>calls.filter(c=>typeof c[4]==='number'&&c[4]>20&&c[4]<40).map(c=>c.slice(2));
  assert.deepEqual(buildings(day),buildings(night));assert.notDeepEqual(day,night);assert.deepEqual(draw(officeDaylight(at(23))),night);
});

