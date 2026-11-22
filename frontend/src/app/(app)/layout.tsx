import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { AccountProvider } from "@/components/app-header";

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
    <AccountProvider label={session.user.email ?? session.user.name ?? ""} signOut={signOutAction}>
      <div className="flex min-h-dvh flex-col lg:h-dvh">{children}</div>
    </AccountProvider>
  );
}
