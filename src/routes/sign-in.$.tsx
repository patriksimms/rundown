import { SignIn } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';
import { pageTitle } from '#/lib/page-title';

export const Route = createFileRoute('/sign-in/$')({
  component: Page,
  head: () => ({ meta: [{ title: pageTitle('Sign in') }] }),
});

function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/" />
    </div>
  );
}
