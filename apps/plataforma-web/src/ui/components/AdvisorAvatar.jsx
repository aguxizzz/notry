function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AdvisorAvatar({ name, size = 28 }) {
  const initials = getInitials(name);
  return (
    <div
      className="kanban-avatar"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-label={name || 'Sin asesor'}
    >
      {initials}
    </div>
  );
}