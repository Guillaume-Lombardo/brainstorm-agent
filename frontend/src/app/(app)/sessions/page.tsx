import type { Metadata } from "next";

import { SessionsList } from "@/components/sessions/sessions-list";

export const metadata: Metadata = { title: "Sessions · Brainstorm Agent" };

export default function SessionsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <SessionsList />
    </main>
  );
}
