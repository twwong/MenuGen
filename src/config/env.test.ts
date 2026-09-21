import { describe, expect, it } from "vitest";
import { readEnvironment } from "./env";

describe("readEnvironment", () => {
  it("accepts an optional valid public application URL", () => {
    expect(
      readEnvironment({
        NODE_ENV: "test",
        NEXT_PUBLIC_APP_URL: "https://menugen.example",
      }),
    ).toEqual({
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "https://menugen.example",
    });
  });

  it("rejects invalid public URLs", () => {
    expect(() =>
      readEnvironment({
        NODE_ENV: "test",
        NEXT_PUBLIC_APP_URL: "not-a-url",
      }),
    ).toThrow();
  });
});
