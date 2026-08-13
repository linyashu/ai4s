import { describe, expect, it } from "vitest"
import { cnDateKey, cnDateLabel, cnTimeLabel, isCnToday } from "./time"

describe("time.cnDateKey（北京时间）", () => {
  it("UTC 午夜 16 点 = 北京次日 0 点", () => {
    // 2026-08-13T16:00:00Z = 北京 2026-08-14 00:00
    expect(cnDateKey(Date.parse("2026-08-13T16:00:00Z"))).toBe("2026-08-14")
  })

  it("北京时间下午 = 同一天", () => {
    // 2026-08-13T06:00:00Z = 北京 2026-08-13 14:00
    expect(cnDateKey(Date.parse("2026-08-13T06:00:00Z"))).toBe("2026-08-13")
  })

  it("日期标签与时间标签正确", () => {
    const ms = Date.parse("2026-08-13T06:30:00Z")
    expect(cnDateLabel(ms)).toBe("8月13日")
    expect(cnTimeLabel(ms)).toBe("14:30")
  })
})

describe("time.isCnToday", () => {
  it("北京时间当天内容判定为今天", () => {
    // ref = 北京 2026-08-13 18:00
    const ref = new Date("2026-08-13T10:00:00Z")
    // 北京 2026-08-13 23:59 = UTC 15:59 → 今天
    expect(isCnToday("2026-08-13T15:59:00Z", ref)).toBe(true)
    // 北京 2026-08-13 00:01 = UTC 前日 16:01 → 今天
    expect(isCnToday("2026-08-12T16:01:00Z", ref)).toBe(true)
    // 北京 2026-08-12 23:59 → 昨天
    expect(isCnToday("2026-08-12T15:59:00Z", ref)).toBe(false)
  })

  it("非法日期返回 false", () => {
    expect(isCnToday("not-a-date")).toBe(false)
  })
})
