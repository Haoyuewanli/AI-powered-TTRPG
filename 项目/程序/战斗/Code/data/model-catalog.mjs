// Appearance catalog: selecting a model never enables a species, class or rule source.
export const MODEL_CLASSES = [
  ['barbarian', '野蛮人', 'fur', 'axe'], ['bard', '吟游诗人', 'performer', 'sword'],
  ['cleric', '牧师', 'priest', 'mace'], ['druid', '德鲁伊', 'leaves', 'staff'],
  ['fighter', '战士', 'soldier', 'sword'], ['monk', '武僧', 'wraps', 'staff'],
  ['paladin', '圣武士', 'knight', 'sword'], ['ranger', '游侠', 'scout', 'bow'],
  ['rogue', '游荡者', 'leather', 'dagger'], ['sorcerer', '术士', 'silk', 'dagger'],
  ['warlock', '魔契师', 'occult', 'staff'], ['wizard', '法师', 'robe', 'staff'],
  ['artificer', '奇械师', 'engineer', 'hammer']
].map(([id, name, outfit, weapon], index) => Object.freeze({ id, name, outfit, weapon, core: index < 12 }));

// Distinct silhouettes and anatomical features are composed with each class outfit.
const speciesRows = [
  ['human','人类',true,'human',1,1], ['aasimar','阿斯莫',true,'celestial',1,1.03],
  ['dragonborn','龙裔',true,'dragon',1.15,1.08], ['dwarf','矮人',true,'beard',1.18,.8],
  ['elf','精灵',true,'ears',.9,1.03], ['gnome','侏儒',true,'nose',.9,.65],
  ['goliath','歌利亚',true,'stone',1.28,1.3], ['halfling','半身人',true,'barefoot',.95,.62],
  ['orc','兽人',true,'tusks',1.22,1.1], ['tiefling','提夫林',true,'infernal',1,1.02],
  ['tabaxi','斑猫人',false,'cat',.94,1.03], ['satyr','半羊人',false,'goat',1,.98],
  ['yuan-ti','蛇人',false,'snake',.92,1.03], ['hobgoblin','大地精',false,'goblin-warrior',1.16,1.05],
  ['goblin','地精',false,'goblin',.82,.61], ['firbolg','费尔伯格人',false,'firbolg',1.22,1.22],
  ['kobold','狗头人',false,'small-dragon',.72,.6], ['tortle','龟人',false,'shell',1.3,1.03],
  ['shifter','化兽者',false,'beast',1.05,1], ['changeling','幻身灵',false,'mask',.88,1],
  ['githyanki','吉斯洋基人',false,'gith-warrior',.84,1.08], ['githzerai','吉斯泽莱人',false,'gith-monk',.82,1.06],
  ['khoravar','科拉瓦',false,'half-ears',.98,1.01], ['kalashtar','离梦人',false,'crystal',.94,1.04],
  ['aarakocra','鸟羽人',false,'bird',.86,1.03], ['minotaur','牛头人',false,'bull',1.35,1.2],
  ['centaur','人马',false,'centaur',1.12,1.1], ['triton','梭螺鱼人',false,'fins',1.04,1.04],
  ['kenku','天狗',false,'crow',.83,.88], ['harengon','兔人',false,'rabbit',.95,.96],
  ['lizardfolk','蜥蜴人',false,'lizard',1.1,1.04], ['fairy','仙灵',false,'fairy',.7,.58],
  ['bugbear','熊地精',false,'long-arms',1.3,1.18], ['genasi','元素裔',false,'elements',1.06,1.02],
  ['warforged','战俑',false,'construct',1.2,1.06],
  ['deep-gnome','地底侏儒',false,'deep-gnome',.95,.66], ['sea-elf','海精灵',false,'sea-elf',.91,1.04],
  ['duergar','灰矮人',false,'grey-dwarf',1.2,.82], ['eladrin','雅灵',false,'season-elf',.92,1.05],
  ['shadar-kai','影灵',false,'shadow-elf',.88,1.04]
];
export const MODEL_SPECIES = speciesRows.map(([id,name,core,anatomy,width,height]) => Object.freeze({id,name,core,anatomy,width,height}));
export const MODEL_WEAPONS = [
  ['none','徒手','punch'], ['club','棍棒','swing'], ['staff','长棍／法杖','staff'],
  ['sword','剑','slash'], ['axe','斧','chop'], ['bow','弓','bow'], ['crossbow','弩','crossbow'],
  ['scimitar','刀／弯刀','sweep'], ['dagger','匕首','stab'], ['spear','矛','thrust'],
  ['hammer','战锤','hammer'], ['mace','硬头锤','mace'], ['halberd','长柄斧／戟','halberd'],
  ['flail','链枷','flail'], ['sickle','镰刀','hook']
].map(([id,name,animation]) => Object.freeze({id,name,animation}));

