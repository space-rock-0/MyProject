import { loginUrl } from "@/lib/pd-gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Derive the PUBLIC origin from forwarded headers, never from the raw socket
// (the raw socket is the container's 0.0.0.0:10000 on Render, which Google neither
// knows nor authorizes).
function publicOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  try {
    const origin = publicOrigin(req);
    const redirect = process.env.PD_GOOGLE_REDIRECT_URI || `${origin}/auth/google/callback`;
    return Response.redirect(loginUrl(redirect), 302);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Gmail not configured" },
      { status: 400 },
    );
  }
}
