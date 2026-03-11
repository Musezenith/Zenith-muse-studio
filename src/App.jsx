import { useMemo, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Research from "./pages/Research";
import PromptLab from "./pages/PromptLab";
import ImageFactory from "./pages/ImageFactory";
import Motion from "./pages/Motion";
import Archive from "./pages/Archive";
import ProofBoard from "./pages/ProofBoard";
import CanonGate from "./pages/CanonGate";
import StudioChief from "./pages/StudioChief";
import ControlRoom from "./pages/ControlRoom";
import CanonAssetBrowser from "./pages/CanonAssetBrowser";
import ReferenceLibrary from "./pages/ReferenceLibrary";
import JapaneseKnowledge from "./pages/JapaneseKnowledge";
import DocsHub from "./pages/DocsHub";
import DocDetail from "./pages/DocDetail";
import IntakeNew from "./pages/IntakeNew";
import JobDetail from "./pages/JobDetail";
import QuoteNew from "./pages/QuoteNew";
import QuoteDetail from "./pages/QuoteDetail";
import SidebarNavItem from "./components/ui/SidebarNavItem";

export default function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const patternClass = useMemo(() => {
    if (typeof window === "undefined") return "";
    const pattern = new URLSearchParams(window.location.search).get("pattern");
    if (pattern === "seigaiha") return "pattern-seigaiha";
    if (pattern === "asanoha") return "pattern-asanoha";
    return "";
  }, []);

  return (
    <BrowserRouter>
      <div className={`app-page ${patternClass} ${isSidebarCollapsed ? "app-sidebar-collapsed" : ""}`.trim()}>
        <aside className="app-sidebar">
          <div>
            <div className="app-sidebar-topbar">
              <div className="app-logo">M</div>
              <button
                type="button"
                className="app-sidebar-toggle"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setIsSidebarCollapsed((current) => !current)}
              >
                {isSidebarCollapsed ? ">" : "<"}
              </button>
            </div>
            <h2 className="app-brand">Musezenith</h2>
            <p className="app-subbrand">Luxury Visual Workflow System</p>
          </div>

          <nav className="app-nav">
            <SidebarNavItem to="/dashboard">Dashboard</SidebarNavItem>

            <div className="app-nav-section">
              <p className="app-nav-heading">PRODUCTION</p>
              <SidebarNavItem to="/intake/new">New Intake</SidebarNavItem>
              <SidebarNavItem to="/prompt-lab">Brief Compiler</SidebarNavItem>
              <SidebarNavItem to="/image-factory">Image Factory</SidebarNavItem>
              <SidebarNavItem to="/proof-board">Proof Board</SidebarNavItem>
              <SidebarNavItem to="/canon-gate">Canon Gate</SidebarNavItem>
              <SidebarNavItem to="/archive">Archive</SidebarNavItem>
            </div>

            <div className="app-nav-section">
              <p className="app-nav-heading">LIBRARIES</p>
              <SidebarNavItem to="/reference-library">Reference Library</SidebarNavItem>
              <SidebarNavItem to="/japanese-knowledge">Japanese Knowledge</SidebarNavItem>
              <SidebarNavItem to="/canon-assets">Canon Asset Browser</SidebarNavItem>
            </div>

            <div className="app-nav-section">
              <p className="app-nav-heading">CLIENT</p>
              <SidebarNavItem to="/archive?view=client">Client Archive</SidebarNavItem>
              <SidebarNavItem to="/proof-board?view=client">Client Pitch</SidebarNavItem>
            </div>

            <div className="app-nav-section">
              <p className="app-nav-heading">SYSTEM</p>
              <SidebarNavItem to="/studio/chief">Studio Chief</SidebarNavItem>
              <SidebarNavItem to="/studio/control-room">Control Room</SidebarNavItem>
              <SidebarNavItem to="/research">Research</SidebarNavItem>
              <SidebarNavItem to="/docs">Docs Hub</SidebarNavItem>
            </div>
          </nav>
        </aside>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/studio/chief" element={<StudioChief />} />
            <Route path="/studio/control-room" element={<ControlRoom />} />
            <Route path="/research" element={<Research />} />
            <Route path="/prompt-lab" element={<PromptLab />} />
            <Route path="/image-factory" element={<ImageFactory />} />
            <Route path="/canon-assets" element={<CanonAssetBrowser />} />
            <Route path="/reference-library" element={<ReferenceLibrary />} />
            <Route path="/japanese-knowledge" element={<JapaneseKnowledge />} />
            <Route path="/motion" element={<Motion />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/proof-board" element={<ProofBoard />} />
            <Route path="/canon-gate" element={<CanonGate />} />
            <Route path="/docs" element={<DocsHub />} />
            <Route path="/docs/:slug" element={<DocDetail />} />
            <Route path="/intake/new" element={<IntakeNew />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/jobs/:id/quotes/new" element={<QuoteNew />} />
            <Route path="/quotes/:id" element={<QuoteDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
