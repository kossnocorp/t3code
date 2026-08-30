import { assert, describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DEFAULT_SERVER_SETTINGS, VcsRepositoryDetectionError } from "@t3tools/contracts";

import * as GitManager from "./GitManager.ts";
import * as GitWorkflowService from "./GitWorkflowService.ts";
import * as Worktrunk from "./Worktrunk.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as ServerSettingsService from "../serverSettings.ts";

function makeLayer(input: {
  readonly detect: VcsDriverRegistry.VcsDriverRegistry["Service"]["detect"];
  readonly resolve?: VcsDriverRegistry.VcsDriverRegistry["Service"]["resolve"];
  readonly serverSettings?: Partial<ServerSettingsService.ServerSettingsService["Service"]>;
  readonly gitManager?: Partial<GitManager.GitManager["Service"]>;
}) {
  return GitWorkflowService.layer.pipe(
    Layer.provide(
      Layer.mock(ServerSettingsService.ServerSettingsService)({
        ...input.serverSettings,
      }),
    ),
    Layer.provide(
      Layer.mock(VcsDriverRegistry.VcsDriverRegistry)({
        detect: input.detect,
        ...(input.resolve ? { resolve: input.resolve } : {}),
      }),
    ),
    Layer.provide(Layer.mock(GitVcsDriver.GitVcsDriver)({})),
    Layer.provide(Layer.mock(GitManager.GitManager)({ ...input.gitManager })),
    Layer.provide(Layer.mock(Worktrunk.Worktrunk)({})),
  );
}

