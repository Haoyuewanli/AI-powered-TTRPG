export class RuleError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function requireRule(condition, message, status) {
  if (!condition) throw new RuleError(message, status);
}
export function integer(value, min, max, label) {
  requireRule(Number.isInteger(value) && value >= min && value <= max, `${label}须为 ${min}～${max} 的整数`);
  return value;
}
