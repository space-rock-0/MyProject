import path from "node:path";

// Deployment-friendly data directory. Defaults to the checkout's data/ folder;
// override with CAREER_OPS_DATA_DIR to point at a persistent volume elsewhere
// (e.g. /var/data/career-ops on Render, or a mounted disk).
export const DATA_DIR = process.env.CAREER_OPS_DATA_DIR
  ? path.resolve(process.env.CAREER_OPS_DATA_DIR)
  : path.join(process.cwd(), "data");
