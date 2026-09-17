import { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { C, FONT } from "./theme";
import { useStore } from "./store";
import { useClock, formatDate, formatTime, Toaster } from "./ui";

const adminNav = [
  { label: "MAIN", items: [
    { to: "/admin/dashboard", icon: "📊", text: "Dashboard" },
    { to: "/admin/patients", icon: "👥", text: "Patient Registry" },
  ]},
  { label: "CLINICAL", items: [
    { to: "/admin/emergency", icon: "🚨", text: "Emergency" },
    { to: "/admin/opd", icon: "🎫", text: "OPD Queue" },
    { to: "/admin/ipd", icon: "🏥", text: "IPD Admissions" },
    { to: "/admin/beds", icon: "🛏️", text: "Bed Management" },
  ]},
  { label: "DIAGNOSTICS", items: [
    { to: "/admin/lab", icon: "✏️", text: "Lab" },
    { to: "/admin/pharmacy", icon: "💊", text: "Pharmacy" },
  ]},
  { label: "ADMINISTRATION", items: [
    { to: "/admin/doctors", icon: "👨‍⚕️", text: "Doctors" },
    { to: "/admin/staff", icon: "👥", text: "Staff" },
    { to: "/admin/billing", icon: "💰", text: "Billing" },
    { to: "/admin/mlc", icon: "⚖️", text: "MLC Alerts" },
    { to: "/admin/reports", icon: "📋", text: "Reports" },
  ]},
];
const recNav = adminNav.map(g => ({ ...g, items: g.items.map(i => ({ ...i, to: i.to.replace("/admin/", "/receptionist/") })) }));

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard", patients: "Patient Registry", emergency: "Emergency Cases",
  opd: "OPD Token Queue", ipd: "IPD Admissions", beds: "Ward & Bed Management",
  lab: "Lab Management", pharmacy: "Pharmacy", doctors: "Doctor Management",
  staff: "Staff Management", billing: "Billing & Payments", mlc: "MLC Alerts", reports: "Reports & Analytics",
};

export function HospitalIcon({ size = 22 }: { size?: number }) {
  return (
    <div style={{
      width: size + 8, height: size + 8, background: C.white, borderRadius: 6,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: C.red, fontWeight: 900, fontSize: size * 0.85,
    }}>✚</div>
  );
}

function Sidebar({ role }: { role: "admin" | "receptionist" }) {
  const groups = role === "admin" ? adminNav : recNav;
  return (
    <aside className="hms-sidebar" style={{
      width: 220, background: C.navy, color: C.white, height: "100vh",
      position: "fixed", left: 0, top: 0, display: "flex", flexDirection: "column",
      fontFamily: FONT, overflowY: "auto", zIndex: 60,
    }}>
      <div className="hms-sidebar-brand" style={{ padding: "20px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <HospitalIcon size={20} />
        <div className="hms-nav-label">
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Ballari Hrudayalaya</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>HMS</div>
        </div>
      </div>
      <nav style={{ flex: 1, padding: "12px 0" }}>
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 14 }}>
            <div className="hms-nav-label" style={{ padding: "6px 18px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1.2 }}>{g.label}</div>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end title={i.text} style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10, padding: "9px 18px",
                margin: "1px 10px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                color: C.white, textDecoration: "none",
                background: isActive ? "rgba(96,165,250,0.25)" : "transparent",
              })}>
                <span style={{ fontSize: 14 }}>{i.icon}</span>
                <span className="hms-nav-label">{i.text}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="hms-nav-label" style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
        <div style={{ fontWeight: 600 }}>Ballari Hrudayalaya HMS</div>
        <div>v2.0 • AI Powered</div>
      </div>
    </aside>
  );
}

const RESPONSIVE_CSS = `
@media (max-width: 768px) {
  .hms-sidebar { width: 64px !important; }
  .hms-sidebar .hms-nav-label { display: none !important; }
  .hms-sidebar nav a { justify-content: center; padding: 10px 0 !important; margin: 2px 8px !important; }
  .hms-sidebar nav a span { font-size: 18px !important; }
  .hms-sidebar-brand { justify-content: center; padding: 16px 0 !important; }
  .hms-header { left: 64px !important; padding: 0 14px !important; }
  .hms-header .hms-header-meta { display: none !important; }
  .hms-main { margin-left: 64px !important; }
  .hms-main > div { padding: 16px !important; }
  .hms-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
  .hms-grid-6 { grid-template-columns: repeat(2, 1fr) !important; }
}
`;

export function ResponsiveStyles() {
  return <style>{RESPONSIVE_CSS}</style>;
}

function Header() {
  const { user, setUser } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const now = useClock();
  const slug = loc.pathname.split("/").pop() || "dashboard";
  const title = PAGE_TITLES[slug] || "Dashboard";

  const logout = () => { setUser(null); nav("/login"); };

  return (
    <header className="hms-header" style={{
      position: "fixed", top: 0, left: 220, right: 0, height: 70,
      background: C.navy, color: C.white, display: "flex", alignItems: "center",
      padding: "0 24px", justifyContent: "space-between", zIndex: 50, fontFamily: FONT,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <HospitalIcon size={20} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{formatDate(now)}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600 }}>{formatTime(now)}</div>
        <div style={{ fontSize: 20, color: C.yellow, cursor: "pointer" }}>🔔</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "#1a3460",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 14, border: `2px solid rgba(255,255,255,0.15)`,
          }}>{user?.initial || "A"}</div>
          <div className="hms-header-meta" style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{user?.name || "Admin"}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{user?.roleLabel || "Full Access"}</div>
          </div>
        </div>
        <button onClick={logout} style={{
          background: "transparent", color: C.white, border: "1px solid rgba(255,255,255,0.4)",
          padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT,
        }}>Logout</button>
      </div>
    </header>
  );
}

export function ShellLayout({ role, children }: { role: "admin" | "receptionist"; children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONT, background: C.bgGray, minHeight: "100vh" }}>
      <ResponsiveStyles />
      <Sidebar role={role} />
      <Header />
      <Toaster />
      <main className="hms-main" style={{ marginLeft: 220, paddingTop: 70 }}>
        <div style={{ padding: 24 }}>{children}</div>
      </main>
    </div>
  );
}
