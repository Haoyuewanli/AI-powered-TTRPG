const $=id=>document.getElementById(id);
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const values=text=>text.trim()?text.trim().split(/[\s,，]+/).map(v=>{const n=Number(v);if(!Number.isInteger(n))throw new Error('原始骰点请用整数，以空格或逗号分隔');return n;}):[];
export function manualRecordPanel({action,getState,getActor,notify}) {
  const root=el('details','','manual-record-panel section');root.id='manual-record-panel';
  root.innerHTML=`<summary>主持记录与通用掷骰</summary><p class="fine">可以只记录线下已经发生的操作，也可明确应用数值。仅记录不会重掷、扣费或修改HP；记录并应用才会改变进度。</p>
  <form id="general-roll-form"><h3>通用掷骰</h3><label>用途<input id="general-roll-label" maxlength="80" value="通用掷骰" required></label><label>公式<input id="general-roll-formula" value="1d20" maxlength="30" required placeholder="1d20+5"></label><label>检定方式<select id="general-roll-mode"><option value="normal">通常</option><option value="advantage">d20优势</option><option value="disadvantage">d20劣势</option></select></label><label>骰点来源<select id="general-roll-source"><option value="program">本地程序掷骰</option><option value="physical-dice">线下实体骰</option><option value="external-tool">外部工具</option><option value="dm-recorded">DM手动记录</option></select></label><label id="general-roll-values-label" hidden>原始骰点<input id="general-roll-values" placeholder="如：12，8；不要填总和"></label><button id="general-roll-submit" type="submit">掷骰并保存记录</button><p id="general-roll-result" class="fine" role="status"></p></form>
  <form id="manual-record-form"><h3>记录一项操作</h3><label>模式<select id="record-mode"><option value="record-only">仅记录已发生结果</option><option value="apply">记录并应用以下数值</option></select></label><label>操作名称<input id="record-label" maxlength="80" required placeholder="例如：线下攻击检定、交涉、物品交接"></label><label>目标 / 结果接受者<select id="record-target"></select></label><label>私密说明与依据<textarea id="record-note" required minlength="2" maxlength="2000" rows="3"></textarea></label><div id="record-rolls"></div><button type="button" id="record-add-roll">添加已掷骰组</button>
  <fieldset id="record-application" hidden disabled><legend>明确应用的数值</legend><p class="fine">分类伤害填减免前数值，程序处理抗性及临时生命。已在外部结算过的结果请填最终HP，避免再次减免。</p><label>结果方式<select id="record-result-mode"><option value="delta">治疗 / 减免前伤害 / 临时生命</option><option value="final-hp">直接核定最终HP</option></select></label><div id="record-delta-fields" class="fields two"><label>治疗量<input id="record-heal" type="number" min="0" max="10000" value="0"></label><label>赋予临时生命<input id="record-temp" type="number" min="0" max="10000" value="0"></label><label>减免前伤害<input id="record-damage" type="number" min="0" max="100000" value="0"></label><label>伤害类型<select id="record-damage-type"></select></label></div><div id="record-final-hp-label" hidden><label>最终HP<input id="record-final-hp" type="number" min="0" max="10000" placeholder="含本次结果后的最终值"></label><label>最终临时生命（可留空）<input id="record-final-temp" type="number" min="0" max="10000" placeholder="外部结算后剩余的临时生命"></label></div><label>组合费用JSON<input id="record-costs" value="[]" spellcheck="false"></label><p class="fine">费用从所选行动者扣除；数值应用于目标。例：[{"resourceId":"bonus","amount":1}]。留空或[]不扣资源。</p></fieldset>
  <label>向玩家公开的内容（留空为DM私密记录）<textarea id="record-public" maxlength="2000" rows="2"></textarea></label><div class="button-grid"><button type="button" id="record-preview">预览记录</button><button type="submit" id="record-save" class="primary" disabled>确认保存记录</button></div><p id="record-preview-status" class="fine" role="status"></p><textarea id="record-preview-json" rows="6" readonly hidden aria-label="待提交主持记录"></textarea></form>`;
  $('dm-tools').append(root);
  for(const [id,name] of [['acid','强酸'],['bludgeoning','钝击'],['cold','寒冷'],['fire','火焰'],['force','力场'],['lightning','闪电'],['necrotic','暗蚀'],['piercing','穿刺'],['poison','毒素'],['psychic','心灵'],['radiant','光耀'],['slashing','挥砍'],['thunder','雷鸣']]){const o=el('option',name);o.value=id;$('record-damage-type').append(o);}
  let context='',targetsKey='',previewed=null,submitting=false;
  const safe=fn=>async e=>{e?.preventDefault();try{await fn(e);}catch(error){notify(error.message,true);}};
  function invalidate(message='内容尚未提交，请预览后保存。') {previewed=null;$('record-save').disabled=true;$('record-preview-json').hidden=true;$('record-preview-status').textContent=message;}
  function mode() {const apply=$('record-mode').value==='apply';$('record-application').hidden=!apply;$('record-application').disabled=!apply;const final=$('record-result-mode').value==='final-hp';$('record-delta-fields').hidden=final;$('record-final-hp-label').hidden=!final;}
  function rollSource() {const program=$('general-roll-source').value==='program';$('general-roll-values-label').hidden=program;$('general-roll-submit').textContent=program?'掷骰并保存记录':'记录原始骰点并计算总数';}
  function addRoll() {
    const row=el('fieldset','','record-dice-row');row.innerHTML='<legend>已掷骰组</legend><label>公式<input data-field="formula" value="1d20" maxlength="30" required></label><label>检定方式<select data-field="mode"><option value="normal">通常</option><option value="advantage">d20优势</option><option value="disadvantage">d20劣势</option></select></label><label>原始骰点<input data-field="values" required placeholder="例：12，8"></label><label>来源<select data-field="origin"><option value="physical-dice">线下实体骰</option><option value="external-tool">外部工具</option><option value="dm-recorded">DM手动记录</option></select></label><button type="button">移除此骰组</button>';
    row.querySelector('button').addEventListener('click',()=>{row.remove();invalidate();});$('record-rolls').append(row);invalidate();
  }
  function payload() {
    const p={mode:$('record-mode').value,actorId:getActor().id,targetId:$('record-target').value,label:$('record-label').value.trim(),note:$('record-note').value.trim(),publicNote:$('record-public').value,rolls:[...$('record-rolls').children].map(row=>({formula:row.querySelector('[data-field=formula]').value,mode:row.querySelector('[data-field=mode]').value,values:values(row.querySelector('[data-field=values]').value),origin:row.querySelector('[data-field=origin]').value}))};
    if(!p.label||p.note.length<2)throw new Error('请填写操作名称和至少两个字的记录依据');
    if(p.mode==='apply') {
      const application={};
      if($('record-result-mode').value==='final-hp') {if($('record-final-hp').value==='')throw new Error('请填写最终HP');application.finalHp=Number($('record-final-hp').value);if($('record-final-temp').value!=='')application.finalTempHp=Number($('record-final-temp').value);}
      else {if(Number($('record-heal').value)>0)application.heal=Number($('record-heal').value);if(Number($('record-temp').value)>0)application.temporaryHp=Number($('record-temp').value);if(Number($('record-damage').value)>0)application.damage=[{type:$('record-damage-type').value,amount:Number($('record-damage').value)}];}
      const costs=JSON.parse($('record-costs').value.trim()||'[]');if(!Array.isArray(costs))throw new Error('费用JSON须为数组');if(costs.length)application.costs=costs;
      if(!Object.keys(application).length)throw new Error('请填写要应用的数值或费用；只做记录时选择“仅记录”');p.application=application;
    }
    return p;
  }
  $('general-roll-source').addEventListener('change',rollSource);
  $('general-roll-form').addEventListener('submit',safe(async()=>{
    if(submitting)return;submitting=true;$('general-roll-submit').disabled=true;
    try {const p={actorId:getActor().id,label:$('general-roll-label').value,formula:$('general-roll-formula').value,mode:$('general-roll-mode').value};if($('general-roll-source').value!=='program'){p.values=values($('general-roll-values').value);p.origin=$('general-roll-source').value;}await action('roll-dice',p);const event=getState().events.at(-1);$('general-roll-result').textContent=event.dmText||'骰点记录已保存';}
    finally {submitting=false;$('general-roll-submit').disabled=false;}
  }));
  $('record-mode').addEventListener('change',mode);$('record-result-mode').addEventListener('change',mode);$('record-add-roll').addEventListener('click',addRoll);
  $('manual-record-form').addEventListener('input',()=>invalidate());$('manual-record-form').addEventListener('change',()=>invalidate());
  $('record-preview').addEventListener('click',safe(()=>{const p=payload();previewed={payload:p,revision:getState().revision,actorId:getActor().id};$('record-preview-json').value=JSON.stringify({expectedRevision:previewed.revision,type:'manual-record',payload:p},null,2);$('record-preview-json').hidden=false;$('record-preview-status').textContent=p.mode==='record-only'?'确认后只保存日志，不改变资源、HP或位置。':'确认后应用上方明确数值与费用，并保存日志。';$('record-save').disabled=false;}));
  $('manual-record-form').addEventListener('submit',safe(async()=>{
    if(!previewed||submitting)throw new Error('请先预览当前记录');
    const p=previewed;submitting=true;$('record-save').disabled=true;
    try {await action('manual-record',p.payload,p.revision);$('manual-record-form').reset();$('record-rolls').replaceChildren();mode();invalidate('记录已保存。');}
    finally {submitting=false;}
  }));
  function render() {
    const s=getState(),a=getActor();root.hidden=!s||s.viewRole!=='dm'||!a;if(root.hidden)return;
    const next=`${s.campaignId}/${s.battleId}/${a.id}`;
    if(context!==next) {context=next;$('manual-record-form').reset();$('general-roll-form').reset();$('record-rolls').replaceChildren();$('general-roll-result').textContent='';$('record-target').replaceChildren(...s.actors.map(actor=>{const o=el('option',actor.name);o.value=actor.id;return o;}));$('record-target').value=a.id;mode();rollSource();invalidate();}
    const nextTargets=JSON.stringify(s.actors.map(actor=>[actor.id,actor.name]));
    if(targetsKey!==nextTargets){targetsKey=nextTargets;const selected=$('record-target').value;$('record-target').replaceChildren(...s.actors.map(actor=>{const o=el('option',actor.name);o.value=actor.id;return o;}));$('record-target').value=s.actors.some(actor=>actor.id===selected)?selected:a.id;invalidate();}
    $('general-roll-source').options[0].disabled=s.diceMode==='physical';
    if(s.diceMode==='physical'&&$('general-roll-source').value==='program'){$('general-roll-source').value='physical-dice';rollSource();}
    if(previewed&&previewed.revision!==s.revision)invalidate('局面已更新，请重新预览记录。');
  }
  return {render,prepare({label,note}){render();$('manual-record-form').reset();$('record-rolls').replaceChildren();$('record-target').value=getActor().id;root.open=true;$('record-mode').value='record-only';$('record-label').value=label.slice(0,80);$('record-note').value=note.slice(0,2000);mode();invalidate();root.scrollIntoView({block:'center'});},clear(){context='';targetsKey='';previewed=null;root.open=false;$('record-target').replaceChildren();$('record-rolls').replaceChildren();$('record-preview-json').value='';$('record-preview-json').hidden=true;$('general-roll-result').textContent='';}};
}
