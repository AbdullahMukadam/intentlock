export enum DriverErrorKind {
  DATABASE_NOT_REACHABLE = "DatabaseNotReachable",
  CONNECTION_CLOSED = "ConnectionClosed",
  SOCKET_TIMEOUT = "SocketTimeout",
  TOO_MANY_CONNECTIONS = "TooManyConnections",
  TRANSACTION_ALREADY_CLOSED = "TransactionAlreadyClosed",
  POSTGRES = "postgres",
}
