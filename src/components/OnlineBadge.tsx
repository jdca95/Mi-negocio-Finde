interface OnlineBadgeProps {
  isOnline: boolean
}

export const OnlineBadge = ({ isOnline }: OnlineBadgeProps) => (
  <span className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
    {isOnline ? 'Online' : 'Offline'}
  </span>
)

