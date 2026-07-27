import { describe, it, expect } from "vitest";
import request from "supertest";
import {
  BASE_URL,
  uniqueEmail,
  TEST_PASSWORD,
  getSegmentRow,
  getUserByEmail,
  setUserRole,
  countVotesByUser,
} from "../helpers";

/** Registers a user and returns a logged-in agent (session cookie) + their id. */
async function registerUser(): Promise<{
  agent: ReturnType<typeof request.agent>;
  email: string;
  id: string;
}> {
  const email = uniqueEmail();
  const agent = request.agent(BASE_URL);
  await agent.post("/api/register").send({ email, password: TEST_PASSWORD });
  const user = await getUserByEmail(email);
  return { agent, email, id: user!.id };
}

async function registerStaff(
  role: "moderator" | "admin" = "admin",
): Promise<{ agent: ReturnType<typeof request.agent>; id: string }> {
  const { agent, id } = await registerUser();
  await setUserRole(id, role);
  return { agent, id };
}

describe("disabling a user purges their votes", () => {
  it("deletes the voter's votes and recomputes the affected segment + owner reputation", async () => {
    const owner = await registerUser();
    const submit = await owner.agent.post("/api/segments").send({
      imdb_id: "tt3000001",
      season: 1,
      episode: 1,
      segment_type: "intro",
      start_ms: 60_000,
      end_ms: 90_000,
    });
    const segmentId: number = submit.body.id;

    const spammer = await registerUser();
    const vote = await spammer.agent
      .post(`/api/segments/${segmentId}/vote`)
      .send({ value: 1 });
    expect(vote.status).toBe(200);

    let row = await getSegmentRow(segmentId);
    expect(row).toMatchObject({ votes_up: 1, votes_down: 0, score: 1 });
    let owningUser = await getUserByEmail(owner.email);
    expect(owningUser?.reputation).toBe(1);
    expect(await countVotesByUser(spammer.id)).toBe(1);

    const staff = await registerStaff();
    const disable = await staff.agent
      .post(`/api/admin/users/${spammer.id}`)
      .send({ action: "disable" });
    expect(disable.status).toBe(200);
    expect(disable.body.disabled).toBe(true);

    expect(await countVotesByUser(spammer.id)).toBe(0);
    row = await getSegmentRow(segmentId);
    expect(row).toMatchObject({ votes_up: 0, votes_down: 0, score: 0 });
    owningUser = await getUserByEmail(owner.email);
    expect(owningUser?.reputation).toBe(0);
  });

  it("is a cheap no-op for a user who never voted on anything", async () => {
    const idle = await registerUser();
    const staff = await registerStaff();

    const disable = await staff.agent
      .post(`/api/admin/users/${idle.id}`)
      .send({ action: "disable" });
    expect(disable.status).toBe(200);
    expect(await countVotesByUser(idle.id)).toBe(0);
  });

  it("does not touch votes cast by other users on the disabled user's own segments", async () => {
    const spammer = await registerUser();
    const submit = await spammer.agent.post("/api/segments").send({
      imdb_id: "tt3000002",
      season: 1,
      episode: 1,
      segment_type: "intro",
      start_ms: 60_000,
      end_ms: 90_000,
    });
    const segmentId: number = submit.body.id;

    const voter = await registerUser();
    const vote = await voter.agent
      .post(`/api/segments/${segmentId}/vote`)
      .send({ value: 1 });
    expect(vote.status).toBe(200);

    const staff = await registerStaff();
    const disable = await staff.agent
      .post(`/api/admin/users/${spammer.id}`)
      .send({ action: "disable" });
    expect(disable.status).toBe(200);

    // The segment itself is soft-disabled (owner disabled), but the other
    // user's vote row and the aggregate it produced are untouched — only the
    // *voter*'s own votes get purged, not votes cast *on* their segments.
    expect(await countVotesByUser(voter.id)).toBe(1);
    const row = await getSegmentRow(segmentId);
    expect(row).toMatchObject({ status: "disabled", votes_up: 1, score: 1 });
  });
});
