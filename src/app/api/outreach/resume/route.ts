import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { resolveDriveDir, resumePdfPath } from "@/lib/outreach/drive.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve one of the four original résumé PDFs.
 *
 * `key` is validated against the four known variants and the path is re-derived
 * from the catalog, so the query string can never reach an arbitrary file.
 * `mode=view` opens it in the browser; the default downloads it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const mode = url.searchParams.get("mode") === "view" ? "inline" : "attachment";

  const drive = resolveDriveDir({ dataRoot: careerOpsRoot() });
  if (!drive) {
    return Response.json({ error: "Personal Drive not found" }, { status: 404 });
  }
  const file = resumePdfPath(drive, key);
  if (!file) {
    return Response.json({ error: `No PDF for résumé "${key}" in Resume_org/` }, { status: 404 });
  }

  let data: Buffer;
  try {
    data = fs.readFileSync(file);
  } catch {
    return Response.json({ error: "Résumé PDF could not be read" }, { status: 500 });
  }

  const filename = path.basename(file).replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `${mode}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
