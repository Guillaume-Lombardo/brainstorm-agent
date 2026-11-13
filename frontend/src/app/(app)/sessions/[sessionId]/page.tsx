import type { Metadata } from "next";

import { Workspace } from "@/components/workspace/workspace";

export const metadata: Metadata = { title: "Workspace · Brainstorm Agent" };

export default async function WorkspacePage({ params }: PageProps<"/sessions/[sessionId]">) {
  const { sessionId } = await params;
  return <Workspace sessionId={sessionId} />;
}
