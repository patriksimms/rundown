import { SignInButton, SignUpButton } from '@clerk/tanstack-react-start';
import { useLocation } from '@tanstack/react-router';
import type { ReactElement } from 'react';

export function SignInAction({ children }: { children: ReactElement }) {
  const redirectUrl = useLocation({ select: (location) => location.href });

  return (
    <SignInButton
      mode="modal"
      forceRedirectUrl={redirectUrl}
      signUpForceRedirectUrl={redirectUrl}
      withSignUp
    >
      {children}
    </SignInButton>
  );
}

export function SignUpAction({ children }: { children: ReactElement }) {
  const redirectUrl = useLocation({ select: (location) => location.href });

  return (
    <SignUpButton mode="modal" forceRedirectUrl={redirectUrl} signInForceRedirectUrl={redirectUrl}>
      {children}
    </SignUpButton>
  );
}
