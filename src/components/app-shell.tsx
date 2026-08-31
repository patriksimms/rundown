import { Show, UserButton } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SignInAction, SignUpAction } from '#/components/auth-actions';
import { Button } from '#/components/ui/button';
import { WorkspaceGate } from '#/components/workspace-gate';

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
          <nav aria-label="Main" className="flex flex-1 items-center gap-4 text-sm">
            <Show when="signed-in">
              <Link className="text-muted-foreground hover:text-foreground" to="/">
                Dashboards
              </Link>
              <Link className="text-muted-foreground hover:text-foreground" to="/datasources">
                Datasources
              </Link>
              <Link className="text-muted-foreground hover:text-foreground" to="/metrics">
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
