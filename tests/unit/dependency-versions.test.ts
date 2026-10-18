import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Minimum versions that fix known advisories. A downgrade below these brings back:
// next < 16.4.2: RCE GHSA-2xp9-vwfh-vxw4, GHSA-vcvr-r3jv-pc5j, middleware bypass GHSA-6gpp-xcg3-4w24 and others;
// next-auth <= 5.0.0-beta.31 / @auth/core <= 0.41.2: GHSA-8fpg-xm3f-6cx3, GHSA-x445-f3h2-j279 and others.
const MINIMUM: Record<string, string> = {
  next: "16.4.2",
  "eslint-config-next": "16.4.2",
  "next-auth": "5.0.0-beta.32",
  "@auth/core": "0.41.3",
};

function installed(name: string): string {
  const file = path.resolve(__dirname, "../../node_modules", name, "package.json");
  return JSON.parse(fs.readFileSync(file, "utf8")).version;
}

// Enough of semver for x.y.z and x.y.z-tag.N.
function compare(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split("-");
    const nums = core.split(".").map(Number);
    const preNum = pre ? Number(pre.split(".").pop()) : Infinity; // release > any prerelease
    return [...nums, preNum];
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

describe("patched dependency versions", () => {
  it("compares versions correctly", () => {
    expect(compare("16.2.6", "16.4.2")).toBe(-1);
    expect(compare("16.4.2", "16.4.2")).toBe(0);
    expect(compare("5.0.0-beta.31", "5.0.0-beta.32")).toBe(-1);
    expect(compare("5.0.0", "5.0.0-beta.32")).toBe(1);
  });

  for (const [name, min] of Object.entries(MINIMUM)) {
    it(`${name} is at least ${min}`, () => {
      expect(compare(installed(name), min)).toBeGreaterThanOrEqual(0);
    });
  }
});
