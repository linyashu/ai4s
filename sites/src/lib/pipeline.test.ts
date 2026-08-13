import { describe, expect, it } from "vitest"
import { normalizeUrl } from "./pipeline"

describe("pipeline.normalizeUrl", () => {
  it("剔除 utm 系列参数", () => {
    expect(
      normalizeUrl("https://example.com/a?utm_source=twitter&utm_medium=social&id=1")
    ).toBe("https://example.com/a?id=1")
  })

  it("剔除 fbclid/gclid", () => {
    expect(normalizeUrl("https://example.com/a?fbclid=xxx&b=2")).toBe(
      "https://example.com/a?b=2"
    )
  })

  it("剔除 hash 片段", () => {
    expect(normalizeUrl("https://example.com/a#section")).toBe(
      "https://example.com/a"
    )
  })

  it("无参数 URL 原样返回", () => {
    expect(normalizeUrl("https://example.com/a/b")).toBe("https://example.com/a/b")
  })

  it("非法 URL 回退为 trim 后的字符串", () => {
    expect(normalizeUrl("  not-a-url  ")).toBe("not-a-url")
  })
})
