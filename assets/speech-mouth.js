import * as THREE from '../vendor/three/three.module.js';

// Landmarks measured on the shipped, fitted portrait meshes in their own coordinates.
export const MOUTH_FITS = {
  mira: {x:-.007,y:-.428,width:.125,front:.34,curve:.65},
  pixel:{x:.005,y:-.400,width:.155,front:.43,curve:.60},
  nord: {x:.021,y:-.349,width:.150,front:.42,curve:.65},
  iskra:{x:.032,y:-.327,width:.145,front:.44,curve:.65},
  saga: {x:.021,y:-.291,width:.145,front:.43,curve:.65},
  echo: {x:.008,y:-.313,width:.145,front:.43,curve:.65},
};
const clamp=THREE.MathUtils.clamp;
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
function opening(p,fit,side){
  const x=(p[0]-fit.x)/fit.width,d=p[1]-fit.y-fit.curve*(p[0]-fit.x)**2;
  const width=Math.max(0,1-x*x),vertical=1-smooth(Math.abs(d)/.17),depth=smooth((p[2]-fit.front)/.04);
  const sign=side??(d>=0?1:-1);
  return sign*(sign>0?.007:.035)*width*vertical*depth;
}

// Only triangles intersecting the lip seam are split. UVs, normals, tangents and
// existing blink targets interpolate at the cut; the cached GLB stays immutable.
export function makeSpeechGeometry(source,fit){
  if(!source.index||source.groups.length>1)return null;
  const attrs=Object.fromEntries(Object.entries(source.attributes).map(([k,a])=>[k,{size:a.itemSize,values:Array.from(a.array)}]));
  const morphs=Object.fromEntries(Object.entries(source.morphAttributes).map(([k,list])=>[k,list.map(a=>({size:a.itemSize,values:Array.from(a.array)}))]));
  const pos=attrs.position.values,count=source.attributes.position.count,indices=[],seams=[],forced=new Map(),cache=new Map();
  const point=i=>pos.slice(i*3,i*3+3),signed=i=>{const p=point(i);return p[1]-fit.y-fit.curve*(p[0]-fit.x)**2;};
  function intersection(a,b,side){
    const key=[Math.min(a,b),Math.max(a,b),side].join(':');if(cache.has(key))return cache.get(key);
    const t=signed(a)/(signed(a)-signed(b)),index=pos.length/3;
    for(const attr of [...Object.values(attrs),...Object.values(morphs).flat()])for(let j=0;j<attr.size;j++)attr.values.push(THREE.MathUtils.lerp(attr.values[a*attr.size+j],attr.values[b*attr.size+j],t));
    forced.set(index,side);cache.set(key,index);return index;
  }
  const original=source.index.array;
  for(let i=0;i<original.length;i+=3){
    const tri=[original[i],original[i+1],original[i+2]],points=tri.map(point),signs=tri.map(signed);
    const near=points.every(p=>p[2]>fit.front&&Math.abs(p[0]-fit.x)<fit.width*1.6);
    if(!near||Math.min(...signs)>=0||Math.max(...signs)<=0){indices.push(...tri);continue;}
    const edge=[];
    for(const side of [1,-1]){
      const polygon=[];
      for(let j=0;j<3;j++){
        const a=tri[j],b=tri[(j+1)%3],inside=signed(a)*side>=0;
        if(inside)polygon.push(a);
        if((signed(a)>=0)!==(signed(b)>=0)){const n=intersection(a,b,side);polygon.push(n);if(side===1)edge.push(point(n));}
      }
      for(let j=1;j<polygon.length-1;j++)indices.push(polygon[0],polygon[j],polygon[j+1]);
    }
    if(edge.length===2)seams.push(edge);
  }
  if(!seams.length)return null;
  const geometry=new THREE.BufferGeometry();
  for(const [k,a] of Object.entries(attrs))geometry.setAttribute(k,new THREE.Float32BufferAttribute(a.values,a.size));
  for(const [k,list] of Object.entries(morphs))geometry.morphAttributes[k]=list.map(a=>new THREE.Float32BufferAttribute(a.values,a.size));
  geometry.morphTargetsRelative=source.morphTargetsRelative;geometry.setIndex(indices);
  const delta=new Float32Array(pos.length);
  for(let i=0;i<pos.length/3;i++)delta[i*3+1]=opening(point(i),fit,forced.get(i));
  const index=geometry.morphAttributes.position?.length||0;
  (geometry.morphAttributes.position||=[]).push(new THREE.Float32BufferAttribute(delta,3));
  // Other morph channels must have the same target count.
  for(const [k,list] of Object.entries(geometry.morphAttributes))if(k!=='position')list.push(new THREE.Float32BufferAttribute(new Float32Array(attrs[k].values.length),attrs[k].size));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const inner=[],innerDelta=[],innerIndices=[];
  for(const edge of seams){const start=inner.length/3;
    for(const side of [1,-1])for(const p of edge){inner.push(p[0],p[1],p[2]-.003);innerDelta.push(0,opening(p,fit,side),0);}
    innerIndices.push(start,start+1,start+2,start+2,start+1,start+3);
  }
  const cavity=new THREE.BufferGeometry();cavity.setAttribute('position',new THREE.Float32BufferAttribute(inner,3));cavity.setIndex(innerIndices);cavity.morphTargetsRelative=true;cavity.morphAttributes.position=[new THREE.Float32BufferAttribute(innerDelta,3)];
  return {geometry,cavity,index,addedVertices:pos.length/3-count,seams:seams.length};
}

export function bindSpeechMouth(head,id){
  const fit=MOUTH_FITS[id];if(!head?.isMesh||!fit||!head.geometry.morphTargetsRelative)return null;
  const sourceGeometry=head.geometry,result=makeSpeechGeometry(sourceGeometry,fit);if(!result)return null;
  const previous=head.morphTargetInfluences?.slice()||[],dictionary={...head.morphTargetDictionary};
  head.geometry=result.geometry;head.updateMorphTargets();head.morphTargetDictionary={...dictionary,SpeechOpen:result.index};
  previous.forEach((value,i)=>head.morphTargetInfluences[i]=value);
  const cavity=new THREE.Mesh(result.cavity,new THREE.MeshBasicMaterial({color:'#321b20',side:THREE.DoubleSide}));
  cavity.name=`SpeechMouth_${id}`;cavity.visible=false;head.add(cavity);
  let amount=0;
  return {head,cavity,index:result.index,update(dt,speaking,level){
    const target=speaking&&Number.isFinite(level)?smooth((level-.025)/.65):0;
    amount=THREE.MathUtils.damp(amount,target,target>amount?32:24,clamp(dt,0,.1));if(amount<.0001)amount=0;
    head.morphTargetInfluences[result.index]=amount;cavity.morphTargetInfluences[0]=amount;cavity.visible=amount>.002;
    return amount;
  },dispose(){if(head.geometry===result.geometry){head.geometry=sourceGeometry;head.updateMorphTargets();head.morphTargetDictionary=dictionary;previous.forEach((v,i)=>head.morphTargetInfluences[i]=v);}result.geometry.dispose();cavity.removeFromParent();cavity.geometry.dispose();cavity.material.dispose();}};
}
