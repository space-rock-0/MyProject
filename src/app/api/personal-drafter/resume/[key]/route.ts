import fs from "node:fs";
import { resumePdfs } from "@/lib/pd-config.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const pdfs = resumePdfs() as Record<string, string>;
  const p = pdfs[key.toLowerCase()];
  if (!p) return new Response("Resume not found", { status: 404 });
  const bytes = fs.readFileSync(p);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${p.split(/[\\/]/).pop()}"`,
    },
  });
}
