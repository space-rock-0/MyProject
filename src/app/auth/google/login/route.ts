import { loginUrl } from "@/lib/pd-gmail.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const redirect = process.env.PD_GOOGLE_REDIRECT_URI || `${origin}/auth/google/callback`;
    return Response.redirect(loginUrl(redirect), 302);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Gmail not configured" },
      { status: 400 },
    );
  }
}
