import type { NextResponse } from "next/server";

import { SESSION_TTL_MS } from "./store";

/** One cookie per session, so a device can hold a seat in several at once. */
export const seatCookieName = (slug: string) => `w2e_seat_${slug}`;

export function setSeatCookie(response: NextResponse, slug: string, token: string): void {
  response.cookies.set(seatCookieName(slug), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}
