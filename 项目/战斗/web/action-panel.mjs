import {actionCatalog,operationProblem,operationCosts,eligibleSlots,needsSlot,CATEGORY_NAMES} from '/action-catalog.mjs';
import {el} from '/resource-icons.mjs';
import {actionIcon} from '/action-icons.mjs';
import {actionId} from '/client-utils.mjs';
const $=id=>document.getElementById(id);
export function actionPanel({resources,getState,getActor,action,notify,openTool,openCategory=()=>{}}) {
  const root=el('section','','hotbar-section');root.id='hotbar-section';const head=el('div','','resource-heading'),sort=el('button','调整位置');sort.type='button';sort.id='hotbar-sort';head.append(el('h3','操作目录'),sort);
  const hint=el('p','按分类查看操作，拖动同一分类中的方格可交换位置。','fine'),filter=el('select');filter.id='hotbar-filter';filter.setAttribute('aria-label','筛选操作分类');const all=el('option','全部操作');all.value='';filter.append(all,...Object.entries(CATEGORY_NAMES).map(([id,name])=>{const o=el('option',name);o.value=id;return o;}));const grid=el('div','','operation-grid');grid.id='operation-grid';root.append(head,hint,filter,grid);resources.root.append(root);
  const dialog=el('dialog','','tool-dialog operation-dialog');dialog.id='operation-dialog';dialog.dataset.dialog='operation';dialog.setAttribute('aria-label','确认操作');dialog.innerHTML=`<header class="dialog-heading"><h2 id="operation-title">操作</h2><button type="button" class="icon-button" data-close-tool aria-label="关闭操作">×</button></header><div class="dialog-body"><p id="operation-source" class="fine"></p><p id="operation-notes"></p><p id="operation-cost" class="cost-caption"></p><p id="operation-problem" class="notice"></p><form id="operation-form"><label id="operation-slot-label">使用法术位<select id="operation-slot"></select></label><label>目标 / 效果接受者<select id="operation-target"></select></label><label id="operation-movement-label">本次实际移动消耗（尺）<input id="operation-movement" type="number" min="1" max="600" value="5"></label><section id="operation-dm-fields"><p class="fine">此操作的条件、检定/豁免和具体效果由主持核对。确认后，本地同时校验费用、应用下方结果并保存。留空的效果不自动发生。</p><label>裁定依据与检定结果<textarea id="operation-reason" rows="3" maxlength="2000" placeholder="核对来源、目标条件、检定/豁免及最终效果"></textarea></label><div class="fields two"><label>治疗<input id="operation-heal" type="number" min="0" max="10000" value="0"></label><label>临时生命<input id="operation-temp" type="number" min="0" max="10000" value="0"></label><label>伤害<input id="operation-damage" type="number" min="0" max="100000" value="0"></label><label>伤害类型<select id="operation-damage-type"><option value="force">力场</option><option value="bludgeoning">钝击</option><option value="slashing">挥砍</option><option value="piercing">穿刺</option><option value="fire">火焰</option><option value="cold">寒冷</option><option value="radiant">光耀</option><option value="necrotic">暗蚀</option><option value="acid">强酸</option><option value="lightning">闪电</option><option value="thunder">雷鸣</option><option value="poison">毒素</option><option value="psychic">心灵</option></select></label></div><label>公开结果<textarea id="operation-public" rows="2" maxlength="2000"></textarea></label></section><p id="operation-player-caption" class="fine">此操作需要主持裁定。可复制下方提议，交给主持补充依据和结果；浏览或复制不会扣费。</p><button id="operation-submit" class="primary">确认费用并保存结果</button><button id="operation-proposal-copy" type="button">生成主持提议</button><textarea id="operation-proposal" rows="5" readonly hidden aria-label="待主持核对的提议"></textarea></form></div>`;$('table').append(dialog);
  const editor=el('details','','section');editor.id='operations-editor';editor.innerHTML=`<summary>本场法术、特性与装备操作</summary><p class="fine">仅登记当前角色拥有的能力；来源必须已核对。此处的特殊效果交主持确认，通用核心负责费用及明确的数值结果。轻型/Nick、额外动作、专注、形态变化等条件写入说明，不会仅凭名字自动启用。</p><label>已有操作<select id="op-choice"></select></label><form id="op-form"><div class="fields two"><label>ID<input id="op-id" required pattern="[A-Za-z0-9_-]{1,60}" maxlength="60"></label><label>名称<input id="op-name" required maxlength="80"></label><label>分类<select id="op-category"><option value="spells">法术</option><option value="features">职业 / 其他特性</option><option value="items">物品 / 装备</option><option value="weapons">特殊武器操作</option><option value="movement">特殊移动</option></select></label><label>启用来源<select id="op-ruleset"><option value="2024">2024</option><option value="compatible-expansion">已核对并启用的兼容扩展</option></select></label><label>法术环级<input id="op-level" type="number" min="0" max="9" value="0"></label><label>施法方式<select id="op-slotmode"><option value="expend">通常消耗法术位</option><option value="free">特性授权免费施法（写明来源）</option></select></label></div><label>费用JSON<input id="op-costs" value='[{"resourceId":"action","amount":1}]' required></label><p class="fine">resourceId使用action、bonus、reaction、attack或资源池ID。attack是一次攻击机会；消耗法术位的法术会在执行时另外选择环位。</p><label>规则来源<input id="op-source" required maxlength="1000"></label><label>条件与效果说明<textarea id="op-notes" required rows="3" maxlength="2000"></textarea></label><label class="check"><input id="op-target" type="checkbox">必须选择目标</label><button class="primary">保存本场操作</button><button type="button" id="op-remove">移出本场操作</button></form><label>操作JSON批量编辑<textarea id="operations-json" rows="8" spellcheck="false"></textarea></label><button type="button" id="operations-apply">应用操作JSON</button></details>`;$('resource-data-settings').append(editor);
  let selected=null,selectedRevision,context='',reorder=false,dragId='',suppressUntil=0,pointer,editingRevision;
  const safe=fn=>async e=>{e?.preventDefault();try{await fn(e);}catch(err){notify(err.message,true);}};
  const owned=()=>getState().viewRole==='dm'||getActor()?.ownerId===getState().viewerId;
  const catalog=()=>getActor()?actionCatalog(getActor()):[];
  function ordered() {const list=catalog(),ids=resources.preferences.hotbars?.[getActor().id]||[];return [...ids.map(id=>list.find(o=>o.id===id)).filter(Boolean),...list.filter(o=>!ids.includes(o.id))];}
  function costsLabel(o,slot) {
    try{return operationCosts(getActor(),o,slot).map(c=>`${({action:'动作',bonus:'附赠动作',reaction:'反应',attack:'攻击机会'})[c.resourceId]||getActor().resourcePools?.find(r=>r.id===c.resourceId)?.name||c.resourceId} ×${c.amount}`).join(' + ') || '无固定资源费用；仍须满足规则条件';}
    catch {return o.costs.map(c=>`${c.resourceId} ×${c.amount}`).join(' + ')+' + 选择法术位';}
  }
  function render() {
    const a=getActor(),s=getState();root.hidden=!a||!('hp' in a);
    const empty=$('operations-empty');if(empty)empty.hidden=!root.hidden;
    if(root.hidden){grid.replaceChildren();selected=null;dialog.close();return;}
    const next=`${s.campaignId}/${s.battleId}/${a.id}`;if(context!==next){context=next;selected=null;filter.value='';if(dialog.open)dialog.close();}
    const cards=ordered().filter(o=>!filter.value||o.category===filter.value).map(o=>{
      const card=el('div','','operation-cell');card.dataset.operationId=o.id;card.dataset.category=o.category;
      const b=el('button','','operation-tile');b.type='button';b.draggable=true;const problem=owned()?operationProblem(s,a,o):'不能操作其他角色';b.dataset.unavailable=String(!!problem);b.title=`${o.name}\n${costsLabel(o)}\n${problem||o.source}`;
      b.append(actionIcon(o.icon),el('span',o.name),el('small',o.mode==='adjudicate'?'主持裁定':o.mode==='reference'?'需登记资料':o.mode==='navigate'?'选择子项':'本地结算'));
      b.addEventListener('click',()=>{if(Date.now()>suppressUntil)choose(o);});
      b.addEventListener('dragstart',e=>{dragId=o.id;e.dataTransfer.setData('text/plain',o.id);e.dataTransfer.effectAllowed='move';});
      b.addEventListener('dragend',()=>{dragId='';suppressUntil=Date.now()+150;});
      card.addEventListener('dragover',e=>{if(dragId){e.preventDefault();e.dataTransfer.dropEffect='move';}});
      card.addEventListener('drop',safe(async e=>{await swap(dragId,o.id);dragId='';}));
      b.addEventListener('pointerdown',e=>{if(!reorder||e.button!==0)return;pointer={id:o.id,pointerId:e.pointerId};b.setPointerCapture(e.pointerId);e.preventDefault();});
      b.addEventListener('pointerup',safe(async e=>{if(!pointer)return;const from=pointer.id;pointer=null;suppressUntil=Date.now()+300;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-operation-id]');if(target&&grid.contains(target))await swap(from,target.dataset.operationId);}));
      b.addEventListener('pointercancel',()=>{pointer=null;});
      card.append(b);
      if(reorder){b.draggable=false;for(const [symbol,offset] of [['←',-1],['→',1]]){const move=el('button',symbol,'reorder-button');move.type='button';move.setAttribute('aria-label',`${o.name}${offset<0?'前移':'后移'}`);const list=ordered().filter(x=>x.category===o.category),i=list.findIndex(x=>x.id===o.id);move.disabled=!list[i+offset];move.addEventListener('click',safe(async()=>{if(list[i+offset])await swap(o.id,list[i+offset].id);}));card.append(move);}}
      return {category:o.category,node:card};
    });
    grid.replaceChildren(...Object.entries(CATEGORY_NAMES).flatMap(([category,name])=>{
      const items=cards.filter(c=>c.category===category);if(!items.length)return [];
      const group=el('section','','operation-category');group.dataset.category=category;
      const title=el('h4',`${name} · ${items.length}`);title.id=`operation-category-${category}`;group.setAttribute('aria-labelledby',title.id);
      const body=el('div','','category-grid');body.append(...items.map(c=>c.node));group.append(title,body);return [group];
    }));if(selected&&dialog.open)refreshDialog();
  }
  async function swap(from,to) {if(!from||from===to)return;const before=context;await resources.ready();if(before!==context)return;const a=getActor(),entries=ordered(),list=entries.map(o=>o.id),i=list.indexOf(from),j=list.indexOf(to);if(i<0||j<0)return;if(entries[i].category!==entries[j].category){notify('请在同一分类内拖动操作格');return;}[list[i],list[j]]=[list[j],list[i]];await resources.save({...resources.preferences,hotbars:{...resources.preferences.hotbars,[a.id]:list}});}
  function choose(o,preferredSlot) {
    if(o.mode==='navigate'){openCategory(o.category);return;}
    if(o.mode==='attack'){if(!owned()){notify('不能操作其他角色',true);return;}$('attack-choice').value=o.attackId;openTool('actions');$('attack-form').scrollIntoView({block:'center',behavior:'smooth'});$('attack-form').classList.add('chosen-operation');setTimeout(()=>$('attack-form').classList.remove('chosen-operation'),1200);return;}
    selected=o;selectedRevision=getState().revision;$('operation-form').reset();$('operation-proposal').hidden=true;$('operation-title').textContent=o.name;$('operation-source').textContent=o.source;$('operation-notes').textContent=o.notes;
    const slots=eligibleSlots(getActor(),o);$('operation-slot').replaceChildren(...slots.map(r=>{const opt=el('option',`${r.name} · ${r.current}/${r.max}`);opt.value=r.id;return opt;}));if(slots.some(r=>r.current>0))$('operation-slot').value=slots.find(r=>r.current>0).id;if(slots.some(r=>r.id===preferredSlot))$('operation-slot').value=preferredSlot;
    $('operation-target').replaceChildren(...getState().actors.map(a=>{const opt=el('option',a.name);opt.value=a.id;return opt;}));$('operation-target').value=o.target?(getState().actors.find(a=>a.id!==getActor().id)?.id||getActor().id):getActor().id;
    refreshDialog();openTool('operation');
  }
  function refreshDialog() {
    const o=selected;if(!o)return;const dm=getState().viewRole==='dm',slot=$('operation-slot').value,problem=getState().revision!==selectedRevision?'局面已更新，请关闭后重新选择操作':owned()?operationProblem(getState(),getActor(),o,slot):'不能操作其他角色';
    $('operation-slot-label').hidden=!needsSlot(o,getActor());$('operation-movement-label').hidden=!o.movement;$('operation-dm-fields').hidden=!dm||o.mode!=='adjudicate';$('operation-player-caption').hidden=dm||o.mode!=='adjudicate';$('operation-cost').textContent=`费用：${costsLabel(o,slot)}`;$('operation-problem').textContent=problem;$('operation-problem').hidden=!problem;
    $('operation-submit').disabled=!!problem||!owned()||(!dm&&o.mode==='adjudicate');$('operation-submit').textContent=o.mode==='dash'?'确认疾走并保存':'确认费用并保存结果';
  }
  function proposal() {
    const s=getState(),o=selected,result={};for(const [id,key] of [['operation-heal','heal'],['operation-temp','temporaryHp']])if(Number($(id).value)>0)result[key]=Number($(id).value);
    if(Number($('operation-damage').value)>0)result.damage=[{type:$('operation-damage-type').value,amount:Number($('operation-damage').value)}];
    return {campaignId:s.campaignId,battleId:s.battleId,actionId:actionId(),expectedRevision:selectedRevision,type:'use-operation',payload:{actorId:getActor().id,operationId:o.id,targetId:$('operation-target').value,...(needsSlot(o,getActor())?{slotId:$('operation-slot').value}:{}),...(o.movement?{movementCost:Number($('operation-movement').value)}:{}),reason:$('operation-reason').value,result,publicNote:$('operation-public').value}};
  }
  $('operation-slot').addEventListener('change',refreshDialog);
  $('operation-form').addEventListener('submit',safe(async()=>{const p=proposal();$('operation-submit').disabled=true;try{await action(p.type,p.payload,p.expectedRevision);dialog.close();selected=null;}finally{if(selected)refreshDialog();}}));
  $('operation-proposal-copy').addEventListener('click',()=>{$('operation-proposal').value=JSON.stringify(proposal(),null,2);$('operation-proposal').hidden=false;$('operation-proposal').focus();$('operation-proposal').select();notify('提议已生成，请复制后交给主持核对');});
  sort.addEventListener('click',()=>{reorder=!reorder;sort.textContent=reorder?'完成排列':'调整位置';grid.classList.toggle('reordering',reorder);render();});filter.addEventListener('change',render);
  function fillOps() {
    editingRevision=getState().revision;
    const a=getActor();if(!a)return;const list=a.operations||[];$('op-choice').replaceChildren(el('option','新增操作'),...list.map(o=>{const n=el('option',o.name);n.value=o.id;return n;}));$('op-choice').options[0].value='';$('operations-json').value=JSON.stringify(list,null,2);fillOp();
  }
  function fillOp() {
    const o=getActor().operations?.find(o=>o.id===$('op-choice').value);
    for(const key of ['id','name','category','ruleset','source','notes'])$(`op-${key}`).value=o?.[key]??({category:'spells',ruleset:'2024'}[key]||'');$('op-id').readOnly=!!o;$('op-level').value=o?.spellLevel??0;$('op-slotmode').value=o?.slotMode||'expend';$('op-costs').value=JSON.stringify(o?.costs||[{resourceId:'action',amount:1}]);$('op-target').checked=o?.target??false;
  }
  $('resource-settings').addEventListener('click',fillOps);$('op-choice').addEventListener('change',fillOp);
  $('op-form').addEventListener('submit',safe(async()=>{const a=getActor(),o={};for(const key of ['id','name','category','ruleset','source','notes'])o[key]=$(`op-${key}`).value;o.costs=JSON.parse($('op-costs').value);o.target=$('op-target').checked;if(o.category==='spells'){o.spellLevel=Number($('op-level').value);o.slotMode=$('op-slotmode').value;}const list=structuredClone(a.operations||[]),i=list.findIndex(x=>x.id===o.id);if(i<0)list.push(o);else list[i]=o;await action('edit-actor',{actorId:a.id,patch:{operations:list},reason:'主持登记已启用的操作规则'},editingRevision);fillOps();}));
  $('op-remove').addEventListener('click',safe(async()=>{const a=getActor();await action('edit-actor',{actorId:a.id,patch:{operations:(a.operations||[]).filter(o=>o.id!==$('op-choice').value)},reason:'主持移出操作'},editingRevision);fillOps();}));
  $('operations-apply').addEventListener('click',safe(async()=>{await action('edit-actor',{actorId:getActor().id,patch:{operations:JSON.parse($('operations-json').value)},reason:'主持导入已核对操作目录'},editingRevision);fillOps();}));
  resources.onRender(render);
  return {render,choose,catalog,showCategory(category){filter.value=category;render();root.scrollIntoView({block:'nearest'});},problem:o=>operationProblem(getState(),getActor(),o),clear(){selected=null;context='';grid.replaceChildren();dialog.close();for(const id of ['op-choice','operations-json','operation-source','operation-notes','operation-target','operation-slot','operation-title']){const n=$(id);if(n.matches('input,textarea'))n.value='';else n.replaceChildren();}}};
}
