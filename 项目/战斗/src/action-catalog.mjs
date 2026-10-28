import {requireRule} from './rule-errors.mjs';
import {costProblem} from './resources.mjs';
export const CATEGORY_NAMES={common:'常规动作',weapons:'武器攻击',unarmed:'徒手',spells:'法术',features:'职业与其他特性',items:'物品与装备',movement:'移动'};
const source='PHB2024：进行游戏／动作、术语汇编';
const common=(id,name,icon,category,cost,notes,extra={})=>({id:`common:${id}`,name,icon,category,costs:cost?[{resourceId:cost,amount:1}]:[],source,notes,mode:'adjudicate',...extra});
export const COMMON_OPERATIONS=[
  common('attack','攻击','sword','weapons',null,'选择已登记武器；一次攻击动作内的额外攻击由攻击次数校验。',{mode:'navigate'}),
  common('dash','疾走','run','movement','action','使用动作，获得等于速度的额外移动预算。',{mode:'dash'}),
  common('disengage','撤离','exit','movement','action','本回合移动不引发借机攻击；具体触发由主持核对。'),
  common('dodge','回避','shield','common','action','防守至自己下回合开始：你看得见的攻击者对你的攻击检定具有劣势，你的敏捷豁免具有优势。失能或速度降为0时失效。具体攻击和豁免仍须主持核对。'),
  common('help','协助','hand','unarmed','action','选择援助检定或攻击分支，核对距离、熟练及条件。',{target:true}),
  common('hide','躲藏','eye','movement','action','核对遮蔽/掩护、敌方视线、DC15敏捷（隐匿）及失效条件。'),
  common('influence','影响','voice','common','action','向对方提出请求，可用魅力（欺瞒、威吓、表演、游说）或感知（驯兽）。愿意时可直接同意，不愿意时可直接拒绝；犹豫才检定，通常DC取15与对方智力值中的较高者。失败后通常须等待24小时或主持指定时间再提同一要求。由主持决定态度、可行性及结果，不会强制控制NPC。',{target:true}),
  common('magic','魔法','spark','spells',null,'选择已登记法术、魔法物品或特性；按对应条文支付费用。',{mode:'navigate'}),
  common('ready','预备','clock','common','action','在自己回合先花动作，声明可感知的触发条件，并选一个动作或至多速度的移动，等待下次自己回合开始前触发。触发完成后可花反应执行，也可放弃。本入口用于非施法预备；预备法术当场花施法资源并保持专注，请登记独立操作。'),
  common('release-ready','响应预备行动','clock','features','reaction','这是“预备”的第二阶段：核对先前已预备的内容及触发已完成，且尚未到下次自己回合，才花反应执行；不是额外赠送的动作。释放已预备法术不再次扣先前付过的法术位，仍须主持核对专注与效果。'),
  common('search','搜索','eye','common','action','花动作，用感知（洞悉、医药、察觉或求生）寻找隐蔽事实，如察看踪迹、发现藏匿者或识别意图。主持根据目的确定技能、DC及可获得的信息。'),
  common('study','研究','book','common','action','花动作，用智力（奥秘、历史、调查、自然或宗教）回忆知识、分析线索或理解事物。主持确定具体技能、DC和信息；与主要靠感知寻找迹象的搜索不同。'),
  common('utilize','操作','hand','items','action','操作非魔法物件；具体物品可改变动作需求。'),
  common('unarmed','徒手打击','fist','unarmed','attack','核对徒手攻击加值与伤害；可选择伤害、擒抱或推撞。',{target:true}),
  common('shove','推撞（推击）','push','unarmed','attack','2024徒手打击分支：目标力量或敏捷豁免；核对体型、触及，成功推开5尺或倒地。',{target:true,reach:5}),
  common('grapple','擒抱','hand','unarmed','attack','2024徒手打击分支：力量或敏捷豁免；核对空手、体型及触及。',{target:true,reach:5}),
  common('throw','投掷','throw','unarmed','attack','选择投掷武器或临时武器，核对重量、射程、加值、弹药/库存及伤害。',{target:true}),
  common('opportunity','借机攻击','sword','weapons','reaction','核对离开触及、反应可用、可见性及阻止触发的条件。一次近战攻击结果由主持核对。',{target:true}),
  common('jump','跳跃','jump','movement',null,'2024普通跳跃使用移动预算，不统一消耗附赠动作。核对力量、助跑、距离及落点；填写实际移动成本。',{movement:true}),
  common('climb','攀爬 / 游泳','climb','movement',null,'按速度、额外移动成本、地形和检定裁定；填写实际移动成本。',{movement:true}),
  common('stand','从倒地站起','stand','movement',null,'通常花费一半速度；核对倒地、速度及其他限制，填写实际成本。',{movement:true}),
  common('dip','蘸取 / 涂层','drop','items',null,'需先登记具体2024物品或已启用扩展的操作及消耗。不自动采用BG3蘸火伤害。',{mode:'reference'}),
  common('potion','饮用 / 喂治疗药水','bottle','items','bonus','2024治疗药水使用附赠动作；需先登记持有药水、库存及具体效果。',{mode:'reference'}),
  common('offhand','轻型武器额外攻击','sword','weapons','bonus','须登记轻型武器条件与一次限制。Nick可改变费用，不能一概视为附赠动作。',{mode:'reference'})
];
export function validateOperations(actor) {
  const list=actor.operations ?? [];
  requireRule(Array.isArray(list) && list.length<=180 && list.every(o=>o&&typeof o==='object'&&!Array.isArray(o)) && new Set(list.map(o=>o.id)).size===list.length,'操作目录须为唯一ID数组（最多180项）');
  for(const o of list) {
    requireRule(o && typeof o.id==='string' && /^[\w-]{1,60}$/.test(o.id) && typeof o.name==='string' && o.name.trim().length>0 && o.name.length<=80,'操作名称或ID无效');
    requireRule(['spells','features','items','weapons','movement'].includes(o.category) && ['2024','compatible-expansion'].includes(o.ruleset),'操作分类或启用规则版本无效');
    requireRule(typeof o.source==='string' && o.source.trim().length>0 && o.source.length<=1000 && typeof o.notes==='string' && o.notes.length<=2000,'操作须有来源与规则说明');
    requireRule(typeof o.target==='boolean' && Array.isArray(o.costs) && o.costs.length<=10 && o.costs.every(c=>c&&typeof c.resourceId==='string' && /^[\w-]{1,60}$/.test(c.resourceId) && Number.isInteger(c.amount) && c.amount>0 && c.amount<=1000),'操作费用无效');
    requireRule(!o.costs.some(c=>['action','attack'].includes(c.resourceId)) || !o.costs.some(c=>c.resourceId==='reaction'),'反应操作不能同时占用本人回合动作/攻击');
    for(const c of o.costs)requireRule(['action','attack','bonus','reaction'].includes(c.resourceId) || actor.resourcePools?.some(r=>r.id===c.resourceId),'操作费用引用了不存在的资源池');
    if(o.category==='spells')requireRule(Number.isInteger(o.spellLevel)&&o.spellLevel>=0&&o.spellLevel<=9&&['expend','free'].includes(o.slotMode),'法术须填写环级及耗位/免费施法方式');
  }
}
export function actionCatalog(actor) {
  return [...COMMON_OPERATIONS,...(actor.attacks||[]).map(a=>({id:`weapon:${a.id}`,name:a.name,icon:a.kind==='ranged'?'bow':'sword',category:'weapons',costs:[{resourceId:'attack',amount:1},...(a.costs||[])],source:'本场已核对的2024攻击资料',notes:a.manualEffect||'本地校验触及/射程、攻击与伤害骰、AC、抗性与临时生命。',mode:'attack',attackId:a.id})),
    ...(actor.operations||[]).map(o=>({...o,id:`custom:${o.id}`,icon:o.category==='spells'?'spark':o.category==='items'?'bottle':'star',mode:'adjudicate'}))];
}
export function eligibleSlots(actor,operation) {return (actor.resourcePools||[]).filter(r=>['slots','pact'].includes(r.kind) && r.level>=operation.spellLevel);}
export function needsSlot(operation,actor) {return operation.category==='spells' && operation.spellLevel>0 && operation.slotMode==='expend' && !operation.costs.some(c=>['slots','pact'].includes(actor.resourcePools?.find(r=>r.id===c.resourceId)?.kind));}
export function operationCosts(actor,operation,slotId) {
  const costs=structuredClone(operation.costs);
  if(needsSlot(operation,actor)) {
    const slot=eligibleSlots(actor,operation).find(r=>r.id===slotId);requireRule(slot,'请选择足够环级的普通或契约法术位');costs.push({resourceId:slot.id,amount:1});
  }
  if(operation.category==='spells' && operation.spellLevel>0)for(const c of costs){const r=actor.resourcePools?.find(r=>r.id===c.resourceId);if(['slots','pact'].includes(r?.kind))requireRule(r.level>=operation.spellLevel,'法术位环级不足');}
  return costs;
}
export function operationProblem(state,actor,operation,slotId) {
  if(operation.mode==='reference')return '请先在角色操作资料中登记具体装备、能力与规则费用';
  if(operation.mode==='navigate')return '';
  try {
    if(needsSlot(operation,actor)&&!slotId){const pools=eligibleSlots(actor,operation);if(!pools.length)return '未登记足够环级的法术位';const problems=pools.map(p=>costProblem(state,actor,operationCosts(actor,operation,p.id)));return problems.find(p=>!p) ?? problems[0];}
    return costProblem(state,actor,operationCosts(actor,operation,slotId));
  }catch(e){return e.message;}
}
