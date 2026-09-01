export interface WorktreeOption {
  readonly value: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly keywords: readonly string[];
}

interface WorktreeRecord {
  readonly path: string;
  readonly displayName?: string;
  readonly branch?: string;
  readonly isArchived?: boolean;
  readonly lastActivityAt?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWorktree(value: unknown): WorktreeRecord | null {
  if (!isRecord(value) || typeof value.path !== "string" || !value.path) return null;
  if (value.displayName !== undefined && typeof value.displayName !== "string") return null;
  if (value.branch !== undefined && typeof value.branch !== "string") return null;
  if (value.isArchived !== undefined && typeof value.isArchived !== "boolean") return null;
  if (value.lastActivityAt !== undefined && typeof value.lastActivityAt !== "number") return null;

  const worktree: {
    path: string;
    displayName?: string;
    branch?: string;
    isArchived?: boolean;
    lastActivityAt?: number;
  } = { path: value.path };
  if (value.displayName !== undefined) worktree.displayName = value.displayName;
  if (value.branch !== undefined) worktree.branch = value.branch;
  if (value.isArchived !== undefined) worktree.isArchived = value.isArchived;
  if (value.lastActivityAt !== undefined) worktree.lastActivityAt = value.lastActivityAt;
  return worktree;
}

function activityTime(worktree: WorktreeRecord): number | undefined {
  return typeof worktree.lastActivityAt === "number" && Number.isFinite(worktree.lastActivityAt)
    ? worktree.lastActivityAt
    : undefined;
}

function keywordsFor(worktree: WorktreeRecord, branch: string | undefined): string[] {
  const keywords = new Set<string>();
  if (branch) {
    keywords.add(branch);
    for (const part of branch.split(/[\\/:_-]+/)) {
      if (part) keywords.add(part);
    }
  }
  for (const part of worktree.path.split(/[\\/]+/)) {
    if (part) keywords.add(part);
  }
  return [...keywords];
}

export function parseWorktreeOptions(raw: string): WorktreeOption[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.ok !== true || !isRecord(parsed.result)) return [];
    if (!Array.isArray(parsed.result.worktrees)) return [];

    const worktrees: WorktreeRecord[] = [];
    for (const value of parsed.result.worktrees) {
      const worktree = parseWorktree(value);
      if (worktree && !worktree.isArchived) worktrees.push(worktree);
    }

    worktrees.sort((left, right) => {
      const leftTime = activityTime(left);
      const rightTime = activityTime(right);
      if (leftTime === undefined && rightTime === undefined) return 0;
      if (leftTime === undefined) return 1;
      if (rightTime === undefined) return -1;
      return rightTime - leftTime;
    });

    return worktrees.map((worktree) => {
      const branch = worktree.branch?.replace(/^refs\/heads\//, "");
      const option: {
        value: string;
        title: string;
        subtitle?: string;
        keywords: readonly string[];
      } = {
        value: `path:${worktree.path}`,
        title: worktree.displayName ?? worktree.path,
        keywords: keywordsFor(worktree, branch),
      };
      if (branch) option.subtitle = branch;
      return option;
    });
  } catch {
    return [];
  }
}
