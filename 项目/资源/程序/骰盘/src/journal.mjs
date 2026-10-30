import { validateRecord } from './rolls.mjs';

export const STORAGE_KEY = 'solo-dice-prototype.last-roll.v2';
export const LEGACY_STORAGE_KEY = 'solo-dice-prototype.last-roll.v1';

export function saveRoll(storage, record) {
  validateRecord(record);
  const serialized = JSON.stringify(record);
  const key = record.version === 1 ? LEGACY_STORAGE_KEY : STORAGE_KEY;
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error('判定记录未能写入。');
}

export function loadRoll(storage) {
  const serialized = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
  if (serialized === null) return null;
  return validateRecord(JSON.parse(serialized));
}
