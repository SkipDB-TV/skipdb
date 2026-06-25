import { auth } from "./auth";

export interface Staff {
  id: string;
  role: "moderator" | "admin";
}

/** Returns the session user if they are staff, otherwise null. */
export async function requireStaff(): Promise<Staff | null> {
  const session = await auth();
  const role = session?.user?.role;
  if (session?.user?.id && (role === "moderator" || role === "admin")) {
    return { id: session.user.id, role };
  }
  return null;
}
