import { defineToolboxCommand } from "../../src/toolbox-adapter.ts";
import type { CommandDef } from "../../src/types.ts";

/** A stable no-match query keeps the two-surface proof deterministic. */
export const KNOWLEDGE_PROOF_QUERY = "wks-1529-polycast-surface-proof-unique";

/**
 * The reference Knowledge binding is intentionally a test fixture: the
 * canonical Toolbox path is setup-time machine state, not a portable command
 * source checked into Polycast's sample pack.
 */
export function knowledgeCommand(executable: string): CommandDef {
  return defineToolboxCommand({
    id: "toolbox-knowledge-search",
    title: "Search Toolbox Knowledge",
    description: "Search the canonical Toolbox knowledge store.",
    executable,
    fixedArgv: ["knowledge", "--json", "search"],
    modality: "args",
    args: [{ name: "query", placeholder: "Search terms" }],
    effectClass: "inspect",
    output: "canonical",
    targets: ["raycast-script", "agent-cli"],
  });
}
