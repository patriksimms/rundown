import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';
import type { ClerkCredentials } from './clerk-credentials';

/**
 * Clerk accepts this code for any address using its `+clerk_test` convention. A development
 * instance asks an unrecognised browser to prove itself, and every Playwright run is a new
 * browser, so the sign-in settles that step with the test code instead of a real inbox.
 */
const CLERK_TEST_CODE = '424242';

interface EmailCodeFactor {
  strategy: string;
  emailAddressId?: string;
}

interface BrowserSignIn {
  status: string;
  createdSessionId: string | null;
  supportedFirstFactors: EmailCodeFactor[] | null;
  supportedSecondFactors: EmailCodeFactor[] | null;
  prepareFirstFactor(params: {
    strategy: 'email_code';
    emailAddressId: string;
  }): Promise<BrowserSignIn>;
  attemptFirstFactor(params: { strategy: 'email_code'; code: string }): Promise<BrowserSignIn>;
  prepareSecondFactor(params: {
    strategy: 'email_code';
    emailAddressId: string;
  }): Promise<BrowserSignIn>;
  attemptSecondFactor(params: { strategy: 'email_code'; code: string }): Promise<BrowserSignIn>;
}

interface BrowserClerk {
  loaded?: boolean;
  client: {
    signIn: {
      create(params: {
        strategy: 'password';
        identifier: string;
        password: string;
      }): Promise<BrowserSignIn>;
    };
  };
  setActive(params: { session: string }): Promise<void>;
}

/** Signs the Clerk test user in and leaves the browser on the application root. */
export async function signInWithClerk(page: Page, credentials: ClerkCredentials) {
  await setupClerkTestingToken({ page });
  await page.goto('/');
  await clerk.loaded({ page });

  const status = await page.evaluate(
    async ([identifier, password, code]) => {
      const emailCodeFactor = (factors: EmailCodeFactor[] | null) =>
        factors?.find((factor) => factor.strategy === 'email_code' && factor.emailAddressId);

      // Clerk's own window typing describes the full SDK; this suite needs only these calls.
      const instance = (window as unknown as { Clerk: BrowserClerk }).Clerk;
      let attempt = await instance.client.signIn.create({
        strategy: 'password',
        identifier,
        password,
      });

      if (attempt.status === 'needs_client_trust' || attempt.status === 'needs_second_factor') {
        const first = emailCodeFactor(attempt.supportedFirstFactors);
        const second = emailCodeFactor(attempt.supportedSecondFactors);
        if (first?.emailAddressId) {
          const prepared = await attempt.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: first.emailAddressId,
          });
          attempt = await prepared.attemptFirstFactor({ strategy: 'email_code', code });
        } else if (second?.emailAddressId) {
          const prepared = await attempt.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: second.emailAddressId,
          });
          attempt = await prepared.attemptSecondFactor({ strategy: 'email_code', code });
        }
      }

      if (attempt.status !== 'complete' || !attempt.createdSessionId) return attempt.status;
      await instance.setActive({ session: attempt.createdSessionId });
      return 'complete';
    },
    [credentials.identifier, credentials.password, CLERK_TEST_CODE] as const,
  );

  if (status !== 'complete')
    throw new Error(
      `Clerk stopped the sign-in at "${status}". The test user needs a password and an email ` +
        'address using the +clerk_test convention.',
    );

  await page.goto('/');
}
