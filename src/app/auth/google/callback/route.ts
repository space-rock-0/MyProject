import { finishLogin } from "@/lib/pd-gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const origin = host && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
      ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}`
      : url.origin;
    const redirect = process.env.PD_GOOGLE_REDIRECT_URI || `${origin}/auth/google/callback`;
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing code from Google");
    await finishLogin(code, redirect);
    return Response.redirect(new URL("/drafter?gmail=connected", req.url), 302);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Google sign-in failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
