import { describe, it, expect } from "vitest";
import request from "supertest";
import {
  BASE_URL,
  uniqueEmail,
  TEST_PASSWORD,
  getSegmentRow,
  getUserByEmail,
  setUserRole,
} from "../helpers";

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

async function registerStaff(): Promise<ReturnType<typeof request.agent>> {
  const { agent, id } = await registerUser();
  await setUserRole(id, "admin");
  return agent;
}

/** Submit a first-of-its-kind segment for a fresh episode — with no approved
 *  data or pattern to match, the smart controls leave it `pending`. */
async function submitPending(
  agent: ReturnType<typeof request.agent>,
  imdbId: string,
  episode: number,
): Promise<number> {
  const res = await agent.post("/api/segments").send({
    imdb_id: imdbId,
    season: 1,
    episode,
    segment_type: "intro",
    start_ms: 60_000,
    end_ms: 90_000,
  });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe("pending");
  return res.body.id;
}

describe("approve all from a user", () => {
  it("approves every pending submission from one contributor and leaves others untouched", async () => {
    const contributor = await registerUser();
    const other = await registerUser();

    const mine = [
      await submitPending(contributor.agent, "tt4100001", 1),
      await submitPending(contributor.agent, "tt4100001", 2),
      await submitPending(contributor.agent, "tt4100001", 3),
    ];
    const theirs = await submitPending(other.agent, "tt4100002", 1);

    const staff = await registerStaff();
    const res = await staff
      .post("/api/admin/segments/approve-all")
      .send({ submitted_by: contributor.id });

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(3);
    expect(res.body.ids.sort()).toEqual([...mine].sort());

    for (const id of mine) {
      expect((await getSegmentRow(id))?.status).toBe("approved");
    }
    expect((await getSegmentRow(theirs))?.status).toBe("pending");

    // 5 reputation per approval (config.review.reputationPerApproval) × 3.
    const owner = await getUserByEmail(contributor.email);
    expect(owner?.reputation).toBe(15);
  });

  it("is a no-op when the user has nothing pending", async () => {
    const idle = await registerUser();
    const staff = await registerStaff();

    const res = await staff
      .post("/api/admin/segments/approve-all")
      .send({ submitted_by: idle.id });

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(0);
  });

  it("requires staff", async () => {
    const user = await registerUser();
    const res = await user.agent
      .post("/api/admin/segments/approve-all")
      .send({ submitted_by: user.id });
    expect(res.status).toBe(403);
  });
});
