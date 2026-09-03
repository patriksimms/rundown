export interface AgentModeState {
  enabled: boolean;
  userSelected: boolean;
}

export const initialAgentModeState: AgentModeState = {
  enabled: false,
  userSelected: false,
};

export function activateAgentModeFromToolUse(state: AgentModeState): AgentModeState {
  if (state.userSelected || state.enabled) return state;
  return { ...state, enabled: true };
}

export function selectAgentMode(enabled: boolean): AgentModeState {
  return { enabled, userSelected: true };
}
