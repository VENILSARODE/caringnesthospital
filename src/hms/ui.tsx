import { CSSProperties, ReactNode, useEffect, useState } from "react";
import { C, FONT, shadow } from "./theme";
import { useStore } from "./store";

// ===== Buttons =====
export function PrimaryBtn({ children, onClick, type = "button", style }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; style?: CSSProperties }) {
  return (
    <button type={type} onClick={onClick} style={{
      background: C.navy, color: C.white, border: "none", padding: "10px 18px",
      borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: FONT,
      display: "inline-flex", alignItems: "center", gap: 8, ...style,
    }}>{children}</button>
  );
}
export function GhostBtn({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  return (
    <button onClick={onClick} style={{
      background: C.white, color: C.textDark, border: `1px solid ${C.border}`, padding: "8px 14px",
      borderRadius: 8, fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: FONT, ...style,
    }}>{children}</button>
  );
}
export function DangerBtn({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  return (
    <button onClick={onClick} style={{
      background: C.red, color: C.white, border: "none", padding: "10px 18px",
      borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: FONT,
      display: "inline-flex", alignItems: "center", gap: 8, ...style,
    }}>{children}</button>
  );
}

// ===== Card =====
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: 20, boxShadow: shadow.card, ...style,
    }}>{children}</div>
  );
}

// ===== StatCard =====
export function StatCard({ label, value, icon, color = C.navy, tint }: { label: string; value: string | number; icon: string; color?: string; tint?: string }) {
  return (
    <div style={{
      background: tint || C.white, border: `1px solid ${C.border}`, borderLeft: `4px solid ${color}`,
      borderRadius: 8, padding: 18, boxShadow: shadow.card,
      display: "flex", justifyContent: "space-between", alignItems: "flex-start", minHeight: 90,
    }}>
      <div>
        <div style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        <div style={{ color: C.textDark, fontSize: 28, fontWeight: 700, marginTop: 6 }}>{value}</div>
      </div>
      <div style={{ fontSize: 26, opacity: 0.8 }}>{icon}</div>
    </div>
  );
}

// ===== Pill / Badge =====
export function Pill({ children, bg, color }: { children: ReactNode; bg: string; color: string }) {
  return (
    <span style={{
      background: bg, color, padding: "4px 12px", borderRadius: 20, fontSize: 12,
      fontWeight: 600, display: "inline-block",
    }}>{children}</span>
  );
}

// ===== Table =====
export function Table({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, background: C.white }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: FONT }}>
        <thead>
          <tr style={{ background: C.bgGray }}>
            {columns.map((col) => (
              <th key={col} style={{
                textAlign: "left", padding: "12px 14px", color: C.textMuted, fontSize: 11,
                fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                borderBottom: `1px solid ${C.border}`,
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function TR({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <tr style={{ borderBottom: `1px solid ${C.border}`, ...style }}>{children}</tr>;
}
export function TD({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <td style={{ padding: "12px 14px", color: C.textDark, ...style }}>{children}</td>;
}
export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "60px 20px", textAlign: "center", color: C.textMuted, fontStyle: "italic" }}>
        {message}
      </td>
    </tr>
  );
}

// ===== Input / Select / Textarea =====
export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textDark, marginBottom: 6 }}>{label}</label>
      {children}
      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
export const inputStyle: CSSProperties = {
  width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8,
  fontSize: 14, fontFamily: FONT, color: C.textDark, background: C.white, boxSizing: "border-box",
};

// ===== Modal =====
export function Modal({ open, onClose, title, children, width = 600 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,37,72,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.white, borderRadius: 12, width: "100%", maxWidth: width,
        maxHeight: "90vh", overflowY: "auto", boxShadow: shadow.modal,
      }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.textDark }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.textMuted }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

// ===== Toaster =====
export function Toaster() {
  const { toasts, dismissToast } = useStore();
  return (
    <div style={{ position: "fixed", top: 90, right: 24, zIndex: 2000, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map((t) => {
        const colors = {
          success: { bg: C.greenLight, color: C.green, icon: "✓" },
          error: { bg: C.redLight, color: C.red, icon: "✕" },
          warn: { bg: C.amberBg, color: C.orange, icon: "⚠" },
          info: { bg: C.blueLight, color: C.blue, icon: "ℹ" },
        }[t.type];
        return (
          <div key={t.id} onClick={() => dismissToast(t.id)} style={{
            background: C.white, border: `1px solid ${colors.color}`, borderLeft: `4px solid ${colors.color}`,
            padding: "12px 18px", borderRadius: 8, minWidth: 280, maxWidth: 380, cursor: "pointer",
            boxShadow: shadow.modal, display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ background: colors.bg, color: colors.color, borderRadius: "50%", width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{colors.icon}</span>
            <span style={{ color: C.textDark, fontSize: 14 }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

// ===== Section heading =====
export function PageHeading({ title, subtitle, action }: { title: ReactNode; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.textDark }}>{title}</h1>
        {subtitle && <div style={{ color: C.textMuted, fontSize: 14, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function ChartPlaceholder({ title }: { title: string }) {
  return (
    <div style={{
      background: C.white, border: `2px dashed ${C.border}`, borderRadius: 8,
      padding: 40, textAlign: "center", minHeight: 220,
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
    }}>
      <div style={{ fontSize: 14, color: C.textDark, fontWeight: 600, marginBottom: 18, alignSelf: "flex-start" }}>{title}</div>
      <div style={{ fontSize: 56, opacity: 0.3 }}>📊</div>
      <div style={{ color: C.textMuted, fontSize: 14, marginTop: 12, fontWeight: 600 }}>No data yet</div>
      <div style={{ color: C.textLight, fontSize: 12, marginTop: 4 }}>Add data through modules to see charts here</div>
    </div>
  );
}

// ===== Live clock hook =====
export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
}
export function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}
