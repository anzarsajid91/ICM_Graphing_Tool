import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";
const source = fs.readFileSync("web/assets/workbench-v2.js", "utf8");
const helper = source.slice(
  source.indexOf("  let webGLAvailable;"),
  source.indexOf("  function displayPointBudget"),
);
assert.ok(helper.includes("function timeGraphTraceType"));
for (const available of [true, false]) {
  let created = 0,
    lost = 0;
  const sandbox = {
    document: {
      createElement: () => {
        created++;
        return {
          getContext: () =>
            available
              ? { getExtension: () => ({ loseContext: () => lost++ }) }
              : null,
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(helper, sandbox);
  const type = (count) =>
    vm.runInContext(
      "timeGraphTraceType({display_count:" + count + "})",
      sandbox,
    );
  assert.equal(type(24), "scatter");
  assert.equal(type(8000), "scatter");
  assert.equal(created, 0);
  assert.equal(type(8001), available ? "scattergl" : "scatter");
  assert.equal(type(120000), available ? "scattergl" : "scatter");
  assert.equal(created, 1);
  assert.equal(lost, available ? 1 : 0);
}
console.log(
  "Adaptive graph renderer: SVG for small traces and unavailable WebGL; one released capability probe for large traces.",
);
