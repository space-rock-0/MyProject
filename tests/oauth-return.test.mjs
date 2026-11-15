import test from "node:test";
import assert from "node:assert/strict";
import { checkRequest, isDrafterDocumentNavigation } from "../src/lib/origin-guard.mjs";

const navigation = {
  method: "GET", pathname: "/drafter", secFetchMode: "navigate", secFetchDest: "document",
};
function decision(request, host = "localhost:3000") {
  return checkRequest({
    secFetchSite: isDrafterDocumentNavigation(request) ? "none" : "cross-site",
    origin: null, host, allowedHosts: new Set(), allowedOrigins: new Set(),
  });
}

test("Google redirect chain can finish on the Drafter document", () => {
  assert.equal(decision(navigation).ok, true);
  assert.equal(isDrafterDocumentNavigation({ ...navigation, pathname: new URL("https://example.com/drafter?gmail=connected").pathname }), true);
});

test("the navigation exception does not allow cross-site API calls, writes or frames", () => {
  for (const override of [
    { method: "POST" }, { method: "PUT" }, { method: "DELETE" },
    { pathname: "/api/personal-drafter/meta" }, { pathname: "/api/job-tracker" },
    { secFetchMode: "cors", secFetchDest: "empty" },
    { secFetchDest: "iframe" }, { secFetchMode: null, secFetchDest: null },
  ]) assert.equal(decision({ ...navigation, ...override }).ok, false);
});

test("OAuth return still checks the destination host", () => {
  assert.equal(decision(navigation, "untrusted.example").ok, false);
});
