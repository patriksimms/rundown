interface SharedUser {
  displayName?: string;
  userEmail?: string;
}

export function sharedUserLabel(user: SharedUser) {
  if (user.displayName && user.userEmail) return `${user.displayName} · ${user.userEmail}`;
  return user.displayName ?? user.userEmail ?? 'Unknown or deleted user';
}
