export interface ClerkCredentials {
  identifier: string;
  password: string;
}

/** Clerk test-user credentials, when the environment provides a complete set. */
export function clerkCredentials(): ClerkCredentials | undefined {
  const identifier = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;
  if (!identifier || !password || !process.env.CLERK_SECRET_KEY) return undefined;
  return { identifier, password };
}

/** Explains what is missing when the signed-in suite cannot run. */
export const missingClerkCredentials =
  'The signed-in suite needs CLERK_SECRET_KEY, E2E_CLERK_USER_USERNAME, and E2E_CLERK_USER_PASSWORD ' +
  'for a Clerk development instance whose test user belongs to an organization.';
