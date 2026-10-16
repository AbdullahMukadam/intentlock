export enum ClientBlockReason {
  SERVER_UNAVAILABLE = "server_unavailable",
  API_KEY_REJECTED = "api_key_rejected",
  GATE_REJECTED = "gate_rejected",
  AUDIT_WRITE_FAILED = "audit_write_failed",
  AUDIT_BACKLOG = "audit_backlog",
  HOLD_REQUIRES_SERVER = "hold_requires_server",
}
