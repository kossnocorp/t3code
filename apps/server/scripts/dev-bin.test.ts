import { assert, describe, it } from "@effect/vitest";

import { devServerNodeArgs } from "./dev-bin.ts";

describe("devServerNodeArgs", () => {
  it("enables watch mode by default", () => {
    assert.deepStrictEqual(devServerNodeArgs(undefined), ["--watch", "src/bin.ts"]);
  });

  it.each(["0", "false", " FALSE "])("disables watch mode for %s", (value) => {
    assert.deepStrictEqual(devServerNodeArgs(value), ["src/bin.ts"]);
  });
});
