import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <Link href="/sessions" className="font-semibold">
          Brainstorm Agent
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span data-testid="current-user">{session.user.email ?? session.user.name}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOutIcon />
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">{children}</div>
    </div>
  );
}
