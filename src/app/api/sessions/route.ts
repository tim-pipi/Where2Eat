import { NextResponse } from "next/server";

import { setSeatCookie } from "@/lib/cookies";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Create a session and take seat A (FR-1.1). */
export async function POST() {
  const { session, token } = store.create();
  const response = NextResponse.json({ slug: session.slug });
  setSeatCookie(response, session.slug, token);
  return response;
}
