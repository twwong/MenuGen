import { z } from "zod";

export const menuStateSchema = z.enum([
  "uploading",
  "preflight",
  "extracting",
  "review_ready",
  "generation_ready",
  "generating",
  "ready",
  "deleting",
  "deleted",
  "failed",
]);

export const itemStateSchema = z.enum([
  "pending",
  "source_photo_ready",
  "generation_eligible",
  "generating",
  "generated",
  "failed",
  "not_eligible",
]);

export const jobStateSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "partially_succeeded",
  "failed",
  "cancelled",
]);

export type MenuState = z.infer<typeof menuStateSchema>;
export type ItemState = z.infer<typeof itemStateSchema>;
export type JobState = z.infer<typeof jobStateSchema>;

const menuTransitions: Readonly<Record<MenuState, readonly MenuState[]>> = {
  uploading: ["preflight", "deleting", "failed"],
  preflight: ["extracting", "deleting", "failed"],
  extracting: ["review_ready", "deleting", "failed"],
  review_ready: ["generation_ready", "deleting"],
  generation_ready: ["generating", "review_ready", "deleting", "failed"],
  generating: ["ready", "deleting", "failed"],
  ready: ["deleting"],
  deleting: ["deleted"],
  deleted: [],
  failed: ["preflight", "extracting", "review_ready", "deleting"],
};

const itemTransitions: Readonly<Record<ItemState, readonly ItemState[]>> = {
  pending: [
    "source_photo_ready",
    "generation_eligible",
    "not_eligible",
    "failed",
  ],
  source_photo_ready: [],
  generation_eligible: ["generating", "not_eligible"],
  generating: ["generated", "failed"],
  generated: ["generating"],
  failed: ["generating"],
  not_eligible: ["generation_eligible"],
};

export class InvalidStateTransitionError extends Error {
  constructor(entity: "menu" | "item", from: string, to: string) {
    super(`Invalid ${entity} state transition: ${from} -> ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

export function assertMenuTransition(from: MenuState, to: MenuState): void {
  if (!menuTransitions[from].includes(to)) {
    throw new InvalidStateTransitionError("menu", from, to);
  }
}

export function assertItemTransition(from: ItemState, to: ItemState): void {
  if (!itemTransitions[from].includes(to)) {
    throw new InvalidStateTransitionError("item", from, to);
  }
}

export function isMenuTerminal(state: MenuState): boolean {
  return state === "ready" || state === "deleted" || state === "failed";
}
