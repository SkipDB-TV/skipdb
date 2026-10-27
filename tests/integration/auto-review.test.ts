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

type Agent = ReturnType<typeof request.agent>;

async function registerUser(): Promise<{
  agent: Agent;
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
): Promise<{ agent: Agent; id: string }> {
  const { agent, id } = await registerUser();
  await setUserRole(id, role);
  return { agent, id };
}

async function submit(
  agent: Agent,
  imdbId: string,
  episode: number,
  startMs = 60_000,
  endMs = 90_000,
) {
  const res = await agent.post("/api/segments").send({
    imdb_id: imdbId,
    season: 1,
    episode,
    segment_type: "intro",
    start_ms: startMs,
    end_ms: endMs,
  });
  expect(res.status).toBe(201);
  return res.body as { id: number; status: string; reasons: string[] };
}

async function moderate(
  staff: Agent,
  id: number,
  action: "approve" | "reject",
) {
  const res = await staff
    .post(`/api/admin/segments/${id}`)
    .send({ action });
  expect(res.status).toBe(200);
}

describe("peer consensus", () => {
  it("approves both submissions when two users independently agree", async () => {
    const a = await registerUser();
    const b = await registerUser();

    const first = await submit(a.agent, "tt5100001", 1);
    expect(first.status).toBe("pending");

    // Within the consensus tolerance of the first.
    const second = await submit(b.agent, "tt5100001", 1, 61_000, 91_500);
    expect(second.status).toBe("approved");
    expect(second.reasons.join(" ")).toMatch(/peer consensus/);

    const firstRow = await getSegmentRow(first.id);
    expect(firstRow?.status).toBe("approved");
    expect((await getUserByEmail(a.email))?.reputation).toBe(5);
  });

  it("leaves both pending when they disagree", async () => {
    const a = await registerUser();
    const b = await registerUser();

    const first = await submit(a.agent, "tt5100002", 1);
    const second = await submit(b.agent, "tt5100002", 1, 120_000, 150_000);
    expect(second.status).toBe("pending");
    expect((await getSegmentRow(first.id))?.status).toBe("pending");
  });
});

describe("trust by approval record", () => {
  it("auto-approves after 5 reviewed submissions with ≥90% approved", async () => {
    const staff = await registerStaff();
    const user = await registerUser();

    for (let ep = 1; ep <= 5; ep++) {
      const s = await submit(user.agent, `tt52000${ep}0`, 1);
      expect(s.status).toBe("pending");
      await moderate(staff.agent, s.id, "approve");
    }

    const next = await submit(user.agent, "tt5200099", 1);
    expect(next.status).toBe("approved");
    expect(next.reasons.join(" ")).toMatch(/strong approval record/);
  });

  it("does not trust a record below the approval rate", async () => {
    const staff = await registerStaff();
    const user = await registerUser();

    for (let ep = 1; ep <= 5; ep++) {
      const s = await submit(user.agent, `tt53000${ep}0`, 1);
      await moderate(staff.agent, s.id, ep === 5 ? "reject" : "approve");
    }

    const next = await submit(user.agent, "tt5300099", 1);
    expect(next.status).toBe("pending");
  });
});

describe("clean record + same-season length", () => {
  it("approves a clean submitter's first-for-episode match, but not a newcomer's", async () => {
    const staff = await registerStaff();
    const clean = await registerUser();
    const newcomer = await registerUser();

    // One approved sample for the season (not enough for the show pattern).
    const seed = await submit(clean.agent, "tt5400001", 1);
    await moderate(staff.agent, seed.id, "approve");

    // Newcomer goes first so the clean user's approval doesn't make a pattern.
    const theirs = await submit(newcomer.agent, "tt5400001", 3, 50_000, 81_000);
    expect(theirs.status).toBe("pending");

    const mine = await submit(clean.agent, "tt5400001", 2, 70_000, 101_000);
    expect(mine.status).toBe("approved");
    expect(mine.reasons.join(" ")).toMatch(/clean submitter/);
  });

  it("does not apply once the submitter has a rejection", async () => {
    const staff = await registerStaff();
    const user = await registerUser();

    const good = await submit(user.agent, "tt5500001", 1);
    await moderate(staff.agent, good.id, "approve");
    const bad = await submit(user.agent, "tt5500002", 1);
    await moderate(staff.agent, bad.id, "reject");

    const next = await submit(user.agent, "tt5500001", 2, 70_000, 101_000);
    expect(next.status).toBe("pending");
  });
});

describe("moderator role toggle", () => {
  it("lets an admin promote and demote a user", async () => {
    const admin = await registerStaff("admin");
    const user = await registerUser();

    const promote = await admin.agent
      .post(`/api/admin/users/${user.id}`)
      .send({ action: "set-role", role: "moderator" });
    expect(promote.status).toBe(200);
    expect((await getUserByEmail(user.email))?.role).toBe("moderator");

    // Takes effect on their existing session (database sessions).
    expect((await user.agent.get("/api/admin/queue")).status).toBe(200);

    const demote = await admin.agent
      .post(`/api/admin/users/${user.id}`)
      .send({ action: "set-role", role: "user" });
    expect(demote.status).toBe(200);
    expect((await getUserByEmail(user.email))?.role).toBe("user");
  });

  it("is admin-only and can't touch admins", async () => {
    const mod = await registerStaff("moderator");
    const admin = await registerStaff("admin");
    const otherAdmin = await registerStaff("admin");
    const user = await registerUser();

    const byMod = await mod.agent
      .post(`/api/admin/users/${user.id}`)
      .send({ action: "set-role", role: "moderator" });
    expect(byMod.status).toBe(403);

    const onAdmin = await admin.agent
      .post(`/api/admin/users/${otherAdmin.id}`)
      .send({ action: "set-role", role: "user" });
    expect(onAdmin.status).toBe(400);
  });
});
