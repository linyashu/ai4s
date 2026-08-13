const CN_TIME_ZONE = "Asia/Shanghai"

function fmtParts(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find((p) => p.type === type)?.value ?? 0)
}

/**
 * 以北京时间（Asia/Shanghai）解析某时刻的年月日，与服务器本地时区无关。
 */
export function cnDateParts(ms: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms))
  return {
    year: fmtParts(parts, "year"),
    month: fmtParts(parts, "month"),
    day: fmtParts(parts, "day"),
  }
}

export function cnDateKey(ms: number): string {
  const { year, month, day } = cnDateParts(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${year}-${p(month)}-${p(day)}`
}

export function cnDateLabel(ms: number): string {
  const { month, day } = cnDateParts(ms)
  return `${month}月${day}日`
}

export function cnTimeLabel(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms))
  const hour = fmtParts(parts, "hour")
  const minute = fmtParts(parts, "minute")
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/**
 * 判断 publishedAt 是否落在北京时间"今天"（ref 为参考时刻）。
 */
export function isCnToday(publishedAt: string, ref = new Date()): boolean {
  const d = new Date(publishedAt)
  if (Number.isNaN(d.getTime())) return false
  return cnDateKey(d.getTime()) === cnDateKey(ref.getTime())
}
