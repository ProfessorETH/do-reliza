import { officeDaylight, paintDaylightWindow } from './office-daylight.js';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { assetURL } from '../asset-url.js';

const DESKS = [[-2.65, 1.95], [1.4, 1.95], [-.9, -1.45]];
const dressingURL = new URL(assetURL('models/office-dressing.glb'));
const cozyURL = new URL(assetURL('models/office-cozy.glb?v=1'));
const shellURL = new URL(assetURL('models/office-shell.glb?v=1'));
const decorationLoads = new Map();

function daylightWindow() {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=344;
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
  return {canvas,texture,material:new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide})};
}

function orbitPoster(mesh) {
  const c=document.createElement('canvas');c.width=384;c.height=628;
  const ctx=c.getContext('2d');ctx.fillStyle='#142d3a';ctx.fillRect(0,0,384,628);
  ctx.strokeStyle='#99c7bd';ctx.lineWidth=2;ctx.strokeRect(22,22,340,584);
  for(let i=0;i<40;i++){ctx.fillStyle=i%3?'#6a989a':'#eed6a2';ctx.fillRect(38+(i*53)%305,62+(i*97)%390,2,2);}
  const planet=ctx.createLinearGradient(100,200,290,370);planet.addColorStop(0,'#e9c68e');planet.addColorStop(1,'#a56462');
  ctx.fillStyle=planet;ctx.beginPath();ctx.arc(192,264,86,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#91cfbe';ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(192,264,137,34,-.4,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#f3e6c5';ctx.textAlign='center';ctx.font='bold 47px Bahnschrift, sans-serif';ctx.fillText('ОРБИТА',192,473);
  ctx.font='15px Segoe UI, sans-serif';ctx.fillStyle='#98beb3';ctx.fillText('ТВОЯ КОМАНДА. ТВОЙ РЕЛИЗ.',192,510);
  ctx.font='bold 14px Segoe UI, sans-serif';ctx.fillStyle='#e7bd79';ctx.fillText('ШКОЛЬНЫЙ ФЕСТИВАЛЬ  /  01',192,566);
  const map=new THREE.CanvasTexture(c);map.flipY=false;map.colorSpace=THREE.SRGBColorSpace;
  mesh.material=new THREE.MeshStandardMaterial({map,roughness:.95});
}

function radialTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.35, 'rgba(255,255,255,.55)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function woodTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e3d8c6'; ctx.fillRect(0, 0, 512, 128);
  // A fixed seed keeps the material identical after every reload.
  let seed = 29031;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 280; i++) {
    const y = random() * 128;
    ctx.strokeStyle = `rgba(85,58,34,${.025 + random() * .07})`; ctx.lineWidth = .3 + random() * .7;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(160, y + random() * 8 - 4, 330, y + random() * 8 - 4, 512, y); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export function createOfficeAtmosphere(scene, renderer) {
  const view=daylightWindow(),lamps=[];let displayedMinute=null,paintKey=null;
  const compact = window.matchMedia('(max-width:760px)').matches;
  renderer.toneMappingExposure = 1.12;
  const ambient = new THREE.HemisphereLight(0x9ebbdc, 0x49313b, .92); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffd6a0, 2.7); key.position.set(-4, 7, 2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left:-8, right:8, top:8, bottom:-8, near:.1, far:30});
  key.shadow.normalBias = .025; key.shadow.bias = -.0002; key.shadow.radius = 3;
  key.shadow.camera.updateProjectionMatrix(); scene.add(key);
  const moon = new THREE.DirectionalLight(0x86accf, .9); moon.position.set(-7, 4, -1); scene.add(moon);
  const fill = new THREE.DirectionalLight(0xc7d7e1, .55); fill.position.set(7, 4, 6); scene.add(fill);
  const reverseFill = new THREE.DirectionalLight(0xffd6b2, .85); reverseFill.position.set(-6, 5, -7); scene.add(reverseFill);
  for (const x of [-2.65, 1.4, 3.8]) {
    const lamp = new THREE.PointLight(0xffbd72, 11, 4.5, 2); lamp.position.set(x, 2.38, -3.57); scene.add(lamp);lamps.push({light:lamp,scale:lamp.intensity/11});
  }
  for (const [x,z] of compact ? [] : DESKS) {
    const lamp = new THREE.PointLight(0xffd8a1, 1.6, 2.0, 2); lamp.position.set(x-.5, 1.13, -z+.10); scene.add(lamp);lamps.push({light:lamp,scale:lamp.intensity/11});
  }
  if (!compact) { const neon = new THREE.PointLight(0x7fe5d1, 1.4, 3.6, 2); neon.position.set(1.85, 2.18, -3.55); scene.add(neon); }

  const radial = radialTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshBasicMaterial({map:radial, color:0x020913, transparent:true, opacity:.65, depthWrite:false}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -.355; ground.renderOrder = -1; scene.add(ground);
  for (const [x,z] of DESKS) {
    for (const [px,pz,w,h] of [[x,-z,2.8,1.7],[x,-z+.94,1.05,.9]]) {
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:radial,color:0x13202a,transparent:true,opacity:.34,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
      shadow.rotation.x=-Math.PI/2;shadow.position.set(px,.009,pz);scene.add(shadow);
    }
  }

  const grain = woodTexture();
  const palette = {wall:'#20313c', wall_edge:'#344c55', floor:'#876951', oak:'#c29a6b', oak_edge:'#946b48', steel:'#26343e', chair:'#2c3a46', chair_pad:'#617b7a', rug:'#304b53', ivory:'#dfd5bd', coral:'#cf826e', leaf:'#49795e', leaf_light:'#83aa7c'};
  const materialCopies = new Map();
  return {
    update(game,dt=0){
      const target=officeDaylight(game).minute;
      displayedMinute=displayedMinute===null?target:displayedMinute+(target-displayedMinute)*(dt?1-Math.exp(-dt*4):1);
      const s=officeDaylight({time:(displayedMinute-540)/60});
      ambient.color.set(s.ambient);ambient.intensity=s.ambientPower;
      key.color.set(s.key);key.intensity=s.keyPower;moon.intensity=s.moonPower;
      fill.intensity=.4+(1-s.night)*.25;reverseFill.intensity=.65+s.night*.2;
      for(const {light,scale} of lamps)light.intensity=s.lampPower*scale;
      const bucket=Math.floor(s.minute/5);
      if(bucket!==paintKey){paintDaylightWindow(view.canvas.getContext('2d'),s);view.texture.needsUpdate=true;paintKey=bucket;}
      return s;
    },
    async dress(room) {
      room.traverse(node => {
        if (!node.isMesh) return;
        if (node.userData.windowTexture) { node.material=view.material; return; }
        const old = node.material;
        if (!old || Array.isArray(old) || node.userData.screenIndex !== undefined || node.userData.windowTexture) return;
        if (!materialCopies.has(old)) {
          const material = old.clone(), token = old.name.replace(/^Release3D_/, '');
          if (palette[token]) material.color.set(palette[token]);
          material.roughness = token === 'steel' ? .55 : .83;
          if (['oak','oak_edge','floor'].includes(token)) material.map = grain;
          materialCopies.set(old,material);
        }
        node.material = materialCopies.get(old);
      });
      // Additive assets preserve all original furniture and character rigs.
      await Promise.all([
        ['StudioArtDressing', dressingURL, 'artDressing'],
        ['StudioCozyDetails', cozyURL, 'cozyDetails'],
        ['StudioShell', shellURL, 'shellDetails'],
      ].map(async ([name, url, statusKey]) => {
        if (!decorationLoads.has(name)) decorationLoads.set(name, new GLTFLoader().loadAsync(url.href));
        try {
          const additions = (await decorationLoads.get(name)).scene.clone(true);
          additions.name = name;
          additions.traverse(node => {
            if (!node.isMesh) return;
            node.castShadow = true; node.receiveShadow = true;
            if (node.userData.studioArtwork === 'orbit') orbitPoster(node);
          });
          for (const child of [...additions.children]) {
            if (!child.userData.wallSide) continue;
            let wall;
            // Attach to the base wall, never to another decorative collection.
            room.traverse(node => {
              if (node.name.startsWith('Release3D_') && node.userData.wallSide === child.userData.wallSide) wall = node;
            });
            if (wall) wall.add(child);
          }
          room.add(additions); room.userData[statusKey] = 'ready';
        } catch (error) {
          decorationLoads.delete(name); room.userData[statusKey] = 'unavailable';
          console.warn(`${name} unavailable:`, error);
        }
      }));
    },
  };
}
