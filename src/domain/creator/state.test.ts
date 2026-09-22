import { describe, expect, it } from "vitest";

import {
  InvalidStateTransitionError,
  assertItemTransition,
  assertMenuTransition,
} from "@/domain/creator/state";

describe("creator state transitions", () => {
  it("allows the normal creator path", () => {
    expect(() =>
      assertMenuTransition("review_ready", "generation_ready"),
    ).not.toThrow();
    expect(() =>
      assertItemTransition("generation_eligible", "generating"),
    ).not.toThrow();
    expect(() => assertItemTransition("generating", "generated")).not.toThrow();
  });

  it("prevents editing by returning to review during active generation", () => {
    expect(() => assertMenuTransition("generating", "review_ready")).toThrow(
      InvalidStateTransitionError,
    );
  });
});
