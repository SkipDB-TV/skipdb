import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { BASE_URL, uniqueEmail, TEST_PASSWORD } from "../helpers";

describe("API key lifecycle", () => {
  const agent = request.agent(BASE_URL);

  beforeAll(async () => {
    const email = uniqueEmail();
    const res = await agent
      .post("/api/register")
      .send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(201);
  });

  it("has no active key for a fresh account", async () => {
    const res = await agent.get("/api/keys");
    expect(res.status).toBe(200);
    expect(res.body.key).toBeNull();
  });

  it("generates a key that authenticates a write request, then revokes it", async () => {
    const generated = await agent.post("/api/keys");
    expect(generated.status).toBe(201);
    expect(generated.body.key).toMatch(/^skdb_/);
    expect(generated.body.prefix).toBeTruthy();

    const info = await agent.get("/api/keys");
    expect(info.body.key.keyPrefix).toBe(generated.body.prefix);

    const key = generated.body.key;
    const submit = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${key}`)
      .send({
        imdb_id: "tt1000001",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 60_000,
        end_ms: 90_000,
      });
    expect(submit.status).toBe(201);

    const revoke = await agent.delete("/api/keys");
    expect(revoke.status).toBe(200);
    expect(revoke.body.revoked).toBe(true);

    const rejected = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${key}`)
      .send({
        imdb_id: "tt1000002",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 60_000,
        end_ms: 90_000,
      });
    expect(rejected.status).toBe(401);
  });

  it("resetting the key revokes the previous one", async () => {
    const first = await agent.post("/api/keys");
    const second = await agent.post("/api/keys");
    expect(second.body.key).not.toBe(first.body.key);

    const usingOld = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${first.body.key}`)
      .send({
        imdb_id: "tt1000003",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 60_000,
        end_ms: 90_000,
      });
    expect(usingOld.status).toBe(401);

    const usingNew = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${second.body.key}`)
      .send({
        imdb_id: "tt1000004",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 60_000,
        end_ms: 90_000,
      });
    expect(usingNew.status).toBe(201);
  });
});
