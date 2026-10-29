// @mole/telemetry (T16): OpenTelemetry spans for mole check, the daemon and MCP tool calls, only when MOLE_OTEL=1.
// Red-commit stub: the API the tests and the M13 bench compile against; every call fails until implemented.
export type Attrs = Record<string, string | number | boolean | undefined>;
export type SetAttrs = (a: Attrs) => void;

export const GEN_AI = {
  operation: 'gen_ai.operation.name',
  toolName: 'gen_ai.tool.name',
  toolCallId: 'gen_ai.tool.call.id',
  errorType: 'error.type',
  mcpMethod: 'mcp.method.name',
} as const;

const todo = (): never => {
  throw new Error('not implemented (T16)');
};

export function telemetryEnabled(_env: NodeJS.ProcessEnv = process.env): boolean {
  return todo();
}
export function sdkLoaded(): boolean {
  return todo();
}
export async function startTelemetry(_service: string): Promise<boolean> {
  return todo();
}
export async function shutdownTelemetry(): Promise<void> {
  return todo();
}
export async function withSpan<T>(_name: string, _attrs: Attrs, _fn: (set: SetAttrs) => Promise<T> | T): Promise<T> {
  return todo();
}
export function withSpanSync<T>(_name: string, _attrs: Attrs, _fn: (set: SetAttrs) => T): T {
  return todo();
}
export async function executeTool<T>(_tool: string, _attrs: Attrs, _fn: (set: SetAttrs) => Promise<T> | T): Promise<T> {
  return todo();
}
