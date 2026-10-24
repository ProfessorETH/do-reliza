import * as THREE from 'three';

export function makeScreen(mesh, arcade = false) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  mesh.material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: .5, roughness: .8 });
  return { canvas, texture, last: '', arcade };
}
export function paintSunset(mesh) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const ctx = c.getContext('2d'), sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#516684'); sky.addColorStop(.55, '#d68876'); sky.addColorStop(1, '#f7c578');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#ffe5aa'; ctx.beginPath(); ctx.arc(330, 123, 32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eab291'; for (let n = 0; n < 5; n++) ctx.fillRect(60 + n * 89, 66 + n % 2 * 32, 61, 3);
  const map = new THREE.CanvasTexture(c); map.flipY = false; map.colorSpace = THREE.SRGBColorSpace;
  mesh.material = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: .45, roughness: 1 });
}
export function paintScreen(screen, task, progress, stage) {
  const key = `${task?.id}:${Math.round(progress)}:${stage}`;
  if (screen.last === key) return; screen.last = key;
  const c = screen.canvas.getContext('2d'); c.fillStyle = '#122a35'; c.fillRect(0, 0, 256, 160);
  if (screen.arcade) {
    c.fillStyle = '#bed8c2'; for (let n = 0; n < 28; n++) c.fillRect(n * 37 % 250, n * 53 % 150, 2, 2);
    c.fillStyle = '#f8bb68'; c.beginPath(); c.moveTo(125, 46); c.lineTo(145, 96); c.lineTo(125, 84); c.lineTo(105, 96); c.fill();
    c.font = 'bold 18px sans-serif'; c.fillStyle = '#d9e6de'; c.fillText('ОРБИТА', 90, 130);
  } else if (!task) {
    c.fillStyle = '#71968c'; c.font = 'bold 15px sans-serif'; c.fillText(stage === 'result' ? 'РЕЛИЗ ГОТОВ' : 'ДО РЕЛИЗА.', 24, 65);
    c.fillStyle = '#395965'; c.fillRect(24, 81, 200, 3);
  } else {
    c.fillStyle = '#7bc4ae'; c.font = 'bold 12px sans-serif'; c.fillText(task.id.toUpperCase(), 15, 21);
    if (task.id === 'design') {
      c.fillStyle = '#294c5c'; c.fillRect(15, 33, 225, 95); c.fillStyle = '#edbe7a'; c.fillRect(27, 46, 65, 70);
      c.fillStyle = '#93c7b0'; c.fillRect(103, 46, 124, 24); c.fillStyle = '#628c8e'; c.fillRect(103, 80, 57, 36); c.fillRect(170, 80, 57, 36);
    } else if (task.id === 'qa') {
      c.font = '14px monospace';
      for (let n = 0; n < 4; n++) { c.fillStyle = n < 3 ? '#90c5aa' : '#e4bb7a'; c.fillText(n < 3 ? '✓' : '…', 20, 48 + n * 22); c.fillRect(51, 39 + n * 22, 110 + n * 8, 6); }
    } else {
      c.font = '13px monospace';
      ['function launch() {', '  const ship = ready;', '  checkNextCell();', '  move(ship);', '}'].forEach((text, i) => { c.fillStyle = i % 2 ? '#98bfbc' : '#e2b77a'; c.fillText(text, 16, 45 + i * 18); });
    }
    c.fillStyle = '#284d58'; c.fillRect(15, 143, 225, 5); c.fillStyle = '#85d4b6'; c.fillRect(15, 143, progress * 2.25, 5);
  }
  screen.texture.needsUpdate = true;
}
