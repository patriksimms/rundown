import type { EmailCodeFactor } from '@clerk/shared/types';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';
import type { ClerkCredentials } from './clerk-credentials';

/**
 * Clerk accepts this code for any address using its `+clerk_test` convention. A development
 * instance asks an unrecognised browser to prove itself, and every Playwright run is a new
 * browser, so the sign-in settles that step with the test code instead of a real inbox.
 */
const CLERK_TEST_CODE = '424242';

/** Signs the Clerk test user in and leaves the browser on the application root. */
export async function signInWithClerk(page: Page, credentials: ClerkCredentials) {
  await setupClerkTestingToken({ page });
  await page.goto('/');
  await clerk.loaded({ page });

  const status = await page.evaluate(
    async ([identifier, password, code]) => {
      const client = window.Clerk.client;
      if (!client) return 'the Clerk client never became available';

      let attempt = await client.signIn.create({ strategy: 'password', identifier, password });

      // Clerk keeps `supportedFirstFactors` populated after the password verifies, so the factor
      // list is only read for the status that actually asked for another factor.
      if (attempt.status === 'needs_client_trust') {
        const factor = attempt.supportedFirstFactors?.find(
          (candidate): candidate is EmailCodeFactor => candidate.strategy === 'email_code',
        );
        if (factor) {
          const prepared = await attempt.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: factor.emailAddressId,
          });
          attempt = await prepared.attemptFirstFactor({ strategy: 'email_code', code });
        }
      }

      if (attempt.status !== 'complete' || !attempt.createdSessionId) return attempt.status;
      await window.Clerk.setActive({ session: attempt.createdSessionId });
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
