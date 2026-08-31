import { Show, UserButton } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignInAction, SignUpAction } from '#/components/auth-actions';
import { Button } from '#/components/ui/button';
import { WorkspaceGate } from '#/components/workspace-gate';

// Active sections are marked with foreground text and a bottom border that meets
// the header rule. Inactive styling is kept separate so the two never both apply.
const navLink = 'flex h-full items-center border-b-2 transition-colors hover:text-foreground';
const navLinkActive = { className: 'border-foreground text-foreground' };
const navLinkInactive = { className: 'border-transparent text-muted-foreground' };

export function AppShell({
  children,
  requireWorkspace = false,
}: {
  children: ReactNode;
  requireWorkspace?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-5 px-4 sm:px-6">
          <Link className="font-semibold tracking-tight" to="/">
            Rundown
          </Link>
          <nav aria-label="Main" className="flex h-full flex-1 items-center gap-4 text-sm">
            <Show when="signed-in">
              <Link
                className={navLink}
                activeProps={navLinkActive}
                inactiveProps={navLinkInactive}
                // Dashboards live at the root, so only an exact match may light it up.
                activeOptions={{ exact: true }}
                to="/"
              >
                Dashboards
              </Link>
              <Link
                className={navLink}
                activeProps={navLinkActive}
                inactiveProps={navLinkInactive}
                to="/datasources"
              >
                Datasources
              </Link>
              <Link
                className={navLink}
                activeProps={navLinkActive}
                inactiveProps={navLinkInactive}
                to="/metrics"
              >
                Metrics
              </Link>
            </Show>
          </nav>
          <Show when="signed-out">
            <SignInAction>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInAction>
            <SignUpAction>
              <Button size="sm">Create account</Button>
            </SignUpAction>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>
      {requireWorkspace ? <WorkspaceGate>{children}</WorkspaceGate> : children}
    </div>
  );
}
