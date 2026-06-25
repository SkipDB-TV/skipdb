import { NextResponse } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

export function json(
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
) {
  return NextResponse.json(data as object, {
    status: init?.status ?? 200,
    headers: { ...CORS, ...(init?.headers ?? {}) },
  });
}

export function apiError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return json({ error: message, ...extra }, { status });
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export const LICENSE_NOTICE =
  "Data licensed CC BY-NC-SA 4.0 unless you have explicit permission.";
