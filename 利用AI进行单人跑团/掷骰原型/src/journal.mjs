import { validateRecord } from './rolls.mjs';

export const STORAGE_KEY = 'solo-dice-prototype.last-roll.v1';

export function saveRoll(storage, record) {
  validateRecord(record);
  const serialized = JSON.stringify(record);
  storage.setItem(STORAGE_KEY, serialized);
  if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error('判定记录未能写入。');
}

export function loadRoll(storage) {
  const serialized = storage.getItem(STORAGE_KEY);
  if (serialized === null) return null;
  return validateRecord(JSON.parse(serialized));
}
