import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameTexturedSurface} from '../scripts/optimize-head-normal.js';

// Five values per corner: position XYZ and the UV attached to that position.
const a=[0,0,0,0,0],b=[1,0,0,1,0],c=[0,1,0,0,1],d=[1,1,0,1,1];
const triangles=[[a,b,c],[b,d,c]];
function fixture(tris,{weld=true,translation}={}){
  const vertices=[],indices=[],seen=new Map();
  for(const triangle of tris)for(const corner of triangle){
    const key=corner.join(',');
    let index=weld?seen.get(key):undefined;
    if(index===undefined){index=vertices.length;vertices.push(corner);seen.set(key,index);}
    indices.push(index);
  }
  // Offset + stride deliberately prevent comparing whole bufferViews as accessors.
  const vertexBytes=Buffer.alloc(8+vertices.length*24),indexBytes=Buffer.alloc(indices.length*2);
  vertices.forEach((v,i)=>v.forEach((value,j)=>vertexBytes.writeFloatLE(value,8+i*24+j*4)));
  indices.forEach((v,i)=>indexBytes.writeUInt16LE(v,i*2));
  const binary=Buffer.concat([vertexBytes,indexBytes]);
  return {binary,doc:{
    buffers:[{byteLength:binary.length}],
    bufferViews:[{buffer:0,byteOffset:8,byteLength:vertexBytes.length-8,byteStride:24},
      {buffer:0,byteOffset:vertexBytes.length,byteLength:indexBytes.length}],
    accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:vertices.length},
      {bufferView:0,byteOffset:12,componentType:5126,type:'VEC2',count:vertices.length},
      {bufferView:1,componentType:5123,type:'SCALAR',count:indices.length}],
    meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},indices:2}]}],
    nodes:[{mesh:0,...(translation?{translation}:{})}],scenes:[{nodes:[0]}],scene:0,
  }};
}
const compare=(x,y)=>assertSameTexturedSurface(x.doc,x.binary,y.doc,y.binary);

test('normal albedo guard accepts split/reordered vertices, winding and triangles with strided accessors',()=>{
  const source=fixture(triangles),baked=fixture([[c,d,b],[c,b,a]],{weld:false});
  assert.notEqual(source.doc.accessors[0].count,baked.doc.accessors[0].count);
  assert.equal(compare(baked,source).triangles,2);
});

test('normal albedo guard rejects changed shape, UV correspondence and connectivity',()=>{
  const original=fixture(triangles);
  const changedPosition=structuredClone(triangles);changedPosition[1][1][2]=.001;
  const changedUV=structuredClone(triangles);changedUV[0][0][3]=.1;
  // Same global POSITION+UV values but a different diagonal must fail.
  for(const mutation of [changedPosition,changedUV,[[a,b,d],[a,d,c]],[[a,b,c],[a,b,c]]])
    assert.throws(()=>compare(original,fixture(mutation)),/surface|triangle|POSITION|UV/i);
});

test('normal albedo guard uses epsilon without quantization-boundary false rejection',()=>{
  const original=fixture(triangles),near=triangles.map(t=>t.map(v=>[...v]));
  near.forEach(t=>t.forEach(v=>{v[0]-=9e-6;v[4]+=9e-6;}));
  assert.equal(compare(original,fixture(near)).triangles,2);
  near[0][0][0]-=3e-5;
  assert.throws(()=>compare(original,fixture(near)),/surface|triangle|POSITION|UV/i);
});

test('normal albedo guard compares world positions and counts duplicate triangles',()=>{
  assert.throws(()=>compare(fixture(triangles),fixture(triangles,{translation:[.1,0,0]})),/surface|triangle|POSITION|UV/i);
  assert.throws(()=>compare(fixture(triangles),fixture([...triangles,triangles[0]])),/triangle/i);
});

test('normal albedo guard resolves epsilon-ambiguous duplicates with one-to-one matching',()=>{
  const move=delta=>triangles[0].map(v=>[v[0]+delta,...v.slice(1)]);
  // The first baked face can match either source face. The second needs the
  // first source face, so a greedy consume-only comparison would reject this.
  assert.equal(compare(fixture([move(.75e-5),move(0)]),fixture([move(0),move(1.5e-5)])).triangles,2);
});

test('normal albedo guard checks later primitives, not just primitive zero',()=>{
  const original=fixture(triangles),changed=fixture(triangles);
  original.doc.meshes[0].primitives.push(structuredClone(original.doc.meshes[0].primitives[0]));
  assert.throws(()=>compare(original,changed),/triangle/i);
});
