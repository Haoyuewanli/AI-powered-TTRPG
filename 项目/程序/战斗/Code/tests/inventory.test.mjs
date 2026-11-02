import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEM_CATALOG, ITEM_CATALOG_INFO} from '../data/items-2024.mjs';
import {getItem, getItemUse, validateInventory, inventoryChoices, consumeInventory} from '../src/inventory.mjs';

const named = name => ITEM_CATALOG.find(item => item.name === name);
const stack = (name, quantity = 1, id = 'stack-1', extra = {}) => ({id, itemId: named(name).id, quantity, ...extra});
const stateWith = (personal, party = []) => ({actors: [{id: 'hero', inventory: personal}], partyInventory: party});

test('PHB2024 catalog covers 182 unique concrete items and bounded sourced use definitions', () => {
  assert.equal(ITEM_CATALOG.length, 182);assert.equal(ITEM_CATALOG_INFO.total, 182);
  assert.equal(new Set(ITEM_CATALOG.map(item => item.id)).size, 182);
  assert.deepEqual(ITEM_CATALOG_INFO.counts, {gear:71,pack:7,ammunition:5,focus:11,weapon:38,armor:13,tool:37});
  for (const item of ITEM_CATALOG) {
    assert.equal(item.ruleset, '2024');assert.ok(item.version && item.sourcePath && item.sourceSection && item.uses.length);
    for (const use of item.uses) {assert.ok(['action','bonus','attack','manual'].includes(use.timing));assert.ok(['automatic-heal','adjudicate','reference'].includes(use.mode));assert.ok(use.label);assert.ok(Object.keys(use.consume).every(k=>['quantity','charges'].includes(k)));}
  }
  assert.ok(Object.isFrozen(ITEM_CATALOG) && Object.isFrozen(named('治疗药水').uses[0]));
  assert.equal(getItem('unknown'), undefined);assert.equal(getItemUse('unknown','use'), undefined);
});

test('2024 item uses distinguish potion, coating, attack replacement and don/doff times', () => {
  const potion = getItemUse(named('治疗药水'), 'drink-feed');assert.equal(getItemUse(named('治疗药水').id,'drink-feed'),potion);assert.equal(potion.timing,'bonus');assert.equal(potion.formula,'2d4+2');assert.equal(potion.mode,'automatic-heal');assert.deepEqual(potion.consume,{quantity:1});assert.equal(potion.rangeFeet,5);assert.equal(potion.allowSelf,true);
  assert.equal(getItemUse(named('基础毒药'),'coat').timing,'bonus');
  for (const name of ['强酸','炽火胶','圣水','捕网']) assert.equal(named(name).uses[0].timing,'attack');
  assert.equal(named('燃油').uses.find(use=>use.id==='douse-space').timing,'action');
  assert.equal(getItemUse(named('板甲'),'don').durationMinutes,10);assert.equal(getItemUse(named('板甲'),'doff').durationMinutes,5);
  assert.equal(getItemUse(named('链甲衫'),'don').durationMinutes,5);assert.equal(getItemUse(named('链甲衫'),'doff').durationMinutes,1);
  assert.equal(getItemUse(named('盾牌'),'don').timing,'action');assert.equal(getItemUse(named('盾牌'),'doff').timing,'action');
  assert.equal(named('医疗包').chargesPerItem,10);assert.match(named('捕网').uses[0].disposition,/recoverable/);
});

test('inventory validates legacy absence, references, counts, IDs and medical package charges', () => {
  assert.deepEqual(validateInventory(undefined),[]);assert.deepEqual(validateInventory([]),[]);
  assert.doesNotThrow(()=>validateInventory([stack('医疗包',2,'kit',{charges:4})]));
  for(const invalid of [null,{},[null],[{...stack('治疗药水'),id:''}],[stack('治疗药水',-1)],[stack('治疗药水',10000)],[stack('治疗药水',1.5)],[{...stack('治疗药水'),itemId:'unknown'}],[stack('治疗药水',1,'same'),stack('燃油',1,'same')],[stack('医疗包',1,'kit',{charges:11})],[stack('医疗包',0,'kit',{charges:1})],[stack('治疗药水',1,'potion',{charges:1})]]) assert.throws(()=>validateInventory(invalid));
});

