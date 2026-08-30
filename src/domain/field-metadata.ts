import type { ApiRequest } from '#/api/contracts';

type MetadataPatch = Extract<ApiRequest, { action: 'updateFieldMetadata' }>['patch'];

export function canUpdateFieldMetadata(
  isAdmin: boolean,
  hasEditorAccess: boolean,
  dashboardUsesSource: boolean,
  patch: MetadataPatch,
) {
  if (isAdmin) return true;
  if (!hasEditorAccess || !dashboardUsesSource) return false;
  return (
    patch.hidden === undefined && patch.castTo === undefined && patch.canonicalName === undefined
  );
}
