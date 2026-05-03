import { describe, expect, it } from "vitest";
import { normalizeSqlForD1 } from "../../src/server/lib/db";

describe("normalizeSqlForD1", () => {
  it("converts postgres-style parameters into D1 placeholders", () => {
    expect(
      normalizeSqlForD1(
        "select * from users where id = $1 and username = $2 limit 1",
      ),
    ).toBe("select * from users where id = ? and username = ? limit 1");
  });
});
