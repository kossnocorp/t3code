import {
  WorktreeManagerDiscoveryItem,
  type SourceControlDiscoveryResult,
  type VcsDiscoveryItem,
  type VcsDriverKind,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ServerConfig } from "../config.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { detailFromCause, firstNonEmptyLine } from "./SourceControlProviderDiscovery.ts";
import * as SourceControlProviderRegistry from "./SourceControlProviderRegistry.ts";

interface DiscoveryProbe<Kind extends string> {
  readonly kind: Kind;
  readonly label: string;
  readonly executable?: string;
  readonly versionArgs?: ReadonlyArray<string>;
  readonly implemented: boolean;
  readonly installHint: string;
  readonly enableHint?: string;
  readonly enabledHint?: string;
  readonly transform?: (result: DiscoveryProbeResult<Kind>) => DiscoveryProbeResult<Kind>;
}

type VcsProbe = DiscoveryProbe<VcsDriverKind> & {
  readonly executable: string;
  readonly versionArgs: ReadonlyArray<string>;
};

type WorktreeManagerProbe = DiscoveryProbe<"worktrunk">;

interface DiscoveryProbeResult<Kind extends string> {
  readonly kind: Kind;
  readonly label: string;
  readonly executable?: string;
  readonly implemented: boolean;
  readonly status: "available" | "missing";
  readonly version: Option.Option<string>;
  readonly installHint: string;
  readonly enableHint: string | undefined;
  readonly enabledHint: string | undefined;
  readonly detail: Option.Option<string>;
}

const VCS_PROBES: ReadonlyArray<VcsProbe> = [
  {
    kind: "git",
    label: "Git",
    executable: "git",
    versionArgs: ["--version"],
    implemented: true,
    installHint: "Install Git from https://git-scm.com/downloads or with your package manager.",
  },
  {
    kind: "jj",
    label: "Jujutsu",
    executable: "jj",
    versionArgs: ["--version"],
    implemented: false,
    installHint: "Install Jujutsu with `brew install jj` or from https://github.com/jj-vcs/jj.",
  },
];

const WORKTRUNK_DOCS_SNIPPET = "See documentation at https://worktrunk.dev.";

const WORKTREE_MANAGER_PROBES: ReadonlyArray<WorktreeManagerProbe> = [
  {
    kind: "worktrunk",
    label: "Worktrunk",
    executable: "wt",
    versionArgs: ["--version"],
    implemented: true,
    installHint:
      "Install Worktrunk from https://worktrunk.dev/installation/ to use it to manage Git worktrees.",
    enableHint: `Enable Worktrunk to use it to manage Git worktrees. ${WORKTRUNK_DOCS_SNIPPET}`,
    enabledHint: `Git Worktrees are managed by Worktrunk. ${WORKTRUNK_DOCS_SNIPPET}`,
    transform: (result) => ({
      ...result,
      version: Option.map(result.version, (version) =>
        version.replace(/^wt v(?=\d)/, "wt version "),
      ),
    }),
  },
];

export class SourceControlDiscovery extends Context.Service<
  SourceControlDiscovery,
  {
    readonly discover: Effect.Effect<SourceControlDiscoveryResult>;
  }
>()("t3/sourceControl/SourceControlDiscovery") {}

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const process = yield* VcsProcess.VcsProcess;
  const sourceControlProviders = yield* SourceControlProviderRegistry.SourceControlProviderRegistry;

  const probe = <Kind extends string>(
    input: DiscoveryProbe<Kind>,
  ): Effect.Effect<DiscoveryProbeResult<Kind>> => {
    const executable = input.executable;
    const versionArgs = input.versionArgs;

    if (!executable || !versionArgs) {
      return Effect.succeed({
        kind: input.kind,
        label: input.label,
        implemented: input.implemented,
        status: "missing" as const,
        version: Option.none<string>(),
        installHint: input.installHint,
        enableHint: input.enableHint,
        enabledHint: input.enabledHint,
        detail: Option.fromUndefinedOr(input.installHint),
      } satisfies DiscoveryProbeResult<Kind>);
    }

    return process
      .run({
        operation: "source-control.discovery.probe",
        command: executable,
        args: versionArgs,
        cwd: config.cwd,
        timeoutMs: 5_000,
        maxOutputBytes: 8_000,
        appendTruncationMarker: true,
      })
      .pipe(
        Effect.map(
          (result) =>
            ({
              kind: input.kind,
              label: input.label,
              executable,
              implemented: input.implemented,
              status: "available" as const,
              version: Option.orElse(firstNonEmptyLine(result.stdout), () =>
                firstNonEmptyLine(result.stderr),
              ),
              installHint: input.installHint,
              enableHint: input.enableHint,
              enabledHint: input.enabledHint,
              detail: Option.none<string>(),
            }) satisfies DiscoveryProbeResult<Kind>,
        ),
        Effect.map((result) => (input.transform ? input.transform(result) : result)),
        Effect.catch((cause) =>
          Effect.succeed({
            kind: input.kind,
            label: input.label,
            executable,
            implemented: input.implemented,
            status: "missing" as const,
            version: Option.none<string>(),
            installHint: input.installHint,
            enableHint: input.enableHint,
            enabledHint: input.enabledHint,
            detail: detailFromCause(cause),
          } satisfies DiscoveryProbeResult<Kind>),
        ),
      );
  };

  return SourceControlDiscovery.of({
    discover: Effect.all({
      versionControlSystems: Effect.all(
        VCS_PROBES.map((entry) => probe(entry)) as ReadonlyArray<Effect.Effect<VcsDiscoveryItem>>,
        { concurrency: "unbounded" },
      ),
      sourceControlProviders: sourceControlProviders.discover,
      worktreeManagers: Effect.all(
        WORKTREE_MANAGER_PROBES.map((entry) => probe(entry)) as ReadonlyArray<
          Effect.Effect<WorktreeManagerDiscoveryItem>
        >,
        { concurrency: "unbounded" },
      ),
    }),
  });
});

export const layer = Layer.effect(SourceControlDiscovery, make);
