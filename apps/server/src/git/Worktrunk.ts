import {
  GitCommandError,
  TrimmedNonEmptyString,
  type VcsCreateWorktreeInput,
  type VcsCreateWorktreeResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as VcsProcess from "../vcs/VcsProcess.ts";

const WorktrunkSwitchResult = Schema.Struct({
  branch: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
});
const decodeSwitchResult = Schema.decodeUnknownEffect(Schema.fromJsonString(WorktrunkSwitchResult));

export class Worktrunk extends Context.Service<
  Worktrunk,
  {
    readonly createWorktree: (
      input: VcsCreateWorktreeInput,
    ) => Effect.Effect<VcsCreateWorktreeResult, GitCommandError>;
  }
>()("t3/git/Worktrunk") {}

export const makeWorktrunk = Effect.gen(function* () {
  const process = yield* VcsProcess.VcsProcess;

  const createWorktree = Effect.fn("Worktrunk.createWorktree")(function* (
    input: VcsCreateWorktreeInput,
  ) {
    if (input.path !== null) {
      return yield* new GitCommandError({
        operation: "Worktrunk.createWorktree",
        command: "wt",
        cwd: input.cwd,
        detail: "Worktrunk does not support creating worktrees at a specific path.",
      });
    }

    if (!input.newRefName) {
      return yield* new GitCommandError({
        operation: "Worktrunk.createWorktree",
        command: "wt",
        cwd: input.cwd,
        detail: "Worktrunk requires a new ref name to create a worktree.",
      });
    }

    const result = yield* process
      .run({
        operation: "Worktrunk.createWorktree",
        command: "wt",
        args: ["switch", "--format", "json", "--create", "--no-cd", input.newRefName],
        cwd: input.cwd,
        timeoutMs: 120_000,
        maxOutputBytes: 64_000,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new GitCommandError({
              operation: "Worktrunk.createWorktree",
              command: "wt",
              cwd: input.cwd,
              argumentCount: 6,
              detail: "wt switch failed to create the worktree.",
              cause,
            }),
        ),
      );

    const decoded = yield* decodeSwitchResult(result.stdout).pipe(
      Effect.mapError(
        (cause) =>
          new GitCommandError({
            operation: "Worktrunk.createWorktree.decode",
            command: "wt",
            cwd: input.cwd,
            stdoutLength: result.stdout.length,
            detail: "wt switch returned an invalid JSON result.",
            cause,
          }),
      ),
    );

    return { worktree: { path: decoded.path, refName: decoded.branch } };
  });

  return Worktrunk.of({ createWorktree });
});

export const layer = Layer.effect(Worktrunk, makeWorktrunk);
