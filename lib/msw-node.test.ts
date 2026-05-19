import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("https://msw-fixture.test/ping", () => HttpResponse.json({ pong: true })),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("msw (node)", () => {
  it("intercepts fetch for tests", async () => {
    const res = await fetch("https://msw-fixture.test/ping");
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ pong: true });
  });
});
