import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { C, FONT } from "./theme";
import { useStore, Role } from "./store";
import { useClock, formatDate } from "./ui";
import { HospitalIcon } from "./Shell";

export default function LoginPage({ pharmacist = false }: { pharmacist?: boolean }) {
  const { setUser } = useStore();
  const nav = useNavigate();
  const now = useClock();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [role, setRole] = useState<"admin" | "receptionist" | "pharmacist">("admin");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (mode === "signup" && !name.trim()) errs.name = "Name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid email";
    if (!password) errs.password = "Password is required";
    else if (mode === "signup" && password.length < 6) errs.password = "Min 6 characters";
    if (mode === "signup" && password !== confirmPwd) errs.confirm = "Passwords do not match";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const displayName = name.trim() || (email.split("@")[0] || "User");

    if (pharmacist || role === "pharmacist") {
      setUser({
        name: mode === "signup" ? displayName : "Suresh R.",
        role: "pharmacist",
        initial: (mode === "signup" ? displayName : "Suresh R.").charAt(0).toUpperCase(),
        roleLabel: "Pharmacy Counter 1",
      });
      nav("/pharmacy/queue");
    } else {
      const r: Role = role;
      setUser({
        name: mode === "signup" ? displayName : (r === "admin" ? "Admin" : "Front Officer"),
        role: r,
        initial: (mode === "signup" ? displayName : (r === "admin" ? "Admin" : "Front Officer")).charAt(0).toUpperCase(),
        roleLabel: r === "admin" ? "Full Access" : "Operations",
      });
      nav(r === "admin" ? "/admin/dashboard" : "/receptionist/dashboard");
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: FONT, background: C.white }}>
      {/* LEFT */}
      <div style={{
        flex: "0 0 60%", background: `linear-gradient(135deg, ${C.navy} 0%, #1a3a70 50%, #0a1d3a 100%)`,
        color: C.white, padding: 40, display: "flex", flexDirection: "column", position: "relative",
      }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {formatDate(now)} • {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div style={{
            width: 90, height: 90, background: "#0a1d3a", borderRadius: 18,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            <span style={{ color: C.red, fontSize: 50, fontWeight: 900 }}>✚</span>
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: FONT,
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: 0,
            fontStyle: "normal",
            color: C.white,
          }}>CARING-NEST HOSPITAL</h1>
          <div style={{
            marginTop: 16, background: "rgba(0,0,0,0.3)", padding: "8px 18px",
            borderRadius: 20, fontSize: 13, border: "1px solid rgba(255,255,255,0.1)",
          }}>🏥 AI Voice Agent & Smart Hospital Management</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {[
            { icon: "🏥", t: "OPD & IPD", s: "Complete patient flow" },
            { icon: "✏️", t: "Lab & Pharmacy", s: "Diagnostics & meds" },
            { icon: "📊", t: "Analytics", s: "Real-time insights" },
          ].map((f) => (
            <div key={f.t} style={{
              flex: 1, background: "rgba(0,0,0,0.3)", padding: 18, borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ fontSize: 24 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, marginTop: 8, fontSize: 14 }}>{f.t}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{f.s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ flex: "0 0 40%", padding: "60px 50px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: C.textDark }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <div style={{ color: C.textMuted, marginTop: 6, marginBottom: 28, fontSize: 14 }}>
          {mode === "signup"
            ? `Sign up to access your ${pharmacist ? "pharmacy" : "hospital"} dashboard`
            : `Sign in to access your ${pharmacist ? "pharmacy" : "hospital"} dashboard`}
        </div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.textDark, display: "block", marginBottom: 6 }}>Full Name</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>👤</span>
                <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Your full name" style={{
                  width: "100%", padding: "12px 12px 12px 40px", border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 14, fontFamily: FONT, boxSizing: "border-box",
                }} />
              </div>
              {errors.name && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{errors.name}</div>}
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.textDark, display: "block", marginBottom: 6 }}>Email Address</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>📧</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@hospital.com" style={{
                width: "100%", padding: "12px 12px 12px 40px", border: `1px solid ${C.border}`,
                borderRadius: 8, fontSize: 14, fontFamily: FONT, boxSizing: "border-box",
              }} />
            </div>
            {errors.email && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{errors.email}</div>}
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.textDark, display: "block", marginBottom: 6 }}>Password</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>🔒</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPwd ? "text" : "password"} placeholder={mode === "signup" ? "Create a password (min 6 chars)" : "Enter password"} style={{
                width: "100%", padding: "12px 40px 12px 40px", border: `1px solid ${C.border}`,
                borderRadius: 8, fontSize: 14, fontFamily: FONT, boxSizing: "border-box",
              }} />
              <span onClick={() => setShowPwd(!showPwd)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }}>{showPwd ? "🙈" : "👁️"}</span>
            </div>
            {errors.password && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{errors.password}</div>}
          </div>

          {mode === "signup" && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.textDark, display: "block", marginBottom: 6 }}>Confirm Password</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>🔒</span>
                <input value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} type={showPwd ? "text" : "password"} placeholder="Re-enter password" style={{
                  width: "100%", padding: "12px 12px 12px 40px", border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 14, fontFamily: FONT, boxSizing: "border-box",
                }} />
              </div>
              {errors.confirm && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{errors.confirm}</div>}
            </div>
          )}

          {!pharmacist && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.textDark, display: "block", marginBottom: 8 }}>{mode === "signup" ? "Sign Up As" : "Login As"}</label>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { k: "admin" as const, icon: "🛡️", t: "Admin", s: "Full access" },
                  { k: "receptionist" as const, icon: "🧑", t: "Front Officer", s: "Operations" },
                  { k: "pharmacist" as const, icon: "💊", t: "Pharmacist", s: "Dispensing" },
                ].map((o) => (
                  <div key={o.k} onClick={() => setRole(o.k)} style={{
                    flex: 1, padding: 14, border: `2px solid ${role === o.k ? C.navy : C.border}`,
                    borderRadius: 10, cursor: "pointer", textAlign: "center",
                    background: role === o.k ? "#F1F5F9" : C.white,
                  }}>
                    <div style={{ fontSize: 22 }}>{o.icon}</div>
                    <div style={{ fontWeight: 700, marginTop: 4, fontSize: 13 }}>{o.t}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{o.s}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" style={{
            width: "100%", padding: 14, background: C.navy, color: C.white, border: "none",
            borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}>{mode === "signup" ? "Create Account →" : "Sign In →"}</button>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 13 }}>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); alert("Password reset is not available in this demo. Use any email & password to sign in."); }}
              style={{ color: C.blue, textDecoration: "none" }}
            >
              Forgot Password?
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setErrors({});
                setMode(mode === "signup" ? "signin" : "signup");
              }}
              style={{ color: C.blue, textDecoration: "none", fontWeight: 600 }}
            >
              {mode === "signup" ? "Already have an account? Sign In" : "Create Account"}
            </a>
          </div>
          <div style={{ textAlign: "center", marginTop: 22, color: C.textLight, fontSize: 12, lineHeight: 1.5 }}>
            🔒 Secure login • 256-bit encrypted
            <div style={{ marginTop: 4, color: C.textMuted }}>
              Demo mode — any email & password works
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
