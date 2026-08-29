# Workspace and sharing

## Workspace

A workspace is a tenant. It maps one-to-one to a Clerk Organization.

```yaml
Workspace:
  id: string
  clerkOrganizationId: string
  name: string
  r2Prefix: string          # ws/<id>/ ; all datasource keys must start with it
  createdAt: string
```

## Membership

Workspace roles come from the Clerk Organization. They are not stored separately.

```yaml
WorkspaceRole: admin | member
```

- `admin` (Clerk org admin): everything in the workspace, including datasource registration and the metric library.
- `member`: may create dashboards and becomes their first editor. Access to other dashboards comes from grants.

## Dashboard grant

```yaml
DashboardGrant:
  dashboardId: string
  clerkUserId: string
  role: editor | viewer
  grantedBy: string          # clerkUserId
  grantedAt: string
```

- `editor`: edit the dashboard, manage grants and share links.
- `viewer`: open the dashboard and call `queryWidget` for its widgets.

The creator receives an `editor` grant. Admins need no grant.

## Share link

An unlisted link. Anyone holding the token can view the dashboard and query its widgets, nothing else.

```yaml
ShareLink:
  token: string              # random, at least 128 bits, appears in the URL path
  dashboardId: string
  createdBy: string
  createdAt: string
  revokedAt?: string
```

The server derives the workspace from `dashboardId`. Revoking sets `revokedAt`; the token is never reused.

## Permission summary

| Action | admin | editor grant | viewer grant | share link |
|---|---|---|---|---|
| Register datasource, edit lookup table | yes | no | no | no |
| Create or edit library metrics | yes | yes | no | no |
| Create dashboard | yes | yes (any member) | no | no |
| Edit widgets, calculated fields used by the dashboard | yes | yes | no | no |
| Manage grants and share links | yes | yes | no | no |
| View dashboard, `queryWidget`, `explainWidget` | yes | yes | yes | yes |
