// PHB2024 resource fixtures. These are deliberately unconfirmed, partial test cards.
const FULL_SLOTS=[4,3,3,3,3,2,2,1,1], HALF_SLOTS=[4,3,3,3,2], THIRD_SLOTS=[4,3,3,1];
const LOCAL='项目/资源/资料/5E不全书/网页/topics/玩家手册2024/角色职业';
const CLASSES=[
  ['barbarian','野蛮人',12,null,[['berserker','狂战士道途'],['wild-heart','兽心道途'],['world-tree','世界树道途'],['zealot','狂热者道途']]],
  ['bard','吟游诗人',8,'full',[['dance','舞蹈学院'],['glamour','魅心学院'],['lore','逸闻学院'],['valor','勇气学院']]],
  ['cleric','牧师',8,'full',[['life','生命领域'],['light','光明领域'],['trickery','诡术领域'],['war','战争领域']]],
  ['druid','德鲁伊',8,'full',[['land','大地结社'],['moon','月亮结社'],['sea','海洋结社'],['stars','星辰结社']]],
  ['fighter','战士',10,null,[['battle-master','战斗大师'],['champion','勇士'],['eldritch-knight','奥法骑士'],['psi-warrior','灵能武士']]],
  ['monk','武僧',8,null,[['mercy','命流武者'],['shadow','暗影武者'],['elements','四象武者'],['open-hand','散打武者']]],
  ['paladin','圣武士',10,'half',[['devotion','奉献之誓'],['glory','荣耀之誓'],['ancients','古贤之誓'],['vengeance','复仇之誓']]],
  ['ranger','游侠',10,'half',[['beast-master','驯兽师'],['fey-wanderer','妖精漫游者'],['gloom-stalker','幽域追猎者'],['hunter','猎人']]],
  ['rogue','游荡者',8,null,[['arcane-trickster','诡术师'],['assassin','刺客'],['soulknife','魂刃'],['thief','盗贼']]],
  ['sorcerer','术士',6,'full',[['aberrant','畸变术法'],['clockwork','时械术法'],['draconic','龙族术法'],['wild-magic','狂野术法']]],
  ['warlock','魔契师',8,'pact',[['archfey','至高妖精宗主'],['celestial','天界宗主'],['fiend','邪魔宗主'],['great-old-one','旧日支配者宗主']]],
  ['wizard','法师',6,'full',[['abjurer','防护师'],['diviner','预言师'],['evoker','塑能师'],['illusionist','幻术师']]]
];

