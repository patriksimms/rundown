import { describe, expect, it } from 'vitest';
import { replacePlainTextDocument, textDocument } from '#/domain/text-content';

describe('text widget editing', () => {
  it('keeps structured documents intact', () => {
    const document = { type: 'paragraph', children: [{ text: 'Campaign notes' }] };

    expect(textDocument(document)).toContain('Campaign notes');
    expect(replacePlainTextDocument(document, 'Changed')).toBe(document);
  });

  it('updates plain text documents', () => {
    expect(replacePlainTextDocument('Before', 'After')).toBe('After');
  });
});
