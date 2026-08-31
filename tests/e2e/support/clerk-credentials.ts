export interface ClerkCredentials {
  identifier: string;
  password: string;
}

/**
 * Clerk test-user credentials, when the environment provides a complete set. The publishable key
 * counts: without it the browser never loads Clerk, so a sign-in could not succeed anyway.
 */
export function clerkCredentials(): ClerkCredentials | undefined {
  const identifier = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;
  if (
    !identifier ||
    !password ||
    !process.env.CLERK_SECRET_KEY ||
    !process.env.VITE_CLERK_PUBLISHABLE_KEY
  )
    return undefined;
  return { identifier, password };
}

/** Explains what is missing when the signed-in suite cannot run. */
export const missingClerkCredentials =
  'The signed-in suite needs VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, ' +
  'E2E_CLERK_USER_USERNAME, and E2E_CLERK_USER_PASSWORD for a Clerk development instance whose ' +
  'test user has a +clerk_test address and belongs to an organization.';