function abilityScores(classId,subclassId) {
  const scores={str:10,dex:14,con:14,int:10,wis:10,cha:10};
  if(['barbarian','fighter','paladin'].includes(classId))scores.str=20;
  if(['bard','paladin','sorcerer','warlock'].includes(classId))scores.cha=20;
  if(['cleric','druid','ranger'].includes(classId))scores.wis=20;
  if(['ranger','rogue'].includes(classId))scores.dex=20;
  if(classId==='wizard'||['eldritch-knight','psi-warrior','arcane-trickster'].includes(subclassId))scores.int=20;
  if(classId==='barbarian'){scores.str=24;scores.con=24;}
  if(classId==='monk'){scores.dex=24;scores.wis=24;}
  return scores;
}
const modifier=value=>Math.floor((value-10)/2);
function operation(ctx,id,name,costs,notes,{timing='free',target=false}={}) {
  ctx.operations.push({id,name,category:'features',ruleset:'2024',source:ctx.currentSource,
    notes:`主持资源核对；效果须另行确认。${notes}`,target,
    costs:[...(['action','bonus','reaction','attack'].includes(timing)?[{resourceId:timing,amount:1}]:[]),...costs]});
}
function pool(ctx,id,name,max,{current=max,kind='pool',sides,level,recovery={},timing='free',ability=name,notes='',target=false,extraCosts=[]}={}) {
  ctx.pools.push({id,name,kind,max,current,recovery,source:`${ctx.currentSource}；${notes}`,
    ...(sides?{sides}:{}),...(level?{level}:{}),...(kind==='rolls'?{values:[]}:{})});
  operation(ctx,`check-${id}`,ability,[{resourceId:id,amount:1},...extraCosts],notes,{timing,target});
}
function spells(ctx,slots) {
  slots.forEach((max,i)=>pool(ctx,`spell-slot-${i+1}`,`${i+1}环法术位`,max,{kind:'slots',level:i+1,recovery:{long:'all'},timing:'action',ability:`施法（${i+1}环／动作型测试）`,notes:'先由主持选择角色已准备的合法动作型法术并核对成分/目标；本入口只核对一枚该环位，不授予额外法术。'}));
}
function baseResources(ctx) {
  const {classId,abilities}=ctx,cha=modifier(abilities.cha),wis=modifier(abilities.wis);
  switch(classId) {
    case 'barbarian':
      pool(ctx,'rage','狂暴',6,{recovery:{short:1,long:'all'},timing:'bonus',notes:'20级仍为6次，短休恢复1、长休全部；非无限。未着重甲方可激活。'});
      pool(ctx,'persistent-rage','持久狂暴：先攻回满权',1,{recovery:{long:'all'},notes:'仅在掷先攻时选择使用，恢复全部狂暴；每长休一次，不自动恢复狂暴。'});
      ctx.manualState.relentlessRageDc=10;ctx.notes.push('坚韧狂暴：合资格归零时体质豁免DC从10开始，每次使用后+5，短/长休重置10；不是独立消耗池。原初斗士使本合成角色力量/体质从20升至24。');break;
    case 'bard':
      pool(ctx,'bardic-inspiration','诗人激励',Math.max(1,cha),{kind:'dice',sides:12,recovery:{short:'all',long:'all'},timing:'bonus',target:true,notes:'20级d12；次数为魅力调整值。授予其他生物的骰另记。先攻不足2回到2，或无动作花法术位换回1，均须主持确认。'});break;
    case 'cleric':
      pool(ctx,'channel-divinity','引导神力',4,{recovery:{short:1,long:'all'},timing:'action',ability:'神圣火花（引导神力）',target:true,notes:'20级4次；短休回1、长休全部；神圣火花4d8加感知调整值，主持确认治疗或体质豁免及伤害。'});
      pool(ctx,'divine-intervention','神圣干预',1,{timing:'action',notes:'通常完成长休后可再次使用；若20级选择祈愿术则需2d4次长休。此预设不自动恢复，须主持记录所选模式和剩余长休次数。'});
      ctx.manualState.divineInterventionWishLongRests=0;ctx.notes.push('神圣干预的祈愿术冷却不能写成每次长休无条件回满；剩余长休次数由真实2d4掷骰结果登记。');break;
    case 'druid':
      pool(ctx,'wild-shape','荒野变形',4,{recovery:{short:1,long:'all'},timing:'bonus',notes:'20级4次；短休回1、长休全部。掷先攻时仅在0次时回1；没有无限变形。形态与临时生命另行核对。'});
      pool(ctx,'wild-resurgence','荒野复苏：变形换一环位',1,{recovery:{long:'all'},extraCosts:[{resourceId:'wild-shape',amount:1}],notes:'合并支付一次使用权和一次荒野变形，获得一个一环位；这是获得法术位，不能仅按回补已用位处理，新增位结果由主持另记。'});
      pool(ctx,'nature-magician','自然术使',1,{recovery:{long:'all'},extraCosts:[{resourceId:'wild-shape',amount:1}],notes:'本测试合并支付一次使用权和一次形态，创造一个二环位；20级可改付更多形态，每份贡献2环阶，变体费用和新增位须另行核对。'});
      ctx.notes.push('荒野复苏的另一分支：每个本人回合一次，在形态为0时可以花一个法术位换回1次，无动作；不是另一份长休额度。上述两类形态换位能力各有独立每长休使用权。');break;
    case 'fighter':
      pool(ctx,'second-wind','回气',4,{recovery:{short:1,long:'all'},timing:'bonus',notes:'20级4次；短休回1、长休全部。治疗1d10+20；战术思维复用此池，不能另造一份回气次数。'});
      pool(ctx,'action-surge','动作如潮',2,{recovery:{short:'all',long:'all'},notes:'20级2次，每个回合最多用一次；增加的动作不能执行魔法动作。额外动作状态须主持另行核对。'});
      pool(ctx,'indomitable','不屈',3,{recovery:{long:'all'},notes:'豁免失败时重骰并+20，必须用新结果；不额外消耗反应。'});break;
    case 'monk':
      pool(ctx,'focus','功力',20,{recovery:{short:'all',long:'all'},timing:'bonus',ability:'疾风连击（功力核对）',notes:'20点；短/长休全部恢复。20级疾风连击1点发动3次徒手打击；其他功力能力复用此池。'});
      pool(ctx,'uncanny-metabolism','运转周天',1,{recovery:{long:'all'},notes:'仅掷先攻时选择：回满功力并恢复1d12+20生命，每长休一次，效果不自动应用。'});
      ctx.notes.push('明镜止水：掷先攻时若不使用运转周天且功力≤3，恢复至4；不是每回合回4。天人合一使本合成角色敏捷/感知从20升至24。');break;
    case 'paladin':
      pool(ctx,'lay-on-hands','圣疗',100,{recovery:{long:'all'},timing:'bonus',target:true,ability:'圣疗（核对1点治疗能量）',notes:'20级100点；每次治疗可选择实际耗量；此测试入口核对1点。移除中毒须5点且不同时治疗。'});
      pool(ctx,'channel-divinity','引导神力',3,{recovery:{short:1,long:'all'},timing:'bonus',ability:'神圣感知（引导神力）',notes:'20级3次，短休回1、长休全部；子职对应能力共用这一池。'});
      pool(ctx,'free-divine-smite','免费至圣斩',1,{recovery:{long:'all'},timing:'bonus',target:true,notes:'圣武斩给予的独立免费施法一次；必须满足至圣斩命中触发和成分等要求，不是普通法术位。'});
      pool(ctx,'free-find-steed','免费寻获坐骑',1,{recovery:{long:'all'},timing:'action',notes:'信实坐骑每长休一次免费施法；2024寻获坐骑为动作，实际坐骑须另建记录。'});break;
    case 'ranger':
      pool(ctx,'favored-enemy','免费猎人印记',6,{recovery:{long:'all'},timing:'bonus',target:true,notes:'20级宿敌6次免费猎人印记；专注及高等级特性由主持确认；独立于普通法术位。'});
      pool(ctx,'tireless','不知疲倦',Math.max(1,wis),{recovery:{long:'all'},timing:'action',notes:'次数为感知调整值，给予自身1d8+感知调整值临时生命，最低1；短休减少力竭属于另一效果，不额外给次数。'});
      pool(ctx,'natures-veil','自然面纱',Math.max(1,wis),{recovery:{long:'all'},timing:'bonus',notes:'次数为感知调整值；隐形持续至下一回合结束，效果另行确认。'});break;
    case 'rogue':
      pool(ctx,'stroke-of-luck','幸运一击',1,{recovery:{short:'all',long:'all'},notes:'D20检定失败时将骰值改为20，不额外消耗反应。'});
      ctx.notes.push('偷袭是每回合一次的条件伤害，20级10d6；狡诈打击消耗其中的伤害骰，不是另一份休息消耗池。');break;
    case 'sorcerer':
      pool(ctx,'sorcery-points','术法点',20,{recovery:{long:'all'},ability:'超魔法（核对1点费用）',notes:'最多20点；此入口仅核对费用为1点的已选超魔，实际选项及资格须主持确认。高费用选项不得只扣1点。'});
      pool(ctx,'innate-sorcery','先天术法',2,{recovery:{long:'all'},timing:'bonus',notes:'每长休2次；为0时可改花2术法点启动，不能在此重复扣免费次数。20级激活期间每个本人回合一次免费超魔。'});
      pool(ctx,'sorcerous-restoration','术法复苏',1,{recovery:{long:'all'},notes:'短休时可恢复最多10点已用术法点，但此恢复能力每长休仅一次，不是每次短休自动回10。'});
      ctx.manualState.apotheosisFreeMetamagicUsedThisOwnTurn=false;ctx.notes.push('术法点换位为附赠动作，创造一至五环位分别需要2/3/5/6/7点；所创造位在长休消失。环位换点无动作。转化效果须专用规则处理。');break;
    case 'warlock':
      pool(ctx,'pact-slots','五环契约法术位',4,{kind:'pact',level:5,recovery:{short:'all',long:'all'},timing:'action',ability:'契约魔法（动作型施法测试）',notes:'4个五环契约位，与普通法术位分开；须先选定本角色合法的动作型法术。'});
      pool(ctx,'magical-cunning','秘法回流',1,{recovery:{long:'all'},notes:'需举行1分钟仪式。20级魔能掌控使其回满契约位，非较低等级的部分恢复；本入口不自动恢复契约位。'});
      pool(ctx,'contact-patron','联络宗主：免费异界探知',1,{recovery:{long:'all'},notes:'免费异界探知且自动通过该法术豁免；仍遵守施法时间，不能当作普通五环位。'});
      for(const level of [6,7,8,9])pool(ctx,`arcanum-${level}`,`${level}环玄奥秘法`,1,{recovery:{long:'all'},timing:'action',ability:`玄奥秘法（${level}环／动作型测试）`,notes:'独立免费施法权，不是普通高环法术位；主持须先选定该环动作型秘法，若实际法术时间不同应另行记录。'});break;
    case 'wizard':
      pool(ctx,'arcane-recovery','奥术回想',1,{recovery:{long:'all'},notes:'短休时恢复总环阶最多10，单个位必须低于六环；每长休一次，不是每短休无条件恢复环位。'});
      for(const n of [1,2])pool(ctx,`signature-spell-${n}`,`招牌法术${n}：免费三环施法`,1,{recovery:{short:'all',long:'all'},timing:'action',notes:'两道预先选定的三环法术各一次免费额度；不得任选三环法术替代。此测试入口只适用于其中动作型法术。'});
      ctx.notes.push('法术精通所选一环与二环法术可以不限次最低环施展，不建次数池；需要预先选定合法动作型法术，升环仍耗位。');break;
  }
}
function subclassResources(ctx) {
  const key=`${ctx.classId}:${ctx.subclassId}`,cha=modifier(ctx.abilities.cha),wis=modifier(ctx.abilities.wis),int=modifier(ctx.abilities.int);
  switch(key) {
    case 'barbarian:berserker':pool(ctx,'intimidating-presence','威慑之姿',1,{recovery:{long:'all'},timing:'bonus',notes:'每长休一次；可额外花一次狂暴无动作重置使用权，不自动恢复。'});break;
    case 'barbarian:world-tree':ctx.manualState.travelAlongTreeUsedThisRage=false;ctx.notes.push('世界树之奇旅：每次狂暴期间一次可扩大为150尺并携带最多6名同伴；这是绑定当次狂暴的独立标记，不是另一份休息池。');break;
    case 'barbarian:zealot':
      pool(ctx,'warrior-of-gods','神之勇者治疗骰',7,{kind:'dice',sides:12,recovery:{long:'all'},timing:'bonus',notes:'20级7枚d12，可一次选择消耗多枚治疗自己；本入口核对一枚。'});
      pool(ctx,'zealous-presence','狂热威仪',1,{recovery:{long:'all'},timing:'bonus',notes:'每长休一次；可花一次狂暴无动作重置使用权，另行核对。'});
      pool(ctx,'rage-of-gods','神之狂暴',1,{recovery:{long:'all'},timing:'bonus',extraCosts:[{resourceId:'rage',amount:1}],notes:'合并激活一次狂暴并选择圣斗士姿态，每长休一次；不要为本次激活再额外点击普通狂暴。'});
      ctx.manualState.fanaticalFocusUsedThisRage=false;
      ctx.notes.push('专心炽志：每次狂暴仅一次，豁免失败后重掷并加狂暴伤害加值（20级+4），必须使用新结果；以当次狂暴标记记录，不因长休直接赠送额外使用。神之狂暴的回春在姿态期间以反应另耗一次狂暴，令合格30尺内归零目标改为20HP，不复用姿态的每长休使用权。');break;
    case 'bard:glamour':
      pool(ctx,'beguiling-magic','惑心魔法',1,{recovery:{long:'all'},notes:'在用法术位施放惑控/幻术法术后触发；诗人激励可重置此使用权，条件及费用另行核对。'});
      pool(ctx,'mantle-of-majesty','统御光环',1,{recovery:{long:'all'},timing:'bonus',notes:'无需环位命令术及1分钟形态，须专注；三环以上位可重置使用权。'});
      pool(ctx,'unbreakable-majesty','绝对统御',1,{recovery:{short:'all',long:'all'},timing:'bonus',notes:'每短/长休一次的威仪姿态，持续1分钟；攻击命中触发与豁免另行处理。'});break;
    case 'bard:dance':ctx.notes.push('舞蹈学院的灵巧打击、激励挪步与协同灵舞复用主职诗人激励；不另建“舞蹈次数”。灵巧打击是消耗诗人激励的原动作/附赠动作/反应的一部分。');break;
    case 'bard:lore':ctx.notes.push('逸闻学院的语出惊人、超凡技艺复用诗人激励；超凡技艺若加骰后仍失败则不消耗该次数，不另建独立池。');break;
    case 'bard:valor':ctx.notes.push('勇气学院的战斗激励使用受激励者持有的同一枚诗人激励骰，不应再次从授予者扣一次。额外攻击使攻击动作有两次攻击。');break;
    case 'cleric:light':
      pool(ctx,'warding-flare','守御之光',Math.max(1,wis),{recovery:{short:'all',long:'all'},timing:'reaction',notes:'20级已受进阶守御之光影响，短/长休均回满；次数为感知调整值。'});
      pool(ctx,'corona-of-light','光冕',Math.max(1,wis),{recovery:{long:'all'},timing:'action',notes:'次数为感知调整值；持续一分钟的日光灵光及相应豁免劣势须主持判定。'});break;
    case 'cleric:war':pool(ctx,'war-priest','战争祭司',Math.max(1,wis),{recovery:{short:'all',long:'all'},timing:'bonus',notes:'感知调整值次的附赠武器攻击或徒手打击；短/长休回满，不和普通攻击动作次数混为一池。'});break;
    case 'druid:land':
      pool(ctx,'natural-recovery-free','自然恢复：免费结社法术',1,{recovery:{long:'all'},timing:'action',notes:'选一道已由结社法术准备的一环以上法术免费施放；本测试假定该法术为动作型，其他时间须另行处理。'});
      pool(ctx,'natural-recovery-slots','自然恢复：恢复环位权',1,{recovery:{long:'all'},notes:'短休时恢复总环阶最多10、单个位低于六环；与免费结社法术的额度独立。'});break;
    case 'druid:moon':pool(ctx,'moonlight-step','月光飞步',Math.max(1,wis),{recovery:{long:'all'},timing:'bonus',notes:'感知调整值次；二环以上法术位可无动作恢复一次，须按所选位另行支付。'});break;
    case 'druid:stars':
      pool(ctx,'star-map-guiding-bolt','星图：免费光导箭',Math.max(1,wis),{recovery:{long:'all'},timing:'action',target:true,notes:'感知调整值次免费光导箭，必须持有合格星图；攻击和伤害须另行结算。'});
      pool(ctx,'cosmic-omen','宇宙预兆',Math.max(1,wis),{recovery:{long:'all'},timing:'reaction',notes:'感知调整值次；长休后须真实掷骰决定当日奇偶/吉凶，使用时再掷d6，不能预编结果。'});
      ctx.manualState.cosmicOmenParity=null;break;
    case 'fighter:eldritch-knight':spells(ctx,THIRD_SLOTS);break;
    case 'fighter:battle-master':
      pool(ctx,'superiority-dice','卓越骰',6,{kind:'dice',sides:12,recovery:{short:'all',long:'all'},ability:'卓越战技（核对一枚卓越骰）',notes:'20级6枚d12；每次攻击通常只能一项战技。具体战技触发和动作费用由主持按已选项确认。'});
      pool(ctx,'know-enemy','料敌机先',1,{recovery:{long:'all'},timing:'bonus',notes:'每长休一次；可消耗一枚卓越骰无动作重置此使用权。'});
      ctx.manualState.relentlessManeuverUsedThisTurn=false;ctx.notes.push('15级坚韧：每回合一次战技可改掷d8且不消耗卓越骰，不是每次战技都免费。');break;
    case 'fighter:champion':
      pool(ctx,'heroic-inspiration','勇战英豪：英雄激励',1,{current:0,ability:'英雄激励（重掷核对）',notes:'初始尚未触发。战斗中本人回合开始且没有英雄激励时可获得1；须主持在真实触发时登记，不自动预赠。消耗后可重掷刚掷出的任意一枚骰，不额外消耗动作。'});break;
    case 'fighter:psi-warrior':
      pool(ctx,'psi-dice','灵能武士灵能骰',12,{kind:'dice',sides:12,recovery:{short:1,long:'all'},ability:'庇护力场（灵能骰核对）',timing:'reaction',notes:'20级12枚d12，短休恢复1枚、长休全部；仅供此子职，不与魂刃骰混用。'});
      pool(ctx,'telekinetic-movement','念力控物免费权',1,{recovery:{short:'all',long:'all'},timing:'action',notes:'短/长休一次；可花一枚灵能骰无动作重置。'});
      pool(ctx,'psi-powered-leap','灵力跃动免费权',1,{recovery:{short:'all',long:'all'},timing:'bonus',notes:'短/长休一次；可额外花一枚灵能骰再次使用。'});
      pool(ctx,'bulwark-force','力场壁垒免费权',1,{recovery:{long:'all'},timing:'bonus',notes:`每长休一次；可花一枚灵能骰重置，最多选择智力调整值（本卡${int}）个目标。`});
      pool(ctx,'telekinetic-master','念力宗师免费施法权',1,{recovery:{long:'all'},timing:'action',notes:'每长休一次免费心灵遥控；可花一枚灵能骰重置，专注与额外攻击条件另行核对。'});break;
    case 'monk:mercy':
      pool(ctx,'flurry-healing-harm','生杀予夺免费增益',Math.max(1,wis),{recovery:{long:'all'},timing:'bonus',extraCosts:[{resourceId:'focus',amount:1}],notes:'合并核对一次疾风连击及免费治疗/伤害增益；次数为感知调整值，不要再次支付同一次疾风连击。'});
      pool(ctx,'hand-ultimate-mercy','命极之手使用权',1,{recovery:{long:'all'},timing:'action',target:true,extraCosts:[{resourceId:'focus',amount:5}],notes:'每长休一次并支付5点功力，触碰合格死者；复活的真实条件和结果由主持核对。'});break;
    case 'monk:open-hand':
      pool(ctx,'wholeness-body','混元体',Math.max(1,wis),{recovery:{long:'all'},timing:'bonus',notes:'感知调整值次，每次恢复一枚武艺骰加感知调整值的生命，最低1。'});
      ctx.manualState.quiveringPalmTargetId=null;ctx.notes.push('渗透劲复用4功力，并须记录唯一一个处于暗劲的目标，不能同时给多个目标保留暗劲。');break;
    case 'monk:shadow':ctx.notes.push('暗影术、改良暗影步和幽影斗篷复用功力，不另建次数池；幽影斗篷激活期间疾风连击不再消耗功力，不能仍按普通1点按钮扣费。');break;
    case 'paladin:devotion':pool(ctx,'holy-nimbus','至圣光轮',1,{recovery:{long:'all'},timing:'bonus',notes:'20级每长休一次，持续10分钟；五环法术位可重置使用权。'});break;
    case 'paladin:glory':
      pool(ctx,'glorious-defense','辉煌防御',Math.max(1,cha),{recovery:{long:'all'},timing:'reaction',notes:'次数为魅力调整值；符合条件时提高AC，若改为失手且攻击者在触及内可反击。'});
      pool(ctx,'living-legend','现世传说',1,{recovery:{long:'all'},timing:'bonus',notes:'20级每长休一次，持续10分钟；五环法术位可重置使用权。'});break;
    case 'paladin:ancients':
      pool(ctx,'undying-sentinel','不灭哨卫',1,{recovery:{long:'all'},notes:'归零但未直接死亡时，改为1HP再恢复60HP；每长休一次，不消耗反应。'});
      pool(ctx,'elder-champion','上古斗士',1,{recovery:{long:'all'},timing:'bonus',notes:'20级每长休一次，持续1分钟；五环法术位可重置使用权。'});break;
    case 'paladin:vengeance':pool(ctx,'avenging-angel','复仇天使',1,{recovery:{long:'all'},timing:'bonus',notes:'20级每长休一次，持续10分钟；五环法术位可重置使用权。'});break;
    case 'ranger:beast-master':ctx.manualState.primalCompanionActorId=null;ctx.notes.push('驯兽师须另建一只原初野兽及其生命、位置和反应；不伪造额外消耗池。死亡后复活消耗普通法术位，长休可替换伙伴。');break;
    case 'ranger:fey-wanderer':
      pool(ctx,'fey-reinforcements','精宸所与：免费召唤妖精',1,{recovery:{long:'all'},timing:'action',notes:'每长休一次免费召唤妖精；可调整为不需专注而持续1分钟，实际状态另行确认。'});
      pool(ctx,'misty-wanderer','雾行漫游：免费迷踪步',Math.max(1,wis),{recovery:{long:'all'},timing:'bonus',notes:'感知调整值次免费迷踪步；同行生物与落点等条件由主持核对。'});break;
    case 'ranger:gloom-stalker':pool(ctx,'dreadful-strike','恐惧打击',Math.max(1,wis),{recovery:{long:'all'},notes:'每回合最多一次，武器命中触发，次数为感知调整值；附加伤害及高等级增益另行核对。'});break;
    case 'rogue:arcane-trickster':
      spells(ctx,THIRD_SLOTS);
      pool(ctx,'spell-thief','法术窃贼',1,{recovery:{long:'all'},timing:'reaction',notes:'满足被法术指定或位于区域等条件后触发；偷得法术及8小时时限须另记。'});break;
    case 'rogue:thief':
      pool(ctx,'attunement-capacity','使用魔法装置：可用同调格',4,{kind:'inventory',ability:'使用魔法装置：登记一件同调物品',notes:'最多同时同调4件。初始空余4格；通常须专注物品完成短休后同调，完成时扣格，解除同调返还，不因休息回满。'});
      ctx.manualState.attunedItemIds=[];
      ctx.notes.push('使用魔法装置：消耗充能时真实掷d6，6则不扣充能；高于一环卷轴须智力（奥秘）DC10+环级，失败卷轴化尘。窃盗本能是首轮第二次回合，不是一次额外动作池。');break;
    case 'rogue:soulknife':
      pool(ctx,'soulknife-dice','魂刃灵能骰',12,{kind:'dice',sides:12,recovery:{short:1,long:'all'},ability:'灵振诀窍（灵能骰核对）',notes:'20级12枚d12，短休恢复1、长休全部；灵振诀窍及寻的斩击仅在加入结果使检定成功/命中时才消耗。'});
      pool(ctx,'psychic-whispers','心灵低语免费权',1,{recovery:{long:'all'},timing:'action',notes:'每长休免费一次，但仍须真实掷灵能骰决定时长；后续使用须另花灵能骰。'});
      pool(ctx,'psychic-veil','灵能面纱',1,{recovery:{long:'all'},timing:'action',notes:'每长休一次；可花一枚魂刃灵能骰无动作重置，隐形及失效条件另行核对。'});
      pool(ctx,'rend-mind','撕裂心智',1,{recovery:{long:'all'},notes:'以念刃造成偷袭伤害时触发；每长休一次，可花3枚魂刃灵能骰重置。'});break;
    case 'sorcerer:aberrant':pool(ctx,'warping-implosion','扭曲内爆',1,{recovery:{long:'all'},timing:'action',notes:'每长休一次；可花5术法点无动作重置，传送、力量豁免及伤害另行处理。'});break;
    case 'sorcerer:clockwork':
      pool(ctx,'restore-balance','归复平衡',Math.max(1,cha),{recovery:{long:'all'},timing:'reaction',notes:'次数为魅力调整值；在合格生物带优势/劣势检定时取消该影响。'});
      pool(ctx,'bastion-law-dice','律令之壁授予护盾骰',5,{kind:'dice',sides:8,current:0,notes:'当前尚未授予护盾；须花1～5术法点后记录对应数量d8，最大5枚，不能长休自动回满。再次施加或长休结束旧护盾。',ability:'律令之壁：核对一枚护盾骰'});
      pool(ctx,'trance-order','序列意识',1,{recovery:{long:'all'},timing:'bonus',notes:'每长休一次；可花5术法点重置，持续一分钟，效果由主持确认。'});
      pool(ctx,'clockwork-cavalcade','时械矩阵',1,{recovery:{long:'all'},timing:'action',notes:'每长休一次；可花7术法点重置，100点分配治疗、修复和解除效果另行核对。'});break;
    case 'sorcerer:draconic':
      pool(ctx,'dragon-wings','龙翼',1,{recovery:{long:'all'},timing:'bonus',notes:'每长休一次，持续一小时；可花3术法点重置。'});
      pool(ctx,'dragon-companion','龙族伙伴免费施法权',1,{recovery:{long:'all'},timing:'action',notes:'每长休一次免费召唤巨龙；无专注版持续1分钟，召唤物须另建记录。'});break;
    case 'sorcerer:wild-magic':
      pool(ctx,'tides-chaos','混乱之潮',1,{recovery:{long:'all'},notes:'在自身D20掷骰前取得优势；使用法术位施放术士法术时也会恢复并自动掷狂野浪涌，不能只恢复不处理浪涌。'});
      pool(ctx,'tamed-surge','驯服浪涌',1,{recovery:{long:'all'},notes:'用法术位施放术士法术后选择合格浪涌效应；每长休一次，效应仍需按条文掷骰。'});break;
    case 'warlock:archfey':
      pool(ctx,'steps-fey','妖精步伐：免费迷踪步',Math.max(1,cha),{recovery:{long:'all'},timing:'bonus',notes:'次数为魅力调整值；传送及额外步伐效果须核对。'});
      pool(ctx,'beguiling-defenses','斗转星移',1,{recovery:{long:'all'},timing:'reaction',notes:'合格敌人命中后伤害减半并反击心灵效果；可花一个契约位重置。'});
      ctx.notes.push('14级惑心魔法：以动作耗位施放幻术/惑控法术后附带的免费迷踪步，不再消耗妖精步伐独立免费次数。');break;
    case 'warlock:celestial':
      pool(ctx,'healing-light','治愈之光',21,{kind:'dice',sides:6,recovery:{long:'all'},timing:'bonus',target:true,notes:`20级21枚d6，每次最多消耗魅力调整值（本卡${cha}）枚；本入口核对一枚。`});
      pool(ctx,'searing-vengeance','灼光复仇',1,{recovery:{long:'all'},target:true,notes:'你或60尺内盟友将要死亡豁免时触发，每长休一次；目标恢复其生命上限一半，周边伤害等另行核对，不额外消耗反应。'});break;
    case 'warlock:fiend':
      pool(ctx,'dark-ones-luck','黑暗强运',Math.max(1,cha),{recovery:{long:'all'},notes:'属性检定或豁免结果生效前加d10，次数为魅力调整值；一次检定最多一次，不消耗反应。'});
      pool(ctx,'hurl-through-hell','直坠噩梦',1,{recovery:{long:'all'},notes:'每回合最多一次、攻击命中后触发；每长休一次，可花一个契约位重置。'});break;
    case 'warlock:great-old-one':pool(ctx,'clairvoyant-combatant','锐眼斗士',1,{recovery:{short:'all',long:'all'},notes:'通过唤醒心灵建立合格连结时触发，短/长休恢复；可花一个契约位重置，豁免及连结时限另行核对。'});break;
    case 'wizard:abjurer':
      pool(ctx,'arcane-ward-create','奥术守御创建权',1,{recovery:{long:'all'},notes:'施放消耗法术位的防护法术时触发创建；不是额外动作。现未创建，须主持实际施法后填写结界HP。'});
      pool(ctx,'arcane-ward-hp','奥术守御结界生命',40+int,{current:0,ability:'奥术守御：核对1点实际吸伤',notes:'初始未创建；上限为2×法师等级+智力调整值。施防护法术/附赠动作花位可补2×环级HP，长休结束旧结界，不自动回满。'});
      ctx.manualState.arcaneWardCreated=false;break;
    case 'wizard:diviner':
      pool(ctx,'portent','预见骰（等待真实预掷）',3,{kind:'rolls',current:0,ability:'预兆：使用一个已记录预见骰',notes:'20级高等预兆为3枚d20；长休后由本地掷骰或真实人工骰产生结果并填入values，不能编造预掷点数。每回合最多替换一次。'});
      pool(ctx,'third-eye','天眼通',1,{recovery:{short:'all',long:'all'},timing:'bonus',notes:'每短/长休一次；选择并记录对应感官增益，持续至开始短/长休。'});
      ctx.notes.push('专业预言复用普通法术位：用二环以上位施放预言法术后恢复一个更低环且不高于五环的已用位；不是独立免费位池。');break;
    case 'wizard:evoker':
      pool(ctx,'overchannel-free','超限导能首次免自损',1,{recovery:{long:'all'},ability:'超限导能（本次长休后首次）',notes:'仅对合格的一至五环伤害法术；首次免自损，后续仍可使用但须按次数承担无视抗性/免疫的暗蚀伤害，不能视为总共只能一次。'});
      operation(ctx,'check-overchannel-again','超限导能（再次使用，须自损）',[],'须核对本次长休后已用次数：第二次每环2d12，以后每次每环再+1d12；结算真实自损并更新计数。');ctx.manualState.overchannelUses=0;break;
    case 'wizard:illusionist':
      pool(ctx,'phantasmal-beast','魅影生灵：免费召唤野兽',1,{recovery:{long:'all'},timing:'action',notes:'每长休该法术免费一次，只能使用该特性幻术版本，召唤物生命减半；与妖精版额度独立。'});
      pool(ctx,'phantasmal-fey','魅影生灵：免费召唤妖精',1,{recovery:{long:'all'},timing:'action',notes:'每长休该法术免费一次，只能使用该特性幻术版本，召唤物生命减半；与野兽版额度独立。'});
      pool(ctx,'illusory-self','幻影化形',1,{recovery:{long:'all'},timing:'reaction',notes:'遭合格攻击命中时令攻击失手；每长休一次，可花二环以上法术位重置。'});break;
    default:ctx.notes.push('该子职不新增独立的休息消耗池；其被动能力、主职资源变体与每回合/触发条件仍须按子职条文核对。');
  }
}

