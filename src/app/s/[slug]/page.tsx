import { SessionClient } from "@/components/SessionClient";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SessionClient slug={slug} />;
}
