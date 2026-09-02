export interface ParsedTimestamp {
  date: Date;
  malformed: boolean;
}

const RELATIVE_UNIT_MS: Record<string, number> = {
  second: 1_000,
  sec: 1_000,
  minute: 60_000,
  min: 60_000,
  hour: 3_600_000,
  hr: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

const RELATIVE_AGO_PATTERN =
  /^(\d+)\s*(second|sec|minute|min|hour|hr|day|week|month|year)s?\s+ago$/i;
const JUST_NOW_PATTERN = /^(just now|now)$/i;
const YESTERDAY_PATTERN = /^yesterday$/i;

function parseRelativeTime(text: string, now: Date): Date | null {
  if (JUST_NOW_PATTERN.test(text)) {
    return new Date(now.getTime());
  }
  if (YESTERDAY_PATTERN.test(text)) {
    return new Date(now.getTime() - RELATIVE_UNIT_MS.day!);
  }

  const match = RELATIVE_AGO_PATTERN.exec(text);
  if (!match) return null;

  const amount = Number(match[1]);
  const unitMs = RELATIVE_UNIT_MS[match[2]!.toLowerCase()];
  if (!Number.isFinite(amount) || unitMs === undefined) return null;

  return new Date(now.getTime() - amount * unitMs);
}

function parseDirect(text: string): Date | null {
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parses a listing-page timestamp: ISO-8601 and RFC-2822 both parse natively via
 * Date, so only the free-text relative-time case ("3 mins ago") needs custom logic.
 */
export function parseTimestamp(raw: string, now: Date): ParsedTimestamp {
  const trimmed = raw.trim();
  const parsed =
    trimmed.length > 0
      ? (parseDirect(trimmed) ?? parseRelativeTime(trimmed, now))
      : null;

  if (parsed === null || parsed.getTime() > now.getTime()) {
    return { date: now, malformed: true };
  }

  return { date: parsed, malformed: false };
}
