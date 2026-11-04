import {PALETTE,DEFAULT_SETTINGS,demoStats,layerFor} from '/scene-model.mjs';
import {SceneView} from '/v2-view.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,selected=null,mode='2d',tool='select',current='ground',layers=new Set(['ground']),priority=false,slot=0,slots=PALETTE.slice(0,9).map(p=>p.id),dirty=false,layerEditing=null,queue=Promise.resolve(),pending=0,timer;
let settings={...DEFAULT_SETTINGS};try{const saved=JSON.parse(localStorage.getItem('battle-preview-v2-controls'));for(const k of Object.keys(settings))if(Number.isFinite(saved?.[k]))settings[k]=Math.min(k==='look'?3:60,Math.max(k==='look'?.2:2,saved[k]));}catch{}
const view=new SceneView($('viewport'),{place:handlePlace,pick:choose,cycle:n=>{if(canLeaveEditor())chooseSlot((slot+n+9)%9);},hint:notify,candidate:p=>{$('scene-hint').textContent=`${tool==='move'?'移动落点':brush().name} → ${p.layerName} · 高度 ${p.y}尺 · (${p.x}, ${p.z})${tool==='build'?' · 点击放置':''}`;},lock:on=>{$('crosshair').hidden=!on;$('look-lock').textContent=on?'Esc 退出环视':'鼠标环视';}});
const active=()=>state?.combat?.combat.phase==='active';
const actors=()=>state.items.filter(i=>i.kind==='actor');
const chosen=()=>state.items.find(i=>i.id===selected);
const turn=()=>state.combat?.actors.find(a=>a.id===state.combat.combat.order[state.combat.combat.index]);
function brush(){if(tool==='relocate'&&chosen())return chosen();if(tool==='move'&&turn())return {...PALETTE[2],width:5};return PALETTE.find(p=>p.id===slots[slot]);}
function notify(message,error=false){clearTimeout(timer);$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;timer=setTimeout(()=>$('toast').hidden=true,error?8000:3500);}
function guard(fn){return async e=>{e?.preventDefault();try{await fn(e);}catch(error){notify(error.message,true);}};}
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(value.error||'操作未完成');return value;}
function send(type,payload={},extra={}){
  if(pending&&type!=='place')return Promise.reject(Error('上一项操作正在保存，请稍候'));
  pending++;$('save').textContent='正在保存…';
  const task=queue.then(async()=>{try{state=await api('/v2/state',{revision:state.revision,type,payload,...extra});render();return state;}catch(e){state=await api('/v2/state');render();throw e;}finally{pending--;if(!pending)$('save').textContent=`演示已保存 · ${state.revision}`;}});
  queue=task.catch(()=>{});return task;
}
function syncView(){if(!state)return;view.set(state,{mode,tool,current,layers,priority,selected,brush:brush(),settings});}
function render(){
  if(!state.layers.some(l=>l.id===current))current=state.layers[0].id;layers=new Set([...layers].filter(id=>state.layers.some(l=>l.id===id)));
  if(selected&&!chosen())selected=null;
  $('phase').textContent=active()?'进行战斗':state.combat?'战斗已结束':'布置场景';$('save').textContent=`演示已保存 · ${state.revision}`;
  $('battle-start').hidden=active();$('battle-start').textContent=state.combat?'重新试跑战斗 →':'开始战斗 →';$('battle-end').hidden=!active();$('build-tools').hidden=active();$('combat-panel').hidden=!active();$('dock').hidden=active();
  if(active()&&['build','relocate'].includes(tool))tool='select';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===mode));document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  $('look-lock').hidden=mode!=='3d';$('priority-wrap').hidden=mode!=='3d';$('layer-priority').checked=priority;$('layer-add').disabled=active();
  $('layer-hint').textContent=mode==='2d'?'选择当前编辑层。俯视图只显示这一层。':'勾选可建造的层。实线网格表示允许落点。';
  renderLayers();renderHotbar();renderCombat();syncView();
  if(!selected||active())$('inspector').hidden=true;if(!selected)$('selection-label').hidden=true;
  $('layer-badge').textContent=mode==='2d'?`${state.layers.find(l=>l.id===current).name} · ${state.layers.find(l=>l.id===current).height}尺 · 俯视图`:`${layers.size}层可建造${priority?' · 固定当前层':' · 按最近命中层落点'}`;
  const hints={select:active()?'先选行动，再选择目标或落点':'点击物件编辑 · 重叠时再点切换 · 右键拖动视角',build:'点击网格放置 · 滚轮 / 1–9选积木 · 同一位置不会重复堆叠',relocate:'点击新的网格位置 · Esc取消',move:'点击移动终点 · 确认后按本地规则结算'};
  $('scene-hint').textContent=hints[tool];
}
function renderLayers(){
  $('layer-list').innerHTML=state.layers.map(l=>`<div class="layer-row ${current===l.id?'current':''}"><input type="${mode==='2d'?'radio':'checkbox'}" name="layer-select" aria-label="选择${esc(l.name)}" data-layer-check="${esc(l.id)}" ${mode==='2d'?(current===l.id?'checked':''):(layers.has(l.id)?'checked':'')}><button class="layer-name" data-layer-current="${esc(l.id)}">${esc(l.name)}<small>${l.height} 尺 · ${state.items.filter(i=>i.layerId===l.id).length} 件</small></button><button class="layer-edit" data-layer-edit="${esc(l.id)}" ${active()?'disabled':''}>编辑</button></div>`).join('');
}
function renderHotbar(){const b=brush();$('brush-name').textContent=b.name;$('brush-detail').textContent=`${b.width} × ${b.depth} × ${b.height} 尺`;
  $('hotbar').innerHTML=slots.map((id,n)=>{const p=PALETTE.find(x=>x.id===id);return `<button class="slot ${slot===n?'active':''}" data-slot="${n}" aria-label="${n+1} ${esc(p.name)}" aria-pressed="${slot===n}"><small>${n+1}</small><i>${p.icon}</i><span>${esc(p.name)}</span></button>`;}).join('');
  $('inventory').innerHTML='<div class="inventory-caption">点击积木替换当前快捷格；所有积木均可在此选取。</div>'+PALETTE.map(p=>`<button data-preset="${p.id}">${p.icon} ${esc(p.name)}<small> ${p.width}尺</small></button>`).join('');
}
function chooseSlot(n){if(active())return;$('selection-label').hidden=true;slot=n;tool='build';selected=null;dirty=false;render();$('viewport').focus();}
function canLeaveEditor(){if(!dirty)return true;if(!confirm('编辑尚未保存，放弃这次修改？'))return false;dirty=false;return true;}
function choose(id){
  if(!canLeaveEditor())return;
  selected=id;tool='select';render();
  if(!id){$('selection-label').hidden=true;return;}
  const item=chosen();$('selection-label').hidden=false;$('selection-label').textContent=`${item.name} · ${layerFor(state,item).name}`;
  if(active()){notify(`${item.name}${item.kind==='actor'?` · HP ${state.combat.actors.find(a=>a.id===id)?.hp??'—'}`:''}`);return;}
  loadEditor(item);$('inspector').hidden=false;
}
function loadEditor(i){
  $('inspector-title').textContent=i.kind==='actor'?'参战者':'场景积木';$('edit-name').value=i.name;
  $('edit-layer').innerHTML=state.layers.map(l=>`<option value="${esc(l.id)}">${esc(l.name)} · ${l.height}尺</option>`).join('');$('edit-layer').value=i.layerId;
  for(const k of ['width','depth','height','x','z'])$(`edit-${k}`).value=i[k];
  $('faction-wrap').hidden=i.kind!=='actor';$('stats-details').hidden=i.kind!=='actor';$('edit-faction').value=i.faction||'ally';
  for(const f of document.querySelectorAll('[data-stat]'))f.value=i.stats?.[f.dataset.stat]??'';
  $('stats-state').textContent=i.stats?'已填写':'待完善';$('stats-details').open=false;
  $('edit-note').textContent=i.kind==='actor'?'尺寸决定俯视点的占地。数值未填写时仍可摆放。':'所有尺寸都以尺为单位，底部随所属地面层移动。';dirty=false;
}
async function handlePlace(point){try{
  if(tool==='move'){
    const a=turn(),position={x:a.position.x+Math.round((point.x-a.position.x)/5)*5,z:a.position.z+Math.round((point.z-a.position.z)/5)*5,y:point.y};
    showAction('确认移动',`<p>${esc(a.name)} → (${position.x}, ${position.z})，高度 ${point.y}尺</p><p class="fine">预计距离 ${Math.max(Math.abs(position.x-a.position.x),Math.abs(position.z-a.position.z))}尺。碰撞、移动余量与高差由本地规则核对。</p><button id="confirm-move" class="primary wide">确认移动</button>`);
    $('confirm-move').onclick=guard(async()=>{await battleAction('move',{actorId:a.id,position});$('action-dialog').close();tool='select';render();});return;
  }
  if(tool==='relocate'){
    await send('edit',{id:selected,patch:{x:point.x,z:point.z,layerId:point.layerId}});tool='select';choose(selected);return;
  }
  if(tool!=='build')return;
  await send('place',{preset:slots[slot],layerId:point.layerId,x:point.x,z:point.z});
}catch(e){notify(e.message,true);}}
function renderCombat(){
  if(!active())return;const a=turn(),c=state.combat.combat;
  $('round').textContent=`第 ${c.round} 轮`;$('turn-name').textContent=a.name;
  $('turn-resources').textContent=`HP ${a.hp}/${a.maxHp} · 移动 ${Math.max(0,a.speed*(c.action==='dash'?2:1)-c.moved)}尺 · ${c.action==='none'?'动作可用':'动作已用'}`;
  $('turn-order').innerHTML=c.order.map(id=>{const p=state.combat.actors.find(a=>a.id===id);return `<span class="${a.id===id?'current':''}">${esc(p.name)} · ${state.combat.combat.initiative.find(i=>i.actorId===id)?.total}</span>`;}).join('');
  document.querySelector('[data-action="dash"]').disabled=c.action!=='none';document.querySelector('[data-action="attack"]').disabled=c.attacksUsed>=a.attackLimit||(!['none','attack'].includes(c.action));
  $('combat-hint').textContent=state.log.at(-1)||'选择一个行动';
}
async function battleAction(action,payload={}){await send('battle-action',payload,{action});notify(state.log.at(-1));}
function showAction(title,html){view.stop();$('action-title').textContent=title;$('action-content').innerHTML=html;if(!$('action-dialog').open)$('action-dialog').showModal();}
function focusTurn(){const a=turn();if(!a)return;const item=state.items.find(i=>i.id===a.id);current=item.layerId;layers.add(current);selected=item.id;tool='select';render();view.focusItem(item);}
function startBattle(){
  if(!canLeaveEditor())return;
  const list=actors(),missing=list.filter(i=>!i.stats);
  showAction('开战前核对',`<p>${list.length} 名参战者 · ${missing.length?'还有白板需要完善':'数值已齐全'}</p>${list.map(i=>`<div class="roster-item"><span>${esc(i.name)} <small>${i.stats?'已填写':'缺少战斗数值'}</small></span><button data-review="${esc(i.id)}">查看 / 编辑</button></div>`).join('')}<p class="fine">点击下方按钮后，程序为所有人掷先攻并进入第一回合。当前是演示局面。</p>${!list.length?'<p class="error-text">先从底部物品栏放置参战者白板。</p>':''}<button id="confirm-start" class="primary wide" ${missing.length||!list.length?'disabled':''}>掷先攻并开战</button>`);
  document.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>{$('action-dialog').close();choose(b.dataset.review);$('stats-details').open=true;});
  $('confirm-start').onclick=guard(async()=>{await send('battle-start');$('action-dialog').close();focusTurn();});
}
function action(type){
  if(type==='move'){tool='move';selected=turn().id;current=chosen().layerId;layers.add(current);render();$('viewport').focus();return;}
  if(type==='attack'){
    const a=turn();showAction('选择攻击目标',`<p>${esc(a.name)} · 武器攻击 · ${a.attacks[0].damage[0].formula}</p><p class="fine">选目标后核对距离和费用，再确认掷骰。</p>${state.combat.actors.filter(t=>t.id!==a.id).map(t=>`<button class="target-button" data-target="${esc(t.id)}">${esc(t.name)} <small>HP ${t.hp}/${t.maxHp}</small></button>`).join('')}`);
    document.querySelectorAll('[data-target]').forEach(b=>b.onclick=guard(async()=>{
      const target=state.combat.actors.find(t=>t.id===b.dataset.target),payload={actorId:a.id,targetId:target.id,attackId:'basic',mode:'normal'};
      try{await api('/v2/plan',payload);}catch(error){notify(error.message,true);return;}
      showAction('确认武器攻击',`<p>${esc(a.name)} → <strong>${esc(target.name)}</strong></p><p>攻击 d20 ${a.attacks[0].bonus>=0?'+':''}${a.attacks[0].bonus} · 伤害 ${esc(a.attacks[0].damage[0].formula)}</p><p class="fine">确认后由本地规则掷骰、扣除行动并结算伤害。</p><button id="confirm-attack" class="primary wide">确认并掷骰</button>`);
      $('confirm-attack').onclick=guard(async()=>{await battleAction('attack',payload);$('action-dialog').close();});
    }));return;
  }
  if(type==='dash'){showAction('确认疾走','<p>使用本回合动作，增加一份速度对应的移动额度。</p><button id="confirm-dash" class="primary wide">确认疾走</button>');$('confirm-dash').onclick=guard(async()=>{await battleAction('dash',{actorId:turn().id});$('action-dialog').close();});return;}
  if(type==='adjudicate'){
    showAction('主持裁定',`<form id="adjudicate-form"><p class="fine">用于手工记录特殊情况。本预览只提供伤害、治疗及动作消耗；复杂规则由主持核对。</p><label>目标<select id="manual-target">${state.combat.actors.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label><label>说明<input id="manual-note" maxlength="200" required></label><div class="fields"><label>结果<select id="manual-kind"><option value="note">仅记录</option><option value="heal">治疗</option><option value="damage">伤害</option></select></label><label>数值<input id="manual-amount" type="number" min="0" max="9999" value="0"></label></div><label>伤害类型（仅伤害时使用）<select id="manual-damage-type"><option value="bludgeoning">钝击</option><option value="slashing">挥砍</option><option value="piercing">穿刺</option><option value="fire">火焰</option><option value="force">力场</option></select></label><label class="check"><input id="manual-cost" type="checkbox">消耗目标角色的动作（仅限当前行动者）</label><button class="primary wide">确认记录与应用</button></form>`);
    $('adjudicate-form').onsubmit=guard(async()=>{const payload={actorId:$('manual-target').value,reason:$('manual-note').value,consumeAction:$('manual-cost').checked},kind=$('manual-kind').value,amount=Number($('manual-amount').value);if(kind==='heal')payload.heal=amount;if(kind==='damage')payload.damage=[{type:$('manual-damage-type').value,amount}];await battleAction('adjudicate',payload);$('action-dialog').close();});
  }
}
function setView(value){if(!canLeaveEditor())return;mode=value;tool=active()?'select':tool;render();$('viewport').focus();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{if(!canLeaveEditor())return;tool=b.dataset.tool;selected=null;render();$('viewport').focus();});
$('hotbar').onclick=e=>{const b=e.target.closest('[data-slot]');if(b&&canLeaveEditor())chooseSlot(Number(b.dataset.slot));};
$('hotbar').onwheel=e=>{e.preventDefault();if(canLeaveEditor())chooseSlot((slot+Math.sign(e.deltaY)+9)%9);};
$('inventory-toggle').onclick=()=>{$('inventory').hidden=!$('inventory').hidden;};
$('inventory').onclick=e=>{const b=e.target.closest('[data-preset]');if(b&&canLeaveEditor()){slots[slot]=b.dataset.preset;chooseSlot(slot);$('inventory').hidden=true;}};
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]'))return;
  if(/^Digit[1-9]$/.test(e.code)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();if(canLeaveEditor())chooseSlot(Number(e.code.slice(-1))-1);}
  if(e.code==='Escape'){view.stop();if(document.pointerLockElement)document.exitPointerLock();if(!canLeaveEditor())return;selected=null;tool='select';render();}
});
$('layer-toggle').onclick=()=>{$('layers-panel').hidden=!$('layers-panel').hidden;};$('layer-close').onclick=()=>{$('layers-panel').hidden=true;};
$('layer-list').onchange=e=>{const id=e.target.dataset.layerCheck;if(!id)return;if(mode==='2d'){current=id;layers.add(id);}else{if(e.target.checked){layers.add(id);current=id;}else{layers.delete(id);if(current===id&&layers.size)current=[...layers][0];}}render();};
$('layer-list').onclick=e=>{const b=e.target.closest('[data-layer-current]'),edit=e.target.closest('[data-layer-edit]');if(b){current=b.dataset.layerCurrent;layers.add(current);render();}if(edit)openLayer(edit.dataset.layerEdit);};
$('layer-priority').onchange=e=>{priority=e.target.checked;render();};
function openLayer(id){view.stop();layerEditing=id;const l=state.layers.find(l=>l.id===id);$('layer-dialog-title').textContent=l?'编辑地面层':'新建地面层';$('layer-name').value=l?.name||`地面层 ${state.layers.length+1}`;$('layer-height').value=l?.height??Math.min(90,Math.max(...state.layers.map(l=>l.height))+10);$('layer-dialog').showModal();}
$('layer-add').onclick=()=>openLayer(null);
$('layer-form').onsubmit=guard(async()=>{const payload={name:$('layer-name').value,height:Number($('layer-height').value)};if(layerEditing)payload.id=layerEditing;await send(layerEditing?'layer-edit':'layer-add',payload);if(!layerEditing){current=state.layers.at(-1).id;layers.add(current);}render();$('layer-dialog').close();});
$('edit-form').oninput=()=>{dirty=true;};
$('demo-stats').onclick=()=>{const stats=demoStats();for(const f of document.querySelectorAll('[data-stat]'))f.value=stats[f.dataset.stat];dirty=true;$('stats-state').textContent='演示数值 · 待保存';};
$('edit-form').onsubmit=guard(async()=>{
  const item=chosen();if(!item)return;const patch={name:$('edit-name').value,layerId:$('edit-layer').value};for(const k of ['width','depth','height','x','z'])patch[k]=Number($(`edit-${k}`).value);
  if(item.kind==='actor'){patch.faction=$('edit-faction').value;const fields=[...document.querySelectorAll('[data-stat]')];if(fields.every(f=>f.value===''))patch.stats=null;else{if(fields.some(f=>f.value===''))throw Error('战斗数值请全部填写，或全部留空作为白板');patch.stats=Object.fromEntries(fields.map(f=>[f.dataset.stat,f.dataset.stat==='damage'?f.value:Number(f.value)]));}}
  await send('edit',{id:item.id,patch});dirty=false;loadEditor(chosen());notify('修改已保存');
});
$('inspector-close').onclick=()=>{if(!canLeaveEditor())return;selected=null;render();};
$('relocate').onclick=()=>{if(!canLeaveEditor())return;tool='relocate';$('inspector').hidden=true;render();$('viewport').focus();};
$('remove').onclick=guard(async()=>{const id=selected;await send('remove',{id});dirty=false;selected=null;render();});
$('undo').onclick=guard(async()=>{if(!canLeaveEditor())return;await send('undo');selected=null;tool='select';render();notify('已撤销');});
$('camera-reset').onclick=()=>view.reset();$('zoom-in').onclick=()=>view.zoom(.85);$('zoom-out').onclick=()=>view.zoom(1.18);
$('look-lock').onclick=guard(async()=>{view.stop();if(document.pointerLockElement===view.canvas)document.exitPointerLock();else{ $('viewport').focus();await view.canvas.requestPointerLock();}});
document.addEventListener('pointerlockerror',()=>notify('无法锁定鼠标；可按住右键转动视角',true));
function settingsValues(){for(const [key,id,unit] of [['move','move',' 尺/秒'],['vertical','vertical',' 尺/秒'],['look','look',' 倍']]){$(`${id}-speed`).value=settings[key];$(`${id}-output`).textContent=settings[key]+unit;}view.settings=settings;}
$('settings-open').onclick=()=>{view.stop();settingsValues();$('settings').showModal();};
for(const key of ['move','vertical','look'])$(`${key}-speed`).oninput=e=>{settings[key]=Number(e.target.value);settingsValues();try{localStorage.setItem('battle-preview-v2-controls',JSON.stringify(settings));}catch{notify('浏览器未允许保存设置，本次调整仍有效');}};
$('settings-reset').onclick=()=>{settings={...DEFAULT_SETTINGS};settingsValues();try{localStorage.setItem('battle-preview-v2-controls',JSON.stringify(settings));}catch{}};
$('battle-start').onclick=startBattle;$('battle-end').onclick=()=>{showAction('结束本次演示战斗','<p>保留本次战斗记录，返回场景布置。</p><button id="confirm-end" class="primary wide">结束战斗</button>');$('confirm-end').onclick=guard(async()=>{await battleAction('end');$('action-dialog').close();tool='select';render();});};
$('next-turn').onclick=guard(async()=>{await battleAction('next');focusTurn();});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
$('log-open').onclick=()=>{$('log-list').innerHTML=state.log.slice().reverse().map(s=>`<p>${esc(s)}</p>`).join('');$('log-dialog').showModal();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
window.addEventListener('beforeunload',e=>{if(dirty||pending){e.preventDefault();e.returnValue='';}});
try{state=await api('/v2/state');render();}catch(e){notify(`预览加载失败：${e.message}`,true);$('save').textContent='加载失败，请刷新';}
