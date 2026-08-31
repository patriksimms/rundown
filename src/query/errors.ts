export function safeQueryMessage(message: string) {
  const compact = message.replaceAll(/\s+/g, ' ').trim();
  return compact.slice(0, 1_000) || 'The query is invalid.';
}