test('choices include personal, party and unavailable catalog rows without mutating inventories', () => {
  const state=stateWith([stack('治疗药水',1,'personal-potion')],[stack('治疗药水',2,'party-potion')]),actor=state.actors[0],before=JSON.stringify(state);
  const choices=inventoryChoices(state,actor,'potion');
  assert.deepEqual(inventoryChoices(state,actor,'common:potion'),choices);
  for(const row of choices) {assert.equal(row.itemId,row.item.id);assert.equal(row.useId,row.use.id);assert.equal(row.reason,row.unavailableReason);assert.equal('charges' in row,false);}
  assert.ok(choices.some(c=>c.scope==='personal'&&c.stackId==='personal-potion'&&c.canConsume&&c.quantity===1));
  assert.ok(choices.some(c=>c.scope==='party'&&c.stackId==='party-potion'&&c.requiresAccessibilityConfirmation));
  assert.ok(choices.some(c=>c.scope==='catalog'&&c.stackId===null&&!c.available&&c.unavailableReason));
  assert.ok(inventoryChoices(state,actor,'dip').every(c=>c.item.name==='基础毒药'));
  assert.ok(inventoryChoices(state,actor,'throw').some(c=>c.item.name==='强酸'));
  assert.ok(inventoryChoices(state,actor,'common:utilize').length>=182);
  assert.equal(new Set(inventoryChoices(state,actor).map(c=>c.item.id)).size,182);
  assert.equal(inventoryChoices(state,actor,'potion',{includeUnavailable:false}).length,2);
  assert.equal(JSON.stringify(state),before);assert.throws(()=>inventoryChoices(state,actor,'unknown'));
});

test('personal consumption does not also spend party stock and failed consumption is unchanged', () => {
  const state=stateWith([stack('治疗药水',1,'mine')],[stack('治疗药水',3,'ours')]),actor=state.actors[0];
  const receipt=consumeInventory(state,actor,{scope:'personal',stackId:'mine'});assert.equal(actor.inventory[0].quantity,0);assert.equal(state.partyInventory[0].quantity,3);assert.equal(receipt.quantityRemoved,1);assert.equal(receipt.chargesSpent,0);
  const before=JSON.stringify(state);
  for(const request of [{scope:'personal',stackId:'mine'},{scope:'personal',stackId:'ours'},{scope:'catalog',stackId:'mine'},{scope:'party',stackId:'ours',quantity:4},{scope:'party',stackId:'ours',quantity:0},{scope:'party',stackId:'ours',charges:1},{scope:'party',stackId:'ours',quantity:1,charges:1}]) {assert.throws(()=>consumeInventory(state,actor,request));assert.equal(JSON.stringify(state),before);}
  consumeInventory(state,actor,{scope:'party',stackId:'ours',quantity:2});assert.equal(state.partyInventory[0].quantity,1);
});

test('medical charges cross package boundaries, canonicalize depletion, and preserve the source clone', () => {
  const original=stateWith([stack('医疗包',3,'kit',{charges:4})]);const state=structuredClone(original),actor=state.actors[0];
  assert.equal(inventoryChoices(state,actor,'utilize',{includeUnavailable:false})[0].availableUses,24);
  consumeInventory(state,actor,{scope:'personal',stackId:'kit',charges:4});assert.deepEqual(actor.inventory[0],stack('医疗包',2,'kit',{charges:10}));
  consumeInventory(state,actor,{scope:'personal',stackId:'kit',charges:11});assert.deepEqual(actor.inventory[0],stack('医疗包',1,'kit',{charges:9}));
  consumeInventory(state,actor,{scope:'personal',stackId:'kit',charges:9});assert.deepEqual(actor.inventory[0],stack('医疗包',0,'kit',{charges:0}));
  assert.equal(inventoryChoices(state,actor,'utilize',{includeUnavailable:false})[0].canConsume,false);assert.deepEqual(original.actors[0].inventory[0],stack('医疗包',3,'kit',{charges:4}));
});

test('unopened medical stacks default to ten charges; whole package removal is explicit', () => {
  const state=stateWith([stack('医疗包',2,'kit')]),actor=state.actors[0];consumeInventory(state,actor,{scope:'personal',stackId:'kit'});assert.deepEqual(actor.inventory[0],stack('医疗包',2,'kit',{charges:9}));
  consumeInventory(state,actor,{scope:'personal',stackId:'kit',quantity:1});assert.deepEqual(actor.inventory[0],stack('医疗包',1,'kit',{charges:10}));
  const empty=stateWith([stack('医疗包',1,'empty',{charges:0})]);assert.equal(inventoryChoices(empty,empty.actors[0],'utilize',{includeUnavailable:false})[0].canConsume,false);assert.throws(()=>consumeInventory(empty,empty.actors[0],{scope:'personal',stackId:'empty',charges:1}));
});
