import {ITEM_CATALOG} from '../data/items-2024.mjs';
import {requireRule} from './rule-errors.mjs';

const itemsById = new Map(ITEM_CATALOG.map(item => [item.id, item]));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const quantityValue = value => Number.isInteger(value) && value >= 0 && value <= 9999;

export const getItem = itemId => itemsById.get(itemId);
export const getItemUse = (itemId, useId) => getItem(typeof itemId === 'string' ? itemId : itemId?.id)?.uses.find(use => use.id === useId);

// Missing inventory is a compatible empty backpack. Validation never fills or changes it.
export function validateInventory(inventory, label = '背包') {
  if (inventory === undefined) return [];
  requireRule(Array.isArray(inventory) && inventory.length <= 500, `${label}须为不超过500个库存条目的数组`);
  requireRule(inventory.every(stack => record(stack) && validId(stack.id)), `${label}库存ID无效`);
  requireRule(new Set(inventory.map(stack => stack.id)).size === inventory.length, `${label}库存ID不能重复`);
  for (const stack of inventory) {
    requireRule(Object.keys(stack).every(key => ['id', 'itemId', 'quantity', 'charges'].includes(key)), `${label}包含不支持的库存字段`);
    const item = getItem(stack.itemId);
    requireRule(typeof stack.itemId === 'string' && item, `${label}引用了不存在的2024物品`);
    requireRule(quantityValue(stack.quantity), `${label}数量须为0～9999的整数`);
    if (item.chargesPerItem) {
      if (stack.charges !== undefined) {
        requireRule(Number.isInteger(stack.charges) && stack.charges >= 0 && stack.charges <= item.chargesPerItem, `${item.name}当前单件次数须为0～${item.chargesPerItem}的整数`);
        requireRule(stack.quantity > 0 || stack.charges === 0, `${item.name}数量为0时不能仍有剩余次数`);
      }
    } else requireRule(stack.charges === undefined, `${item.name}不使用单件次数字段`);
  }
  return inventory;
}

function remainingCharges(stack, item) {
  if (!item.chargesPerItem || !stack.quantity) return 0;
  const current = stack.charges ?? item.chargesPerItem;
  return (stack.quantity - 1) * item.chargesPerItem + current;
}

function choice(item, use, scope, stack) {
  const quantity = stack?.quantity ?? 0;
  const charges = item.chargesPerItem ? (quantity ? stack?.charges ?? item.chargesPerItem : 0) : null;
  const availableUses = item.chargesPerItem ? remainingCharges(stack ?? {quantity: 0}, item) : null;
  let unavailableReason = '';
  if (!stack || quantity === 0) unavailableReason = '背包中没有可用数量';
  else if (use.mode === 'reference') unavailableReason = '此用途尚需登记具体规则或由主持处理';
  else if (use.consume.quantity && quantity < use.consume.quantity) unavailableReason = '物品数量不足';
  else if (use.consume.charges && availableUses < use.consume.charges) unavailableReason = '物品剩余次数不足';
  return {
    scope, stackId: stack?.id ?? null, itemId: item.id, useId: use.id, item, use, quantity,
    ...(item.chargesPerItem ? {charges} : {}), availableUses,
    available: !unavailableReason, canConsume: !unavailableReason, reason: unavailableReason, unavailableReason,
    requiresAccessibilityConfirmation: scope === 'party'
  };
}

// Catalog-only choices stay visible, with canConsume=false. Ownership/access checks belong to the caller.
export function inventoryChoices(state, actor, entryPoint = 'all', {includeUnavailable = true} = {}) {
  const point = typeof entryPoint === 'string' ? entryPoint.replace(/^common:/, '') : '';
  requireRule(['all', 'potion', 'dip', 'throw', 'utilize'].includes(point), '物品交互入口无效');
  const sources = [
    ['personal', validateInventory(actor?.inventory, '个人背包')],
    ['party', validateInventory(state?.partyInventory, '团队背包')]
  ];
  const result = [], present = new Set();
  for (const [scope, stacks] of sources) {
    for (const stack of stacks) {
      const item = getItem(stack.itemId);
      present.add(item.id);
      for (const use of item.uses) if (point === 'all' || use.entryPoints.includes(point)) result.push(choice(item, use, scope, stack));
    }
  }
  if (includeUnavailable) {
    for (const item of ITEM_CATALOG) {
      if (present.has(item.id)) continue;
      for (const use of item.uses) if (point === 'all' || use.entryPoints.includes(point)) result.push(choice(item, use, 'catalog', null));
    }
  }
  return result;
}

// Mutates only the supplied transaction clone. A quantity removal does not declare an item destroyed.
// Charges count the current open package first; all other packages in that stack are unopened/full.
export function consumeInventory(state, actor, request) {
  requireRule(record(request) && ['personal', 'party'].includes(request.scope) && validId(request.stackId), '库存消耗范围或条目ID无效');
  const stacks = request.scope === 'personal' ? actor?.inventory : state?.partyInventory;
  validateInventory(stacks, request.scope === 'personal' ? '个人背包' : '团队背包');
  const stack = stacks?.find(entry => entry.id === request.stackId);
  requireRule(stack, '物品不在所选背包中');
  const item = getItem(stack.itemId), hasQuantity = Object.hasOwn(request, 'quantity'), hasCharges = Object.hasOwn(request, 'charges');
  requireRule(!(hasQuantity && hasCharges), '一次库存消耗请选择数量或次数，不要重复扣除');
  const byCharges = hasCharges || (!hasQuantity && !!item.chargesPerItem);
  const amount = byCharges ? (hasCharges ? request.charges : 1) : (hasQuantity ? request.quantity : 1);
  requireRule(Number.isInteger(amount) && amount > 0, '库存消耗量须为正整数');
  const before = {quantity: stack.quantity, ...(item.chargesPerItem ? {charges: stack.quantity ? stack.charges ?? item.chargesPerItem : 0} : {})};
  let nextQuantity, nextCharges;
  if (byCharges) {
    requireRule(item.chargesPerItem, '此物品不支持按次数扣除');
    const available = remainingCharges(stack, item);
    requireRule(amount <= available, `${item.name}剩余次数不足`);
    const remaining = available - amount;
    nextQuantity = remaining ? Math.ceil(remaining / item.chargesPerItem) : 0;
    nextCharges = remaining ? remaining - (nextQuantity - 1) * item.chargesPerItem : 0;
  } else {
    requireRule(amount <= stack.quantity, `${item.name}数量不足`);
    nextQuantity = stack.quantity - amount;
    if (item.chargesPerItem) nextCharges = nextQuantity ? item.chargesPerItem : 0;
  }
  // All validation and next-value calculation precedes the first state mutation.
  stack.quantity = nextQuantity;
  if (item.chargesPerItem) stack.charges = nextCharges;
  return {
    scope: request.scope, stackId: stack.id, itemId: item.id, itemName: item.name,
    quantityRemoved: before.quantity - nextQuantity, chargesSpent: byCharges ? amount : 0,
    before, after: {quantity: stack.quantity, ...(item.chargesPerItem ? {charges: stack.charges} : {})}
  };
}
