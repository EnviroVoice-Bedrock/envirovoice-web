import type { ConnectionStatus } from "../types/signaling";

type Props = {
  status: ConnectionStatus;
};

const statusLabel: Record<ConnectionStatus, string> = {
  connecting: "Connecting...",
  connected: "Connected",
  disconnected: "Disconnected",
  reconnecting: "Reconnecting..."
};

export const ConnectionBadge = ({ status }: Props) => {
  return <span className={`connection-badge connection-${status}`}>{statusLabel[status]}</span>;
};
