import { describe, expect, it } from 'vitest';
import { activateAgentModeFromToolUse, initialAgentModeState, selectAgentMode } from './agent-mode';

describe('agent mode', () => {
  it('activates when a WebMCP tool is first used', () => {
    expect(activateAgentModeFromToolUse(initialAgentModeState)).toEqual({
      enabled: true,
      userSelected: false,
    });
  });

  it('respects a user who switches agent mode off', () => {
    const manuallyDisabled = selectAgentMode(false);

    expect(activateAgentModeFromToolUse(manuallyDisabled)).toBe(manuallyDisabled);
  });

  it('keeps an explicit user selection when tools are used', () => {
    const manuallyEnabled = selectAgentMode(true);

    expect(activateAgentModeFromToolUse(manuallyEnabled)).toBe(manuallyEnabled);
  });
});
