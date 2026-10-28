const $=id=>document.getElementById(id);
const node=(tag,value='')=>{const e=document.createElement(tag);e.textContent=value;return e;};
export function filesPanel({api,apply,notify,getState,canEdit}) {
 const root=$('files-content');let key='',preview=null,working=false;
 const intro=node('p','团级玩家/NPC JSON是可复用资料库；本场HP、位置、回合和地图保存在战斗状态JSON。资料应用只影响本场，保留棋子位置。');intro.className='fine';root.append(intro);
 const tools=node('div');tools.className='button-grid';root.append(tools);
 function button(label,fn,parent=tools){const b=node('button',label);b.type='button';b.addEventListener('click',async()=>{if(working)return;working=true;b.disabled=true;try{await fn();}catch(e){if(!e.cancelled)notify(e.message,true);}finally{working=false;b.disabled=b===accept?!preview:false;}});parent.append(b);return b;}
 const location=node('p'),status=node('p');location.className=status.className='fine';root.append(location,status);
 const list=node('div');root.append(list);
 const detail=node('pre');detail.id='file-preview';root.append(detail);
 const accept=button('应用已核对的文件差异',async()=>{
  if(!preview||!canEdit())return;
  const {operation,...rest}=preview;
  const result=await call(operation,rest);apply(result);preview=null;accept.disabled=true;detail.textContent='已应用到本场并保存。其他战斗未改动。';await refresh();
 });accept.disabled=true;
 const call=(operation,data={})=>{const s=getState();return api('/api/files',{operation,campaignId:s.campaignId,battleId:s.battleId,...data});};
 button('打开本团文件夹',()=>call('reveal',{key:'folder'}));
 button('定位战斗JSON',()=>call('reveal',{key:'battle'}));
 button('刷新文件列表',refresh);
 button('管理模组封面',()=>{if(canEdit())window.location.assign('/module-covers');});
 button('预览并刷新本场JSON',async()=>{
  if(!canEdit())return;const result=await call('preview-battle');
  preview={operation:'reload-battle',fingerprint:result.preview.fingerprint,expectedRevision:result.preview.revision};
  detail.textContent=result.preview.changes.length ? JSON.stringify(result.preview.changes,null,2) : '内容与当前局面一致。';accept.disabled=!result.preview.changed;
 });
 async function refresh(){
  if(!getState()||getState().viewRole!=='dm')return;
  const r=await call('list');apply(r);location.textContent=r.folder;
  status.textContent=`战斗文件：${r.battle.path}\n${r.battle.error || (r.battle.changed?'检测到外部修改：请预览并刷新本场JSON。':'战斗文件与当前内存一致。')} · ${r.battle.modified || ''}`;
  list.replaceChildren();
  for(const library of r.libraries){
   const section=node('section');section.className='section';section.append(node('strong',library.key==='players'?'玩家资料.json':'NPC资料.json'),node('p',library.path),node('small',library.error || `文件修改时间：${library.modified}`));list.append(section);
   button('在文件夹中选中此文件',()=>call('reveal',{key:library.key}),section);
   const select=node('select');select.setAttribute('aria-label',library.key==='players'?'玩家资料角色':'NPC资料角色');section.append(select);
   for(const a of library.actors){const o=node('option',a.name+(a.inBattle?'':'（不在本场）'));o.value=a.id;o.disabled=!a.inBattle;select.append(o);}
   const first=library.actors.find(a=>a.inBattle);if(first)select.value=first.id;
   const b=button('预览此角色资料 → 本场',async()=>{
    if(!canEdit())return;
    const r=await call('preview-library',{key:library.key,ids:[select.value]});
    preview={operation:'apply-library',key:library.key,ids:[select.value],fingerprint:r.preview.fingerprint,expectedRevision:r.preview.revision};
    detail.textContent=JSON.stringify(r.preview.changes,null,2);accept.disabled=false;
   },section);b.disabled=!first;
  }
 }
 $('files-dialog').addEventListener('close',()=>{preview=null;accept.disabled=true;});
 document.querySelectorAll('[data-tool=files]').forEach(b=>b.addEventListener('click',()=>{preview=null;detail.textContent='先保存编辑器中的JSON，再刷新和预览。应用前会核对文件内容与进度版本。';refresh().catch(e=>notify(e.message,true));}));
 return {update(state){const next=state?`${state.campaignId}/${state.battleId}/${state.viewRole}`:'';if(next!==key){key=next;preview=null;list.replaceChildren();detail.textContent='';location.textContent='';status.textContent='';accept.disabled=true;}},clear(){key='';preview=null;list.replaceChildren();detail.textContent='';location.textContent='';status.textContent='';}};
}
