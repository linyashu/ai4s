import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { dbUpsertVote } from "@/lib/db"

export const dynamic = "force-dynamic"

const SESSION_COOKIE = "ai4s_session"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function getSessionId(request: Request): { sessionId: string; isNew: boolean } {
  const existing = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === SESSION_COOKIE)?.[1]
  if (existing && /^[a-zA-Z0-9-]{8,64}$/.test(existing)) {
    return { sessionId: existing, isNew: false }
  }
  return { sessionId: randomUUID(), isNew: true }
}

export async function POST(request: Request) {
  let body: { itemId?: string; value?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }

  const itemId = typeof body.itemId === "string" ? body.itemId.trim().slice(0, 160) : ""
  const value = body.value === -1 ? -1 : body.value === 1 ? 1 : 0
  if (!itemId || value === 0) {
    return NextResponse.json({ error: "itemId 与 value(±1) 必填" }, { status: 400 })
  }

  const { sessionId, isNew } = getSessionId(request)
  const votes = await dbUpsertVote(itemId, sessionId, value)

  const res = NextResponse.json({ ok: true, votes })
  if (isNew) {
    res.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    })
  }
  return res
}
