import { useAuth, useOrganizationList, useUser } from '@clerk/tanstack-react-start';
import { ArrowRightIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert';
import { Button } from '#/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '#/components/ui/field';
import { Input } from '#/components/ui/input';
import { Separator } from '#/components/ui/separator';
import { Skeleton } from '#/components/ui/skeleton';

type PendingAction =
  | { kind: 'invitation'; id: string }
  | { kind: 'membership'; id: string }
  | { kind: 'create' };

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, orgId } = useAuth();

  if (!isLoaded) return <WorkspaceGateLoading />;
  if (!isSignedIn || orgId) return children;
  return <WorkspaceSetup />;
}

function WorkspaceSetup() {
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isLoaded, createOrganization, setActive, userInvitations, userMemberships } =
    useOrganizationList({
      userInvitations: { infinite: true, pageSize: 20, status: 'pending' },
      userMemberships: { infinite: true, pageSize: 20 },
    });
  const [name, setName] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [actionError, setActionError] = useState<string>();

  if (
    !isLoaded ||
    !isUserLoaded ||
    !createOrganization ||
    !setActive ||
    !userInvitations.revalidate ||
    !userMemberships.revalidate ||
    userInvitations.isLoading ||
    userMemberships.isLoading
  )
    return <WorkspaceGateLoading />;

  const activateOrganization = setActive;
  const createClerkOrganization = createOrganization;
  const reloadInvitations = userInvitations.revalidate;
  const reloadMemberships = userMemberships.revalidate;
  const loadError = userInvitations.error ?? userMemberships.error;
  const invitations = userInvitations.data ?? [];
  const memberships = userMemberships.data ?? [];
  const canCreate = user?.createOrganizationEnabled ?? false;

  async function run(action: PendingAction, operation: () => Promise<void>) {
    setPendingAction(action);
    setActionError(undefined);
    try {
      await operation();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Rundown could not update the workspace.',
      );
      setPendingAction(undefined);
    }
  }

  async function acceptInvitation(invitation: (typeof invitations)[number]) {
    await run({ kind: 'invitation', id: invitation.id }, async () => {
      await invitation.accept();
      await activateOrganization({ organization: invitation.publicOrganizationData.id });
    });
  }

  async function activateMembership(membership: (typeof memberships)[number]) {
    await run({ kind: 'membership', id: membership.id }, async () => {
      await activateOrganization({ organization: membership.organization.id });
    });
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const workspaceName = name.trim();
    if (!workspaceName || !canCreate) return;
    await run({ kind: 'create' }, async () => {
      const organization = await createClerkOrganization({ name: workspaceName });
      await activateOrganization({ organization: organization.id });
    });
  }

  async function retryLoading() {
    setActionError(undefined);
    await Promise.all([reloadInvitations(), reloadMemberships()]);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="flex flex-col gap-8">
        <header>
          <p className="text-sm font-medium text-muted-foreground">Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose where to continue</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Join an invitation, continue in an existing workspace, or create one.
          </p>
        </header>

        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load your workspaces</AlertTitle>
            <AlertDescription>
              <p>{loadError.message}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={retryLoading}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {actionError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not continue</AlertTitle>
                <AlertDescription>{actionError} Try the action again.</AlertDescription>
              </Alert>
            ) : null}

            {invitations.length ? (
              <WorkspaceSection
                title="Pending invitations"
                description="Accept an invitation to join its workspace."
              >
                {invitations.map((invitation) => (
                  <WorkspaceRow
                    key={invitation.id}
                    name={invitation.publicOrganizationData.name}
                    action="Accept"
                    busy={
                      pendingAction?.kind === 'invitation' && pendingAction.id === invitation.id
                    }
                    disabled={Boolean(pendingAction)}
                    onClick={() => acceptInvitation(invitation)}
                  />
                ))}
                {userInvitations.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={userInvitations.isFetching}
                    onClick={userInvitations.fetchNext}
                  >
                    {userInvitations.isFetching ? 'Loading...' : 'Load more invitations'}
                  </Button>
                ) : null}
              </WorkspaceSection>
            ) : null}

            {invitations.length && memberships.length ? <Separator /> : null}

            {memberships.length ? (
              <WorkspaceSection
                title="Your workspaces"
                description="Continue in a workspace you already belong to."
              >
                {memberships.map((membership) => (
                  <WorkspaceRow
                    key={membership.id}
                    name={membership.organization.name}
                    action="Continue"
                    busy={
                      pendingAction?.kind === 'membership' && pendingAction.id === membership.id
                    }
                    disabled={Boolean(pendingAction)}
                    onClick={() => activateMembership(membership)}
                  />
                ))}
                {userMemberships.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={userMemberships.isFetching}
                    onClick={userMemberships.fetchNext}
                  >
                    {userMemberships.isFetching ? 'Loading...' : 'Load more workspaces'}
                  </Button>
                ) : null}
              </WorkspaceSection>
            ) : null}

            {invitations.length || memberships.length ? <Separator /> : null}

            <section aria-labelledby="create-workspace-title" className="flex flex-col gap-4">
              <div>
                <h2 id="create-workspace-title" className="text-lg font-semibold tracking-tight">
                  Create a workspace
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start a separate space for dashboards, data, and members.
                </p>
              </div>
              {canCreate ? (
                <form className="max-w-lg" onSubmit={create}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
                      <Input
                        id="workspace-name"
                        name="workspaceName"
                        autoComplete="organization"
                        value={name}
                        disabled={Boolean(pendingAction)}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="esome"
                      />
                      <FieldDescription>You can invite colleagues after setup.</FieldDescription>
                    </Field>
                    <Field orientation="horizontal">
                      <Button type="submit" disabled={!name.trim() || Boolean(pendingAction)}>
                        {pendingAction?.kind === 'create' ? 'Creating...' : 'Create workspace'}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your Clerk account has reached its workspace limit.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function WorkspaceSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = title.toLowerCase().replaceAll(' ', '-');
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function WorkspaceRow({
  name,
  action,
  busy,
  disabled,
  onClick,
}: {
  name: string;
  action: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 rounded-md bg-muted px-3 py-2">
      <p className="min-w-0 truncate text-sm font-medium">{name}</p>
      <Button size="sm" variant="outline" disabled={disabled} onClick={onClick}>
        {busy ? 'Working...' : action}
        {!busy ? <ArrowRightIcon data-icon="inline-end" /> : null}
      </Button>
    </div>
  );
}

function WorkspaceGateLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="flex flex-col gap-4" aria-label="Loading workspaces">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </main>
  );
}
