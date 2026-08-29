import * as Schema from "effect/Schema";

export const WorktreeManagerKind = Schema.Literals(["worktrunk"]);
export type WorktreeManagerKind = typeof WorktreeManagerKind.Type;
