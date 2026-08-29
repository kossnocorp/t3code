import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as ServerSettings from "../serverSettings.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as Worktrunk from "./Worktrunk.ts";

const input = {
  cwd: "/workspace/project",
  refName: "main",
  newRefName: "t3code/deadbeef",
  baseRefName: "main",
  path: null,
} as const;

const makeLayer = (options: {
  readonly enabled: boolean;
  readonly run: VcsProcess.VcsProcess["Service"]["run"];
}) =>
  Worktrunk.layer.pipe(
    Layer.provide(
      ServerSettings.ServerSettingsService.layerTest({ worktrunkEnabled: options.enabled }),
    ),
    Layer.provide(Layer.mock(VcsProcess.VcsProcess)({ run: options.run })),
  );

describe("Worktrunk", () => {
  it.effect("runs wt switch for a new worktree when enabled", () => {
    const run = vi.fn(() =>
      Effect.succeed({
        exitCode: ChildProcessSpawner.ExitCode(0),
        stdout: JSON.stringify({
          action: "created",
          branch: "t3code/deadbeef",
          path: "/workspace/project.t3code-deadbeef",
        }),
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      }),
    );

    return Effect.gen(function* () {
      const worktrunk = yield* Worktrunk.Worktrunk;
      const result = yield* worktrunk.createWorktree(input);

      expect(result).toEqual(
        Option.some({
          worktree: {
            refName: "t3code/deadbeef",
            path: "/workspace/project.t3code-deadbeef",
          },
        }),
      );
      expect(run).toHaveBeenCalledWith({
        operation: "Worktrunk.createWorktree",
        command: "wt",
        args: ["switch", "--format", "json", "--create", "--no-cd", "t3code/deadbeef"],
        cwd: "/workspace/project",
        timeoutMs: 120_000,
        maxOutputBytes: 64_000,
      });
    }).pipe(Effect.provide(makeLayer({ enabled: true, run })));
  });

  it.effect("leaves creation to Git when disabled", () => {
    const run = vi.fn();
    return Effect.gen(function* () {
      const worktrunk = yield* Worktrunk.Worktrunk;
      expect(yield* worktrunk.createWorktree(input)).toEqual(Option.none());
      expect(run).not.toHaveBeenCalled();
    }).pipe(Effect.provide(makeLayer({ enabled: false, run })));
  });

  it.effect("leaves explicit recovery paths to Git", () => {
    const run = vi.fn();
    return Effect.gen(function* () {
      const worktrunk = yield* Worktrunk.Worktrunk;
      expect(yield* worktrunk.createWorktree({ ...input, path: "/workspace/recovered" })).toEqual(
        Option.none(),
      );
      expect(run).not.toHaveBeenCalled();
    }).pipe(Effect.provide(makeLayer({ enabled: true, run })));
  });
});
