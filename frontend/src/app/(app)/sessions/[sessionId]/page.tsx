import type { Metadata } from "next";

import { Workspace } from "@/components/workspace/workspace";
import { getMessages } from "@/lib/preferences";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).workspace.title };
}

export default async function WorkspacePage({ params }: PageProps<"/sessions/[sessionId]">) {
  const { sessionId } = await params;
  return <Workspace sessionId={sessionId} />;
}
