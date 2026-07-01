import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { BASE_URL, uniqueEmail, TEST_PASSWORD, getSegmentRow } from "../helpers";

async function createApiKey(): Promise<string> {
  const agent = request.agent(BASE_URL);
  await agent
    .post("/api/register")
    .send({ email: uniqueEmail(), password: TEST_PASSWORD });
  const res = await agent.post("/api/keys");
  return res.body.key;
}

describe("segment submission", () => {
  it("requires authentication", async () => {
    const res = await request(BASE_URL).post("/api/segments").send({
      imdb_id: "tt2000001",
      season: 1,
      episode: 1,
      segment_type: "intro",
      start_ms: 60_000,
      end_ms: 90_000,
    });
    expect(res.status).toBe(401);
  });

  it("rejects an end time before the start time", async () => {
    const key = await createApiKey();
    const res = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${key}`)
      .send({
        imdb_id: "tt2000002",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 90_000,
        end_ms: 60_000,
      });
    expect(res.status).toBe(422);
  });

  it("accepts a valid submission", async () => {
    const key = await createApiKey();
    const res = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${key}`)
      .send({
        imdb_id: "tt2000003",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 60_000,
        end_ms: 90_000,
      });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("number");
    expect(["approved", "pending"]).toContain(res.body.status);

    const row = await getSegmentRow(res.body.id);
    expect(row).toMatchObject({ start_ms: 60_000, end_ms: 90_000 });
  });

  it("blocks a second overlapping segment (any type) for the same user/episode/duration", async () => {
    const key = await createApiKey();
    const first = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${key}`)
      .send({
        imdb_id: "tt2000004",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 20_000,
        end_ms: 30_000,
        duration_ms: 2_820_000,
      });
    expect(first.status).toBe(201);

    const overlapping = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${key}`)
      .send({
        imdb_id: "tt2000004",
        season: 1,
        episode: 1,
        segment_type: "preview",
        start_ms: 25_000,
        end_ms: 35_000,
        duration_ms: 2_820_000,
      });
    expect(overlapping.status).toBe(409);
  });
});

describe("segment editing and deletion", () => {
  let ownerKey: string;
  let segmentId: number;

  beforeAll(async () => {
    ownerKey = await createApiKey();
    const res = await request(BASE_URL)
      .post("/api/segments")
      .set("Authorization", `Bearer ${ownerKey}`)
      .send({
        imdb_id: "tt2000005",
        season: 1,
        episode: 1,
        segment_type: "intro",
        start_ms: 60_000,
        end_ms: 90_000,
      });
    segmentId = res.body.id;
  });

  it("lets the owner edit their segment's times", async () => {
    const res = await request(BASE_URL)
      .patch(`/api/segments/${segmentId}`)
      .set("Authorization", `Bearer ${ownerKey}`)
      .send({ start_ms: 65_000, end_ms: 95_000 });

    expect(res.status).toBe(200);
    const row = await getSegmentRow(segmentId);
    expect(row).toMatchObject({ start_ms: 65_000, end_ms: 95_000 });
  });

  it("blocks another user from editing it", async () => {
    const otherKey = await createApiKey();
    const res = await request(BASE_URL)
      .patch(`/api/segments/${segmentId}`)
      .set("Authorization", `Bearer ${otherKey}`)
      .send({ start_ms: 1_000, end_ms: 2_000 });
    expect(res.status).toBe(403);
  });

  it("blocks another user from deleting it", async () => {
    const otherKey = await createApiKey();
    const res = await request(BASE_URL)
      .delete(`/api/segments/${segmentId}`)
      .set("Authorization", `Bearer ${otherKey}`);
    expect(res.status).toBe(403);
  });

  it("lets the owner delete their segment", async () => {
    const res = await request(BASE_URL)
      .delete(`/api/segments/${segmentId}`)
      .set("Authorization", `Bearer ${ownerKey}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const row = await getSegmentRow(segmentId);
    expect(row).toBeNull();
  });

  it("404s when editing an already-deleted segment", async () => {
    const res = await request(BASE_URL)
      .patch(`/api/segments/${segmentId}`)
      .set("Authorization", `Bearer ${ownerKey}`)
      .send({ start_ms: 1_000, end_ms: 2_000 });
    expect(res.status).toBe(404);
  });
});
