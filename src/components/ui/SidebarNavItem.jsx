import { NavLink } from "react-router-dom";

function deriveIcon(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "•";
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0].slice(0, 1).toUpperCase();
  return `${words[0].slice(0, 1)}${words[1].slice(0, 1)}`.toUpperCase();
}

export default function SidebarNavItem({ to, children }) {
  const icon = deriveIcon(children);
  return (
    <NavLink to={to} className={({ isActive }) => `sidebar-nav-item${isActive ? " active" : ""}`}>
      <span className="sidebar-nav-item-icon" aria-hidden="true">{icon}</span>
      <span className="sidebar-nav-item-label">{children}</span>
    </NavLink>
  );
}