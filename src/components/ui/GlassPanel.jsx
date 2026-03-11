export default function GlassPanel({ as = "div", className = "", variant = "default", children }) {
  const Tag = as;
  const variantClass = variant === "hero" ? "glass-panel--hero" : "glass-panel--default";
  return <Tag className={`glass-panel ${variantClass} ${className}`.trim()}>{children}</Tag>;
}