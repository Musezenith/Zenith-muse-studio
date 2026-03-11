type Receipt = {
  mode?: string;
  positive_prompt?: string;
  negative_prompt?: string;
  sampler?: string;
  steps?: number;
  cfg?: number;
  seed?: number;
  aspect_ratio?: string;
  model?: string;
  timestamp?: string;
  asset_url?: string;
};

export default function JobReceipt({ receipt }: { receipt: Receipt | null }) {
  if (!receipt) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-500">
        Receipt data unavailable.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
      <div>mode: {receipt.mode || "n/a"}</div>
      <div>positive prompt: {receipt.positive_prompt || "n/a"}</div>
      <div>negative prompt: {receipt.negative_prompt || "n/a"}</div>
      <div>sampler: {receipt.sampler || "n/a"}</div>
      <div>steps: {receipt.steps ?? "n/a"}</div>
      <div>cfg: {receipt.cfg ?? "n/a"}</div>
      <div>seed: {receipt.seed ?? "n/a"}</div>
      <div>aspect ratio: {receipt.aspect_ratio || "n/a"}</div>
      <div>model: {receipt.model || "n/a"}</div>
      <div>timestamp: {receipt.timestamp || "n/a"}</div>
      <div className="truncate">asset url: {receipt.asset_url || "n/a"}</div>
    </div>
  );
}
