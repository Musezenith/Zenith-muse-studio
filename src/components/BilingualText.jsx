export default function BilingualText({
  as = "div",
  title,
  subtitle = "",
  className = "",
  titleClassName = "",
  subtitleClassName = "",
}) {
  const Tag = as;
  return (
    <div className={className}>
      <Tag className={titleClassName}>{title}</Tag>
      {subtitle ? (
        <p className={`mt-1 text-xs text-neutral-500 ${subtitleClassName}`}>{subtitle}</p>
      ) : null}
    </div>
  );
}
