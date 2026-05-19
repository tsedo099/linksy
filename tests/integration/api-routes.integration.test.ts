import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

function postJson(path: string, body: unknown) {
  return new NextRequest(new URL(path, "http://127.0.0.1"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getUrl(path: string) {
  return new NextRequest(new URL(path, "http://127.0.0.1"));
}

const hasDb = Boolean(process.env.DATABASE_URL);

it("GET /api/health returns ok (no DB required)", async () => {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET(getUrl("/api/health"));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("ok");
});

describe.skipIf(!hasDb)("API route integration (requires DATABASE_URL)", () => {
  it("POST /api/auth/login — unknown user → 401", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      postJson("/api/auth/login", {
        email: `no-such-user-${Date.now()}@test.invalid`,
        password: "irrelevant",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/register — weak password → 400", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(
      postJson("/api/auth/register", {
        username: "x",
        email: "a@b.co",
        password: "short",
        displayName: "Y",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/auth/me — no session → 401", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET(getUrl("/api/auth/me"));
    expect(res.status).toBe(401);
  });

  it("POST /api/e2ee/keys — no session → 401", async () => {
    const { POST } = await import("@/app/api/e2ee/keys/route");
    const res = await POST(postJson("/api/e2ee/keys", {}));
    expect(res.status).toBe(401);
  });

  it("POST /api/posts — no session → 401", async () => {
    const { POST } = await import("@/app/api/posts/route");
    const res = await POST(postJson("/api/posts", {}));
    expect(res.status).toBe(401);
  });

  it("POST /api/messages — no session → 401", async () => {
    const { POST } = await import("@/app/api/messages/route");
    const res = await POST(postJson("/api/messages", {}));
    expect(res.status).toBe(401);
  });

  it("POST /api/users/:id/follow — no session → 401", async () => {
    const { POST } = await import("@/app/api/users/[id]/follow/route");
    const res = await POST(getUrl("/api/users/00000000-0000-0000-0000-000000000001/follow"), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/posts/:id/comments — no session → 401", async () => {
    const { GET } = await import("@/app/api/posts/[id]/comments/route");
    const res = await GET(getUrl("/api/posts/00000000-0000-0000-0000-000000000002/comments"), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000002" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/posts/:id/like — no session → 401", async () => {
    const { POST } = await import("@/app/api/posts/[id]/like/route");
    const res = await POST(getUrl("/api/posts/00000000-0000-0000-0000-000000000003/like"), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000003" }),
    });
    expect(res.status).toBe(401);
  });
});
