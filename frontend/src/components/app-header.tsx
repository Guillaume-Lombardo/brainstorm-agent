"use client";

import { LogOutIcon } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { PreferenceControls } from "@/components/preferences/preference-controls";
import { useMessages } from "@/components/preferences/provider";
import { Button } from "@/components/ui/button";

interface Account {
  /** E-mail (or name) of the signed-in user. */
  label: string;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<Account | null>(null);

/** Gives the page header the signed-in user. */
export function AccountProvider({ children, ...account }: Account & { children: ReactNode }) {
  return <AccountContext value={account}>{children}</AccountContext>;
}

/** Page header: the page's own title and actions, then preferences and sign-out. */
export function AppHeader({ children }: { children: ReactNode }) {
  const account = useContext(AccountContext);
  const t = useMessages().preferences;
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 px-3 py-2.5">
      {children}
      <PreferenceControls />
      {account ? (
        <form action={account.signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={t.signOut}
            title={`${t.signOut} (${account.label})`}
          >
            <LogOutIcon />
          </Button>
        </form>
      ) : null}
    </header>
  );
}