export const CLASS_TEST_PRESET_MATRIX=CLASSES.map(([id,name,,caster,subs],i)=>({classId:id,className:name,level:20,batch:i<6?1:2,caster,subclasses:subs.map(([subclassId,subclassName])=>({subclassId,subclassName}))}));

export function createClassTestActors({batch}={}) {
  if(![1,2].includes(batch))throw new Error('测试批次须为1或2');
  return CLASSES.slice((batch-1)*6,batch*6).flatMap(([classId,className,hitDie,caster,subclasses],classIndex)=>subclasses.map(([subclassId,subclassName],subclassIndex)=>{
    const index=classIndex*4+subclassIndex,abilities=abilityScores(classId,subclassId);
    const mainSource=`${LOCAL}/${className}/${className}.htm`,subSource=`${LOCAL}/${className}/${subclassName}.htm`;
    const ctx={classId,subclassId,abilities,pools:[],operations:[],notes:[],manualState:{},currentSource:`PHB2024 ${className}20级；${mainSource}`};
    if(caster==='full')spells(ctx,FULL_SLOTS);else if(caster==='half')spells(ctx,HALF_SLOTS);
    baseResources(ctx);ctx.currentSource=`PHB2024 ${className}／${subclassName}；${subSource}`;subclassResources(ctx);
    const attackLimit=classId==='fighter'?4:['barbarian','monk','paladin','ranger'].includes(classId)||classId==='bard'&&subclassId==='valor'?2:1;
    return {id:`test20-${classId}-${subclassId}`,ownerId:`player-test20-${classId}-${subclassId}`,name:`${className}·${subclassName}（20级资源测试）`,kind:'pc',
      hp:100,maxHp:100,tempHp:0,tempHpBase:0,ac:15,speed:classId==='monk'?60:['barbarian','ranger'].includes(classId)?40:30,initiativeBonus:modifier(abilities.dex),attackLimit,tiePriority:index,facing:0,
      space:{width:5,depth:5},body:{width:2,depth:1,height:6},position:{x:7.5+(index%6)*15,y:0,z:7.5+Math.floor(index/6)*15},
      immunities:[],resistances:[],vulnerabilities:[],hidden:false,confirmed:false,economy:{bonusUsed:false,reactionUsed:false},
      attacks:[{id:'test-strike',name:'合成基础攻击（仅占位）',kind:'melee',bonus:11,reach:5,damage:[{formula:'1d6+5',type:'bludgeoning'}],manualEffect:'统一测试攻击，不从属性/装备推导；真实攻击、精通与特殊效应需主持替换核对。'}],
      resourcePools:ctx.pools,operations:ctx.operations,
      resources:'PHB2024 20级主职与一个子职的资源测试预设；不是完整角色卡。真实触发、目标、专注、形态与条件恢复均由主持核对。',
      notes:'此为未确认的合成资源测试角色，HP100、AC15及训练攻击为界面测试占位，不代表完整构筑或平衡遭遇。属性为明确合成值，尚未配置种族、背景、专长、完整法术/装备及所有被动特性。',
      classTestProfile:{presetVersion:1,classId,className,subclassId,subclassName,level:20,batch,abilities,hitDie,proficiencyBonus:6,sourceFiles:[mainSource,subSource],
        syntheticStats:{hp:100,ac:15,trainingAttack:'+11 / 1d6+5',baseSpeed:30},resourceNotes:ctx.notes,manualState:ctx.manualState,
        incomplete:['完整角色构筑','种族与背景','专长','已知/准备法术选择','战技/超魔法/祈唤等职业可选项','装备和熟练','持续状态与条件恢复'],
        movementAssumptions:'基础30尺；蛮人/游侠假定未着重甲并计入+10；武僧假定无甲且计入+30。HP/AC/训练攻击仍为统一测试占位。'}};
  }));
}
