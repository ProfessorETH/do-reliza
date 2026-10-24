import * as THREE from 'three';
import { shiftTime } from './shift-clock.js';

export function mountSceneClock(room) {
  room.traverse(node=>{if(/^SD_(Sign|StudioWord|StudioSubtitle)/.test(node.name))node.visible=false;});
  const assembly=new THREE.Group();assembly.name='StudioShiftClock';assembly.userData.hotspot='clock';
  assembly.position.set(1.85,2.17,-3.65);
  const face=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.07,48),new THREE.MeshStandardMaterial({color:'#e9dfc8',roughness:.6}));
  face.rotation.x=Math.PI/2;face.position.x=-.9;assembly.add(face);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.46,.035,8,48),new THREE.MeshStandardMaterial({color:'#c9a775',metalness:.3,roughness:.5}));rim.position.set(-.9,0,.04);assembly.add(rim);
  const ink=new THREE.MeshBasicMaterial({color:'#203438'});
  for(let i=0;i<12;i++){
    const tick=new THREE.Mesh(new THREE.BoxGeometry(.025,i%3===0?.09:.05,.012),ink),angle=i*Math.PI/6;
    tick.position.set(-.9+Math.sin(angle)*.36,Math.cos(angle)*.36,.05);tick.rotation.z=-angle;assembly.add(tick);
  }
  function hand(length,width,color){const pivot=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(width,length,.018),new THREE.MeshBasicMaterial({color}));mesh.position.y=length/2;pivot.position.set(-.9,0,.07);pivot.add(mesh);assembly.add(pivot);return pivot;}
  const hour=hand(.22,.045,'#203438'),minute=hand(.33,.025,'#ad5d4e');
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=576;
  const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const bed=new THREE.Mesh(new THREE.BoxGeometry(1.85,1.04,.08),new THREE.MeshStandardMaterial({color:'#c9a775',roughness:.65}));bed.position.x=.55;assembly.add(bed);
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.79,.98),new THREE.MeshBasicMaterial({map:texture}));panel.position.set(.55,0,.05);assembly.add(panel);
  // Same wall cutaway rules as the original signage; no new navigation obstacle.
  (room.getObjectByName('Release3D_CutawayBack')||room).add(assembly);
  let previous='';
  return {update(game){
    const elapsed=9*60+(game.time+(game.clockFraction||0))*60;
    hour.rotation.z=-elapsed/720*Math.PI*2;minute.rotation.z=-elapsed/60*Math.PI*2;
    const time=shiftTime(game),key=JSON.stringify(time);
    if(key===previous)return;previous=key;
    ctx.fillStyle='#192f32';ctx.fillRect(0,0,1024,576);
    ctx.fillStyle='#a4bbae';ctx.font='600 46px sans-serif';ctx.fillText('СЕЙЧАС',56,74);
    ctx.fillStyle='#f5e7cb';ctx.font='700 120px sans-serif';ctx.fillText(time.now.split(' · ')[0],50,204);
    ctx.font='500 44px sans-serif';ctx.fillStyle='#c9a775';ctx.fillText('ДЕДЛАЙН  '+time.end,56,298);
    ctx.fillStyle=time.late?'#ff9e89':'#a2d3ba';ctx.font='700 62px sans-serif';ctx.fillText((time.late?'ОПОЗДАНИЕ':'ОСТАЛОСЬ'),56,394);ctx.font='700 78px sans-serif';ctx.fillText(time.remaining,56,492);
    texture.needsUpdate=true;
  }};
}
