const STATUS_MAP = {
  overdue: "status-pill status-pill--overdue",
  "at-risk": "status-pill status-pill--at-risk",
  "on-time": "status-pill status-pill--on-time",
  unknown: "status-pill status-pill--unknown",
};

const TONE_MAP = {
  neutral: "status-pill status-pill--unknown",
  info: "status-pill status-pill--on-time",
  success: "status-pill status-pill--on-time",
  warning: "status-pill status-pill--at-risk",
  danger: "status-pill status-pill--overdue",
};

export default function StatusPill({ status = "unknown", tone = "", children = null }) {
  if (tone && TONE_MAP[tone]) {
    return <span className={TONE_MAP[tone]}>{children || tone}</span>;
  }
  const key = STATUS_MAP[status] ? status : "unknown";
  return <span className={STATUS_MAP[key]}>{children || key}</span>;
}
