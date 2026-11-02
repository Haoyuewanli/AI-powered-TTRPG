// PHB2024 equipment facts and concise use summaries; no third-party full text.
// Inventory presence does not equip an item or grant proficiency, training, or attunement.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const ITEM_CATALOG_INFO = freeze({
  "version": "phb2024-items-2026-10-28.1",
  "ruleset": "2024",
  "source": "本地5E不全书：玩家手册2024／装备",
  "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/",
  "coverage": "PHB2024冒险装备（展开弹药/法器/圣徽变体）、武器、护甲盾牌和工具（展开赌具/乐器）；不含坐骑载具服务、DMG、其他扩展魔法物品。",
  "counts": {
    "gear": 71,
    "pack": 7,
    "ammunition": 5,
    "focus": 11,
    "weapon": 38,
    "armor": 13,
    "tool": 37
  },
  "total": 182,
  "notes": [
    "价格和重量为规则表数据；以实体库存数量计数，弹药价格可对应一包多枚。",
    "entryPoints只是界面入口，动作费用以选定用途timing为准，不与入口默认动作叠加。",
    "普通蘸火不提供BG3式伤害；涂层按基础毒药等具体物品规则。",
    "武器、护甲及法器存在于背包中，不代表已装备、具有熟练/受训或符合施法条件。",
    "除治疗药水外，复杂用途默认主持裁定；本目录不自动实施状态、持续时间、地形或制作。",
    "可回收物的数量扣除只表示离开当前持有库存，未判定物品永久毁坏。",
    "医疗包quantity为当前及未开启包的总数；charges为当前包剩余，未填则视为完整新包。"
  ]
});

