export function textDocument(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textDocument).filter(Boolean).join('\n');
  if (value && typeof value === 'object')
    return Object.values(value).map(textDocument).filter(Boolean).join(' ');
  return '';
}

export function replacePlainTextDocument(document: unknown, text: string) {
  return typeof document === 'string' ? text : document;
}
