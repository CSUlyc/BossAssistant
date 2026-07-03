const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toBeijingParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

function parseDate(value?: string | Date): Date {
  if (!value) {
    return new Date();
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function getBeijingDateKey(value?: string | Date): string {
  const parts = toBeijingParts(parseDate(value));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function nowBeijingTimestamp(): string {
  const parts = toBeijingParts(new Date());
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}+08:00`;
}

export function formatBeijingDateTime(value: string | Date): string {
  const parts = toBeijingParts(parseDate(value));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function formatBeijingShortDateTime(value: string | Date): string {
  const parts = toBeijingParts(parseDate(value));
  return `${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatBeijingTime(value: Date = new Date()): string {
  return value.toLocaleTimeString("zh-CN", {
    hour12: false,
    timeZone: BEIJING_TIME_ZONE
  });
}