export const ITEM_CATALOG = freeze([
  {
    "id": "phb24-gear-acid",
    "name": "强酸",
    "nameEn": "Acid",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "throwable"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "强酸",
    "uses": [
      {
        "id": "throw-acid",
        "name": "投掷强酸",
        "rangeFeet": 20,
        "saveAbility": "dexterity",
        "saveDC": {
          "base": 8,
          "ability": "dexterity",
          "proficiency": true
        },
        "damageFormula": "2d6",
        "damageType": "acid",
        "notes": "替换攻击动作中的一次攻击；可见生物或物件；成功豁免不受伤害。",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "label": "投掷强酸"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-ink-pen",
    "name": "墨水笔",
    "nameEn": "Ink Pen",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 2.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "墨水笔",
    "uses": [
      {
        "id": "interact",
        "name": "查看：墨水笔",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：墨水笔"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-alchemist-s-fire",
    "name": "炽火胶",
    "nameEn": "Alchemist's Fire",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "throwable"
    ],
    "unit": "件",
    "aliases": [
      "炼金火",
      "Alchemist's Fire"
    ],
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "炽火胶",
    "uses": [
      {
        "id": "throw-alchemists-fire",
        "name": "投掷炽火胶",
        "rangeFeet": 20,
        "saveAbility": "dexterity",
        "saveDC": {
          "base": 8,
          "ability": "dexterity",
          "proficiency": true
        },
        "damageFormula": "1d4",
        "damageType": "fire",
        "notes": "替换一次攻击；失败还会燃烧，持续效果需主持核对。",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "label": "投掷炽火胶"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-jug",
    "name": "壶",
    "nameEn": "Jug",
    "category": "gear",
    "weightLb": 4.0,
    "price": {
      "amount": 2.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "壶",
    "uses": [
      {
        "id": "interact",
        "name": "查看：壶",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：壶"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-ladder",
    "name": "梯子",
    "nameEn": "Ladder",
    "category": "gear",
    "weightLb": 25.0,
    "price": {
      "amount": 1.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "梯子",
    "uses": [
      {
        "id": "interact",
        "name": "查看：梯子",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：梯子"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-antitoxin",
    "name": "抗毒剂",
    "nameEn": "Antitoxin",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "antitoxin"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "抗毒剂",
    "uses": [
      {
        "id": "drink",
        "name": "饮用抗毒剂",
        "notes": "只饮用自身；随后1小时针对避免/结束中毒的豁免优势，不自动解除中毒。",
        "timing": "bonus",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "potion",
          "utilize"
        ],
        "target": "self",
        "label": "饮用抗毒剂"
      }
    ],
    "entryPoints": [
      "potion",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-lamp",
    "name": "油灯",
    "nameEn": "Lamp",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 5.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "油灯",
    "uses": [
      {
        "id": "interact",
        "name": "查看：油灯",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：油灯"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-lantern-bullseye",
    "name": "牛眼提灯",
    "nameEn": "Lantern, Bullseye",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "牛眼提灯",
    "uses": [
      {
        "id": "interact",
        "name": "查看：牛眼提灯",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：牛眼提灯"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-backpack",
    "name": "背包",
    "nameEn": "Backpack",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "背包",
    "uses": [
      {
        "id": "interact",
        "name": "查看：背包",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：背包"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-lantern-hooded",
    "name": "附盖提灯",
    "nameEn": "Lantern, Hooded",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "light-source"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "附盖提灯",
    "uses": [
      {
        "id": "shutter",
        "name": "盖上或掀开提灯",
        "notes": "改变明亮/微光范围，不自动消耗一整瓶燃油。",
        "timing": "bonus",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "盖上或掀开提灯"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-ball-bearings",
    "name": "滚珠",
    "nameEn": "Ball Bearings",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "deployable",
      "recoverable"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "滚珠",
    "uses": [
      {
        "id": "scatter",
        "name": "撒滚珠",
        "rangeFeet": 10,
        "saveDC": 10,
        "saveAbility": "dexterity",
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "10尺方形区域；每回合首次进入时失败倒地；回收10分钟。",
        "timing": "action",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "撒滚珠"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-lock",
    "name": "锁",
    "nameEn": "Lock",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "锁",
    "uses": [
      {
        "id": "interact",
        "name": "查看：锁",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：锁"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-barrel",
    "name": "木桶",
    "nameEn": "Barrel",
    "category": "gear",
    "weightLb": 70.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "木桶",
    "uses": [
      {
        "id": "interact",
        "name": "查看：木桶",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：木桶"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-magnifying-glass",
    "name": "放大镜",
    "nameEn": "Magnifying Glass",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 100.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "放大镜",
    "uses": [
      {
        "id": "interact",
        "name": "查看：放大镜",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：放大镜"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-basket",
    "name": "篮子",
    "nameEn": "Basket",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 4.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "篮子",
    "uses": [
      {
        "id": "interact",
        "name": "查看：篮子",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：篮子"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-manacles",
    "name": "镣铐",
    "nameEn": "Manacles",
    "category": "gear",
    "weightLb": 6.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "镣铐",
    "uses": [
      {
        "id": "bind",
        "name": "铐住目标",
        "rangeFeet": 5,
        "checkAbility": "dexterity",
        "checkSkill": "sleight-of-hand",
        "checkDC": 13,
        "notes": "目标小型/中型且受擒、失能或束缚；之后解锁/挣脱按具体方式。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "铐住目标"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-bedroll",
    "name": "铺盖",
    "nameEn": "Bedroll",
    "category": "gear",
    "weightLb": 7.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "铺盖",
    "uses": [
      {
        "id": "interact",
        "name": "查看：铺盖",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：铺盖"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-map",
    "name": "地图",
    "nameEn": "Map",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "地图",
    "uses": [
      {
        "id": "interact",
        "name": "查看：地图",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：地图"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-bell",
    "name": "铃铛",
    "nameEn": "Bell",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "铃铛",
    "uses": [
      {
        "id": "interact",
        "name": "查看：铃铛",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：铃铛"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-mirror",
    "name": "镜子",
    "nameEn": "Mirror",
    "category": "gear",
    "weightLb": 0.5,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "镜子",
    "uses": [
      {
        "id": "interact",
        "name": "查看：镜子",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：镜子"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-blanket",
    "name": "毯子",
    "nameEn": "Blanket",
    "category": "gear",
    "weightLb": 3.0,
    "price": {
      "amount": 5.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "毯子",
    "uses": [
      {
        "id": "interact",
        "name": "查看：毯子",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：毯子"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-net",
    "name": "捕网",
    "nameEn": "Net",
    "category": "gear",
    "weightLb": 3.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "throwable",
      "recoverable"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "捕网",
    "uses": [
      {
        "id": "throw-net",
        "name": "投掷捕网",
        "rangeFeet": 15,
        "saveAbility": "dexterity",
        "saveDC": {
          "base": 8,
          "ability": "dexterity",
          "proficiency": true
        },
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "巨型及以上自动成功；失败束缚，挣脱或摧毁结束，不是永久消耗品。",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "label": "投掷捕网"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-block-and-tackle",
    "name": "滑轮组",
    "nameEn": "Block and Tackle",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "滑轮组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：滑轮组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：滑轮组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-oil",
    "name": "燃油",
    "nameEn": "Oil",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 1.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "fuel",
      "throwable"
    ],
    "unit": "件",
    "aliases": [
      "油",
      "Oil"
    ],
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "燃油",
    "uses": [
      {
        "id": "douse-target",
        "name": "泼洒生物或物件",
        "rangeFeet": 20,
        "saveAbility": "dexterity",
        "saveDC": {
          "base": 8,
          "ability": "dexterity",
          "proficiency": true
        },
        "notes": "失败覆油1分钟；期间受火伤再受5火伤。",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize",
          "throw"
        ],
        "label": "泼洒生物或物件"
      },
      {
        "id": "douse-space",
        "name": "泼洒地面",
        "notes": "5尺见方水平区域；点燃持续2轮；进入或回合结束受5火伤，每生物每回合最多一次。",
        "timing": "action",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize",
          "throw"
        ],
        "label": "泼洒地面"
      },
      {
        "id": "refuel",
        "name": "作为灯具燃料",
        "notes": "一扁瓶合计燃烧6小时；熄灭使用操作动作；不自动给武器加伤。",
        "timing": "manual",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize",
          "throw"
        ],
        "label": "作为灯具燃料"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-book",
    "name": "书籍",
    "nameEn": "Book",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "书籍",
    "uses": [
      {
        "id": "interact",
        "name": "查看：书籍",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：书籍"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-paper",
    "name": "纸张",
    "nameEn": "Paper",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 2.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "纸张",
    "uses": [
      {
        "id": "interact",
        "name": "查看：纸张",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：纸张"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-bottle-glass",
    "name": "玻璃瓶",
    "nameEn": "Bottle, Glass",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "玻璃瓶",
    "uses": [
      {
        "id": "interact",
        "name": "查看：玻璃瓶",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：玻璃瓶"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-parchment",
    "name": "羊皮纸",
    "nameEn": "Parchment",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "羊皮纸",
    "uses": [
      {
        "id": "interact",
        "name": "查看：羊皮纸",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：羊皮纸"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-bucket",
    "name": "吊桶",
    "nameEn": "Bucket",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 5.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "吊桶",
    "uses": [
      {
        "id": "interact",
        "name": "查看：吊桶",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：吊桶"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-perfume",
    "name": "香水",
    "nameEn": "Perfume",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "香水",
    "uses": [
      {
        "id": "interact",
        "name": "查看：香水",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：香水"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-burglar-s-pack",
    "name": "窃贼套组",
    "nameEn": "Burglar's Pack",
    "category": "pack",
    "weightLb": 42.0,
    "price": {
      "amount": 16.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "窃贼套组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：窃贼套组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：窃贼套组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-poison-basic",
    "name": "基础毒药",
    "nameEn": "Poison, Basic",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 100.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "coating"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "基础毒药",
    "uses": [
      {
        "id": "coat",
        "name": "涂抹基础毒药",
        "notes": "一把武器或最多3枚弹药；穿刺/挥砍造成伤害时另加1d4毒素；涂后1分钟或造成额外伤害即失效。",
        "timing": "bonus",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "dip",
          "utilize"
        ],
        "label": "涂抹基础毒药"
      }
    ],
    "entryPoints": [
      "dip",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-caltrops",
    "name": "铁蒺藜",
    "nameEn": "Caltrops",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "deployable",
      "recoverable"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "铁蒺藜",
    "uses": [
      {
        "id": "scatter",
        "name": "撒铁蒺藜",
        "rangeFeet": 5,
        "saveDC": 15,
        "saveAbility": "dexterity",
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "5尺方形区域；失败受1穿刺且速度0至下回合开始；回收10分钟。",
        "timing": "action",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "撒铁蒺藜"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-pole",
    "name": "长杆",
    "nameEn": "Pole",
    "category": "gear",
    "weightLb": 7.0,
    "price": {
      "amount": 5.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "长杆",
    "uses": [
      {
        "id": "interact",
        "name": "查看：长杆",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：长杆"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-candle",
    "name": "蜡烛",
    "nameEn": "Candle",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "蜡烛",
    "uses": [
      {
        "id": "interact",
        "name": "查看：蜡烛",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：蜡烛"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-pot-iron",
    "name": "铁锅",
    "nameEn": "Pot, Iron",
    "category": "gear",
    "weightLb": 10.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "铁锅",
    "uses": [
      {
        "id": "interact",
        "name": "查看：铁锅",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：铁锅"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-case-crossbow-bolt",
    "name": "弩矢匣",
    "nameEn": "Case, Crossbow Bolt",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "弩矢匣",
    "uses": [
      {
        "id": "interact",
        "name": "查看：弩矢匣",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：弩矢匣"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-potion-of-healing",
    "name": "治疗药水",
    "nameEn": "Potion of Healing",
    "category": "gear",
    "weightLb": 0.5,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "potion"
    ],
    "unit": "件",
    "aliases": [
      "治疗药剂",
      "Potion of Healing"
    ],
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "治疗药水",
    "uses": [
      {
        "id": "drink-feed",
        "name": "饮用或喂药",
        "rangeFeet": 5,
        "healFormula": "2d4+2",
        "notes": "使用者自己饮用或喂给5尺内其他生物；恢复不超过最大HP。",
        "timing": "bonus",
        "consume": {
          "quantity": 1
        },
        "mode": "automatic-heal",
        "entryPoints": [
          "potion",
          "utilize"
        ],
        "target": "self-or-creature",
        "allowSelf": true,
        "formula": "2d4+2",
        "label": "饮用或喂药"
      }
    ],
    "entryPoints": [
      "potion",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-case-map-or-scroll",
    "name": "地图或卷轴匣",
    "nameEn": "Case, Map or Scroll",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "地图或卷轴匣",
    "uses": [
      {
        "id": "interact",
        "name": "查看：地图或卷轴匣",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：地图或卷轴匣"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-pouch",
    "name": "小包",
    "nameEn": "Pouch",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 5.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "小包",
    "uses": [
      {
        "id": "interact",
        "name": "查看：小包",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：小包"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-chain",
    "name": "链条",
    "nameEn": "Chain",
    "category": "gear",
    "weightLb": 10.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "链条",
    "uses": [
      {
        "id": "interact",
        "name": "查看：链条",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：链条"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-priest-s-pack",
    "name": "祭司套组",
    "nameEn": "Priest's Pack",
    "category": "pack",
    "weightLb": 29.0,
    "price": {
      "amount": 33.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "祭司套组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：祭司套组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：祭司套组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-chest",
    "name": "箱子",
    "nameEn": "Chest",
    "category": "gear",
    "weightLb": 25.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "箱子",
    "uses": [
      {
        "id": "interact",
        "name": "查看：箱子",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：箱子"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-quiver",
    "name": "箭袋",
    "nameEn": "Quiver",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "箭袋",
    "uses": [
      {
        "id": "interact",
        "name": "查看：箭袋",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：箭袋"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-climber-s-kit",
    "name": "攀爬工具",
    "nameEn": "Climber's Kit",
    "category": "gear",
    "weightLb": 12.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "climbing"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "攀爬工具",
    "uses": [
      {
        "id": "anchor",
        "name": "锚定",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "锚定"
      },
      {
        "id": "unanchor",
        "name": "解除锚定",
        "timing": "bonus",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "解除锚定"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-ram-portable",
    "name": "便携式攻城锤",
    "nameEn": "Ram, Portable",
    "category": "gear",
    "weightLb": 35.0,
    "price": {
      "amount": 4.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "便携式攻城锤",
    "uses": [
      {
        "id": "interact",
        "name": "查看：便携式攻城锤",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：便携式攻城锤"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-clothes-fine",
    "name": "高档服装",
    "nameEn": "Clothes, Fine",
    "category": "gear",
    "weightLb": 6.0,
    "price": {
      "amount": 15.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "高档服装",
    "uses": [
      {
        "id": "interact",
        "name": "查看：高档服装",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：高档服装"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-rations",
    "name": "口粮",
    "nameEn": "Rations",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 5.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "口粮",
    "uses": [
      {
        "id": "interact",
        "name": "查看：口粮",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：口粮"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-clothes-traveler-s",
    "name": "旅行服装",
    "nameEn": "Clothes, Traveler's",
    "category": "gear",
    "weightLb": 4.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "旅行服装",
    "uses": [
      {
        "id": "interact",
        "name": "查看：旅行服装",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：旅行服装"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-robe",
    "name": "长袍",
    "nameEn": "Robe",
    "category": "gear",
    "weightLb": 4.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "长袍",
    "uses": [
      {
        "id": "interact",
        "name": "查看：长袍",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：长袍"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-component-pouch",
    "name": "材料包",
    "nameEn": "Component Pouch",
    "category": "gear",
    "weightLb": 2.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "材料包",
    "uses": [
      {
        "id": "interact",
        "name": "查看：材料包",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：材料包"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-rope",
    "name": "绳索",
    "nameEn": "Rope",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "绳索",
    "uses": [
      {
        "id": "tie",
        "name": "打结或捆绑",
        "checkAbility": "dexterity",
        "checkSkill": "sleight-of-hand",
        "checkDC": 10,
        "notes": "捆不自愿目标另需受擒、失能或束缚等条件；挣脱/扯断另判。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "打结或捆绑"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-costume",
    "name": "戏服",
    "nameEn": "Costume",
    "category": "gear",
    "weightLb": 4.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "戏服",
    "uses": [
      {
        "id": "interact",
        "name": "查看：戏服",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：戏服"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-sack",
    "name": "麻袋",
    "nameEn": "Sack",
    "category": "gear",
    "weightLb": 0.5,
    "price": {
      "amount": 1.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "麻袋",
    "uses": [
      {
        "id": "interact",
        "name": "查看：麻袋",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：麻袋"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-crowbar",
    "name": "撬棍",
    "nameEn": "Crowbar",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "撬棍",
    "uses": [
      {
        "id": "interact",
        "name": "查看：撬棍",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：撬棍"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-scholar-s-pack",
    "name": "学者套组",
    "nameEn": "Scholar's Pack",
    "category": "pack",
    "weightLb": 22.0,
    "price": {
      "amount": 40.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "学者套组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：学者套组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：学者套组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-diplomat-s-pack",
    "name": "外交套组",
    "nameEn": "Diplomat's Pack",
    "category": "pack",
    "weightLb": 39.0,
    "price": {
      "amount": 39.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "外交套组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：外交套组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：外交套组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-shovel",
    "name": "铲子",
    "nameEn": "Shovel",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "铲子",
    "uses": [
      {
        "id": "interact",
        "name": "查看：铲子",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：铲子"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-signal-whistle",
    "name": "信号笛",
    "nameEn": "Signal Whistle",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 5.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "信号笛",
    "uses": [
      {
        "id": "signal",
        "name": "吹响",
        "notes": "声音可在600尺外听见；实际听觉情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "吹响"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-dungeoneer-s-pack",
    "name": "地城套组",
    "nameEn": "Dungeoneer's Pack",
    "category": "pack",
    "weightLb": 55.0,
    "price": {
      "amount": 12.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "地城套组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：地城套组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：地城套组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-spell-scroll-cantrip",
    "name": "戏法卷轴",
    "nameEn": "Spell Scroll Cantrip",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 30.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "spell-scroll"
    ],
    "unit": "件",
    "spellLevel": 0,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "戏法卷轴",
    "uses": [
      {
        "id": "cast-scroll",
        "name": "从卷轴施法",
        "notes": "从所在职业法术列表及卷轴具体法术核对施法时间、成分和条件；不是统一操作动作。",
        "timing": "manual",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "从卷轴施法"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-entertainer-s-pack",
    "name": "艺人套组",
    "nameEn": "Entertainer's Pack",
    "category": "pack",
    "weightLb": 58.5,
    "price": {
      "amount": 40.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "艺人套组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：艺人套组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：艺人套组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-spell-scroll-level-1",
    "name": "一环卷轴",
    "nameEn": "Spell Scroll Level 1",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "spell-scroll"
    ],
    "unit": "件",
    "spellLevel": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "一环卷轴",
    "uses": [
      {
        "id": "cast-scroll",
        "name": "从卷轴施法",
        "notes": "从所在职业法术列表及卷轴具体法术核对施法时间、成分和条件；不是统一操作动作。",
        "timing": "manual",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "从卷轴施法"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-explorer-s-pack",
    "name": "探索套组",
    "nameEn": "Explorer's Pack",
    "category": "pack",
    "weightLb": 55.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "探索套组",
    "uses": [
      {
        "id": "interact",
        "name": "查看：探索套组",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：探索套组"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-spikes-iron",
    "name": "铁钉",
    "nameEn": "Spikes, Iron",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "铁钉",
    "uses": [
      {
        "id": "interact",
        "name": "查看：铁钉",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：铁钉"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-flask",
    "name": "扁瓶",
    "nameEn": "Flask",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 2.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "扁瓶",
    "uses": [
      {
        "id": "interact",
        "name": "查看：扁瓶",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：扁瓶"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-spyglass",
    "name": "望远镜",
    "nameEn": "Spyglass",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 1000.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "望远镜",
    "uses": [
      {
        "id": "interact",
        "name": "查看：望远镜",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：望远镜"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-grappling-hook",
    "name": "爪钩",
    "nameEn": "Grappling Hook",
    "category": "gear",
    "weightLb": 4.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "climbing"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "爪钩",
    "uses": [
      {
        "id": "hook",
        "name": "抛掷爪钩",
        "rangeFeet": 50,
        "checkAbility": "dexterity",
        "checkSkill": "acrobatics",
        "checkDC": 13,
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "抛掷爪钩"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-string",
    "name": "细线",
    "nameEn": "String",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "细线",
    "uses": [
      {
        "id": "interact",
        "name": "查看：细线",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：细线"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-healer-s-kit",
    "name": "医疗包",
    "nameEn": "Healer's Kit",
    "category": "gear",
    "weightLb": 3.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "charges"
    ],
    "unit": "件",
    "chargesPerItem": 10,
    "aliases": [
      "Healer's Kit"
    ],
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "医疗包",
    "uses": [
      {
        "id": "stabilize",
        "name": "稳定濒死者",
        "notes": "每包10次；稳定0HP且昏迷的目标，无须医疗检定，不恢复HP。",
        "timing": "action",
        "consume": {
          "charges": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "稳定濒死者"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-tent",
    "name": "帐篷",
    "nameEn": "Tent",
    "category": "gear",
    "weightLb": 20.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "帐篷",
    "uses": [
      {
        "id": "interact",
        "name": "查看：帐篷",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：帐篷"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-tinderbox",
    "name": "火绒盒",
    "nameEn": "Tinderbox",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 5.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "firestarter"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "火绒盒",
    "uses": [
      {
        "id": "ignite-fuel",
        "name": "点燃有燃料物件",
        "timing": "bonus",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "点燃有燃料物件"
      },
      {
        "id": "start-fire",
        "name": "无燃料生火",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "durationMinutes": 1,
        "label": "无燃料生火"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-holy-water",
    "name": "圣水",
    "nameEn": "Holy Water",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "consumable",
      "throwable"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "圣水",
    "uses": [
      {
        "id": "throw-holy-water",
        "name": "投掷圣水",
        "rangeFeet": 20,
        "saveAbility": "dexterity",
        "saveDC": {
          "base": 8,
          "ability": "dexterity",
          "proficiency": true
        },
        "damageFormula": "2d8",
        "damageType": "radiant",
        "notes": "替换一次攻击；只有邪魔或亡灵豁免失败时受伤害。",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "label": "投掷圣水"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-torch",
    "name": "火把",
    "nameEn": "Torch",
    "category": "gear",
    "weightLb": 1.0,
    "price": {
      "amount": 1.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [
      "light-source"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "火把",
    "uses": [
      {
        "id": "torch-attack",
        "name": "燃烧火把攻击",
        "damageType": "fire",
        "damageAmount": 1,
        "notes": "须点燃并核对简易近战武器攻击；普通未点燃火把不自动造成火焰伤害。",
        "timing": "attack",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "燃烧火把攻击"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-hunting-trap",
    "name": "捕猎陷阱",
    "nameEn": "Hunting Trap",
    "category": "gear",
    "weightLb": 25.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "deployable"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "捕猎陷阱",
    "uses": [
      {
        "id": "set",
        "name": "设置陷阱",
        "saveAbility": "dexterity",
        "saveDC": 13,
        "notes": "需固定到不动物体；失败触发1d4穿刺及移速限制，后续挣脱由主持。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "设置陷阱"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-vial",
    "name": "小瓶",
    "nameEn": "Vial",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "小瓶",
    "uses": [
      {
        "id": "interact",
        "name": "查看：小瓶",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：小瓶"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-ink",
    "name": "墨水",
    "nameEn": "Ink",
    "category": "gear",
    "weightLb": 0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "墨水",
    "uses": [
      {
        "id": "interact",
        "name": "查看：墨水",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：墨水"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-gear-waterskin",
    "name": "水袋",
    "nameEn": "Waterskin",
    "category": "gear",
    "weightLb": 5.0,
    "price": {
      "amount": 2.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "水袋",
    "uses": [
      {
        "id": "interact",
        "name": "查看：水袋",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：水袋"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-ammo-arrow",
    "name": "箭矢",
    "nameEn": "Arrow",
    "category": "ammunition",
    "weightLb": 0.05,
    "price": {
      "amount": 1,
      "unit": "gp",
      "basisQuantity": 20
    },
    "tags": [],
    "unit": "支",
    "defaultTestQuantity": 20,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "箭矢",
    "uses": [
      {
        "id": "interact",
        "name": "查看：箭矢",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：箭矢"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-ammo-bolt",
    "name": "弩矢",
    "nameEn": "Crossbow Bolt",
    "category": "ammunition",
    "weightLb": 0.075,
    "price": {
      "amount": 1,
      "unit": "gp",
      "basisQuantity": 20
    },
    "tags": [],
    "unit": "支",
    "defaultTestQuantity": 20,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "弩矢",
    "uses": [
      {
        "id": "interact",
        "name": "查看：弩矢",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：弩矢"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-ammo-firearm-bullet",
    "name": "枪械子弹",
    "nameEn": "Firearm Bullet",
    "category": "ammunition",
    "weightLb": 0.2,
    "price": {
      "amount": 3,
      "unit": "gp",
      "basisQuantity": 10
    },
    "tags": [],
    "unit": "枚",
    "defaultTestQuantity": 10,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "枪械子弹",
    "uses": [
      {
        "id": "interact",
        "name": "查看：枪械子弹",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：枪械子弹"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-ammo-sling-bullet",
    "name": "投石索子弹",
    "nameEn": "Sling Bullet",
    "category": "ammunition",
    "weightLb": 0.075,
    "price": {
      "amount": 4,
      "unit": "cp",
      "basisQuantity": 20
    },
    "tags": [],
    "unit": "枚",
    "defaultTestQuantity": 20,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "投石索子弹",
    "uses": [
      {
        "id": "interact",
        "name": "查看：投石索子弹",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：投石索子弹"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-ammo-needle",
    "name": "吹矢",
    "nameEn": "Blowgun Needle",
    "category": "ammunition",
    "weightLb": 0.02,
    "price": {
      "amount": 1,
      "unit": "gp",
      "basisQuantity": 50
    },
    "tags": [],
    "unit": "支",
    "defaultTestQuantity": 50,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "吹矢",
    "uses": [
      {
        "id": "interact",
        "name": "查看：吹矢",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：吹矢"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-crystal",
    "name": "奥术法器：水晶",
    "nameEn": "Arcane Focus Crystal",
    "category": "focus",
    "weightLb": 1.0,
    "price": {
      "amount": 10,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "奥术法器：水晶",
    "uses": [
      {
        "id": "interact",
        "name": "查看：奥术法器：水晶",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：奥术法器：水晶"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-orb",
    "name": "奥术法器：法球",
    "nameEn": "Arcane Focus Orb",
    "category": "focus",
    "weightLb": 3.0,
    "price": {
      "amount": 20,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "奥术法器：法球",
    "uses": [
      {
        "id": "interact",
        "name": "查看：奥术法器：法球",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：奥术法器：法球"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-rod",
    "name": "奥术法器：权杖",
    "nameEn": "Arcane Focus Rod",
    "category": "focus",
    "weightLb": 2.0,
    "price": {
      "amount": 10,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "奥术法器：权杖",
    "uses": [
      {
        "id": "interact",
        "name": "查看：奥术法器：权杖",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：奥术法器：权杖"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-staff",
    "name": "奥术法器：法杖",
    "nameEn": "Arcane Focus Staff",
    "category": "focus",
    "weightLb": 4.0,
    "price": {
      "amount": 5,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "奥术法器：法杖",
    "uses": [
      {
        "id": "interact",
        "name": "查看：奥术法器：法杖",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：奥术法器：法杖"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-wand",
    "name": "奥术法器：魔杖",
    "nameEn": "Arcane Focus Wand",
    "category": "focus",
    "weightLb": 1.0,
    "price": {
      "amount": 10,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "奥术法器：魔杖",
    "uses": [
      {
        "id": "interact",
        "name": "查看：奥术法器：魔杖",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：奥术法器：魔杖"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-mistletoe",
    "name": "德鲁伊法器：槲寄生枝条",
    "nameEn": "Druidic Focus Sprig of Mistletoe",
    "category": "focus",
    "weightLb": 0.0,
    "price": {
      "amount": 1,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "德鲁伊法器：槲寄生枝条",
    "uses": [
      {
        "id": "interact",
        "name": "查看：德鲁伊法器：槲寄生枝条",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：德鲁伊法器：槲寄生枝条"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-wooden-staff",
    "name": "德鲁伊法器：木质法杖",
    "nameEn": "Druidic Focus Wooden Staff",
    "category": "focus",
    "weightLb": 4.0,
    "price": {
      "amount": 5,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "德鲁伊法器：木质法杖",
    "uses": [
      {
        "id": "interact",
        "name": "查看：德鲁伊法器：木质法杖",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：德鲁伊法器：木质法杖"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-focus-yew-wand",
    "name": "德鲁伊法器：紫衫魔杖",
    "nameEn": "Druidic Focus Yew Wand",
    "category": "focus",
    "weightLb": 1.0,
    "price": {
      "amount": 10,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "德鲁伊法器：紫衫魔杖",
    "uses": [
      {
        "id": "interact",
        "name": "查看：德鲁伊法器：紫衫魔杖",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：德鲁伊法器：紫衫魔杖"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-symbol-amulet",
    "name": "圣徽：护符",
    "nameEn": "Holy Symbol Amulet",
    "category": "focus",
    "weightLb": 1.0,
    "price": {
      "amount": 5,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "圣徽：护符",
    "uses": [
      {
        "id": "interact",
        "name": "查看：圣徽：护符",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：圣徽：护符"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-symbol-emblem",
    "name": "圣徽：纹章",
    "nameEn": "Holy Symbol Emblem",
    "category": "focus",
    "weightLb": 0.0,
    "price": {
      "amount": 5,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "圣徽：纹章",
    "uses": [
      {
        "id": "interact",
        "name": "查看：圣徽：纹章",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：圣徽：纹章"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-symbol-reliquary",
    "name": "圣徽：圣物匣",
    "nameEn": "Holy Symbol Reliquary",
    "category": "focus",
    "weightLb": 2.0,
    "price": {
      "amount": 5,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "件",
    "defaultTestQuantity": 1,
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/冒险装备.htm",
    "sourceSection": "圣徽：圣物匣",
    "uses": [
      {
        "id": "interact",
        "name": "查看：圣徽：圣物匣",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "此条目供查看库存和规则来源；具体交互可通过主持手工记录，不凭物品名称自动授予增益。",
        "label": "查看：圣徽：圣物匣"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-club",
    "name": "短棒",
    "nameEn": "Club",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 1.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d4",
      "type": "bludgeoning"
    },
    "properties": "轻型",
    "mastery": "缓速",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "短棒",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看短棒",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看短棒"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-dagger",
    "name": "匕首",
    "nameEn": "Dagger",
    "category": "weapon",
    "weightLb": 1.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon",
      "thrown"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d4",
      "type": "piercing"
    },
    "properties": "灵巧，轻型，投掷（射程 20/60）",
    "mastery": "迅击",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "匕首",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看匕首",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看匕首"
      },
      {
        "id": "throw-weapon",
        "name": "投掷匕首",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "rangeFeet": 20,
        "longRangeFeet": 60,
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "核对装备、触及/射程、武器属性与攻击机会；投出后离开当前持有库存，不代表毁坏。",
        "label": "投掷匕首"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-greatclub",
    "name": "巨棒",
    "nameEn": "Greatclub",
    "category": "weapon",
    "weightLb": 10.0,
    "price": {
      "amount": 2.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "bludgeoning"
    },
    "properties": "双手",
    "mastery": "推离",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "巨棒",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看巨棒",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看巨棒"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-handaxe",
    "name": "手斧",
    "nameEn": "Handaxe",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon",
      "thrown"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "slashing"
    },
    "properties": "轻型，投掷（射程 20/60）",
    "mastery": "侵扰",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "手斧",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看手斧",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看手斧"
      },
      {
        "id": "throw-weapon",
        "name": "投掷手斧",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "rangeFeet": 20,
        "longRangeFeet": 60,
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "核对装备、触及/射程、武器属性与攻击机会；投出后离开当前持有库存，不代表毁坏。",
        "label": "投掷手斧"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-javelin",
    "name": "标枪",
    "nameEn": "Javelin",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 5.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon",
      "thrown"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "piercing"
    },
    "properties": "投掷（射程 30/120）",
    "mastery": "缓速",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "标枪",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看标枪",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看标枪"
      },
      {
        "id": "throw-weapon",
        "name": "投掷标枪",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "rangeFeet": 30,
        "longRangeFeet": 120,
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "核对装备、触及/射程、武器属性与攻击机会；投出后离开当前持有库存，不代表毁坏。",
        "label": "投掷标枪"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-light-hammer",
    "name": "轻锤",
    "nameEn": "Light Hammer",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon",
      "thrown"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d4",
      "type": "bludgeoning"
    },
    "properties": "轻型，投掷（射程 20/60）",
    "mastery": "迅击",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "轻锤",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看轻锤",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看轻锤"
      },
      {
        "id": "throw-weapon",
        "name": "投掷轻锤",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "rangeFeet": 20,
        "longRangeFeet": 60,
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "核对装备、触及/射程、武器属性与攻击机会；投出后离开当前持有库存，不代表毁坏。",
        "label": "投掷轻锤"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-mace",
    "name": "硬头锤",
    "nameEn": "Mace",
    "category": "weapon",
    "weightLb": 4.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "bludgeoning"
    },
    "properties": "—",
    "mastery": "削弱",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "硬头锤",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看硬头锤",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看硬头锤"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-quarterstaff",
    "name": "长棍",
    "nameEn": "Quarterstaff",
    "category": "weapon",
    "weightLb": 4.0,
    "price": {
      "amount": 2.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "bludgeoning"
    },
    "properties": "多用（1d8）",
    "mastery": "失衡",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "长棍",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看长棍",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看长棍"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-sickle",
    "name": "镰刀",
    "nameEn": "Sickle",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d4",
      "type": "slashing"
    },
    "properties": "轻型",
    "mastery": "迅击",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "镰刀",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看镰刀",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看镰刀"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-spear",
    "name": "矛",
    "nameEn": "Spear",
    "category": "weapon",
    "weightLb": 3.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon",
      "thrown"
    ],
    "unit": "把",
    "weaponGroup": "简易近战武器 Simple Melee Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "piercing"
    },
    "properties": "投掷（射程 20/60），多用（1d8）",
    "mastery": "削弱",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "矛",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看矛",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看矛"
      },
      {
        "id": "throw-weapon",
        "name": "投掷矛",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "rangeFeet": 20,
        "longRangeFeet": 60,
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "核对装备、触及/射程、武器属性与攻击机会；投出后离开当前持有库存，不代表毁坏。",
        "label": "投掷矛"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-dart",
    "name": "飞镖",
    "nameEn": "Dart",
    "category": "weapon",
    "weightLb": 0.25,
    "price": {
      "amount": 5.0,
      "unit": "cp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon",
      "thrown"
    ],
    "unit": "把",
    "weaponGroup": "简易远程武器 Simple Ranged Weapons",
    "baseDamage": {
      "formula": "1d4",
      "type": "piercing"
    },
    "properties": "灵巧，投掷（射程 20/60）",
    "mastery": "侵扰",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "飞镖",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看飞镖",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看飞镖"
      },
      {
        "id": "throw-weapon",
        "name": "投掷飞镖",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "rangeFeet": 20,
        "longRangeFeet": 60,
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "核对装备、触及/射程、武器属性与攻击机会；投出后离开当前持有库存，不代表毁坏。",
        "label": "投掷飞镖"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-light-crossbow",
    "name": "轻弩",
    "nameEn": "Light Crossbow",
    "category": "weapon",
    "weightLb": 5.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易远程武器 Simple Ranged Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "piercing"
    },
    "properties": "弹药（射程 80/320；弩矢），装填，双手",
    "mastery": "缓速",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "轻弩",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看轻弩",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看轻弩"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-shortbow",
    "name": "短弓",
    "nameEn": "Shortbow",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易远程武器 Simple Ranged Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "piercing"
    },
    "properties": "弹药（射程 80/320；箭矢），双手",
    "mastery": "侵扰",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "短弓",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看短弓",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看短弓"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-sling",
    "name": "投石索",
    "nameEn": "Sling",
    "category": "weapon",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "简易远程武器 Simple Ranged Weapons",
    "baseDamage": {
      "formula": "1d4",
      "type": "bludgeoning"
    },
    "properties": "弹药（射程 30/120；子弹）",
    "mastery": "缓速",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "投石索",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看投石索",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看投石索"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-battleaxe",
    "name": "战斧",
    "nameEn": "Battleaxe",
    "category": "weapon",
    "weightLb": 4.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "slashing"
    },
    "properties": "多用（1d10）",
    "mastery": "失衡",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "战斧",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看战斧",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看战斧"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-flail",
    "name": "链枷",
    "nameEn": "Flail",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "bludgeoning"
    },
    "properties": "—",
    "mastery": "削弱",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "链枷",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看链枷",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看链枷"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-glaive",
    "name": "长柄刀",
    "nameEn": "Glaive",
    "category": "weapon",
    "weightLb": 6.0,
    "price": {
      "amount": 20.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d10",
      "type": "slashing"
    },
    "properties": "重型，触及，双手",
    "mastery": "擦掠",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "长柄刀",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看长柄刀",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看长柄刀"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-greataxe",
    "name": "巨斧",
    "nameEn": "Greataxe",
    "category": "weapon",
    "weightLb": 7.0,
    "price": {
      "amount": 30.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d12",
      "type": "slashing"
    },
    "properties": "重型，双手",
    "mastery": "横扫",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "巨斧",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看巨斧",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看巨斧"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-greatsword",
    "name": "巨剑",
    "nameEn": "Greatsword",
    "category": "weapon",
    "weightLb": 6.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "2d6",
      "type": "slashing"
    },
    "properties": "重型，双手",
    "mastery": "擦掠",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "巨剑",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看巨剑",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看巨剑"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-halberd",
    "name": "戟",
    "nameEn": "Halberd",
    "category": "weapon",
    "weightLb": 6.0,
    "price": {
      "amount": 20.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d10",
      "type": "slashing"
    },
    "properties": "重型，触及，双手",
    "mastery": "横扫",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "戟",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看戟",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看戟"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-lance",
    "name": "骑枪",
    "nameEn": "Lance",
    "category": "weapon",
    "weightLb": 6.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d10",
      "type": "piercing"
    },
    "properties": "重型，触及，双手（骑乘期间除外）",
    "mastery": "失衡",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "骑枪",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看骑枪",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看骑枪"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-longsword",
    "name": "长剑",
    "nameEn": "Longsword",
    "category": "weapon",
    "weightLb": 3.0,
    "price": {
      "amount": 15.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "slashing"
    },
    "properties": "多用（1d10）",
    "mastery": "削弱",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "长剑",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看长剑",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看长剑"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-maul",
    "name": "巨锤",
    "nameEn": "Maul",
    "category": "weapon",
    "weightLb": 10.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "2d6",
      "type": "bludgeoning"
    },
    "properties": "重型，双手",
    "mastery": "失衡",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "巨锤",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看巨锤",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看巨锤"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-morningstar",
    "name": "钉头锤",
    "nameEn": "Morningstar",
    "category": "weapon",
    "weightLb": 4.0,
    "price": {
      "amount": 15.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "piercing"
    },
    "properties": "—",
    "mastery": "削弱",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "钉头锤",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看钉头锤",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看钉头锤"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-pike",
    "name": "长矛",
    "nameEn": "Pike",
    "category": "weapon",
    "weightLb": 18.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d10",
      "type": "piercing"
    },
    "properties": "重型，触及，双手",
    "mastery": "推离",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "长矛",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看长矛",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看长矛"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-rapier",
    "name": "刺剑",
    "nameEn": "Rapier",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "piercing"
    },
    "properties": "灵巧",
    "mastery": "侵扰",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "刺剑",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看刺剑",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看刺剑"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-scimitar",
    "name": "弯刀",
    "nameEn": "Scimitar",
    "category": "weapon",
    "weightLb": 3.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "slashing"
    },
    "properties": "灵巧，轻型",
    "mastery": "迅击",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "弯刀",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看弯刀",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看弯刀"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-shortsword",
    "name": "短剑",
    "nameEn": "Shortsword",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "piercing"
    },
    "properties": "灵巧，轻型",
    "mastery": "侵扰",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "短剑",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看短剑",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看短剑"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-trident",
    "name": "三叉戟",
    "nameEn": "Trident",
    "category": "weapon",
    "weightLb": 4.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon",
      "thrown"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "piercing"
    },
    "properties": "投掷（射程 20/60），多用（1d10）",
    "mastery": "失衡",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "三叉戟",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看三叉戟",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看三叉戟"
      },
      {
        "id": "throw-weapon",
        "name": "投掷三叉戟",
        "timing": "attack",
        "consume": {
          "quantity": 1
        },
        "mode": "adjudicate",
        "entryPoints": [
          "throw",
          "utilize"
        ],
        "rangeFeet": 20,
        "longRangeFeet": 60,
        "disposition": "recoverable-outside-carried-inventory",
        "notes": "核对装备、触及/射程、武器属性与攻击机会；投出后离开当前持有库存，不代表毁坏。",
        "label": "投掷三叉戟"
      }
    ],
    "entryPoints": [
      "throw",
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-warpick",
    "name": "战镐",
    "nameEn": "Warpick",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "piercing"
    },
    "properties": "多用（1d10）",
    "mastery": "削弱",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "战镐",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看战镐",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看战镐"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-warhammer",
    "name": "战锤",
    "nameEn": "Warhammer",
    "category": "weapon",
    "weightLb": 5.0,
    "price": {
      "amount": 15.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "bludgeoning"
    },
    "properties": "多用（1d10）",
    "mastery": "推离",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "战锤",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看战锤",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看战锤"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-whip",
    "name": "鞭",
    "nameEn": "Whip",
    "category": "weapon",
    "weightLb": 3.0,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用近战武器 Martial Melee Weapons",
    "baseDamage": {
      "formula": "1d4",
      "type": "slashing"
    },
    "properties": "灵巧，触及",
    "mastery": "缓速",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "鞭",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看鞭",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看鞭"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-blowgun",
    "name": "吹箭筒",
    "nameEn": "Blowgun",
    "category": "weapon",
    "weightLb": 1.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用远程武器 Martial Ranged Weapons",
    "baseDamage": {
      "formula": "1",
      "type": "piercing"
    },
    "properties": "弹药（射程 25/100；吹矢），装填",
    "mastery": "侵扰",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "吹箭筒",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看吹箭筒",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看吹箭筒"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-hand-crossbow",
    "name": "手弩",
    "nameEn": "Hand Crossbow",
    "category": "weapon",
    "weightLb": 3.0,
    "price": {
      "amount": 75.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用远程武器 Martial Ranged Weapons",
    "baseDamage": {
      "formula": "1d6",
      "type": "piercing"
    },
    "properties": "弹药（射程 30/120；弩矢），轻型，装填",
    "mastery": "侵扰",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "手弩",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看手弩",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看手弩"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-heavy-crossbow",
    "name": "重弩",
    "nameEn": "Heavy Crossbow",
    "category": "weapon",
    "weightLb": 18.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用远程武器 Martial Ranged Weapons",
    "baseDamage": {
      "formula": "1d10",
      "type": "piercing"
    },
    "properties": "弹药（射程 100/400；弩矢），重型，装填，双手",
    "mastery": "推离",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "重弩",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看重弩",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看重弩"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-longbow",
    "name": "长弓",
    "nameEn": "Longbow",
    "category": "weapon",
    "weightLb": 2.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用远程武器 Martial Ranged Weapons",
    "baseDamage": {
      "formula": "1d8",
      "type": "piercing"
    },
    "properties": "弹药（射程 150/600；箭矢），重型，双手",
    "mastery": "缓速",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "长弓",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看长弓",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看长弓"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-musket",
    "name": "火铳",
    "nameEn": "Musket",
    "category": "weapon",
    "weightLb": 10.0,
    "price": {
      "amount": 500.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用远程武器 Martial Ranged Weapons",
    "baseDamage": {
      "formula": "1d12",
      "type": "piercing"
    },
    "properties": "弹药（射程 40/120；子弹），装填，双手",
    "mastery": "缓速",
    "aliases": [
      "火枪",
      "Musket"
    ],
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "火铳",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看火铳",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看火铳"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-weapon-pistol",
    "name": "手铳",
    "nameEn": "Pistol",
    "category": "weapon",
    "weightLb": 3.0,
    "price": {
      "amount": 250.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "weapon"
    ],
    "unit": "把",
    "weaponGroup": "军用远程武器 Martial Ranged Weapons",
    "baseDamage": {
      "formula": "1d10",
      "type": "piercing"
    },
    "properties": "弹药（射程 30/90；子弹），装填",
    "mastery": "侵扰",
    "aliases": [
      "手枪",
      "Pistol"
    ],
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/武器.htm",
    "sourceSection": "手铳",
    "uses": [
      {
        "id": "weapon-use",
        "name": "查看手铳",
        "timing": "manual",
        "consume": {},
        "mode": "reference",
        "entryPoints": [
          "utilize"
        ],
        "notes": "请在角色攻击资料中登记武器攻击；从目录选择武器不自动生成加值、装备、熟练或精通。",
        "label": "查看手铳"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-padded-armor",
    "name": "布甲",
    "nameEn": "Padded Armor",
    "category": "armor",
    "weightLb": 8.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "11+敏捷调整值",
    "strengthRequirement": "—",
    "stealthDisadvantage": true,
    "armorGroup": "轻甲 Light Armor（穿戴或卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "布甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴布甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "穿戴布甲"
      },
      {
        "id": "doff",
        "name": "卸除布甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除布甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-leather-armor",
    "name": "皮甲",
    "nameEn": "Leather Armor",
    "category": "armor",
    "weightLb": 10.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "11+敏捷调整值",
    "strengthRequirement": "—",
    "stealthDisadvantage": false,
    "armorGroup": "轻甲 Light Armor（穿戴或卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "皮甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴皮甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "穿戴皮甲"
      },
      {
        "id": "doff",
        "name": "卸除皮甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除皮甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-studded-leather-armor",
    "name": "镶钉皮甲",
    "nameEn": "Studded Leather Armor",
    "category": "armor",
    "weightLb": 13.0,
    "price": {
      "amount": 45.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "12+敏捷调整值",
    "strengthRequirement": "—",
    "stealthDisadvantage": false,
    "armorGroup": "轻甲 Light Armor（穿戴或卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "镶钉皮甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴镶钉皮甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "穿戴镶钉皮甲"
      },
      {
        "id": "doff",
        "name": "卸除镶钉皮甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除镶钉皮甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-hide-armor",
    "name": "兽皮甲",
    "nameEn": "Hide Armor",
    "category": "armor",
    "weightLb": 12.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "12+敏捷调整值（最大2）",
    "strengthRequirement": "—",
    "stealthDisadvantage": false,
    "armorGroup": "中甲 Medium Armor（穿戴需5分钟，卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "兽皮甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴兽皮甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "穿戴兽皮甲"
      },
      {
        "id": "doff",
        "name": "卸除兽皮甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除兽皮甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-chain-shirt",
    "name": "链甲衫",
    "nameEn": "Chain Shirt",
    "category": "armor",
    "weightLb": 20.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "13+敏捷调整值（最大2）",
    "strengthRequirement": "—",
    "stealthDisadvantage": false,
    "armorGroup": "中甲 Medium Armor（穿戴需5分钟，卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "链甲衫",
    "uses": [
      {
        "id": "don",
        "name": "穿戴链甲衫",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "穿戴链甲衫"
      },
      {
        "id": "doff",
        "name": "卸除链甲衫",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除链甲衫"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-scale-mail",
    "name": "鳞甲",
    "nameEn": "Scale Mail",
    "category": "armor",
    "weightLb": 45.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "14+敏捷调整值（最大2）",
    "strengthRequirement": "—",
    "stealthDisadvantage": true,
    "armorGroup": "中甲 Medium Armor（穿戴需5分钟，卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "鳞甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴鳞甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "穿戴鳞甲"
      },
      {
        "id": "doff",
        "name": "卸除鳞甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除鳞甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-breastplate",
    "name": "胸甲",
    "nameEn": "Breastplate",
    "category": "armor",
    "weightLb": 20.0,
    "price": {
      "amount": 400.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "14+敏捷调整值（最大2）",
    "strengthRequirement": "—",
    "stealthDisadvantage": false,
    "armorGroup": "中甲 Medium Armor（穿戴需5分钟，卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "胸甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴胸甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "穿戴胸甲"
      },
      {
        "id": "doff",
        "name": "卸除胸甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除胸甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-half-plate-armor",
    "name": "半身板甲",
    "nameEn": "Half Plate Armor",
    "category": "armor",
    "weightLb": 40.0,
    "price": {
      "amount": 750.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "15+敏捷调整值（最大2）",
    "strengthRequirement": "—",
    "stealthDisadvantage": true,
    "armorGroup": "中甲 Medium Armor（穿戴需5分钟，卸除需1分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "半身板甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴半身板甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "穿戴半身板甲"
      },
      {
        "id": "doff",
        "name": "卸除半身板甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 1,
        "label": "卸除半身板甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-ring-mail",
    "name": "环甲",
    "nameEn": "Ring Mail",
    "category": "armor",
    "weightLb": 40.0,
    "price": {
      "amount": 30.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "14",
    "strengthRequirement": "—",
    "stealthDisadvantage": true,
    "armorGroup": "重甲 Heavy Armor（穿戴需10分钟，卸除需5分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "环甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴环甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 10,
        "label": "穿戴环甲"
      },
      {
        "id": "doff",
        "name": "卸除环甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "卸除环甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-chain-mail",
    "name": "链甲",
    "nameEn": "Chain Mail",
    "category": "armor",
    "weightLb": 55.0,
    "price": {
      "amount": 75.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "16",
    "strengthRequirement": "力量13",
    "stealthDisadvantage": true,
    "armorGroup": "重甲 Heavy Armor（穿戴需10分钟，卸除需5分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "链甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴链甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 10,
        "label": "穿戴链甲"
      },
      {
        "id": "doff",
        "name": "卸除链甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "卸除链甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-splint-armor",
    "name": "板条甲",
    "nameEn": "Splint Armor",
    "category": "armor",
    "weightLb": 60.0,
    "price": {
      "amount": 200.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "17",
    "strengthRequirement": "力量15",
    "stealthDisadvantage": true,
    "armorGroup": "重甲 Heavy Armor（穿戴需10分钟，卸除需5分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "板条甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴板条甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 10,
        "label": "穿戴板条甲"
      },
      {
        "id": "doff",
        "name": "卸除板条甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "卸除板条甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-plate-armor",
    "name": "板甲",
    "nameEn": "Plate Armor",
    "category": "armor",
    "weightLb": 65.0,
    "price": {
      "amount": 1500.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "套",
    "armorClassRule": "18",
    "strengthRequirement": "力量15",
    "stealthDisadvantage": true,
    "armorGroup": "重甲 Heavy Armor（穿戴需10分钟，卸除需5分钟）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "板甲",
    "uses": [
      {
        "id": "don",
        "name": "穿戴板甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 10,
        "label": "穿戴板甲"
      },
      {
        "id": "doff",
        "name": "卸除板甲",
        "timing": "manual",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "durationMinutes": 5,
        "label": "卸除板甲"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-armor-shield",
    "name": "盾牌",
    "nameEn": "Shield",
    "category": "armor",
    "weightLb": 6.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "unit": "面",
    "armorClassRule": "+2",
    "strengthRequirement": "—",
    "stealthDisadvantage": false,
    "armorGroup": "盾牌 Shield（穿戴或卸除需操作动作）",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/护甲.htm",
    "sourceSection": "盾牌",
    "uses": [
      {
        "id": "don",
        "name": "穿戴盾牌",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "label": "穿戴盾牌"
      },
      {
        "id": "doff",
        "name": "卸除盾牌",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "notes": "核对护甲受训、已着装装备及空手等条件；库存操作不自动改写AC。",
        "label": "卸除盾牌"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-alchemist-s-supplies",
    "name": "炼金工具",
    "nameEn": "Alchemist's Supplies",
    "category": "tool",
    "weightLb": 8.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "智力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "炼金工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "智力",
        "listedDCs": [
          15,
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-brewer-s-supplies",
    "name": "酿酒工具",
    "nameEn": "Brewer's Supplies",
    "category": "tool",
    "weightLb": 9.0,
    "price": {
      "amount": 20.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "智力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "酿酒工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "智力",
        "listedDCs": [
          15,
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-calligrapher-s-supplies",
    "name": "书法工具",
    "nameEn": "Calligrapher's Supplies",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "书法工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-carpenter-s-tools",
    "name": "木匠工具",
    "nameEn": "Carpenter's Tools",
    "category": "tool",
    "weightLb": 6.0,
    "price": {
      "amount": 8.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "力量",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "木匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "力量",
        "listedDCs": [
          20
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-cartographer-s-tools",
    "name": "制图工具",
    "nameEn": "Cartographer's Tools",
    "category": "tool",
    "weightLb": 6.0,
    "price": {
      "amount": 15.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "感知",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "制图工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "感知",
        "listedDCs": [
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-cobbler-s-tools",
    "name": "鞋匠工具",
    "nameEn": "Cobbler's Tools",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "鞋匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-cook-s-utensils",
    "name": "厨师工具",
    "nameEn": "Cook's Utensils",
    "category": "tool",
    "weightLb": 8.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "感知",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "厨师工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "感知",
        "listedDCs": [
          10,
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-glassblower-s-tools",
    "name": "玻璃匠工具",
    "nameEn": "Glassblower's Tools",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 30.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "智力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "玻璃匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "智力",
        "listedDCs": [
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-jeweler-s-tools",
    "name": "珠宝匠工具",
    "nameEn": "Jeweler's Tools",
    "category": "tool",
    "weightLb": 2.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "智力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "珠宝匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "智力",
        "listedDCs": [
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-leatherworker-s-tools",
    "name": "皮匠工具",
    "nameEn": "Leatherworker's Tools",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "皮匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-mason-s-tools",
    "name": "石匠工具",
    "nameEn": "Mason's Tools",
    "category": "tool",
    "weightLb": 8.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "力量",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "石匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "力量",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-painter-s-supplies",
    "name": "画家工具",
    "nameEn": "Painter's Supplies",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "感知",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "画家工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "感知",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-potter-s-tools",
    "name": "陶匠工具",
    "nameEn": "Potter's Tools",
    "category": "tool",
    "weightLb": 3.0,
    "price": {
      "amount": 10.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "智力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "陶匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "智力",
        "listedDCs": [
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-smith-s-tools",
    "name": "铁匠工具",
    "nameEn": "Smith's Tools",
    "category": "tool",
    "weightLb": 8.0,
    "price": {
      "amount": 20.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "力量",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "铁匠工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "力量",
        "listedDCs": [
          20
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-tinker-s-tools",
    "name": "修补工具",
    "nameEn": "Tinker's Tools",
    "category": "tool",
    "weightLb": 10.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "修补工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          20
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-weaver-s-tools",
    "name": "织布工具",
    "nameEn": "Weaver's Tools",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "织布工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          10,
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-woodcarver-s-tools",
    "name": "木雕工具",
    "nameEn": "Woodcarver's Tools",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/工匠工具.htm",
    "sourceSection": "木雕工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-disguise-kit",
    "name": "易容工具",
    "nameEn": "Disguise Kit",
    "category": "tool",
    "weightLb": 3.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "魅力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "易容工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "魅力",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-forgery-kit",
    "name": "文书伪造工具",
    "nameEn": "Forgery Kit",
    "category": "tool",
    "weightLb": 5.0,
    "price": {
      "amount": 15.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "文书伪造工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          15,
          20
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-herbalism-kit",
    "name": "草药工具",
    "nameEn": "Herbalism Kit",
    "category": "tool",
    "weightLb": 3.0,
    "price": {
      "amount": 5.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "智力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "草药工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "智力",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-navigator-s-tools",
    "name": "领航工具",
    "nameEn": "Navigator's Tools",
    "category": "tool",
    "weightLb": 2.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "感知",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "领航工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "感知",
        "listedDCs": [
          10,
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-poisoner-s-kit",
    "name": "毒药工具",
    "nameEn": "Poisoner's Kit",
    "category": "tool",
    "weightLb": 2.0,
    "price": {
      "amount": 50.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "智力",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "毒药工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "智力",
        "listedDCs": [
          10
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-thieves-tools",
    "name": "盗贼工具",
    "nameEn": "Thieves' Tools",
    "category": "tool",
    "weightLb": 1.0,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [],
    "ability": "敏捷",
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "盗贼工具",
    "uses": [
      {
        "id": "tool-use",
        "name": "使用工具",
        "checkAbility": "敏捷",
        "listedDCs": [
          15,
          15
        ],
        "notes": "使用对应工具的操作动作；要求的工具熟练、技能与情境由主持核对。",
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用工具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-gaming-dice",
    "name": "骰子",
    "nameEn": "dice",
    "category": "tool",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "gaming-set"
    ],
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "骰子",
    "uses": [
      {
        "id": "gaming",
        "name": "使用赌具",
        "checkAbility": "感知",
        "listedDCs": [
          10,
          20
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用赌具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-gaming-dragonchess",
    "name": "龙棋",
    "nameEn": "dragonchess",
    "category": "tool",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "gaming-set"
    ],
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "龙棋",
    "uses": [
      {
        "id": "gaming",
        "name": "使用赌具",
        "checkAbility": "感知",
        "listedDCs": [
          10,
          20
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用赌具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-gaming-playing-cards",
    "name": "纸牌",
    "nameEn": "playing-cards",
    "category": "tool",
    "weightLb": 0,
    "price": {
      "amount": 5.0,
      "unit": "sp",
      "basisQuantity": 1
    },
    "tags": [
      "gaming-set"
    ],
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "纸牌",
    "uses": [
      {
        "id": "gaming",
        "name": "使用赌具",
        "checkAbility": "感知",
        "listedDCs": [
          10,
          20
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用赌具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-gaming-three-dragon-ante",
    "name": "三龙牌",
    "nameEn": "three-dragon-ante",
    "category": "tool",
    "weightLb": 0,
    "price": {
      "amount": 1.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "gaming-set"
    ],
    "unit": "套",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "三龙牌",
    "uses": [
      {
        "id": "gaming",
        "name": "使用赌具",
        "checkAbility": "感知",
        "listedDCs": [
          10,
          20
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "使用赌具"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-bagpipes",
    "name": "风笛",
    "nameEn": "bagpipes",
    "category": "tool",
    "weightLb": 6,
    "price": {
      "amount": 30.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "风笛",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-drum",
    "name": "鼓",
    "nameEn": "drum",
    "category": "tool",
    "weightLb": 3,
    "price": {
      "amount": 6.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "鼓",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-dulcimer",
    "name": "扬琴",
    "nameEn": "dulcimer",
    "category": "tool",
    "weightLb": 10,
    "price": {
      "amount": 25.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "扬琴",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-flute",
    "name": "长笛",
    "nameEn": "flute",
    "category": "tool",
    "weightLb": 1,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "长笛",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-horn",
    "name": "号角",
    "nameEn": "horn",
    "category": "tool",
    "weightLb": 2,
    "price": {
      "amount": 3.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "号角",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-lute",
    "name": "鲁特琴",
    "nameEn": "lute",
    "category": "tool",
    "weightLb": 2,
    "price": {
      "amount": 35.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "鲁特琴",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-lyre",
    "name": "里拉琴",
    "nameEn": "lyre",
    "category": "tool",
    "weightLb": 2,
    "price": {
      "amount": 30.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "里拉琴",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-pan-flute",
    "name": "排箫",
    "nameEn": "pan-flute",
    "category": "tool",
    "weightLb": 2,
    "price": {
      "amount": 12.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "排箫",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-shawm",
    "name": "芦笛",
    "nameEn": "shawm",
    "category": "tool",
    "weightLb": 1,
    "price": {
      "amount": 2.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "芦笛",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  },
  {
    "id": "phb24-tool-instrument-viol",
    "name": "提琴",
    "nameEn": "viol",
    "category": "tool",
    "weightLb": 1,
    "price": {
      "amount": 30.0,
      "unit": "gp",
      "basisQuantity": 1
    },
    "tags": [
      "musical-instrument"
    ],
    "unit": "件",
    "version": "phb2024-items-2026-10-28.1",
    "ruleset": "2024",
    "sourcePath": "项目/资源/资料/5E不全书/网页/topics/玩家手册2024/装备/其他工具.htm",
    "sourceSection": "提琴",
    "uses": [
      {
        "id": "play",
        "name": "演奏",
        "checkAbility": "魅力",
        "listedDCs": [
          10,
          15
        ],
        "timing": "action",
        "consume": {},
        "mode": "adjudicate",
        "entryPoints": [
          "utilize"
        ],
        "label": "演奏"
      }
    ],
    "entryPoints": [
      "utilize"
    ]
  }
]);
