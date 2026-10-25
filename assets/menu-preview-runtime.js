let active,ticket=0;
export function disposeMenuPreview(){ticket++;active?.dispose();active=null;}
export function mountMenuPreview(dialog) {
  disposeMenuPreview();const host=dialog.querySelector('[data-model-viewer]');if(!host)return;
  const current=ticket;
  import('./upgrade-model-viewer.js').then(async({UpgradeModelViewer})=>{
    if(current!==ticket||!host.isConnected||!dialog.open)return;
    try{active=new UpgradeModelViewer(host);await active.show();}
    catch{if(current===ticket){active?.dispose();active=null;host.dataset.modelReady='false';const status=host.querySelector('.model-status');if(status){status.hidden=false;status.textContent='Показан снимок предмета из офиса';}}}
  }).catch(()=>{if(current===ticket){host.dataset.modelReady='false';const status=host.querySelector('.model-status');if(status)status.textContent='Показан снимок предмета из офиса';}});
}
