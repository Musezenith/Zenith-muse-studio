import BilingualText from "../components/BilingualText";

export default function ImageFactory() {
  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4 overflow-x-hidden">
      <BilingualText
        as="h1"
        title="Image Factory"
        subtitle="Khu vực sản xuất và theo dõi các lô ảnh đầu ra."
        titleClassName="text-3xl font-semibold text-white"
        subtitleClassName="text-sm text-neutral-400"
      />
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
        Image production workspace is available in this module.
      </div>
    </div>
  );
}
