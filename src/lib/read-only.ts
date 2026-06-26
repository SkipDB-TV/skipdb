import { BASE_URL } from "./urls";

export const READ_ONLY = process.env.NEXT_PUBLIC_READ_ONLY === "true";

export function readOnlyError() {
  return Response.json(
    {
      error: `This instance is read-only. Submit to the main instance at ${BASE_URL}.`,
    },
    { status: 405 },
  );
}
