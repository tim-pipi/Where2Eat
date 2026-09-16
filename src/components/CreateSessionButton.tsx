"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateSessionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sessions", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      const { slug } = (await response.json()) as { slug: string };
      router.push(`/s/${slug}`);
    } catch {
      setError("Could not start a session. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={create} disabled={busy}>
        {busy ? "Starting…" : "Find a spot"}
      </button>
      {error ? (
        <p className="banner warn" style={{ marginTop: 14, textAlign: "left" }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
