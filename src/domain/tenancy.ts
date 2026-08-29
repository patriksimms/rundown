export function isWorkspaceR2Key(workspacePrefix: string, key: string) {
  return !key.includes('..') && key.startsWith(workspacePrefix);
}

export function scopedR2Prefix(workspacePrefix: string, suffix = '') {
  if (suffix.includes('..')) return undefined;
  return `${workspacePrefix}${suffix.replace(/^\/+/, '')}`;
}
