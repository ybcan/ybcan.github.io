import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { APP_INFO } from "../docs/workbench/about.mjs";
test("browser import map covers every runtime dependency at the displayed release version", () => {
  const html = fs.readFileSync(
    new URL("../docs/index.html", import.meta.url),
    "utf8",
  );
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(match, "Versioned browser import map is required");
  const imports = JSON.parse(match[1]).imports;
  for (const name of fs
    .readdirSync(new URL("../docs/workbench/", import.meta.url))
    .filter((n) => n.endsWith(".mjs"))) {
    const text = fs.readFileSync(
      new URL("../docs/workbench/" + name, import.meta.url),
      "utf8",
    );
    for (const [, specifier] of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.ok(specifier.startsWith("#workbench/"), name + ": " + specifier);
      assert.equal(
        imports[specifier],
        "./workbench/" + specifier.split("/")[1] + ".mjs?v=" + APP_INFO.version,
      );
    }
  }
  assert.ok(html.includes("app.mjs?v=" + APP_INFO.version));
});
