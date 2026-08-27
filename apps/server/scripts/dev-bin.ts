#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off - this is the process bootstrap before Effect runs.
import * as NodeChildProcess from "node:child_process";
import * as NodeProcess from "node:process";

import { isEntrypoint } from "../src/entrypoint.ts";

export function devServerNodeArgs(watch: string | undefined): ReadonlyArray<string> {
  const normalized = watch?.trim().toLowerCase();
  return normalized === "0" || normalized === "false" ? ["src/bin.ts"] : ["--watch", "src/bin.ts"];
}

if (
  isEntrypoint({
    moduleUrl: import.meta.url,
    entryPath: NodeProcess.argv[1],
    runtimeMain: import.meta.main,
  })
) {
  const child = NodeChildProcess.spawn(
    NodeProcess.execPath,
    devServerNodeArgs(NodeProcess.env.T3CODE_DEV_SERVER_WATCH),
    { stdio: "inherit" },
  );

  child.once("error", (error) => {
    NodeProcess.stderr.write(`${String(error)}\n`);
    NodeProcess.exit(1);
  });
  child.once("exit", (code) => {
    NodeProcess.exit(code ?? 1);
  });
}
