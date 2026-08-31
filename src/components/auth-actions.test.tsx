import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SignInAction, SignUpAction } from './auth-actions';

vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select: (location: { href: string }) => unknown }) =>
    select({ href: '/datasources?tab=fields' }),
}));

vi.mock('@clerk/tanstack-react-start', () => ({
  SignInButton: ({
    children,
    mode,
    forceRedirectUrl,
    signUpForceRedirectUrl,
    withSignUp,
  }: {
    children: ReactNode;
    mode: string;
    forceRedirectUrl: string;
    signUpForceRedirectUrl: string;
    withSignUp: boolean;
  }) => (
    <span
      data-mode={mode}
      data-redirect={forceRedirectUrl}
      data-switch-redirect={signUpForceRedirectUrl}
      data-with-sign-up={withSignUp}
    >
      {children}
    </span>
  ),
  SignUpButton: ({
    children,
    mode,
    forceRedirectUrl,
    signInForceRedirectUrl,
  }: {
    children: ReactNode;
    mode: string;
    forceRedirectUrl: string;
    signInForceRedirectUrl: string;
  }) => (
    <span
      data-mode={mode}
      data-redirect={forceRedirectUrl}
      data-switch-redirect={signInForceRedirectUrl}
    >
      {children}
    </span>
  ),
}));

describe('authentication actions', () => {
  it.each([
    [
      'sign in',
      <SignInAction key="sign-in">
        <button>Sign in</button>
      </SignInAction>,
    ],
    [
      'sign up',
      <SignUpAction key="sign-up">
        <button>Create account</button>
      </SignUpAction>,
    ],
  ])('opens %s in a modal and returns every path through the current URL', (_, action) => {
    const html = renderToStaticMarkup(action);

    expect(html).toContain('data-mode="modal"');
    expect(html).toContain('data-redirect="/datasources?tab=fields"');
    expect(html).toContain('data-switch-redirect="/datasources?tab=fields"');
  });

  it('keeps sign-up available inside the sign-in flow', () => {
    const html = renderToStaticMarkup(
      <SignInAction>
        <button>Sign in</button>
      </SignInAction>,
    );

    expect(html).toContain('data-with-sign-up="true"');
  });
});
