/**
 * Shared cron-expression validation, used by both `set-beat` and
 * `update-beat`. Pure/dependency-free — a copy of the subset of
 * `core/src/utils/heartbeat.ts` those two plugins actually need (the runner's
 * scheduling logic — `matchesCron`, `isCronDue`, `nextCronFire` — stays in
 * core, since it's not a tool concern).
 */

const CRON_REGEX = /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/;

export function isValidCronExpression(expr: string): boolean {
  return CRON_REGEX.test(expr.trim());
}

/**
 * Returns true for patterns whose minute field schedules execution every minute.
 */
export function isEveryMinute(expr: string): boolean {
  const [minuteF] = expr.trim().split(/\s+/);
  return minuteF === '*' || minuteF === '*/1';
}

/**
 * Returns true for any schedule that does not use an every-minute minute field,
 * or when such a minute field is constrained to a specific hour.
 */
export function hasSpecificHour(expr: string): boolean {
  const [minuteF, hourF] = expr.trim().split(/\s+/);
  if (minuteF !== '*' && minuteF !== '*/1') return true;
  return hourF !== '*';
}