describe("GitWorkflowService", () => {
  it.effect("generates a semantic creation branch for temporary Worktrunk branches", () => {
    const generateWorktreeBranchName = vi.fn(() => Effect.succeed("t3code/reconnect-spinner"));

    return Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const branch = yield* workflow.resolveWorktreeCreationBranch({
        cwd: "/repo",
        branch: "t3code/deadbeef",
        message: "Fix the reconnect spinner",
      });

      assert.equal(branch, "t3code/reconnect-spinner");
      expect(generateWorktreeBranchName).toHaveBeenCalledWith({
        cwd: "/repo",
        message: "Fix the reconnect spinner",
      });
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.succeed(null),
          resolve: () => Effect.succeed({ kind: "git" } as VcsDriverRegistry.VcsDriverHandle),
          serverSettings: {
            getSettings: Effect.succeed({
              ...DEFAULT_SERVER_SETTINGS,
              worktrunkEnabled: true,
            }),
          },
          gitManager: { generateWorktreeBranchName },
        }),
      ),
    );
  });

  it.effect("keeps temporary creation branches when Worktrunk is disabled", () =>
    Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const branch = yield* workflow.resolveWorktreeCreationBranch({
        cwd: "/repo",
        branch: "t3code/deadbeef",
        message: "Fix the reconnect spinner",
      });

      assert.equal(branch, "t3code/deadbeef");
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.succeed(null),
          serverSettings: {
            getSettings: Effect.succeed({
              ...DEFAULT_SERVER_SETTINGS,
              worktrunkEnabled: false,
            }),
          },
        }),
      ),
    ),
  );

  it.effect("recognizes temporary creation branches with a custom prefix", () => {
    const generateWorktreeBranchName = vi.fn(() => Effect.succeed("agent/reconnect-spinner"));

    return Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const branch = yield* workflow.resolveWorktreeCreationBranch({
        cwd: "/repo",
        branch: "agent/deadbeef",
        message: "Fix the reconnect spinner",
      });

      assert.equal(branch, "agent/reconnect-spinner");
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.succeed(null),
          resolve: () => Effect.succeed({ kind: "git" } as VcsDriverRegistry.VcsDriverHandle),
          serverSettings: {
            getSettings: Effect.succeed({
              ...DEFAULT_SERVER_SETTINGS,
              branchPrefix: "agent/",
              worktrunkEnabled: true,
            }),
          },
          gitManager: { generateWorktreeBranchName },
        }),
      ),
    );
  });

  it.effect("keeps semantic creation branches after resolving the configured prefix", () => {
    let settingsReads = 0;

    return Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const branch = yield* workflow.resolveWorktreeCreationBranch({
        cwd: "/repo",
        branch: "t3code/reconnect-spinner",
        message: "Fix the reconnect spinner",
      });

      assert.equal(branch, "t3code/reconnect-spinner");
      assert.equal(settingsReads, 1);
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.succeed(null),
          serverSettings: {
            getSettings: Effect.sync(() => {
              settingsReads += 1;
              return DEFAULT_SERVER_SETTINGS;
            }),
          },
        }),
      ),
    );
  });

  it.effect("returns an empty local status when no VCS repository is detected", () =>
    Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const status = yield* workflow.localStatus({ cwd: "/not-a-repo" });

      assert.deepStrictEqual(status, {
        isRepo: false,
        hasPrimaryRemote: false,
        isDefaultRef: false,
        refName: null,
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
      });
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.succeed(null),
        }),
      ),
    ),
  );

  it.effect("returns an empty full status when no VCS repository is detected", () =>
    Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const status = yield* workflow.status({ cwd: "/not-a-repo" });

      assert.deepStrictEqual(status, {
        isRepo: false,
        hasPrimaryRemote: false,
        isDefaultRef: false,
        refName: null,
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 0,
        behindCount: 0,
        aheadOfDefaultCount: 0,
        pr: null,
      });
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.succeed(null),
        }),
      ),
    ),
  );

  it.effect("does not call GitManager status methods when no VCS repository is detected", () => {
    const localStatus = vi.fn();
    const remoteStatus = vi.fn();
    const status = vi.fn();

    const testLayer = GitWorkflowService.layer.pipe(
      Layer.provide(Layer.mock(ServerSettingsService.ServerSettingsService)({})),
      Layer.provide(
        Layer.mock(VcsDriverRegistry.VcsDriverRegistry)({
          detect: () => Effect.succeed(null),
        }),
      ),
      Layer.provide(Layer.mock(GitVcsDriver.GitVcsDriver)({})),
      Layer.provide(
        Layer.mock(GitManager.GitManager)({
          localStatus,
          remoteStatus,
          status,
        }),
      ),
      Layer.provide(Layer.mock(Worktrunk.Worktrunk)({})),
    );

    return Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      yield* workflow.localStatus({ cwd: "/not-a-repo" });
      yield* workflow.remoteStatus({ cwd: "/not-a-repo" });
      yield* workflow.status({ cwd: "/not-a-repo" });

      assert.equal(localStatus.mock.calls.length, 0);
      assert.equal(remoteStatus.mock.calls.length, 0);
      assert.equal(status.mock.calls.length, 0);
    }).pipe(Effect.provide(testLayer));
  });

  it.effect("returns an empty ref list when no VCS repository is detected", () =>
    Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const refs = yield* workflow.listRefs({ cwd: "/not-a-repo" });

      assert.deepStrictEqual(refs, {
        refs: [],
        isRepo: false,
        hasPrimaryRemote: false,
        nextCursor: null,
        totalCount: 0,
      });
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.succeed(null),
        }),
      ),
    ),
  );

  it.effect("structures workflow detection failures without exposing upstream details", () => {
    const cause = new VcsRepositoryDetectionError({
      operation: "VcsDriverRegistry.detect",
      cwd: "/repo",
      detail: "upstream detail must stay in the cause chain",
    });

    return Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const error = yield* workflow.status({ cwd: "/repo" }).pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "GitManagerError",
        operation: "GitWorkflowService.status",
        cwd: "/repo",
        detail: "Failed to detect a VCS repository for this Git workflow.",
      });
      expect(error.message).not.toContain(cause.detail);
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.fail(cause),
        }),
      ),
    );
  });

  it.effect("structures command detection failures without exposing upstream details", () => {
    const cause = new VcsRepositoryDetectionError({
      operation: "VcsDriverRegistry.detect",
      cwd: "/repo",
      detail: "upstream command detail must stay in the cause chain",
    });

    return Effect.gen(function* () {
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const error = yield* workflow.listRefs({ cwd: "/repo" }).pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "GitCommandError",
        operation: "GitWorkflowService.listRefs",
        command: "vcs-route",
        cwd: "/repo",
        detail: "Failed to detect a VCS repository for this Git command.",
      });
      expect(error.message).not.toContain(cause.detail);
    }).pipe(
      Effect.provide(
        makeLayer({
          detect: () => Effect.fail(cause),
        }),
      ),
    );
  });
});
