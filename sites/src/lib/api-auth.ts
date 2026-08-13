import { NextResponse } from "next/server"

/**
 * 管理 API 统一鉴权：INGEST_SECRET 未配置时一律禁用（503），
 * 配置后接受 X-Ingest-Secret 头或 Authorization: Bearer 头（兼容 Vercel CRON_SECRET）。
 * 返回 null 表示放行，否则直接返回该响应。
 */
export function requireIngestSecret(request: Request): NextResponse | null {
  const secret = process.env.INGEST_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      { error: "INGEST_SECRET 未配置，管理 API 已禁用" },
      { status: 503 }
    )
  }
  const headerSecret = request.headers.get("x-ingest-secret")
  const auth = request.headers.get("authorization")
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null
  if (headerSecret !== secret && bearer !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return null
}
