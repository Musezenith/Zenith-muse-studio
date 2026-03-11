import GlassPanel from "./GlassPanel";

export default function StudioPageGuide({ purpose, happensHere, nextStep }) {
  return (
    <GlassPanel className="studio-page-guide rounded-2xl p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="studio-page-guide-label">Page Purpose</div>
          <p className="studio-page-guide-text">{purpose}</p>
        </div>
        <div>
          <div className="studio-page-guide-label">What Happens Here</div>
          <p className="studio-page-guide-text">{happensHere}</p>
        </div>
        <div>
          <div className="studio-page-guide-label">Next Step</div>
          <p className="studio-page-guide-text">{nextStep}</p>
        </div>
      </div>
    </GlassPanel>
  );
}
