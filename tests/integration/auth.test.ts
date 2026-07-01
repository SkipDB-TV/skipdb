import { describe, it, expect } from "vitest";
import request from "supertest";
import { BASE_URL, uniqueEmail, TEST_PASSWORD } from "../helpers";

describe("POST /api/register", () => {
  it("creates a user and starts a session", async () => {
    const email = uniqueEmail();
    const res = await request(BASE_URL)
      .post("/api/register")
      .send({ email, password: TEST_PASSWORD, name: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.email).toBe(email);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/authjs\.session-token=/);
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail();
    const first = await request(BASE_URL)
      .post("/api/register")
      .send({ email, password: TEST_PASSWORD });
    expect(first.status).toBe(201);

    const second = await request(BASE_URL)
      .post("/api/register")
      .send({ email, password: TEST_PASSWORD });
    expect(second.status).toBe(409);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(BASE_URL)
      .post("/api/register")
      .send({ email: uniqueEmail(), password: "short" });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/login", () => {
  it("logs in with correct credentials", async () => {
    const email = uniqueEmail();
    await request(BASE_URL)
      .post("/api/register")
      .send({ email, password: TEST_PASSWORD });

    const res = await request(BASE_URL)
      .post("/api/login")
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/authjs\.session-token=/);
  });

  it("rejects the wrong password", async () => {
    const email = uniqueEmail();
    await request(BASE_URL)
      .post("/api/register")
      .send({ email, password: TEST_PASSWORD });

    const res = await request(BASE_URL)
      .post("/api/login")
      .send({ email, password: "definitely-wrong" });

    expect(res.status).toBe(401);
  });
});
