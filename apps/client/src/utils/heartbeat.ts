const CRON_REGEX = /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/;

export function isValidCronExpression(expr: string): boolean {
  return CRON_REGEX.test(expr.trim());
}

/**
 * Checks whether a single cron field value (e.g. "5", "*", "0-5", "* /15", "1,3,5") matches
 * the given numeric value.
 */
function matchesCronField(field: string, value: number): boolean {
  if (field === '*') return true;

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangeStr, stepStr] = part.split('/');
      const step = Number(stepStr);
      if (isNaN(step) || step <= 0) continue;

      if (rangeStr === '*') {
        if (value % step === 0) return true;
      } else if (rangeStr.includes('-')) {
        const [lo, hi] = rangeStr.split('-').map(Number);
        if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      } else {
        const start = Number(rangeStr);
        if (value >= start && (value - start) % step === 0) return true;
      }
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      if (value >= lo && value <= hi) return true;
    } else {
      if (Number(part) === value) return true;
    }
  }

  return false;
}

/**
 * Returns true for patterns that fire every minute — minute field is '*' or '* /1'.
 * These are never allowed as scheduled tasks.
 */
export function isEveryMinute(expr: string): boolean {
  const [minuteF] = expr.trim().split(/\s+/);
  return minuteF === '*' || minuteF === '*/1';
}

/**
 * Returns true when the expression has a specific hour (hour field != '*'),
 * OR when it is an explicit repeat-by-minutes schedule (e.g. '* /30 * * * *').
 * A plain wildcard hour without a minute-step means "no hour provided" -> false.
 */
export function hasSpecificHour(expr: string): boolean {
  const [minuteF, hourF] = expr.trim().split(/\s+/);
  if (hourF !== '*') return true;
  // Allow */N (N >= 2) in the minute field — it is a deliberate repeat specification.
  return /^\*\/([2-9]|[1-9]\d+)$/.test(minuteF);
}


/**
 * Returns true when "date" falls within the 5-field cron schedule.
 * Field order: minute hour day-of-month month day-of-week (0=Sun ... 6=Sat)
 */
export function matchesCron(expr: string, date: Date): boolean {
  const [minuteF, hourF, domF, monthF, dowF] = expr.trim().split(/\s+/);
  return (
    matchesCronField(minuteF, date.getMinutes()) &&
    matchesCronField(hourF,   date.getHours()) &&
    matchesCronField(domF,    date.getDate()) &&
    matchesCronField(monthF,  date.getMonth() + 1) &&
    matchesCronField(dowF,    date.getDay())
  );
}

/**
 * Returns true if the cron expression has a scheduled minute between "since"
 * (exclusive) and "now" (inclusive), meaning the task is overdue.
 */
export function isCronDue(expr: string, now: Date, since: Date): boolean {
  const sinceMs = since.getTime();
  const nowMs   = now.getTime();

  // Walk minute-by-minute from (since + 1 min) up to now
  for (let t = sinceMs + 60_000; t <= nowMs; t += 60_000) {
    if (matchesCron(expr, new Date(t))) return true;
  }
  return false;
}
