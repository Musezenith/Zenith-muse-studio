import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Research from "./pages/Research";
import PromptLab from "./pages/PromptLab";
import ImageFactory from "./pages/ImageFactory";
import Motion from "./pages/Motion";
import Archive from "./pages/Archive";
import DocsHub from "./pages/DocsHub";
import DocDetail from "./pages/DocDetail";
import IntakeNew from "./pages/IntakeNew";
import JobDetail from "./pages/JobDetail";
import QuoteNew from "./pages/QuoteNew";
import QuoteDetail from "./pages/QuoteDetail";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-page" style={styles.page}>
        <aside className="app-sidebar" style={styles.sidebar}>
          <div>
            <div style={styles.logo}>M</div>
            <h2 style={styles.brand}>Musezenith</h2>
            <p style={styles.subbrand}>Fashion Director Studio</p>
          </div>

          <nav style={styles.nav}>
            <NavLink to="/dashboard" style={navLinkStyle}>Dashboard</NavLink>
            <NavLink to="/research" style={navLinkStyle}>Research</NavLink>
            <NavLink to="/prompt-lab" style={navLinkStyle}>Prompt Lab</NavLink>
            <NavLink to="/image-factory" style={navLinkStyle}>Image Factory</NavLink>
            <NavLink to="/motion" style={navLinkStyle}>Motion</NavLink>
            <NavLink to="/archive" style={navLinkStyle}>Archive</NavLink>
            <NavLink to="/docs" style={navLinkStyle}>Docs Hub</NavLink>
            <NavLink to="/intake/new" style={navLinkStyle}>New Intake</NavLink>
          </nav>
        </aside>

        <main className="app-main" style={styles.main}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/research" element={<Research />} />
            <Route path="/prompt-lab" element={<PromptLab />} />
            <Route path="/image-factory" element={<ImageFactory />} />
            <Route path="/motion" element={<Motion />} />
            <Route path="/archive" element={<Archive />} />
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

const navLinkStyle = ({ isActive }) => ({
  display: "block",
  padding: "12px 14px",
  borderRadius: 12,
  textDecoration: "none",
  background: isActive ? "#f5f1ea" : "transparent",
  color: isActive ? "#111" : "rgba(245,241,234,0.72)",
  fontWeight: isActive ? 600 : 400,
});

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    background: "#0a0a0a",
    color: "#f5f1ea",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  sidebar: {
    borderRight: "1px solid rgba(255,255,255,0.08)",
    padding: "28px 20px",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #d7c2a3, #8c6b45)",
    color: "#111",
    fontWeight: 800,
    fontSize: 22,
    marginBottom: 14,
  },
  brand: {
    margin: 0,
    fontSize: 24,
    letterSpacing: "-0.03em",
  },
  subbrand: {
    margin: "6px 0 0",
    color: "rgba(245,241,234,0.65)",
    fontSize: 14,
  },
  nav: {
    marginTop: 32,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  main: {
    padding: "34px",
    minWidth: 0,
  },
};
