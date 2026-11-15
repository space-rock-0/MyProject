import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { readTracker, writeTracker } from "../src/lib/tracker-store.mjs";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-check-"));
const file = path.join(dir, "jobs.json");
try {
  const initial = readTracker(file);
  initial.push({ id: 1, company: "Example", role: "Engineer", status: "INBOX" });
  writeTracker(file, initial);
  const first = readTracker(file), second = readTracker(file);
  first[0].status = "APPLIED";
  writeTracker(file, first);
  second[0].company = "Stale";
  assert.throws(() => writeTracker(file, second), /changed/);
  const fresh = readTracker(file);
  fresh[0] = second[0];
  assert.throws(() => writeTracker(file, fresh), /changed elsewhere/);
  assert.equal(readTracker(file)[0].status, "APPLIED");
  assert.equal(JSON.parse(fs.readFileSync(file + ".bak", "utf8"))[0].status, "INBOX");
  fs.writeFileSync(file + ".lock", "");
  assert.throws(() => writeTracker(file, readTracker(file)), /busy/);
  fs.unlinkSync(file + ".lock");
  fs.writeFileSync(file, "{}");
  assert.throws(() => readTracker(file), /Invalid tracker/);
  console.log("PASS: persistence, concurrent updates, stale edits, backups, locks and corruption checks.");
} finally {
  for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name));
  fs.rmdirSync(dir);
}
