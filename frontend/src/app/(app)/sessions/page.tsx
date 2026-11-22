import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { SessionsList } from "@/components/sessions/sessions-list";
import { getMessages } from "@/lib/preferences";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).sessions.title };
}

export default function SessionsPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
      <AppHeader>
        <span className="basis-full text-[22px] leading-none font-bold sm:flex-1 sm:basis-0">
          Brainstorm Agent
        </span>
      </AppHeader>
      <main className="min-h-0 flex-1 px-3 pt-1 pb-10 lg:overflow-y-auto">
        <SessionsList />
      </main>
    </div>
  );
}
