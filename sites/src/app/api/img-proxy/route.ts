import { verifyProxySig } from "@/lib/img-sign"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const MAX_BODY_BYTES = 5 * 1024 * 1024

const ALLOWED_HOSTS = new Set([
  "pbs.twimg.com",
  "abs.twimg.com",
  "video.twimg.com",
  "images.unsplash.com",
  "static.wixstatic.com",
  "media.githubusercontent.com",
])

function isAllowedHost(hostname: string): boolean {
  return (
    ALLOWED_HOSTS.has(hostname) ||
    hostname.endsWith(".twitter.com") ||
    hostname.endsWith(".twimg.com")
  )
}

export async function GET(request: Request) {
  if (!process.env.IMG_PROXY_SECRET?.trim()) {
    return new Response("img proxy disabled: IMG_PROXY_SECRET not configured", { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const target = searchParams.get("u")
  const mode = searchParams.get("mode") ?? "img"
  const exp = Number(searchParams.get("exp") ?? 0)
  const sig = searchParams.get("sig") ?? ""

  if (!target || !verifyProxySig(target, mode, exp, sig)) {
    return new Response("invalid signature", { status: 403 })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return new Response("bad url", { status: 400 })
  }

  const isImage = mode === "avatar" || mode === "img"
  if (isImage && !isAllowedHost(parsed.hostname)) {
    return new Response("host not allowed", { status: 403 })
  }
  if (!isImage && !isAllowedHost(parsed.hostname)) {
    return new Response("host not allowed", { status: 403 })
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return new Response("unsupported protocol", { status: 403 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    const res = await fetch(target, {
      headers: {
        "User-Agent": "ai4s-img-proxy/0.1",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    })
    clearTimeout(timer)

    if (!res.ok) {
      return new Response(`upstream ${res.status}`, { status: res.status })
    }

    const contentType = res.headers.get("Content-Type") ?? ""
    if (isImage && !contentType.startsWith("image/")) {
      return new Response("upstream content is not an image", { status: 415 })
    }

    const contentLength = Number(res.headers.get("Content-Length") ?? 0)
    if (contentLength > MAX_BODY_BYTES) {
      return new Response("upstream image too large", { status: 413 })
    }

    const body = await res.arrayBuffer()
    if (body.byteLength > MAX_BODY_BYTES) {
      return new Response("upstream image too large", { status: 413 })
    }
    return new Response(body, {
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (err) {
    return new Response(
      `proxy failed: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 502 }
    )
  }
}
