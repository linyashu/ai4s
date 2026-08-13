import { createHmac, timingSafeEqual } from "node:crypto"

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60

function secret(): string {
  const s = process.env.IMG_PROXY_SECRET?.trim()
  if (!s) {
    throw new Error("IMG_PROXY_SECRET 未配置，图片代理已禁用")
  }
  return s
}

export function signProxyUrl(targetUrl: string, mode = "img", exp = Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS): string {
  const sig = createHmac("sha256", secret())
    .update(`${targetUrl}|${mode}|${exp}`)
    .digest("hex")
    .slice(0, 32)
  const params = new URLSearchParams({
    u: targetUrl,
    mode,
    exp: String(exp),
    sig,
  })
  return `?${params.toString()}`
}

export function verifyProxySig(targetUrl: string, mode: string, exp: number, sig: string): boolean {
  if (!targetUrl || !sig) return false
  if (!process.env.IMG_PROXY_SECRET?.trim()) return false
  if (Date.now() / 1000 > exp) return false
  try {
    new URL(targetUrl)
  } catch {
    return false
  }
  const expected = createHmac("sha256", process.env.IMG_PROXY_SECRET)
    .update(`${targetUrl}|${mode}|${exp}`)
    .digest("hex")
    .slice(0, 32)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}
