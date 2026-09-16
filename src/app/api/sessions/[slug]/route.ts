import { NextResponse, type NextRequest } from "next/server";

import { seatCookieName } from "@/lib/cookies";
import { buildView, expiredView } from "@/lib/session-view";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Current shared state, from the caller's point of view (FR-6.1). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = store.get(slug);
  if (!session) {
    return NextResponse.json(expiredView(slug), { status: 404 });
  }

  const token = request.cookies.get(seatCookieName(slug))?.value;
  const view = await buildView(session, store.seatFor(session, token));
  return NextResponse.json(view, {
    headers: { "Cache-Control": "no-store" },
  });
}
