import {ITEM_CATALOG,ITEM_CATALOG_INFO} from '/data/items-2024.mjs';
import {inventoryChoices,getItem} from '/inventory.mjs';
import {actionId} from '/client-utils.mjs';
import {costProblem} from '/resources.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const categories={gear:'冒险装备',pack:'装备套组',ammunition:'弹药',focus:'法器与圣徽',weapon:'武器',armor:'护甲与盾',tool:'工具'};
const timing={action:'动作',bonus:'附赠动作',attack:'一次攻击机会',manual:'主持核对费用与耗时'};
export function inventoryPanel({action,getState,getActor,notify,openTool,recordItem}) {
  const button=el('button','背包');button.type='button';button.id='open-inventory';$('resource-section').querySelector('.resource-heading').append(button);
  const dialog=el('dialog','','tool-dialog');dialog.id='inventory-dialog';dialog.dataset.dialog='inventory';dialog.setAttribute('aria-label','背包与2024物品目录');
  dialog.innerHTML=`<header class="dialog-heading"><h2>背包与物品目录</h2><button type="button" class="icon-button" data-close-tool aria-label="关闭背包">×</button></header><div class="dialog-body"><p class="fine">PHB2024目录共182个具体物品，包含装备、武器、护甲和工具；持有不代表已装备或具备熟练。团队背包属于本场快照，取用仍需主持确认物品可及。</p><div class="fields two"><label>查看范围<select id="inventory-scope"><option value="personal">选中角色的个人背包</option><option value="party">本场团队背包</option><option value="catalog">全部2024目录</option></select></label><label>搜索<input id="inventory-search" type="search" placeholder="名称或类别"></label></div><div id="inventory-list" class="inventory-list"></div>
  <details id="inventory-editor"><summary>主持修改库存</summary><p class="fine">修改仅作用于本场选定背包，不会同步改写其他战斗。医疗包的quantity是总包数，charges是当前打开的一包剩余次数，其余包按新包计算。</p><label>修改范围<select id="inventory-edit-scope"><option value="personal">选中角色的个人背包</option><option value="party">本场团队背包</option></select></label><form id="inventory-add-form"><div class="fields two"><label>添加物品<select id="inventory-add-item"></select></label><label>数量<input id="inventory-add-quantity" type="number" min="1" max="9999" value="1" required></label></div><button id="inventory-add">添加并保存库存</button></form><label>背包JSON<textarea id="inventory-json" rows="7" spellcheck="false"></textarea></label><label>修改依据<input id="inventory-reason" maxlength="2000" placeholder="核对实际持有数量与来源"></label><div class="button-grid"><button id="inventory-save-json" type="button">保存本背包JSON</button><button id="inventory-reload-json" type="button">重新载入库存</button></div><p id="inventory-edit-status" class="fine"></p></details></div>`;
  const useDialog=el('dialog','','tool-dialog');useDialog.id='item-use-dialog';useDialog.dataset.dialog='item-use';useDialog.setAttribute('aria-label','选择物品用途');
  useDialog.innerHTML=`<header class="dialog-heading"><h2 id="item-use-title">选择物品</h2><button type="button" class="icon-button" data-close-tool aria-label="关闭物品操作">×</button></header><div class="dialog-body"><form id="item-use-form"><label class="check"><input id="item-owned-only" type="checkbox" checked>只显示个人或团队背包中的物品</label><label>物品与用途<select id="item-choice"></select></label><p id="item-source" class="fine"></p><p id="item-notes"></p><p id="item-status" class="notice" role="status"></p><label>目标<select id="item-target"></select></label><label id="item-party-label" class="check"><input id="item-party-access" type="checkbox">主持确认此团队物品当前可取用</label>
  <section id="item-heal-fields"><label class="check"><input id="item-physical" type="checkbox">录入实体骰 / 已掷原始点</label><label id="item-roll-label" hidden>原始骰点<input id="item-roll-values" placeholder="治疗药水例：3，4"></label></section><section id="item-manual-fields"><label>主持裁定依据<textarea id="item-note" rows="3" maxlength="2000" placeholder="核对用途、条件、触发、目标及实际结果"></textarea></label><label id="item-manual-costs-label">核定费用JSON<input id="item-manual-costs" value="[]" spellcheck="false"></label><label>明确的数值结果JSON<textarea id="item-result-json" rows="4" spellcheck="false">{}</textarea></label><p class="fine">示例：{"damage":[{"type":"fire","amount":4}]} 是减免前伤害；外部已处理过的结果用 {"finalHp":20}。状态、持续时间和场地效果请在裁定说明中记录，本程序不自动推断。</p></section><label>公开结果（可留空）<textarea id="item-public" rows="2" maxlength="2000"></textarea></label><div class="button-grid"><button id="item-confirm" class="primary">确认费用、库存并保存</button><button id="item-manual-record" type="button">转到主持手动记录</button><button id="item-proposal-button" type="button">生成主持提议</button></div><textarea id="item-proposal" rows="6" readonly hidden aria-label="待主持核对的物品提议"></textarea></form></div>`;
  $('table').append(dialog,useDialog);
  const reasonLabel=$('item-note').closest('label');reasonLabel.id='item-reason-label';$('item-manual-fields').before(reasonLabel);
  $('inventory-add-item').replaceChildren(...ITEM_CATALOG.map(item=>{const o=el('option',`${item.name} · ${categories[item.category]||item.category}`);o.value=item.id;return o;}));
  let context='',entryPoint='utilize',choices=[],openedRevision=0,editRevision=0,editScope='personal',editorDirty=false,submitting=false;
  const safe=fn=>async e=>{e?.preventDefault();try{await fn(e);}catch(error){notify(error.message,true);}};
  const scopeName=s=>({personal:'个人',party:'团队',catalog:'未持有'})[s];
  const dm=()=>getState()?.viewRole==='dm';
  const stacks=scope=>scope==='party'?(getState().partyInventory||[]):(getActor()?.inventory||[]);
  const selected=()=>choices[Number($('item-choice').value)];
  function renderList() {
    if(!getState()||!getActor())return;const scope=$('inventory-scope').value,q=$('inventory-search').value.trim().toLowerCase();
    const rows=scope==='catalog'?ITEM_CATALOG.map(item=>({item,quantity:null})):stacks(scope).map(stack=>({item:getItem(stack.itemId),...stack}));
    const list=$('inventory-list');list.replaceChildren();
    for(const row of rows.filter(r=>`${r.item?.name} ${categories[r.item?.category]||''}`.toLowerCase().includes(q))) {
      const card=el('details','','inventory-item');card.dataset.itemId=row.item.id;card.append(el('summary',`${row.item.name}${row.quantity===null?'':` ×${row.quantity}`}${row.charges===undefined?'':` · 当前包余${row.charges}次`}`));
      card.append(el('p',`${categories[row.item.category]||row.item.category} · ${row.item.sourcePath||ITEM_CATALOG_INFO.source}`,'fine'));
      for(const use of row.item.uses)card.append(el('p',`${use.label}：${timing[use.timing]}；${use.notes||'具体条件由主持核对。'}`));
      list.append(card);
    }
    if(!list.children.length)list.append(el('p',scope==='catalog'?'没有匹配物品。':'此背包没有匹配的物品。','fine'));
  }
  function fillEditor() {editRevision=getState().revision;editScope=$('inventory-edit-scope').value;editorDirty=false;$('inventory-json').value=JSON.stringify(stacks(editScope),null,2);$('inventory-edit-status').textContent=`基于进度v${editRevision}`;}
  button.addEventListener('click',()=>{renderList();fillEditor();$('inventory-editor').hidden=!dm();openTool('inventory');});
  $('inventory-scope').addEventListener('change',renderList);$('inventory-search').addEventListener('input',renderList);$('inventory-edit-scope').addEventListener('change',()=>{if(editorDirty){$('inventory-edit-scope').value=editScope;notify('请先保存或重新载入当前库存JSON',true);return;}fillEditor();});$('inventory-reload-json').addEventListener('click',fillEditor);$('inventory-json').addEventListener('input',()=>{editorDirty=true;});
  $('inventory-save-json').addEventListener('click',safe(async()=>{await action('edit-inventory',{actorId:getActor().id,scope:$('inventory-edit-scope').value,inventory:JSON.parse($('inventory-json').value),reason:$('inventory-reason').value},editRevision);fillEditor();renderList();}));
  $('inventory-add-form').addEventListener('submit',safe(async()=>{
    if(editorDirty)throw new Error('库存JSON尚未保存，请先保存或重新载入');const scope=$('inventory-edit-scope').value,item=getItem($('inventory-add-item').value),list=structuredClone(stacks(scope)),quantity=Number($('inventory-add-quantity').value),existing=list.find(s=>s.itemId===item.id);
    if(existing){if(item.chargesPerItem&&existing.quantity===0)existing.charges=item.chargesPerItem;existing.quantity+=quantity;}else list.push({id:`stock-${actionId()}`,itemId:item.id,quantity,...(item.chargesPerItem?{charges:item.chargesPerItem}:{})});
    await action('edit-inventory',{actorId:getActor().id,scope,inventory:list,reason:'主持添加并核对测试/实际物品数量'},editRevision);fillEditor();renderList();
  }));
  function fillChoices() {
    const prior=selected(),oldKey=prior&&`${prior.scope}/${prior.stackId}/${prior.useId}`;
    choices=inventoryChoices(getState(),getActor(),entryPoint).filter(c=>!$('item-owned-only').checked||c.scope!=='catalog');
    $('item-choice').replaceChildren(...choices.map((c,i)=>{const o=el('option',`${scopeName(c.scope)} · ${c.item.name} ×${c.quantity} · ${c.use.label}`);o.value=String(i);return o;}));
    const index=choices.findIndex(c=>`${c.scope}/${c.stackId}/${c.useId}`===oldKey);if(index>=0)$('item-choice').value=String(index);else{const first=choices.findIndex(c=>c.available);if(first>=0)$('item-choice').value=String(first);}refreshChoice();
  }
  function problem(c) {
    if(!c)return '当前背包没有此类物品，可取消勾选“只显示”浏览目录';
    if(getState().revision!==openedRevision)return '局面已更新，请关闭后重新选择物品';
    if(!c.available)return c.reason||'该物品或用途不能直接执行';
    if(c.scope==='party'&&(!dm()||!$('item-party-access').checked))return '团队物品需要主持确认当前可取用';
    if(c.use.mode!=='automatic-heal'&&!dm())return '此用途需要主持核对；可生成提议交给主持';
    if(getState().combat.phase!=='active'&&!dm())return '非战斗中的物品使用请交给主持确认';
    if(getState().combat.phase==='active') {
      let costs;
      try {costs=c.use.timing==='manual'?JSON.parse($('item-manual-costs').value||'[]'):[{resourceId:c.use.timing,amount:1}];}
      catch {return '核定费用须为有效JSON数组';}
      if(!Array.isArray(costs)||!costs.every(x=>x&&typeof x.resourceId==='string'&&Number.isInteger(x.amount)&&x.amount>0))return '核定费用须为资源及正整数数量数组';
      const reason=costProblem(getState(),getActor(),costs);if(reason)return reason;
    }
    return '';
  }
  function refreshChoice() {
    const c=selected(),p=problem(c),automatic=c?.use.mode==='automatic-heal';$('item-status').textContent=p||`费用：${timing[c.use.timing]}；库存：${c.use.consume.charges?`${c.use.consume.charges}次`:c.use.consume.quantity?`${c.use.consume.quantity}件`:'不消耗数量'}。${automatic?'治疗由本地掷骰并计算':'效果由主持核对'}`;
    $('item-confirm').disabled=!!p||submitting;$('item-source').textContent=c?`${c.item.name} · ${c.item.sourcePath||ITEM_CATALOG_INFO.source}`:'';$('item-notes').textContent=c?.use.notes||'';
    $('item-party-label').hidden=c?.scope!=='party';$('item-party-access').disabled=!dm();$('item-heal-fields').hidden=!automatic;$('item-manual-fields').hidden=automatic||!dm();$('item-manual-costs-label').hidden=c?.use.timing!=='manual';
    $('item-reason-label').hidden=!dm();$('item-note').required=dm()&&(!automatic||getState().combat.phase!=='active');
    $('item-manual-record').hidden=!dm()||!c||c.scope==='catalog'||c.use.mode!=='reference';
    if(getState().diceMode==='physical')$('item-physical').checked=true;$('item-physical').disabled=getState().diceMode==='physical';$('item-roll-label').hidden=!automatic||!$('item-physical').checked;
  }
  function makePayload() {
    const c=selected();if(!c||c.scope==='catalog')throw new Error('请先选择背包中实际持有的物品');
    const p={actorId:getActor().id,targetId:$('item-target').value,scope:c.scope,stackId:c.stackId,useId:c.useId,partyAccessible:$('item-party-access').checked,reason:$('item-note').value,publicNote:$('item-public').value};
    if(c.use.mode==='automatic-heal'&&$('item-physical').checked){p.manualRolls=$('item-roll-values').value.trim().split(/[\s,，]+/).filter(Boolean).map(Number);p.rollOrigin='physical-dice';}
    if(c.use.mode!=='automatic-heal'){p.result=JSON.parse($('item-result-json').value||'{}');if(c.use.timing==='manual')p.manualCosts=JSON.parse($('item-manual-costs').value||'[]');}
    return p;
  }
  function openInteraction(point='utilize') {
    entryPoint=point;openedRevision=getState().revision;$('item-use-form').reset();$('item-proposal').hidden=true;$('item-result-json').value='{}';$('item-manual-costs').value='[]';
    $('item-use-title').textContent=({potion:'饮用 / 喂治疗药水',dip:'蘸取 / 涂层',throw:'投掷物品',utilize:'操作物品'})[point]||'物品交互';$('item-target').replaceChildren(...getState().actors.map(a=>{const o=el('option',a.name);o.value=a.id;return o;}));$('item-target').value=getActor().id;fillChoices();openTool('item-use');
  }
  $('item-owned-only').addEventListener('change',fillChoices);$('item-choice').addEventListener('change',()=>{$('item-party-access').checked=false;refreshChoice();});$('item-party-access').addEventListener('change',refreshChoice);$('item-physical').addEventListener('change',refreshChoice);
  $('item-manual-costs').addEventListener('input',refreshChoice);
  $('item-use-form').addEventListener('submit',safe(async()=>{const p=makePayload();submitting=true;refreshChoice();try{await action('use-item',p,openedRevision);useDialog.close();}finally{submitting=false;refreshChoice();}}));
  $('item-proposal-button').addEventListener('click',safe(()=>{$('item-proposal').value=JSON.stringify({campaignId:getState().campaignId,battleId:getState().battleId,actionId:actionId(),expectedRevision:openedRevision,type:'use-item',payload:makePayload()},null,2);$('item-proposal').hidden=false;$('item-proposal').focus();$('item-proposal').select();}));
  $('item-manual-record').addEventListener('click',()=>{const c=selected();if(!c)return;useDialog.close();openTool('actions');recordItem?.({item:c.item,use:c.use,scope:c.scope});});
  return {openInteraction,render(){
    const s=getState(),a=getActor();if(!s||!a)return;const next=`${s.campaignId}/${s.battleId}/${a.id}`;if(context&&next!==context){dialog.close();useDialog.close();}context=next;
    if(dialog.open){renderList();$('inventory-editor').hidden=!dm();if(s.revision!==editRevision)$('inventory-edit-status').textContent='局面已更新，保存前请重新载入并核对库存JSON。';}
    if(useDialog.open)refreshChoice();
  },clear(){context='';choices=[];dialog.close();useDialog.close();$('inventory-list').replaceChildren();$('inventory-json').value='';$('item-choice').replaceChildren();$('item-target').replaceChildren();$('item-source').textContent='';$('item-notes').textContent='';$('item-proposal').value='';}};
}
