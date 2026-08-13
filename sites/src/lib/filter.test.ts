import { describe, expect, it } from "vitest"
import { isExcluded } from "./filter"

describe("filter.isExcluded", () => {
  describe("强收录信号（INCLUDE_STRONG 优先于强排除）", () => {
    it("AI 手机类内容保留（含人工智能强信号）", () => {
      expect(isExcluded("AI 手机发布：端侧大模型落地", "")).toBe(false)
    })

    it("OpenAI/大模型内容保留", () => {
      expect(isExcluded("OpenAI 发布 GPT-5", "")).toBe(false)
      expect(isExcluded("DeepSeek 开源新模型", "")).toBe(false)
    })

    it("智能驾驶/自动驾驶内容保留", () => {
      expect(isExcluded("自动驾驶出租车试点扩大", "")).toBe(false)
    })

    it("AI for Science 科研内容保留", () => {
      expect(isExcluded("科研大模型助力科学发现", "")).toBe(false)
    })
  })

  describe("强排除（消费电子硬词）", () => {
    it("手机新品发布排除", () => {
      expect(isExcluded("手机新品发布：旗舰机型亮相", "")).toBe(true)
    })

    it("游戏内容排除", () => {
      expect(isExcluded("王者荣耀新版本更新公告", "")).toBe(true)
      expect(isExcluded("某游戏引擎发布 5.0 版本", "")).toBe(true)
    })

    it("促销内容排除", () => {
      expect(isExcluded("京东 618 促销活动开始", "")).toBe(true)
    })

    it("纯汽车资讯排除", () => {
      expect(isExcluded("新车型预售开启，续航 800 公里", "")).toBe(true)
    })
  })

  describe("一般排除（无 AI 信号的科学/消费内容）", () => {
    it("生命科学排除", () => {
      expect(isExcluded("研究发现蛋白质结构新机制", "")).toBe(true)
      expect(isExcluded("新型药物临床试验获批", "")).toBe(true)
    })

    it("自然科学排除", () => {
      expect(isExcluded("台风路径预测发布", "")).toBe(true)
      expect(isExcluded("新材料突破太阳能电池效率", "")).toBe(true)
    })

    it("金融监管排除", () => {
      expect(isExcluded("SEC 公布新规", "")).toBe(true)
    })
  })

  describe("无关键词命中时保留", () => {
    it("普通 AI 行业动态通过", () => {
      expect(isExcluded("AI 行业动态速览", "")).toBe(false)
    })
  })
})
