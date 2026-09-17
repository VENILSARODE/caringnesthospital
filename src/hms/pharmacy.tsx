import { useState, ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { C, FONT } from "./theme";
import { useStore } from "./store";
import { Card, PrimaryBtn, GhostBtn, Pill, Table, TR, TD, EmptyRow, Field, Modal, inputStyle, PageHeading, Toaster } from "./ui";
import { HospitalIcon, ResponsiveStyles } from "./Shell";

// ===== Layout =====
export function PharmacyLayout() {
  const { user, setUser } = useStore();
  const nav = useNavigate();
  const tabs = [
    { to: "/pharmacy/queue", label: "Prescription Queue" },
    { to: "/pharmacy/stock", label: "Drug Stock" },
    { to: "/pharmacy/catalogue", label: "Medicine Catalogue" },
    { to: "/pharmacy/log", label: "Dispensing Log" },
  ];
  return (
    <div style={{ fontFamily: FONT, background: C.bgGray, minHeight: "100vh" }}>
      <ResponsiveStyles />
      <header style={{ background: C.navy, color: C.white, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <HospitalIcon size={20} />
          <div style={{ fontWeight: 700, fontSize: 16 }}>Ballari Hrudayalaya Hospital, Ballari</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {user?.name || "Suresh R."} · PH-001 · Pharmacy Counter 1 · Morning (08:00–14:00)
          </div>
          <button onClick={() => { setUser(null); nav("/pharmacy/login"); }} style={{ background: "transparent", color: C.white, border: "1px solid rgba(255,255,255,0.4)", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>↪ Logout</button>
        </div>
      </header>
      <nav style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", gap: 6 }}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} style={({ isActive }) => ({
            padding: "14px 18px", textDecoration: "none", color: isActive ? C.navy : C.textMuted,
            fontWeight: 600, fontSize: 14, borderBottom: isActive ? `3px solid ${C.navy}` : "3px solid transparent",
          })}>{t.label}</NavLink>
        ))}
      </nav>
      <Toaster />
      <main style={{ padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}

// ===== Queue =====
export function PharmacyQueue() {
  const { prescriptions, stock, catalogue, dispense, user, pushToast } = useStore();
  const [openRx, setOpenRx] = useState<string | null>(null);
  const rx = prescriptions.find(p => p.rxId === openRx);

  const stColor = (s: string) =>
    s === "pending" ? { bg: C.orangeLight, c: C.orange } :
    s === "partial" ? { bg: C.yellowLight, c: C.tan } :
    { bg: C.greenLight, c: C.green };

  return (
    <div>
      <PageHeading title="Prescription Queue" />
      <Table columns={["RX ID","UHID","PATIENT","TOKEN","DOCTOR","NOTES","ISSUED","STATUS","ACTION"]}>
        {prescriptions.length === 0 ? <EmptyRow colSpan={9} message="No prescriptions in queue." /> :
          prescriptions.map((p) => {
            const c = stColor(p.status);
            return (
              <TR key={p.rxId}>
                <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{p.rxId}</TD>
                <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{p.uhid}</TD>
                <TD>{p.patient}</TD><TD>{p.token}</TD><TD>{p.doctor}</TD>
                <TD style={{ maxWidth: 280, fontSize: 12, color: C.textMuted }}>{p.notes}</TD>
                <TD style={{ fontSize: 12 }}>{p.issued}</TD>
                <TD><Pill bg={c.bg} color={c.c}>{p.status}</Pill></TD>
                <TD><PrimaryBtn onClick={() => setOpenRx(p.rxId)} style={{ padding: "6px 14px", fontSize: 12 }}>Dispense</PrimaryBtn></TD>
              </TR>
            );
          })}
      </Table>

      {rx && <DispenseModal rx={rx} onClose={() => setOpenRx(null)} stock={stock} catalogue={catalogue} dispense={dispense} pharmacistName={user?.name || "Suresh R."} pushToast={pushToast} />}
    </div>
  );
}

function DispenseModal({ rx, onClose, stock, catalogue, dispense, pharmacistName, pushToast }: {
  rx: any; onClose: () => void; stock: any[]; catalogue: any[];
  dispense: any; pharmacistName: string; pushToast: any;
}) {
  const [items, setItems] = useState<{ medId: string; qty: number; dosage: string }[]>([{ medId: "", qty: 0, dosage: "" }]);
  const [paymentMode, setPaymentMode] = useState("Cash");

  const updateItem = (i: number, patch: any) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addItem = () => setItems([...items, { medId: "", qty: 0, dosage: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const grandTotal = items.reduce((a, it) => {
    const cat = catalogue.find((c) => c.id === it.medId);
    return a + (cat ? cat.price * it.qty : 0);
  }, 0);

  const confirm = () => {
    const valid = items.filter((it) => it.medId && it.qty > 0);
    if (valid.length === 0) { pushToast("Add at least one medicine", "error"); return; }
    const result = dispense(rx.rxId, valid, pharmacistName);
    if (result.ok) onClose();
    else pushToast(result.error || "Dispense failed", "error");
  };

  return (
    <Modal open={true} onClose={onClose} title={`Dispense: ${rx.rxId}`} width={1100}>
      <div style={{ background: C.bgGray, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, fontSize: 13 }}>
          <div><strong>UHID:</strong> <span style={{ fontFamily: "monospace" }}>{rx.uhid}</span></div>
          <div><strong>Patient:</strong> {rx.patient}</div>
          <div><strong>Token:</strong> {rx.token}</div>
          <div><strong>Doctor:</strong> {rx.doctor}</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: C.textMuted }}><strong>Issued:</strong> {rx.issued} · <strong>Notes:</strong> {rx.notes}</div>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 14 }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.bgGray }}>
              {["Medicine","Generic","Form / Strength","Batch","Expiry","Rack","Avail","Qty","Unit ₹","Total ₹","Dosage","Rx?","Storage",""].map(h => (
                <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontSize: 10, color: C.textMuted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const cat = catalogue.find((c) => c.id === it.medId);
              const stk = stock.find((s) => s.medId === it.medId);
              const total = cat ? cat.price * it.qty : 0;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: 4 }}>
                    <select value={it.medId} onChange={(e) => updateItem(i, { medId: e.target.value })} style={{ ...inputStyle, padding: 6, fontSize: 12 }}>
                      <option value="">--Select--</option>
                      {catalogue.filter(c => c.status === "Active").map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 4 }}>{cat?.generic || "—"}</td>
                  <td style={{ padding: 4 }}>{cat ? `${cat.form} ${cat.strength}` : "—"}</td>
                  <td style={{ padding: 4, fontFamily: "monospace" }}>{stk?.batch || "—"}</td>
                  <td style={{ padding: 4 }}>{stk?.expiry || "—"}</td>
                  <td style={{ padding: 4 }}>{stk?.rack || "—"}</td>
                  <td style={{ padding: 4, fontWeight: 700, color: stk && stk.available < 50 ? C.red : C.green }}>{stk?.available ?? "—"}</td>
                  <td style={{ padding: 4 }}>
                    <input type="number" min={0} value={it.qty} onChange={(e) => updateItem(i, { qty: +e.target.value })} style={{ ...inputStyle, padding: 6, fontSize: 12, width: 70 }} />
                  </td>
                  <td style={{ padding: 4 }}>₹{cat?.price || 0}</td>
                  <td style={{ padding: 4, fontWeight: 700 }}>₹{total.toFixed(2)}</td>
                  <td style={{ padding: 4 }}>
                    <input value={it.dosage} onChange={(e) => updateItem(i, { dosage: e.target.value })} style={{ ...inputStyle, padding: 6, fontSize: 12, minWidth: 140 }} />
                  </td>
                  <td style={{ padding: 4 }}>{cat?.rx ? <Pill bg={C.redLight} color={C.red}>Rx</Pill> : "—"}</td>
                  <td style={{ padding: 4, fontSize: 11 }}>{cat?.storage || "—"}</td>
                  <td style={{ padding: 4 }}>{items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <GhostBtn onClick={addItem}>+ Add Medicine</GhostBtn>

      <div style={{ marginTop: 18, padding: 16, background: C.bgGray, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 600 }}>Payment:</span>
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            <option>Cash</option><option>Card</option><option>UPI</option><option>Insurance</option>
          </select>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>Total: ₹{grandTotal.toFixed(2)}</div>
        <PrimaryBtn onClick={confirm}>Confirm Dispense</PrimaryBtn>
      </div>
    </Modal>
  );
}

// ===== Stock =====
export function PharmacyStock() {
  const { stock } = useStore();
  const [filter, setFilter] = useState("");
  const filtered = stock.filter(s => !filter || s.medicine.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div>
      <PageHeading title="Drug Stock & Inventory" action={<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by name or category..." style={{ ...inputStyle, width: 280 }} />} />
      <Table columns={["STOCK ID","MED ID","MEDICINE","BATCH","EXPIRY","RECEIVED","DISPENSED","AVAILABLE","REORDER","STATUS","RACK","UPDATED"]}>
        {filtered.map((s) => {
          const low = s.available <= s.reorder;
          return (
            <TR key={s.stockId} style={{ background: low ? C.amberBg : undefined }}>
              <TD style={{ fontFamily: "monospace" }}>{s.stockId}</TD>
              <TD style={{ fontFamily: "monospace" }}>{s.medId}</TD>
              <TD>{s.medicine}</TD>
              <TD style={{ fontFamily: "monospace", fontSize: 11 }}>{s.batch}</TD>
              <TD>{s.expiry}</TD><TD>{s.received}</TD><TD>{s.dispensed}</TD>
              <TD style={{ fontWeight: 700 }}>{s.available}</TD><TD>{s.reorder}</TD>
              <TD>{low ? <Pill bg={C.redLight} color={C.red}>Low Stock ⚠</Pill> : <Pill bg={C.greenLight} color={C.green}>Sufficient ✓</Pill>}</TD>
              <TD>{s.rack}</TD><TD style={{ fontSize: 11 }}>{s.updated}</TD>
            </TR>
          );
        })}
      </Table>
    </div>
  );
}

// ===== Catalogue =====
export function PharmacyCatalogue() {
  const { catalogue } = useStore();
  const [search, setSearch] = useState("");
  const filtered = catalogue.filter(c => !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase()) ||
    c.form.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <PageHeading title="Medicine Catalogue" action={<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, category, or form..." style={{ ...inputStyle, width: 320 }} />} />
      <Table columns={["ID","NAME","GENERIC","CATEGORY","FORM","STRENGTH","MANUFACTURER","SUPPLIER","RX?","HSN","STORAGE","₹/UNIT","SHELF","STATUS"]}>
        {filtered.map((c) => (
          <TR key={c.id} style={{ opacity: c.status === "Active" ? 1 : 0.4 }}>
            <TD style={{ fontFamily: "monospace" }}>{c.id}</TD>
            <TD style={{ fontWeight: 600 }}>{c.name}</TD>
            <TD>{c.generic}</TD><TD>{c.category}</TD><TD>{c.form}</TD><TD>{c.strength}</TD>
            <TD>{c.manufacturer}</TD><TD>{c.supplier}</TD>
            <TD>{c.rx ? <Pill bg={C.redLight} color={C.red}>Yes</Pill> : "No"}</TD>
            <TD style={{ fontFamily: "monospace", fontSize: 11 }}>{c.hsn}</TD>
            <TD style={{ fontSize: 11 }}>{c.storage}</TD>
            <TD style={{ fontWeight: 700 }}>₹{c.price}</TD>
            <TD>{c.shelf}</TD>
            <TD><Pill bg={c.status === "Active" ? C.greenLight : C.border} color={c.status === "Active" ? C.green : C.textMuted}>{c.status}</Pill></TD>
          </TR>
        ))}
      </Table>
    </div>
  );
}

// ===== Log =====
export function PharmacyLog() {
  const { log } = useStore();
  const [filter, setFilter] = useState("");
  const filtered = log.filter(l => !filter ||
    l.pharmacist.toLowerCase().includes(filter.toLowerCase()) ||
    l.patient.toLowerCase().includes(filter.toLowerCase())
  );
  const total = filtered.reduce((a, b) => a + b.total, 0);
  return (
    <div>
      <PageHeading title="Dispensing Log · Today" action={<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by pharmacist or patient..." style={{ ...inputStyle, width: 300 }} />} />
      <Table columns={["DISPENSE ID","RX ID","UHID","PATIENT","TOKEN","MEDICINE","BATCH","QTY","₹/UNIT","TOTAL","DOSAGE","PHARMACIST","TIME"]}>
        {filtered.map(l => (
          <TR key={l.dispenseId}>
            <TD style={{ fontFamily: "monospace" }}>{l.dispenseId}</TD>
            <TD style={{ fontFamily: "monospace" }}>{l.rxId}</TD>
            <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{l.uhid}</TD>
            <TD>{l.patient}</TD><TD>{l.token}</TD><TD>{l.medicine}</TD>
            <TD style={{ fontFamily: "monospace", fontSize: 11 }}>{l.batch}</TD>
            <TD>{l.qty}</TD><TD>₹{l.unitPrice}</TD>
            <TD style={{ fontWeight: 700 }}>₹{l.total.toFixed(2)}</TD>
            <TD style={{ fontSize: 11 }}>{l.dosage}</TD>
            <TD>{l.pharmacist}</TD><TD style={{ fontSize: 11 }}>{l.time}</TD>
          </TR>
        ))}
      </Table>
      <div style={{ marginTop: 16, padding: 16, background: C.navy, color: C.white, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Daily Total ({filtered.length} dispenses)</span>
        <span style={{ fontSize: 24, fontWeight: 800 }}>₹{total.toFixed(2)}</span>
      </div>
    </div>
  );
}
