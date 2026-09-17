import { useState } from "react";
import { useStore, type Emergency } from "./store";
import { C } from "./theme";
import { Card, PrimaryBtn, DangerBtn, GhostBtn, StatCard, Pill, Table, TR, TD, EmptyRow, Field, Modal, inputStyle, PageHeading, ChartPlaceholder } from "./ui";

// ===== MLC Report helpers =====
const HOSPITAL_NAME = "Ballari Hrudayalaya Hospital, Ballari";
const HOSPITAL_ADDR = "Hospital Road, Ballari, Karnataka 583101 · Ph: +91 8392 123456";

function buildMLCReportHTML(e: Emergency): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>MLC Report ${e.uhid}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#222;margin:40px;font-size:13px}
  h1{margin:0;font-size:20px;color:#0F2A5F} h2{margin:0;font-size:13px;color:#666;font-weight:400}
  .hdr{border-bottom:3px double #0F2A5F;padding-bottom:14px;margin-bottom:18px;text-align:center}
  .badge{display:inline-block;background:#DC2626;color:#fff;padding:6px 14px;border-radius:4px;font-weight:700;letter-spacing:1px;margin-top:10px}
  table{width:100%;border-collapse:collapse;margin:14px 0}
  td{padding:8px 10px;border:1px solid #ddd;vertical-align:top}
  td.k{background:#F5F7FA;font-weight:700;width:32%}
  .sec{margin-top:22px;font-weight:700;color:#0F2A5F;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:4px}
  .sign{display:flex;justify-content:space-between;margin-top:60px}
  .sign div{width:30%;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:12px}
  .footer{margin-top:30px;font-size:11px;color:#666;text-align:center;border-top:1px dashed #ccc;padding-top:10px}
  @media print{body{margin:20px}}
</style></head><body>
<div class="hdr">
  <h1>${HOSPITAL_NAME}</h1>
  <h2>${HOSPITAL_ADDR}</h2>
  <div class="badge">⚖ MEDICO-LEGAL CASE (MLC) REPORT</div>
</div>
<div class="sec">Case Identification</div>
<table>
  <tr><td class="k">MLC / UHID No.</td><td><b>${e.uhid}</b></td><td class="k">Emergency ID</td><td>${e.id}</td></tr>
  <tr><td class="k">Date of Arrival</td><td>${e.arrived}</td><td class="k">Time of Arrival</td><td>${e.time}</td></tr>
</table>
<div class="sec">Patient Particulars</div>
<table>
  <tr><td class="k">Patient Name</td><td>${e.patient}</td><td class="k">Age / Gender</td><td>${e.age} yrs / ${e.gender}</td></tr>
  <tr><td class="k">Contact Number</td><td colspan="3">${e.contact || "—"}</td></tr>
</table>
<div class="sec">Incident Details</div>
<table>
  <tr><td class="k">Place of Incident</td><td colspan="3">${e.location || "—"}</td></tr>
  <tr><td class="k">Nature of Injury</td><td colspan="3">${e.injury}</td></tr>
  <tr><td class="k">Condition on Arrival</td><td>${e.condition}</td><td class="k">Triage Level</td><td>${e.triage}</td></tr>
</table>
<div class="sec">Medical Officer</div>
<table>
  <tr><td class="k">Attending Doctor</td><td colspan="3">${e.doctor || "—"}</td></tr>
</table>
<div class="sec">Statutory Declaration</div>
<p style="line-height:1.6">This MLC has been registered under Section 39 CrPC. All findings, treatment, and observations have been entered in the patient's case sheet. A copy of this report is being forwarded to the jurisdictional Police Station for further action as per law.</p>
<div class="sign">
  <div>Medical Officer<br/><small>Signature &amp; Stamp</small></div>
  <div>Casualty In-charge<br/><small>Signature &amp; Stamp</small></div>
  <div>Hospital Seal<br/><small>${HOSPITAL_NAME}</small></div>
</div>
<div class="footer">Generated on ${new Date().toLocaleString()} · Confidential — for medico-legal purposes only</div>
</body></html>`;
}

function printMLCReport(e: Emergency) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { alert("Pop-up blocked. Please allow pop-ups to print the MLC report."); return; }
  w.document.write(buildMLCReportHTML(e));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

function buildMLCEmailBody(e: Emergency): string {
  return `To,
The Station House Officer,
[Police Station Name]

Subject: Intimation of Medico-Legal Case (MLC) — ${e.uhid}

Sir/Madam,

This is to intimate you about the following Medico-Legal Case registered at ${HOSPITAL_NAME} on ${e.arrived} at ${e.time}.

— CASE DETAILS —
MLC / UHID No.   : ${e.uhid}
Emergency ID     : ${e.id}
Patient Name     : ${e.patient}
Age / Gender     : ${e.age} yrs / ${e.gender}
Contact          : ${e.contact || "—"}
Place of Incident: ${e.location || "—"}
Nature of Injury : ${e.injury}
Condition        : ${e.condition} (Triage: ${e.triage})
Attending Doctor : ${e.doctor || "—"}

A signed printed copy of the full MLC report is being dispatched. Kindly acknowledge receipt and depute the Investigating Officer for further proceedings.

Regards,
Casualty Medical Officer
${HOSPITAL_NAME}
${HOSPITAL_ADDR}`;
}


// ===== Dashboard =====
export function DashboardPage({ role }: { role: "admin" | "receptionist" }) {
  const s = useStore();
  const beds = s.beds.filter((b) => b.status === "Available").length;
  const docs = s.doctors.filter((d) => d.available).length;
  const labsP = s.labs.filter((l) => l.status !== "Completed").length;
  const revenue = s.payments.filter((p) => p.status === "Completed").reduce((a, b) => a + b.amount, 0);

  return (
    <div>
      <div style={{
        background: `linear-gradient(135deg, ${C.navy} 0%, #1a3a70 100%)`,
        color: C.white, borderRadius: 14, padding: "26px 30px", marginBottom: 24,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Good Afternoon, {role === "admin" ? "Admin" : "Front Officer"} 👋</div>
          <div style={{ opacity: 0.85, marginTop: 4 }}>Here's what's happening at Ballari Hrudayalaya today</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <DangerBtn>🚨 New Emergency</DangerBtn>
          <button style={{ background: "#1a3a70", color: C.white, border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>🎫 Add OPD Token</button>
          <button style={{ background: "#1a3a70", color: C.white, border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>🏥 Admit Patient</button>
        </div>
      </div>

      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <StatCard label="Total Patients Today" value={s.patients.length} icon="👥" color={C.navy} />
        <StatCard label="Active Emergencies" value={s.emergencies.length} icon="🚨" color={C.red} />
        <StatCard label="OPD Tokens" value={s.opd.length} icon="🎫" color={C.yellow} />
        <StatCard label="IPD Admissions" value={s.ipd.length} icon="🏥" color={C.blue} />
      </div>
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard label="Beds Available" value={beds} icon="🛏️" color={C.green} />
        <StatCard label="Doctors On-Duty" value={docs} icon="👨‍⚕️" color={C.blue} />
        <StatCard label="Lab Tests Pending" value={labsP} icon="✏️" color={C.orange} />
        <StatCard label="Revenue Today" value={`₹${revenue}`} icon="💰" color={C.green} />
      </div>

      <h3 style={{ margin: "8px 0 16px", color: C.textDark }}>⚡ Quick Actions</h3>
      <div className="hms-grid-6" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 30 }}>
        {[
          { label: "🚨 New Emergency", bg: C.redLight, color: C.red },
          { label: "🎫 Add OPD Token", bg: C.yellowLight, color: C.tan },
          { label: "🏥 Admit Patient", bg: C.blueLight, color: C.blue },
          { label: "✏️ Order Lab Test", bg: C.pinkLight, color: C.pink },
          { label: "💰 New Payment", bg: C.greenLight, color: C.green },
          { label: "🛏️ View Beds", bg: "#FEF3C7", color: C.tan },
        ].map((q) => (
          <div key={q.label} style={{
            background: q.bg, borderRadius: 12, padding: 22, textAlign: "center", cursor: "pointer",
            color: q.color, fontWeight: 700, fontSize: 13,
          }}>{q.label}</div>
        ))}
      </div>
      <div style={{ textAlign: "center", color: C.textMuted, fontStyle: "italic", padding: 20 }}>
        Start by adding doctors, patients, and beds to see dashboard analytics populate here.
      </div>
    </div>
  );
}

// ===== Patients =====
export function PatientsPage({ canEdit }: { canEdit: boolean }) {
  const { patients, addPatient, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", blood: "O+", contact: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name required";
    if (!form.age) e.age = "Age required";
    if (!/^\d{10}$/.test(form.contact)) e.contact = "10-digit number required";
    setErrs(e);
    if (Object.keys(e).length) return;
    const today = new Date().toLocaleDateString();
    addPatient({
      uhid: `UHID-${Date.now().toString().slice(-6)}`, name: form.name, age: +form.age,
      gender: form.gender, blood: form.blood, contact: form.contact,
      registered: today, lastVisit: today, visits: 1, status: "Active",
    });
    pushToast("Patient registered", "success");
    setOpen(false); setForm({ name: "", age: "", gender: "Male", blood: "O+", contact: "" });
  };

  const filtered = patients.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.uhid.toLowerCase().includes(search.toLowerCase()) || p.contact.includes(search)
  );

  return (
    <div>
      <PageHeading title="👥 Patient Registry" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Register Patient</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Patients" value={patients.length} icon="👥" color={C.navy} />
        <StatCard label="Active" value={patients.filter(p => p.status === "Active").length} icon="✅" color={C.green} />
        <StatCard label="Discharged" value={0} icon="🏠" color={C.blue} />
        <StatCard label="Follow-Up" value={0} icon="🔄" color={C.orange} />
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, UHID, or phone..." style={{ ...inputStyle, marginBottom: 14 }} />
      <Table columns={["UHID", "PATIENT NAME", "AGE", "GENDER", "BLOOD GROUP", "CONTACT", "REGISTERED", "LAST VISIT", "VISITS", "STATUS", "ACTION"]}>
        {filtered.length === 0 ? <EmptyRow colSpan={11} message="No patients registered yet. Click '+ Register Patient' to add one." /> :
          filtered.map((p) => (
            <TR key={p.uhid}>
              <TD>{p.uhid}</TD><TD>{p.name}</TD><TD>{p.age}</TD><TD>{p.gender}</TD>
              <TD>{p.blood}</TD><TD>{p.contact}</TD><TD>{p.registered}</TD><TD>{p.lastVisit}</TD>
              <TD>{p.visits}</TD><TD><Pill bg={C.greenLight} color={C.green}>{p.status}</Pill></TD>
              <TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD>
            </TR>
          ))}
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title="Register New Patient">
        <Field label="Full Name" error={errs.name}><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Age" error={errs.age}><input type="number" style={inputStyle} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></Field>
        <Field label="Gender"><select style={inputStyle} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option><option>Other</option></select></Field>
        <Field label="Blood Group"><select style={inputStyle} value={form.blood} onChange={(e) => setForm({ ...form, blood: e.target.value })}>{["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(b => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Contact" error={errs.contact}><input style={inputStyle} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <PrimaryBtn onClick={submit}>Register</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== Emergency =====
export function EmergencyPage({ canEdit }: { canEdit: boolean }) {
  const { emergencies, addEmergency, doctors, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient: "", age: "", gender: "Male", contact: "", location: "", injury: "", condition: "Stable", triage: "Yellow", mlc: false, doctor: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.patient) e.patient = "Required";
    if (!form.age) e.age = "Required";
    if (!form.injury) e.injury = "Required";
    setErrs(e);
    if (Object.keys(e).length) return;
    const id = `EM-${Date.now().toString().slice(-6)}`;
    const uhid = form.mlc ? `MLC-${Date.now().toString().slice(-6)}` : `UHID-${Date.now().toString().slice(-6)}`;
    const newCase = {
      id, patient: form.patient, age: +form.age, gender: form.gender, contact: form.contact,
      location: form.location, injury: form.injury, condition: form.condition, triage: form.triage,
      mlc: form.mlc, doctor: form.doctor, arrived: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(), uhid,
    };
    addEmergency(newCase);
    if (form.mlc) {
      pushToast(`MLC case registered: ${uhid} — opening print preview`, "warn");
      setTimeout(() => printMLCReport(newCase), 400);
    } else pushToast("Emergency case added", "success");
    setOpen(false);
    setForm({ patient: "", age: "", gender: "Male", contact: "", location: "", injury: "", condition: "Stable", triage: "Yellow", mlc: false, doctor: "" });
  };

  const triageColor = (t: string) => t === "Red" ? C.red : t === "Yellow" ? C.yellow : C.green;

  return (
    <div>
      <PageHeading title="Emergency Cases" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Add Emergency</PrimaryBtn>} />
      <Table columns={["UHID","PATIENT","AGE","GENDER","CONTACT","LOCATION","INJURY","CONDITION","TRIAGE","MLC","DOCTOR","ARRIVED","TIME","ACTION"]}>
        {emergencies.length === 0 ? <EmptyRow colSpan={14} message="No emergency cases. Click '+ Add Emergency' to add one." /> :
          emergencies.map((e) => (
            <TR key={e.id}>
              <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{e.uhid}</TD>
              <TD>{e.patient}</TD><TD>{e.age}</TD><TD>{e.gender}</TD><TD>{e.contact}</TD>
              <TD>{e.location}</TD><TD>{e.injury}</TD><TD>{e.condition}</TD>
              <TD><Pill bg={triageColor(e.triage)+"22"} color={triageColor(e.triage)}>{e.triage}</Pill></TD>
              <TD>{e.mlc ? <Pill bg={C.redLight} color={C.red}>MLC</Pill> : "No"}</TD>
              <TD>{e.doctor || "—"}</TD><TD>{e.arrived}</TD><TD>{e.time}</TD>
              <TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD>
            </TR>
          ))}
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Emergency Case" width={680}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Patient Name" error={errs.patient}><input style={inputStyle} value={form.patient} onChange={(e) => setForm({...form, patient: e.target.value})} /></Field>
          <Field label="Age" error={errs.age}><input type="number" style={inputStyle} value={form.age} onChange={(e) => setForm({...form, age: e.target.value})} /></Field>
          <Field label="Gender"><select style={inputStyle} value={form.gender} onChange={(e) => setForm({...form, gender: e.target.value})}><option>Male</option><option>Female</option></select></Field>
          <Field label="Contact"><input style={inputStyle} value={form.contact} onChange={(e) => setForm({...form, contact: e.target.value})} /></Field>
          <Field label="Accident Location"><input style={inputStyle} value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} /></Field>
          <Field label="Nature of Injury" error={errs.injury}><input style={inputStyle} value={form.injury} onChange={(e) => setForm({...form, injury: e.target.value})} /></Field>
          <Field label="Condition"><select style={inputStyle} value={form.condition} onChange={(e) => setForm({...form, condition: e.target.value})}><option>Stable</option><option>Critical</option><option>Serious</option></select></Field>
          <Field label="Triage Level"><select style={inputStyle} value={form.triage} onChange={(e) => setForm({...form, triage: e.target.value})}><option>Red</option><option>Yellow</option><option>Green</option></select></Field>
          <Field label="Assigned Doctor"><select style={inputStyle} value={form.doctor} onChange={(e) => setForm({...form, doctor: e.target.value})}><option value="">--Select--</option>{doctors.map(d => <option key={d.id}>{d.name}</option>)}</select></Field>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>MLC:</span>
            <button type="button" onClick={() => setForm({...form, mlc: !form.mlc})} style={{
              background: form.mlc ? C.red : C.border, color: C.white, border: "none",
              padding: "8px 18px", borderRadius: 20, fontWeight: 600, cursor: "pointer",
            }}>{form.mlc ? "MLC: ON" : "MLC: OFF"}</button>
          </div>
        </div>
        <div style={{ marginTop: 18 }}><PrimaryBtn onClick={submit}>Save Emergency</PrimaryBtn></div>
      </Modal>
    </div>
  );
}

// ===== OPD =====
export function OPDPage({ canEdit }: { canEdit: boolean }) {
  const { opd, addOPD, doctors, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ patient: "", age: "", city: "", complaint: "", doctor: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.patient) e.patient = "Required";
    if (!form.age) e.age = "Required";
    setErrs(e);
    if (Object.keys(e).length) return;
    addOPD({
      token: `OPD-${String(opd.length + 1).padStart(4, "0")}`, uhid: `UHID-${Date.now().toString().slice(-6)}`,
      patient: form.patient, age: +form.age,
      city: form.city, complaint: form.complaint, doctor: form.doctor || "—",
      status: "Waiting", appointment: new Date().toLocaleString(),
    });
    pushToast("OPD token created", "success");
    setOpen(false); setForm({ patient: "", age: "", city: "", complaint: "", doctor: "" });
  };

  const filtered = opd.filter((o) => !search || o.patient.toLowerCase().includes(search.toLowerCase()) || o.token.toLowerCase().includes(search.toLowerCase()));
  const stColor = (s: string) => s === "Waiting" ? { bg: C.blueLight, c: C.blue } : s === "In Consultation" ? { bg: C.yellowLight, c: C.tan } : { bg: C.greenLight, c: C.green };

  return (
    <div>
      <PageHeading title="🎫 OPD Token Queue" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Add Token</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Tokens" value={opd.length} icon="🎫" color={C.navy} />
        <StatCard label="Waiting" value={opd.filter(o => o.status === "Waiting").length} icon="⏳" color={C.blue} />
        <StatCard label="In Consultation" value={opd.filter(o => o.status === "In Consultation").length} icon="🩺" color={C.yellow} />
        <StatCard label="Completed" value={opd.filter(o => o.status === "Completed").length} icon="✅" color={C.green} />
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, token, or doctor..." style={{ ...inputStyle, marginBottom: 14 }} />
      <Table columns={["TOKEN NO","UHID","PATIENT NAME","AGE","CITY","COMPLAINT","DOCTOR","STATUS","APPOINTMENT","ACTIONS"]}>
        {filtered.length === 0 ? <EmptyRow colSpan={10} message="No OPD tokens yet. Click '+ Add Token' to create one." /> :
          filtered.map((o) => {
            const c = stColor(o.status);
            return (
              <TR key={o.token}>
                <TD>{o.token}</TD>
                <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{o.uhid}</TD>
                <TD>{o.patient}</TD><TD>{o.age}</TD><TD>{o.city}</TD><TD>{o.complaint}</TD><TD>{o.doctor}</TD>
                <TD><Pill bg={c.bg} color={c.c}>{o.status}</Pill></TD>
                <TD>{o.appointment}</TD>
                <TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD>
              </TR>
            );
          })}
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title="Add OPD Token">
        <Field label="Patient Name" error={errs.patient}><input style={inputStyle} value={form.patient} onChange={(e) => setForm({...form, patient: e.target.value})} /></Field>
        <Field label="Age" error={errs.age}><input type="number" style={inputStyle} value={form.age} onChange={(e) => setForm({...form, age: e.target.value})} /></Field>
        <Field label="City"><input style={inputStyle} value={form.city} onChange={(e) => setForm({...form, city: e.target.value})} /></Field>
        <Field label="Complaint"><input style={inputStyle} value={form.complaint} onChange={(e) => setForm({...form, complaint: e.target.value})} /></Field>
        <Field label="Doctor"><select style={inputStyle} value={form.doctor} onChange={(e) => setForm({...form, doctor: e.target.value})}><option value="">--Select--</option>{doctors.map(d => <option key={d.id}>{d.name}</option>)}</select></Field>
        <PrimaryBtn onClick={submit}>Create Token</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== IPD =====
export function IPDPage({ canEdit }: { canEdit: boolean }) {
  const { ipd, addIPD, doctors, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient: "", age: "", gender: "Male", ward: "General", bed: "", doctor: "", diagnosis: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.patient) e.patient = "Required";
    if (!form.bed) e.bed = "Required";
    setErrs(e);
    if (Object.keys(e).length) return;
    addIPD({
      ipd: `IPD-${String(ipd.length + 1).padStart(4, "0")}`, uhid: `UHID-${Date.now().toString().slice(-6)}`,
      patient: form.patient, age: +form.age,
      gender: form.gender, ward: form.ward, bed: form.bed, doctor: form.doctor,
      diagnosis: form.diagnosis, admitDate: new Date().toLocaleDateString(), status: "Admitted",
    });
    pushToast("Patient admitted", "success");
    setOpen(false); setForm({ patient: "", age: "", gender: "Male", ward: "General", bed: "", doctor: "", diagnosis: "" });
  };

  return (
    <div>
      <PageHeading title="🏥 IPD – Inpatient Department" action={<PrimaryBtn onClick={() => setOpen(true)}>+ New Admission</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Currently Admitted" value={ipd.filter(i => i.status === "Admitted").length} icon="🏥" color={C.blue} />
        <StatCard label="Critical Patients" value={0} icon="🚨" color={C.red} />
        <StatCard label="Discharged Total" value={ipd.filter(i => i.status === "Discharged").length} icon="🏠" color={C.green} />
        <StatCard label="Total Admissions" value={ipd.length} icon="📊" color={C.textMuted} />
      </div>
      <Table columns={["IPD NO","UHID","PATIENT","AGE","GENDER","WARD","BED","DOCTOR","DIAGNOSIS","ADMIT DATE","STATUS","ACTIONS"]}>
        {ipd.length === 0 ? <EmptyRow colSpan={12} message="No admissions yet. Click '+ New Admission' to add one." /> :
          ipd.map((i) => (
            <TR key={i.ipd}>
              <TD>{i.ipd}</TD>
              <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{i.uhid}</TD>
              <TD>{i.patient}</TD><TD>{i.age}</TD><TD>{i.gender}</TD>
              <TD>{i.ward}</TD><TD>{i.bed}</TD><TD>{i.doctor}</TD><TD>{i.diagnosis}</TD>
              <TD>{i.admitDate}</TD>
              <TD><Pill bg={C.blueLight} color={C.blue}>{i.status}</Pill></TD>
              <TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD>
            </TR>
          ))}
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title="New Admission" width={680}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Patient Name" error={errs.patient}><input style={inputStyle} value={form.patient} onChange={(e) => setForm({...form, patient: e.target.value})} /></Field>
          <Field label="Age"><input type="number" style={inputStyle} value={form.age} onChange={(e) => setForm({...form, age: e.target.value})} /></Field>
          <Field label="Gender"><select style={inputStyle} value={form.gender} onChange={(e) => setForm({...form, gender: e.target.value})}><option>Male</option><option>Female</option></select></Field>
          <Field label="Ward"><select style={inputStyle} value={form.ward} onChange={(e) => setForm({...form, ward: e.target.value})}><option>General</option><option>ICU</option><option>Private</option></select></Field>
          <Field label="Bed" error={errs.bed}><input style={inputStyle} value={form.bed} onChange={(e) => setForm({...form, bed: e.target.value})} /></Field>
          <Field label="Doctor"><select style={inputStyle} value={form.doctor} onChange={(e) => setForm({...form, doctor: e.target.value})}><option value="">--Select--</option>{doctors.map(d => <option key={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Diagnosis"><input style={inputStyle} value={form.diagnosis} onChange={(e) => setForm({...form, diagnosis: e.target.value})} /></Field>
        </div>
        <PrimaryBtn onClick={submit}>Admit</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== Beds =====
export function BedsPage() {
  const { beds, addBed, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ward: "General", number: "", status: "Available" });
  const totals = {
    total: beds.length,
    avail: beds.filter(b => b.status === "Available").length,
    occ: beds.filter(b => b.status === "Occupied").length,
    maint: beds.filter(b => b.status === "Maintenance").length,
  };
  const submit = () => {
    if (!form.number) return;
    addBed({ id: `BED-${Date.now().toString().slice(-5)}`, ward: form.ward, number: form.number, status: form.status });
    pushToast("Bed added", "success");
    setOpen(false); setForm({ ward: "General", number: "", status: "Available" });
  };
  return (
    <div>
      <PageHeading title="Ward & Bed Management" subtitle="Real-time bed occupancy tracking and configure beds" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Add Bed</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: C.navy }}>{totals.total}</div>
          <div style={{ color: C.textMuted, marginTop: 4 }}>Total Beds</div>
        </div>
        <div style={{ background: C.greenLight, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: C.green }}>{totals.avail}</div>
          <div style={{ color: C.green, marginTop: 4, fontWeight: 600 }}>Available</div>
        </div>
        <div style={{ background: C.redLight, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: C.red }}>{totals.occ}</div>
          <div style={{ color: C.red, marginTop: 4, fontWeight: 600 }}>Occupied</div>
        </div>
        <div style={{ background: C.yellowLight, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: C.tan }}>{totals.maint}</div>
          <div style={{ color: C.tan, marginTop: 4, fontWeight: 600 }}>Maintenance</div>
        </div>
      </div>
      {beds.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: C.textMuted, padding: 40, fontStyle: "italic" }}>No beds configured yet. Click '+ Add Bed' to add beds to wards.</div></Card>
      ) : (
        <Table columns={["BED ID","WARD","NUMBER","STATUS"]}>
          {beds.map(b => <TR key={b.id}><TD>{b.id}</TD><TD>{b.ward}</TD><TD>{b.number}</TD><TD><Pill bg={C.greenLight} color={C.green}>{b.status}</Pill></TD></TR>)}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Bed">
        <Field label="Ward"><select style={inputStyle} value={form.ward} onChange={e => setForm({...form, ward: e.target.value})}><option>General</option><option>ICU</option><option>Private</option></select></Field>
        <Field label="Bed Number"><input style={inputStyle} value={form.number} onChange={e => setForm({...form, number: e.target.value})} /></Field>
        <Field label="Status"><select style={inputStyle} value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option>Available</option><option>Occupied</option><option>Maintenance</option></select></Field>
        <PrimaryBtn onClick={submit}>Save</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== Lab =====
export function LabPage({ canEdit }: { canEdit: boolean }) {
  const { labs, addLab, doctors, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient: "", doctor: "", tests: "", priority: "Normal" });
  const submit = () => {
    if (!form.patient || !form.tests) return;
    addLab({
      id: `LAB-${String(labs.length + 1).padStart(4, "0")}`, uhid: `UHID-${Date.now().toString().slice(-6)}`,
      patient: form.patient,
      doctor: form.doctor, tests: form.tests, priority: form.priority,
      status: "Pending", ordered: new Date().toLocaleDateString(), result: "—",
    });
    pushToast("Lab test ordered", "success");
    setOpen(false); setForm({ patient: "", doctor: "", tests: "", priority: "Normal" });
  };
  return (
    <div>
      <PageHeading title="✏️ Lab Management" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Order Test</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Tests" value={labs.length} icon="🧪" color={C.green} />
        <StatCard label="Pending Tests" value={labs.filter(l => l.status === "Pending").length} icon="⏳" color={C.orange} />
        <StatCard label="STAT Priority" value={labs.filter(l => l.priority === "STAT").length} icon="🚨" color={C.red} />
        <StatCard label="Completed" value={labs.filter(l => l.status === "Completed").length} icon="✅" color={C.green} />
      </div>
      <Table columns={["LAB ID","UHID","PATIENT","DOCTOR","TESTS","PRIORITY","STATUS","ORDERED","RESULT","ACTIONS"]}>
        {labs.length === 0 ? <EmptyRow colSpan={10} message="No lab tests ordered yet. Click '+ Order Test' to create one." /> :
          labs.map((l) => (
            <TR key={l.id}>
              <TD>{l.id}</TD>
              <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{l.uhid}</TD>
              <TD>{l.patient}</TD><TD>{l.doctor}</TD><TD>{l.tests}</TD>
              <TD><Pill bg={l.priority === "STAT" ? C.redLight : C.blueLight} color={l.priority === "STAT" ? C.red : C.blue}>{l.priority}</Pill></TD>
              <TD><Pill bg={C.yellowLight} color={C.tan}>{l.status}</Pill></TD>
              <TD>{l.ordered}</TD><TD>{l.result}</TD>
              <TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD>
            </TR>
          ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="Order Lab Test">
        <Field label="Patient"><input style={inputStyle} value={form.patient} onChange={e => setForm({...form, patient: e.target.value})} /></Field>
        <Field label="Doctor"><select style={inputStyle} value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})}><option value="">--Select--</option>{doctors.map(d => <option key={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Tests"><input style={inputStyle} value={form.tests} onChange={e => setForm({...form, tests: e.target.value})} /></Field>
        <Field label="Priority"><select style={inputStyle} value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}><option>Normal</option><option>STAT</option></select></Field>
        <PrimaryBtn onClick={submit}>Order</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== Pharmacy (Admin view) =====
export function PharmacyPage({ canEdit }: { canEdit: boolean }) {
  const { medicines, addMedicine, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"inv" | "rx">("inv");
  const [form, setForm] = useState({ name: "", category: "", stock: "", unit: "Tab", price: "", expiry: "", supplier: "" });
  const submit = () => {
    if (!form.name) return;
    addMedicine({ name: form.name, category: form.category, stock: +form.stock, unit: form.unit, price: +form.price, expiry: form.expiry, supplier: form.supplier });
    pushToast("Medicine added", "success");
    setOpen(false); setForm({ name: "", category: "", stock: "", unit: "Tab", price: "", expiry: "", supplier: "" });
  };
  const totalVal = medicines.reduce((a, b) => a + b.price * b.stock, 0);
  return (
    <div>
      <PageHeading title="💊 Pharmacy" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Add Medicine</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Medicines" value={medicines.length} icon="💊" color={C.navy} />
        <StatCard label="Low Stock Alerts" value={medicines.filter(m => m.stock < 10).length} icon="⚠️" color={C.yellow} />
        <StatCard label="Inventory Value" value={`₹${totalVal}`} icon="💰" color={C.green} />
        <StatCard label="Pending Prescriptions" value={0} icon="📋" color={C.blue} />
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {[["inv","💊 Medicine Inventory"],["rx","📋 Prescriptions"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} style={{
            background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
            borderBottom: tab === k ? `2px solid ${C.navy}` : "2px solid transparent",
            color: tab === k ? C.navy : C.textMuted, fontWeight: 600, fontSize: 14,
          }}>{l}</button>
        ))}
      </div>
      {tab === "inv" ? (
        <Table columns={["NAME","CATEGORY","STOCK","UNIT","PRICE (₹)","EXPIRY","SUPPLIER","ACTIONS"]}>
          {medicines.length === 0 ? <EmptyRow colSpan={8} message="No medicines added yet. Click '+ Add Medicine' to add one." /> :
            medicines.map((m, i) => <TR key={i}><TD>{m.name}</TD><TD>{m.category}</TD><TD>{m.stock}</TD><TD>{m.unit}</TD><TD>₹{m.price}</TD><TD>{m.expiry}</TD><TD>{m.supplier}</TD><TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD></TR>)}
        </Table>
      ) : (
        <Card><div style={{ textAlign: "center", padding: 40, color: C.textMuted, fontStyle: "italic" }}>No prescriptions yet.</div></Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Medicine">
        <Field label="Name"><input style={inputStyle} value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></Field>
        <Field label="Category"><input style={inputStyle} value={form.category} onChange={e => setForm({...form, category: e.target.value})} /></Field>
        <Field label="Stock"><input type="number" style={inputStyle} value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} /></Field>
        <Field label="Unit"><input style={inputStyle} value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} /></Field>
        <Field label="Price"><input type="number" style={inputStyle} value={form.price} onChange={e => setForm({...form, price: e.target.value})} /></Field>
        <Field label="Expiry"><input type="date" style={inputStyle} value={form.expiry} onChange={e => setForm({...form, expiry: e.target.value})} /></Field>
        <Field label="Supplier"><input style={inputStyle} value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} /></Field>
        <PrimaryBtn onClick={submit}>Save</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== Doctors =====
export function DoctorsPage({ canEdit }: { canEdit: boolean }) {
  const { doctors, addDoctor, updateDoctor, removeDoctor, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", specialization: "", department: "" });
  const submit = () => {
    if (!form.name) return;
    addDoctor({ id: `DOC-${Date.now().toString().slice(-5)}`, name: form.name, specialization: form.specialization, department: form.department, available: true });
    pushToast("Doctor added", "success");
    setOpen(false); setForm({ name: "", specialization: "", department: "" });
  };
  return (
    <div>
      <PageHeading title="Doctor Management" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Add Doctor</PrimaryBtn>} />
      <Table columns={["NAME","SPECIALIZATION","DEPARTMENT","AVAILABILITY","ACTIONS"]}>
        {doctors.length === 0 ? <EmptyRow colSpan={5} message="No doctors added yet. Click '+ Add Doctor' to add one." /> :
          doctors.map((d) => (
            <TR key={d.id}>
              <TD>{d.name}</TD><TD>{d.specialization}</TD><TD>{d.department}</TD>
              <TD>
                <button onClick={() => canEdit && updateDoctor(d.id, { available: !d.available })} style={{
                  background: d.available ? C.green : C.border, color: C.white, border: "none",
                  width: 44, height: 22, borderRadius: 22, cursor: canEdit ? "pointer" : "not-allowed", position: "relative",
                }}>
                  <span style={{ position: "absolute", top: 2, left: d.available ? 24 : 2, width: 18, height: 18, background: C.white, borderRadius: "50%" }} />
                </button>
              </TD>
              <TD>
                {canEdit ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <GhostBtn>Edit</GhostBtn>
                    <button onClick={() => { removeDoctor(d.id); pushToast("Doctor removed", "info"); }} style={{ background: C.redLight, color: C.red, border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Delete</button>
                  </div>
                ) : "—"}
              </TD>
            </TR>
          ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Doctor">
        <Field label="Name"><input style={inputStyle} value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></Field>
        <Field label="Specialization"><input style={inputStyle} value={form.specialization} onChange={e => setForm({...form, specialization: e.target.value})} /></Field>
        <Field label="Department"><input style={inputStyle} value={form.department} onChange={e => setForm({...form, department: e.target.value})} /></Field>
        <PrimaryBtn onClick={submit}>Save</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== Staff =====
export function StaffPage({ canEdit }: { canEdit: boolean }) {
  const { staff, addStaff, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", role: "Nurse", department: "", contact: "", shift: "Morning" });
  const submit = () => {
    if (!form.name) return;
    addStaff({
      id: `STF-${Date.now().toString().slice(-5)}`, name: form.name, role: form.role,
      department: form.department, contact: form.contact, shift: form.shift,
      status: "On Duty", joined: new Date().toLocaleDateString(),
    });
    pushToast("Staff added", "success");
    setOpen(false); setForm({ name: "", role: "Nurse", department: "", contact: "", shift: "Morning" });
  };
  const filtered = staff.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <PageHeading title="👥 Staff Management" action={<PrimaryBtn onClick={() => setOpen(true)}>+ Add Staff</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Staff" value={staff.length} icon="👥" color={C.navy} />
        <StatCard label="On Duty" value={staff.filter(s => s.status === "On Duty").length} icon="✅" color={C.green} />
        <StatCard label="On Leave" value={0} icon="📋" color={C.yellow} />
        <StatCard label="Night Shift" value={staff.filter(s => s.shift === "Night").length} icon="🌙" color={C.blue} />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff..." style={{ ...inputStyle, marginBottom: 14 }} />
      <Table columns={["ID","NAME","ROLE","DEPARTMENT","CONTACT","SHIFT","STATUS","JOINED","ACTION"]}>
        {filtered.length === 0 ? <EmptyRow colSpan={9} message="No staff added yet. Click '+ Add Staff' to add one." /> :
          filtered.map(s => (
            <TR key={s.id}>
              <TD>{s.id}</TD><TD>{s.name}</TD><TD>{s.role}</TD><TD>{s.department}</TD><TD>{s.contact}</TD>
              <TD>{s.shift}</TD><TD><Pill bg={C.greenLight} color={C.green}>{s.status}</Pill></TD><TD>{s.joined}</TD>
              <TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD>
            </TR>
          ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Staff">
        <Field label="Name"><input style={inputStyle} value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></Field>
        <Field label="Role"><select style={inputStyle} value={form.role} onChange={e => setForm({...form, role: e.target.value})}><option>Nurse</option><option>Technician</option><option>Helper</option></select></Field>
        <Field label="Department"><input style={inputStyle} value={form.department} onChange={e => setForm({...form, department: e.target.value})} /></Field>
        <Field label="Contact"><input style={inputStyle} value={form.contact} onChange={e => setForm({...form, contact: e.target.value})} /></Field>
        <Field label="Shift"><select style={inputStyle} value={form.shift} onChange={e => setForm({...form, shift: e.target.value})}><option>Morning</option><option>Evening</option><option>Night</option></select></Field>
        <PrimaryBtn onClick={submit}>Save</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== Billing =====
export function BillingPage({ canEdit }: { canEdit: boolean }) {
  const { payments, addPayment, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ uhid: "", patient: "", type: "OPD", description: "", amount: "", method: "Cash" });
  const submit = () => {
    if (!form.patient || !form.amount) return;
    const isOnline = ["Razorpay","PhonePe","Google Pay","UPI"].includes(form.method);
    addPayment({
      invoice: `INV-${Date.now().toString().slice(-6)}`,
      uhid: form.uhid || `UHID-${Date.now().toString().slice(-6)}`,
      patient: form.patient, type: form.type,
      description: form.description, amount: +form.amount, method: form.method, status: "Completed",
      date: new Date().toLocaleDateString(),
      txnId: isOnline ? `UTR${Date.now()}` : "—",
    });
    pushToast("Payment recorded", "success");
    setOpen(false); setForm({ uhid: "", patient: "", type: "OPD", description: "", amount: "", method: "Cash" });
  };
  const collected = payments.filter(p => p.status === "Completed").reduce((a, b) => a + b.amount, 0);
  return (
    <div>
      <PageHeading title="💰 Billing & Payments" action={<PrimaryBtn onClick={() => setOpen(true)}>+ New Payment</PrimaryBtn>} />
      <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Collected" value={`₹${collected}`} icon="💰" color={C.green} />
        <StatCard label="Pending Payments" value="₹0" icon="⏳" color={C.orange} />
        <StatCard label="Failed Transactions" value="₹0" icon="❌" color={C.red} />
        <StatCard label="Total Invoices" value={payments.length} icon="🧾" color={C.textMuted} />
      </div>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, color: C.textDark }}>Accepted Methods:</span>
        {["Razorpay","PhonePe","Google Pay","UPI","Card","Cash","Net Banking"].map(m => <Pill key={m} bg={C.blueLight} color={C.blue}>{m}</Pill>)}
      </div>
      <Table columns={["INVOICE","UHID","PATIENT","TYPE","DESCRIPTION","AMOUNT","METHOD","STATUS","DATE","TRANSACTION ID","ACTION"]}>
        {payments.length === 0 ? <EmptyRow colSpan={11} message="No payments yet. Click '+ New Payment' to create one." /> :
          payments.map(p => (
            <TR key={p.invoice}>
              <TD>{p.invoice}</TD>
              <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{p.uhid}</TD>
              <TD>{p.patient}</TD><TD>{p.type}</TD><TD>{p.description}</TD>
              <TD>₹{p.amount}</TD><TD>{p.method}</TD>
              <TD><Pill bg={C.greenLight} color={C.green}>{p.status}</Pill></TD>
              <TD>{p.date}</TD><TD style={{ fontFamily: "monospace", fontSize: 11 }}>{p.txnId}</TD>
              <TD>{canEdit ? <GhostBtn>Edit</GhostBtn> : "—"}</TD>
            </TR>
          ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="New Payment">
        <Field label="UHID (leave blank to auto-generate)"><input style={inputStyle} placeholder="UHID-XXXXXX" value={form.uhid} onChange={e => setForm({...form, uhid: e.target.value})} /></Field>
        <Field label="Patient"><input style={inputStyle} value={form.patient} onChange={e => setForm({...form, patient: e.target.value})} /></Field>
        <Field label="Type"><select style={inputStyle} value={form.type} onChange={e => setForm({...form, type: e.target.value})}><option>OPD</option><option>IPD</option><option>Lab</option><option>Pharmacy</option></select></Field>
        <Field label="Description"><input style={inputStyle} value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></Field>
        <Field label="Amount (₹)"><input type="number" style={inputStyle} value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></Field>
        <Field label="Payment Method"><select style={inputStyle} value={form.method} onChange={e => setForm({...form, method: e.target.value})}>{["Cash","Card","UPI","Razorpay","PhonePe","Google Pay","Net Banking"].map(m => <option key={m}>{m}</option>)}</select></Field>
        <PrimaryBtn onClick={submit}>Record</PrimaryBtn>
      </Modal>
    </div>
  );
}

// ===== MLC =====
const POLICE_STATIONS: Record<string, string> = {
  "Ballari City PS": "ballaricitypsbly@ksp.gov.in",
  "Cowl Bazar PS": "cowlbazarpsbly@ksp.gov.in",
  "Gandhi Nagar PS": "gandhinagarpsbly@ksp.gov.in",
  "Moka PS": "mokapsbly@ksp.gov.in",
  "Bruce Pet PS": "brucepetpsbly@ksp.gov.in",
};

export function MLCPage() {
  const { emergencies, pushToast } = useStore();
  const mlc = emergencies.filter(e => e.mlc);
  const triageColor = (t: string) => t === "Red" ? C.red : t === "Yellow" ? C.yellow : C.green;

  const [sendCase, setSendCase] = useState<Emergency | null>(null);
  const [station, setStation] = useState<string>("Ballari City PS");
  const [stationEmail, setStationEmail] = useState<string>(POLICE_STATIONS["Ballari City PS"]);
  const [io, setIo] = useState({ name: "", rank: "", phone: "", firNo: "" });
  const [sentMap, setSentMap] = useState<Record<string, { station: string; at: string }>>({});

  const openSend = (e: Emergency) => {
    setSendCase(e);
    setStation("Ballari City PS");
    setStationEmail(POLICE_STATIONS["Ballari City PS"]);
    setIo({ name: "", rank: "", phone: "", firNo: "" });
  };

  const sendEmail = () => {
    if (!sendCase) return;
    const body = buildMLCEmailBody(sendCase)
      .replace("[Police Station Name]", station)
      + (io.name || io.firNo ? `\n\n— LIAISON —\nIO Name : ${io.name || "—"}\nRank    : ${io.rank || "—"}\nPhone   : ${io.phone || "—"}\nFIR No. : ${io.firNo || "—"}` : "");
    const subject = `MLC Intimation — ${sendCase.uhid} (${sendCase.patient})`;
    const mailto = `mailto:${encodeURIComponent(stationEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSentMap(m => ({ ...m, [sendCase.id]: { station, at: new Date().toLocaleString() } }));
    pushToast(`MLC report dispatched to ${station}`, "success");
    setSendCase(null);
  };

  return (
    <div>
      <PageHeading title="⚖️ MLC Alerts" />
      <div style={{ background: C.amberBg, border: `1px solid ${C.amber}`, borderLeft: `4px solid ${C.orange}`, borderRadius: 10, padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <span style={{ fontWeight: 700, color: C.orange }}>MLC Cases Require Immediate Legal Attention — Print the report and dispatch a copy to the jurisdictional Police Station.</span>
      </div>
      <Table columns={["UHID","PATIENT","AGE","TRIAGE","INJURY","DOCTOR","ARRIVED","TIME","POLICE","ACTIONS"]}>
        {mlc.length === 0 ? <EmptyRow colSpan={10} message="No MLC cases. Cases marked as MLC in Emergency will appear here." /> :
          mlc.map(e => {
            const sent = sentMap[e.id];
            return (
              <TR key={e.id}>
                <TD style={{ fontFamily: "monospace", fontWeight: 700 }}>{e.uhid}</TD>
                <TD>{e.patient}</TD><TD>{e.age}</TD>
                <TD><Pill bg={triageColor(e.triage)+"22"} color={triageColor(e.triage)}>{e.triage}</Pill></TD>
                <TD>{e.injury}</TD><TD>{e.doctor || "—"}</TD><TD>{e.arrived}</TD><TD>{e.time}</TD>
                <TD>{sent
                  ? <Pill bg={C.greenLight} color={C.green}>✓ {sent.station}</Pill>
                  : <Pill bg={C.redLight} color={C.red}>Pending</Pill>}</TD>
                <TD>
                  <div style={{ display: "flex", gap: 6 }}>
                    <GhostBtn onClick={() => printMLCReport(e)}>🖨️ Print</GhostBtn>
                    <button onClick={() => openSend(e)} style={{ background: C.navy, color: C.white, border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>📧 Send to Police</button>
                  </div>
                </TD>
              </TR>
            );
          })}
      </Table>

      <Modal open={!!sendCase} onClose={() => setSendCase(null)} title={`Send MLC Report to Police — ${sendCase?.uhid || ""}`} width={620}>
        {sendCase && (
          <>
            <div style={{ background: C.bgGray, padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              <strong>{sendCase.patient}</strong> · {sendCase.age}/{sendCase.gender} · {sendCase.injury}
            </div>
            <Field label="Police Station">
              <select style={inputStyle} value={station} onChange={e => { setStation(e.target.value); setStationEmail(POLICE_STATIONS[e.target.value] || ""); }}>
                {Object.keys(POLICE_STATIONS).map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Station Email"><input style={inputStyle} value={stationEmail} onChange={e => setStationEmail(e.target.value)} placeholder="ps@ksp.gov.in" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Investigating Officer (optional)"><input style={inputStyle} value={io.name} onChange={e => setIo({ ...io, name: e.target.value })} /></Field>
              <Field label="Rank"><input style={inputStyle} value={io.rank} onChange={e => setIo({ ...io, rank: e.target.value })} placeholder="SI / PSI / HC" /></Field>
              <Field label="Officer Phone"><input style={inputStyle} value={io.phone} onChange={e => setIo({ ...io, phone: e.target.value })} /></Field>
              <Field label="FIR / DD No. (if known)"><input style={inputStyle} value={io.firNo} onChange={e => setIo({ ...io, firNo: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted, padding: 10, background: C.amberBg, borderRadius: 6 }}>
              ℹ️ This opens your default email client with the MLC details pre-filled. Attach the printed report PDF before sending.
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <GhostBtn onClick={() => printMLCReport(sendCase)}>🖨️ Print First</GhostBtn>
              <PrimaryBtn onClick={sendEmail}>📧 Send Email Now</PrimaryBtn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}


// ===== Reports =====
export function ReportsPage() {
  const { patients, payments, emergencies, doctors } = useStore();
  const [tab, setTab] = useState<"ov" | "doc" | "rev" | "pat">("ov");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const auto = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Hospital Report", 14, 18);
    doc.setFontSize(11); doc.text(`Period: ${from} to ${to}`, 14, 26);
    auto(doc, {
      startY: 32,
      head: [["Metric","Value"]],
      body: [
        ["Total Patients OPD", String(patients.length)],
        ["Revenue Collected", `₹${payments.reduce((a,b)=>a+b.amount,0)}`],
        ["Emergency Cases", String(emergencies.length)],
        ["Doctors on Staff", String(doctors.length)],
      ],
    });
    doc.save("hospital-report.pdf");
  };
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      { Metric: "Total Patients OPD", Value: patients.length },
      { Metric: "Revenue Collected", Value: payments.reduce((a,b)=>a+b.amount,0) },
      { Metric: "Emergency Cases", Value: emergencies.length },
      { Metric: "Doctors on Staff", Value: doctors.length },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Overview");
    XLSX.writeFile(wb, "hospital-report.xlsx");
  };

  return (
    <div>
      <PageHeading title="📊 Reports & Analytics" subtitle="Comprehensive insights into hospital performance" />
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>📅</span><span style={{ fontWeight: 600 }}>Date Range:</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        <span>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        <PrimaryBtn>Apply Filter</PrimaryBtn>
        <GhostBtn onClick={exportPDF} style={{ color: C.blue }}>⬇ Export PDF</GhostBtn>
        <GhostBtn onClick={exportExcel} style={{ color: C.green }}>📊 Export Excel</GhostBtn>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 18 }}>
        {[["ov","📊 Overview"],["doc","👨‍⚕️ Doctor Reports"],["rev","💰 Revenue"],["pat","👥 Patient Analytics"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} style={{
            background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
            borderBottom: tab === k ? `2px solid ${C.navy}` : "2px solid transparent",
            color: tab === k ? C.navy : C.textMuted, fontWeight: 600, fontSize: 14,
          }}>{l}</button>
        ))}
      </div>
      {tab === "ov" && (
        <>
          <div className="hms-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Patients OPD" value={patients.length} icon="👥" color={C.navy} />
            <StatCard label="Revenue Collected" value={`₹${payments.reduce((a,b)=>a+b.amount,0)}`} icon="💰" color={C.green} />
            <StatCard label="Emergency Cases" value={emergencies.length} icon="🚨" color={C.red} />
            <StatCard label="Doctors on Staff" value={doctors.length} icon="👨‍⚕️" color={C.blue} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <ChartPlaceholder title="Monthly Patient & Revenue Trend" />
            <ChartPlaceholder title="Revenue by Department" />
          </div>
        </>
      )}
      {tab !== "ov" && <Card><div style={{ textAlign: "center", padding: 40, color: C.textMuted, fontStyle: "italic" }}>No data yet. Add records through the modules to see analytics.</div></Card>}
    </div>
  );
}
