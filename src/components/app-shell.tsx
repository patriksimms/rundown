import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button';

export function AppShell({ children }: { children: ReactNode }) {
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
            <SignInButton>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton>
              <Button size="sm">Create account</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>
      {children}
    </div>
  );
}
