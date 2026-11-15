import { finishLogin } from "@/lib/pd-gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const cookie = req.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("pd_oauth_state="))?.slice("pd_oauth_state=".length);
    if (!state || !cookie || state !== cookie) throw new Error("Sign-in expired or could not be verified. Connect Gmail again.");
    if (url.searchParams.has("error")) throw new Error("Google sign-in was cancelled. Connect Gmail again when ready.");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const origin = host && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
      ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}`
      : url.origin;
    const redirect = process.env.PD_GOOGLE_REDIRECT_URI || `${origin}/auth/google/callback`;
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing code from Google");
    await finishLogin(code, redirect);
    return new Response(null, { status: 302, headers: { Location: new URL("/drafter?gmail=connected", origin).toString(), "Set-Cookie": "pd_oauth_state=; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=0" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Google sign-in failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
