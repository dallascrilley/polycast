import type {
  CommandDelegation,
  CommandTarget,
  CrossTargetHints,
  ToolboxEffectClass,
} from "./types.ts";

type SensitiveEffectAdmission = "direct" | "confirmation" | "deny";

interface ToolboxSurfaceCapability {
  readonly canonicalOutput: boolean;
  readonly sensitiveEffects: SensitiveEffectAdmission;
}

/**
 * Polycast-owned surface facts for the Toolbox adapter contract. These describe
 * launcher invocation and result handling only; Toolbox still owns command
 * behavior, policy, validation, state, and receipts.
 */
const TOOLBOX_SURFACE_CAPABILITIES = {
  "raycast-script": { canonicalOutput: true, sensitiveEffects: "confirmation" },
  popclip: { canonicalOutput: true, sensitiveEffects: "deny" },
  dropzone: { canonicalOutput: true, sensitiveEffects: "deny" },
  "dropover-script": { canonicalOutput: true, sensitiveEffects: "deny" },
  "shortcuts-cherri": { canonicalOutput: true, sensitiveEffects: "deny" },
  "shortcuts-remote-ssh": { canonicalOutput: true, sensitiveEffects: "deny" },
  "termux-shortcut": { canonicalOutput: true, sensitiveEffects: "deny" },
  "raycast-snippet": { canonicalOutput: false, sensitiveEffects: "deny" },
  "raycast-quicklink": { canonicalOutput: false, sensitiveEffects: "deny" },
  "agent-cli": { canonicalOutput: true, sensitiveEffects: "direct" },
} as const satisfies Record<CommandTarget, ToolboxSurfaceCapability>;

export type ToolboxTargetCompatibility =
  | { readonly compatible: true }
  | { readonly compatible: false; readonly reason: string };

const SENSITIVE_TOOLBOX_EFFECTS: readonly ToolboxEffectClass[] = ["mutate", "integrate"];

export interface ToolboxCompatibilityInput {
  readonly delegation?: CommandDelegation;
  readonly x?: Pick<CrossTargetHints, "raycast">;
}

/** Check only the Toolbox delegation semantics for one existing Polycast target. */
export function toolboxTargetCompatibility(
  cmd: ToolboxCompatibilityInput,
  target: CommandTarget,
): ToolboxTargetCompatibility {
  if (cmd.delegation?.kind !== "toolbox") return { compatible: true };

  const capability = TOOLBOX_SURFACE_CAPABILITIES[target];
  const raycastMode = cmd.x?.raycast?.mode ?? "fullOutput";
  if (
    cmd.delegation.output !== "canonical" ||
    !capability.canonicalOutput ||
    (target === "raycast-script" && raycastMode !== "fullOutput")
  ) {
    return {
      compatible: false,
      reason: "surface does not preserve canonical Toolbox output and failure semantics",
    };
  }

  if (!SENSITIVE_TOOLBOX_EFFECTS.includes(cmd.delegation.effectClass)) {
    return { compatible: true };
  }
  if (capability.sensitiveEffects === "deny") {
    return {
      compatible: false,
      reason: `effect class "${cmd.delegation.effectClass}" requires a confirmation-capable local surface`,
    };
  }
  if (
    capability.sensitiveEffects === "confirmation" &&
    cmd.x?.raycast?.needsConfirmation !== true
  ) {
    return {
      compatible: false,
      reason: `effect class "${cmd.delegation.effectClass}" requires x.raycast.needsConfirmation: true`,
    };
  }
  return { compatible: true };
}
