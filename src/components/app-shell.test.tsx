import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

const clerk = vi.hoisted(() => ({ state: 'signed-in' as 'signed-in' | 'signed-out' }));

vi.mock('@clerk/tanstack-react-start', () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    when === clerk.state ? children : null,
  UserButton: () => <span data-testid="user-button" />,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, isSignedIn: true, orgId: 'org_1' }),
  useUser: () => ({ isLoaded: true, user: {} }),
  useOrganizationList: () => ({ isLoaded: true }),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: ({ select }: { select: (location: { href: string }) => unknown }) =>
    select({ href: '/' }),
}));

const header = (markup: string) => markup.slice(0, markup.indexOf('</header>'));

describe('signed-in application shell', () => {
  beforeEach(() => {
    clerk.state = 'signed-in';
  });

  it('keeps the destination links out of the header row until sm', () => {
    const markup = header(renderToStaticMarkup(<AppShell>content</AppShell>));
    const nav = markup.slice(markup.indexOf('<nav'), markup.indexOf('</nav>'));

    expect(nav).toContain('hidden');
    expect(nav).toContain('sm:flex');
    for (const href of ['/', '/datasources', '/metrics']) expect(nav).toContain(`href="${href}"`);
  });

  it('offers a menu button that only exists below sm', () => {
    const markup = header(renderToStaticMarkup(<AppShell>content</AppShell>));
    const menu = markup.slice(markup.indexOf('aria-label="Menu"'));

    expect(markup).toContain('aria-label="Menu"');
    expect(menu.slice(0, menu.indexOf('>'))).toContain('sm:hidden');
  });

  it('shows neither navigation nor menu button when signed out', () => {
    clerk.state = 'signed-out';
    const markup = header(renderToStaticMarkup(<AppShell>content</AppShell>));

    expect(markup).not.toContain('aria-label="Menu"');
    expect(markup).not.toContain('href="/datasources"');
  });
});
