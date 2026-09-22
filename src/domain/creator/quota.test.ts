import { describe, expect, it } from "vitest";

import { summarizeRollingQuota, type QuotaEntry } from "@/domain/creator/quota";

const USER_ID = "user_123";
const MENU_ID = "78b51473-88d8-4c9a-9949-a279ad123876";
const RESERVATION_ID = "6679c305-e170-44f4-8461-e64cdd84d521";

function entry(
  id: string,
  kind: QuotaEntry["kind"],
  occurredAt: string,
): QuotaEntry {
  return {
    id,
    userId: USER_ID,
    menuId: MENU_ID,
    reservationId: RESERVATION_ID,
    kind,
    amount: kind === "release" ? -1 : 1,
    businessKey: `${RESERVATION_ID}:${kind}`,
    occurredAt,
    reasonCode: "generation",
  };
}

describe("summarizeRollingQuota", () => {
  it("counts an active reservation before a provider request starts", () => {
    const summary = summarizeRollingQuota(
      [
        entry(
          "4b870542-7ddd-4376-9544-4d985099ca3f",
          "reservation",
          "2026-09-20T00:00:00.000Z",
        ),
      ],
      new Date("2026-09-22T00:00:00.000Z"),
    );

    expect(summary).toMatchObject({ reserved: 1, consumed: 0, remaining: 2 });
  });

  it("does not charge a released reservation", () => {
    const summary = summarizeRollingQuota(
      [
        entry(
          "4b870542-7ddd-4376-9544-4d985099ca3f",
          "reservation",
          "2026-09-20T00:00:00.000Z",
        ),
        entry(
          "3a9f568d-358b-45ba-bcdb-dbe206942115",
          "release",
          "2026-09-20T00:01:00.000Z",
        ),
      ],
      new Date("2026-09-22T00:00:00.000Z"),
    );

    expect(summary).toMatchObject({ reserved: 0, consumed: 0, remaining: 3 });
  });

  it("reports the oldest rolling reset for consumed credits", () => {
    const summary = summarizeRollingQuota(
      [
        entry(
          "4b870542-7ddd-4376-9544-4d985099ca3f",
          "reservation",
          "2026-09-20T00:00:00.000Z",
        ),
        entry(
          "3a9f568d-358b-45ba-bcdb-dbe206942115",
          "consumption",
          "2026-09-20T00:01:00.000Z",
        ),
      ],
      new Date("2026-09-22T00:00:00.000Z"),
    );

    expect(summary.consumed).toBe(1);
    expect(summary.nextResetAt).toBe("2026-10-20T00:01:00.000Z");
  });
});
