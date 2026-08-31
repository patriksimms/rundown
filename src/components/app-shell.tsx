import { Show, UserButton } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';
import { MenuIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SignInAction, SignUpAction } from '#/components/auth-actions';
import { Button } from '#/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet';
import { WorkspaceGate } from '#/components/workspace-gate';

const navigation = [
  { to: '/', label: 'Dashboards' },
  { to: '/datasources', label: 'Datasources' },
  { to: '/metrics', label: 'Metrics' },
] as const;

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
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Show when="signed-in">
            <MobileNavigation />
          </Show>
          <Link className="font-semibold tracking-tight" to="/">
            Rundown
          </Link>
          {/* Links collapse into the sheet below sm so the bar still fits a 320 px screen. */}
          <nav aria-label="Main" className="hidden flex-1 items-center gap-4 text-sm sm:flex">
            <Show when="signed-in">
              {navigation.map((item) => (
                <Link
                  key={item.to}
                  className="text-muted-foreground hover:text-foreground"
                  to={item.to}
                >
                  {item.label}
                </Link>
              ))}
            </Show>
          </nav>
          <div className="ml-auto flex items-center gap-2">
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
        </div>
      </header>
      {requireWorkspace ? <WorkspaceGate>{children}</WorkspaceGate> : children}
    </div>
  );
}

function MobileNavigation() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button className="sm:hidden" variant="ghost" size="icon-sm" aria-label="Menu" />}
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(80vw,18rem)]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>Move between the workspace screens.</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-1 px-2 pb-4">
          {navigation.map((item) => (
            <li key={item.to}>
              <Link
                className="flex min-h-11 items-center rounded-lg px-2 text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                to={item.to}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