const find = (values, value, fallback) => values.find(item => item.id === value || item.name === value)
  || [...values].sort((a,b)=>Math.max(b.id.length,b.name.length)-Math.max(a.id.length,a.name.length)).find(item => typeof value === 'string' && (value.toLowerCase().includes(item.id) || value.includes(item.name)))
  || values.find(item => item.id === fallback);
export function modelDescriptor(input = {}) {
  const species = find(MODEL_SPECIES, input.species, 'human'), profession = find(MODEL_CLASSES, input.classId, 'fighter');
  const weapon = MODEL_WEAPONS.find(item => item.id === input.weapon) || MODEL_WEAPONS.find(item => item.id === profession.weapon);
  return {
    modelId: input.preset === 'monster' ? 'voxel-monster-v2' : `voxel-v2:${species.id}:${profession.id}`,
    species, profession, weapon,
    signature: input.preset === 'monster' ? 'monster-cuboid' : `${species.anatomy}:${species.width}:${species.height}/${profession.outfit}`,
    monster: input.preset === 'monster'
  };
}
export function modelMatrix({ coreOnly = false } = {}) {
  return MODEL_SPECIES.filter(item => !coreOnly || item.core).flatMap(species => MODEL_CLASSES.filter(item => !coreOnly || item.core).map(profession => modelDescriptor({ species: species.id, classId: profession.id })));
}

// Each family has its own arm/weapon motion. Coordinates are appearance-only radians.
export function attackPose(weaponId, progress, magic = false) {
  const t = Math.max(0, Math.min(1, progress)), pulse = Math.sin(t * Math.PI), release = t < .3 ? 0 : Math.max(0, Math.sin((t-.3)/.7 * Math.PI));
  const result = { rightX: 0, rightY: 0, rightZ: 0, leftX: 0, leftY: 0, leftZ: 0, torsoY: 0, weaponZ: 0, weaponX: 0, reach: 0, draw: 0 };
  if (magic) return { ...result, rightX: -1.45*pulse, leftX: -.9*pulse, leftZ: .4*pulse, torsoY: .12*pulse, reach: .8*pulse };
  switch (weaponId) {
    case 'bow': return {...result,rightX:-1.35*pulse,rightY:-.8*pulse,leftX:-1.45*pulse,leftY:.25*pulse,draw:pulse,torsoY:.3*pulse};
    case 'crossbow': return {...result,rightX:-1.55*pulse,leftX:-1.25*pulse,leftY:.4*pulse,reach:release*.5,weaponX:.16*release};
    case 'dagger': return {...result,rightX:-1.6*pulse,rightY:.25*pulse,reach:1.8*pulse,torsoY:.35*pulse};
    case 'spear': return {...result,rightX:-1.55*pulse,leftX:-1.3*pulse,leftY:.65*pulse,reach:2.5*pulse,torsoY:.2*pulse};
    case 'staff': return {...result,rightX:-1.05*pulse,rightY:1.5*pulse,leftX:-.8*pulse,leftY:.6*pulse,torsoY:.7*pulse,weaponZ:.7*pulse};
    case 'axe': return {...result,rightX:-2.5*pulse,rightZ:-.3*pulse,torsoY:.28*pulse,weaponX:.45*release};
    case 'hammer': return {...result,rightX:-2.8*pulse,rightY:-.2*pulse,torsoY:.18*pulse,weaponX:.7*release};
    case 'mace': return {...result,rightX:-2.25*pulse,rightZ:.4*pulse,torsoY:-.25*pulse,weaponX:.2*release};
    case 'halberd': return {...result,rightX:-1.8*pulse,rightY:1.2*pulse,leftX:-1.1*pulse,torsoY:.9*pulse,weaponZ:.35*pulse};
    case 'flail': return {...result,rightX:-1.6*pulse,rightZ:-1.4*pulse,weaponZ:Math.sin(t*Math.PI*3)*pulse,torsoY:.45*pulse};
    case 'sickle': return {...result,rightX:-.8*pulse,rightY:-1.8*pulse,weaponZ:-.8*pulse,torsoY:-.5*pulse};
    case 'scimitar': return {...result,rightX:-.65*pulse,rightY:2.1*pulse,rightZ:-.55*pulse,torsoY:.85*pulse};
    case 'sword': return {...result,rightX:-1.45*pulse,rightY:1.2*pulse,rightZ:-.35*pulse,torsoY:.55*pulse};
    case 'club': return {...result,rightX:-2.05*pulse,rightY:.55*pulse,torsoY:.36*pulse};
    default: return {...result,rightX:-1.45*pulse,leftX:-.65*Math.sin(t*Math.PI*2),reach:1.3*pulse,torsoY:.2*pulse};
  }
}
