import { createContext, useContext, useState, ReactNode, useCallback } from "react";

// ===== Types =====
export type Role = "admin" | "receptionist" | "pharmacist";

export interface User {
  name: string;
  role: Role;
  initial: string;
  roleLabel: string;
}

export interface Patient {
  uhid: string; name: string; age: number; gender: string; blood: string;
  contact: string; registered: string; lastVisit: string; visits: number; status: string;
}
export interface Emergency {
  id: string; patient: string; age: number; gender: string; contact: string;
  location: string; injury: string; condition: string; triage: string;
  mlc: boolean; doctor: string; arrived: string; time: string; uhid: string;
}
export interface OPDToken {
  token: string; uhid: string; patient: string; age: number; city: string; complaint: string;
  doctor: string; status: string; appointment: string;
}
export interface IPDAdmission {
  ipd: string; uhid: string; patient: string; age: number; gender: string; ward: string;
  bed: string; doctor: string; diagnosis: string; admitDate: string; status: string;
}
export interface Bed {
  id: string; ward: string; number: string; status: string;
}
export interface LabTest {
  id: string; uhid: string; patient: string; doctor: string; tests: string; priority: string;
  status: string; ordered: string; result: string;
}
export interface Medicine {
  name: string; category: string; stock: number; unit: string; price: number;
  expiry: string; supplier: string;
}
export interface Doctor {
  id: string; name: string; specialization: string; department: string; available: boolean;
}
export interface Staff {
  id: string; name: string; role: string; department: string; contact: string;
  shift: string; status: string; joined: string;
}
export interface Payment {
  invoice: string; uhid: string; patient: string; type: string; description: string;
  amount: number; method: string; status: string; date: string; txnId: string;
}
export interface Toast { id: number; message: string; type: "success" | "error" | "info" | "warn"; }

// ===== Pharmacist domain =====
export interface CatalogueMed {
  id: string; name: string; generic: string; category: string; form: string;
  strength: string; manufacturer: string; supplier: string; rx: boolean;
  hsn: string; storage: string; price: number; shelf: string; status: "Active" | "Inactive";
}
export interface StockRow {
  stockId: string; medId: string; medicine: string; batch: string; expiry: string;
  received: number; dispensed: number; available: number; reorder: number;
  rack: string; updated: string;
}
export interface Prescription {
  rxId: string; uhid: string; patient: string; token: string; doctor: string; notes: string;
  issued: string; status: "pending" | "partial" | "dispensed";
}
export interface DispenseLog {
  dispenseId: string; rxId: string; uhid: string; patient: string; token: string; medicine: string;
  batch: string; qty: number; unitPrice: number; total: number; dosage: string;
  pharmacist: string; time: string;
}

// ===== Initial data =====
const initialCatalogue: CatalogueMed[] = [
  { id: "MED-001", name: "Paracetamol 500mg", generic: "Paracetamol", category: "Analgesic/Antipyretic", form: "Tablet", strength: "500mg", manufacturer: "Cipla Ltd", supplier: "MedSupply Co.", rx: false, hsn: "3004.90.99", storage: "Room Temp 15–25°C", price: 2.5, shelf: "36m", status: "Active" },
  { id: "MED-002", name: "Amoxicillin 250mg", generic: "Amoxicillin Trihydrate", category: "Antibiotic", form: "Capsule", strength: "250mg", manufacturer: "Sun Pharma", supplier: "PharmaDist Pvt.", rx: true, hsn: "3004.20.11", storage: "Room Temp 15–25°C", price: 8, shelf: "24m", status: "Active" },
  { id: "MED-003", name: "Metformin 500mg", generic: "Metformin HCl", category: "Anti-diabetic", form: "Tablet", strength: "500mg", manufacturer: "Dr. Reddy's", supplier: "MedSupply Co.", rx: true, hsn: "3004.90.20", storage: "Room Temp 15–25°C", price: 4, shelf: "30m", status: "Active" },
  { id: "MED-004", name: "Atorvastatin 10mg", generic: "Atorvastatin Calcium", category: "Lipid Lowering", form: "Tablet", strength: "10mg", manufacturer: "Lupin Ltd", supplier: "HealthLine Dist.", rx: true, hsn: "3004.90.39", storage: "Below 30°C", price: 6.5, shelf: "24m", status: "Active" },
  { id: "MED-005", name: "Cetirizine 10mg", generic: "Cetirizine HCl", category: "Antihistamine", form: "Tablet", strength: "10mg", manufacturer: "Mankind Pharma", supplier: "MedSupply Co.", rx: false, hsn: "3004.90.99", storage: "Room Temp 15–25°C", price: 3, shelf: "36m", status: "Active" },
  { id: "MED-006", name: "Omeprazole 20mg", generic: "Omeprazole", category: "Proton Pump Inhibitor", form: "Capsule", strength: "20mg", manufacturer: "Zydus Cadila", supplier: "PharmaDist Pvt.", rx: true, hsn: "3004.90.42", storage: "Room Temp 15–25°C", price: 5.5, shelf: "24m", status: "Active" },
  { id: "MED-007", name: "Insulin Glargine 100U/ml", generic: "Insulin Glargine", category: "Anti-diabetic", form: "Injection", strength: "100 U/ml", manufacturer: "Sanofi India", supplier: "ColdChain Med.", rx: true, hsn: "3004.31.00", storage: "Refrigerate 2–8°C", price: 320, shelf: "24m", status: "Active" },
];

const initialStock: StockRow[] = [
  { stockId: "STK-001", medId: "MED-001", medicine: "Paracetamol 500mg", batch: "BN-PAR-2025-01", expiry: "2027-03-31", received: 5000, dispensed: 1250, available: 3750, reorder: 200, rack: "Rack A-01", updated: "2026-04-15 08:00" },
  { stockId: "STK-002", medId: "MED-002", medicine: "Amoxicillin 250mg", batch: "BN-AMX-2025-04", expiry: "2026-09-30", received: 2000, dispensed: 780, available: 1220, reorder: 150, rack: "Rack A-03", updated: "2026-04-15 08:00" },
  { stockId: "STK-003", medId: "MED-003", medicine: "Metformin 500mg", batch: "BN-MET-2025-02", expiry: "2027-01-31", received: 3000, dispensed: 1100, available: 1900, reorder: 200, rack: "Rack B-01", updated: "2026-04-15 08:00" },
  { stockId: "STK-004", medId: "MED-004", medicine: "Atorvastatin 10mg", batch: "BN-ATO-2025-06", expiry: "2026-12-31", received: 1500, dispensed: 620, available: 880, reorder: 100, rack: "Rack B-02", updated: "2026-04-15 08:00" },
  { stockId: "STK-005", medId: "MED-005", medicine: "Cetirizine 10mg", batch: "BN-CET-2025-03", expiry: "2027-06-30", received: 2500, dispensed: 400, available: 2100, reorder: 150, rack: "Rack A-05", updated: "2026-04-15 08:00" },
  { stockId: "STK-006", medId: "MED-006", medicine: "Omeprazole 20mg", batch: "BN-OMP-2025-05", expiry: "2026-11-30", received: 1800, dispensed: 950, available: 850, reorder: 120, rack: "Rack C-01", updated: "2026-04-15 08:00" },
  { stockId: "STK-007", medId: "MED-007", medicine: "Insulin Glargine 100U/ml", batch: "BN-INS-2025-01", expiry: "2026-06-30", received: 300, dispensed: 140, available: 160, reorder: 50, rack: "Cold Storage R-1", updated: "2026-04-15 08:00" },
  { stockId: "STK-008", medId: "MED-008", medicine: "Amlodipine 5mg", batch: "BN-AML-2025-02", expiry: "2027-04-30", received: 2000, dispensed: 880, available: 1120, reorder: 100, rack: "Rack B-04", updated: "2026-04-15 08:00" },
  { stockId: "STK-009", medId: "MED-009", medicine: "Azithromycin 500mg", batch: "BN-AZI-2025-07", expiry: "2026-08-31", received: 800, dispensed: 420, available: 380, reorder: 80, rack: "Rack A-07", updated: "2026-04-15 08:00" },
  { stockId: "STK-010", medId: "MED-010", medicine: "Ondansetron 4mg", batch: "BN-OND-2025-04", expiry: "2026-10-31", received: 1200, dispensed: 580, available: 620, reorder: 100, rack: "Rack C-03", updated: "2026-04-15 08:00" },
  { stockId: "STK-011", medId: "MED-011", medicine: "Normal Saline 500ml", batch: "BN-NS-2025-03", expiry: "2027-02-28", received: 600, dispensed: 380, available: 220, reorder: 100, rack: "IV Store S-1", updated: "2026-04-15 08:00" },
];

const initialPrescriptions: Prescription[] = [
  { rxId: "RX-2026-0831", uhid: "UHID-100042", patient: "Ramesh Kumar", token: "OPD-0042", doctor: "Dr. Priya Nair", notes: "Mild hypertension. Advised low-sodium diet.", issued: "15-Apr-2026 10:10", status: "pending" },
  { rxId: "RX-2026-0834", uhid: "UHID-100047", patient: "Priya Sharma", token: "OPD-0047", doctor: "Dr. Meena Joshi", notes: "Type 2 diabetes management.", issued: "15-Apr-2026 09:40", status: "pending" },
  { rxId: "RX-2026-0835", uhid: "UHID-100051", patient: "Kiran Patel", token: "OPD-0051", doctor: "Dr. Anil Verma", notes: "Respiratory infection with gastric issues.", issued: "15-Apr-2026 10:05", status: "pending" },
];

const initialLog: DispenseLog[] = [
  { dispenseId: "DL-001", rxId: "RX-2026-0831", uhid: "UHID-100042", patient: "Ramesh Kumar", token: "OPD-0042", medicine: "Amlodipine 5mg", batch: "BN-AML-2025-02", qty: 30, unitPrice: 5, total: 150.0, dosage: "1 tab daily after breakfast", pharmacist: "Suresh R.", time: "15-Apr-2026 09:14" },
  { dispenseId: "DL-002", rxId: "RX-2026-0831", uhid: "UHID-100042", patient: "Ramesh Kumar", token: "OPD-0042", medicine: "Paracetamol 500mg", batch: "BN-PAR-2025-01", qty: 10, unitPrice: 2.5, total: 25.0, dosage: "1 tab thrice daily after meals", pharmacist: "Suresh R.", time: "15-Apr-2026 09:12" },
  { dispenseId: "DL-003", rxId: "RX-2026-0834", uhid: "UHID-100047", patient: "Priya Sharma", token: "OPD-0047", medicine: "Metformin 500mg", batch: "BN-MET-2025-02", qty: 60, unitPrice: 4, total: 240.0, dosage: "1 tab twice daily after meals", pharmacist: "Suresh R.", time: "15-Apr-2026 09:45" },
  { dispenseId: "DL-004", rxId: "RX-2026-0835", uhid: "UHID-100051", patient: "Kiran Patel", token: "OPD-0051", medicine: "Amoxicillin 250mg", batch: "BN-AMX-2025-04", qty: 21, unitPrice: 8, total: 168.0, dosage: "1 cap three times daily", pharmacist: "Anita M.", time: "15-Apr-2026 10:05" },
  { dispenseId: "DL-005", rxId: "RX-2026-0835", uhid: "UHID-100051", patient: "Kiran Patel", token: "OPD-0051", medicine: "Omeprazole 20mg", batch: "BN-OMP-2025-05", qty: 14, unitPrice: 5.5, total: 77.0, dosage: "1 cap before breakfast", pharmacist: "Anita M.", time: "15-Apr-2026 10:07" },
  { dispenseId: "DL-006", rxId: "RX-2026-0838", uhid: "UHID-100055", patient: "Sanjay Mehta", token: "OPD-0055", medicine: "Atorvastatin 10mg", batch: "BN-ATO-2025-06", qty: 30, unitPrice: 6.5, total: 195.0, dosage: "1 tab at bedtime", pharmacist: "Anita M.", time: "15-Apr-2026 10:30" },
  { dispenseId: "DL-007", rxId: "RX-2026-0840", uhid: "UHID-100058", patient: "Lakshmi Devi", token: "OPD-0058", medicine: "Cetirizine 10mg", batch: "BN-CET-2025-03", qty: 10, unitPrice: 3, total: 30.0, dosage: "1 tab at night", pharmacist: "Suresh R.", time: "15-Apr-2026 10:52" },
  { dispenseId: "DL-008", rxId: "RX-2026-0841", uhid: "UHID-100062", patient: "Vikram Singh", token: "OPD-0062", medicine: "Azithromycin 500mg", batch: "BN-AZI-2025-07", qty: 5, unitPrice: 22, total: 110.0, dosage: "1 tab daily for 5 days", pharmacist: "Suresh R.", time: "15-Apr-2026 11:15" },
  { dispenseId: "DL-009", rxId: "RX-2026-0843", uhid: "UHID-100065", patient: "Meena Nair", token: "OPD-0065", medicine: "Insulin Glargine 100U/ml", batch: "BN-INS-2025-01", qty: 2, unitPrice: 320, total: 640.0, dosage: "10U subcutaneous at bedtime", pharmacist: "Anita M.", time: "15-Apr-2026 11:40" },
  { dispenseId: "DL-010", rxId: "RX-2026-0845", uhid: "UHID-100069", patient: "Arjun Das", token: "OPD-0069", medicine: "Salbutamol Inhaler", batch: "BN-SAL-2025-02", qty: 1, unitPrice: 185, total: 185.0, dosage: "2 puffs when required", pharmacist: "Suresh R.", time: "15-Apr-2026 12:10" },
  { dispenseId: "DL-011", rxId: "RX-2026-0847", uhid: "UHID-100073", patient: "Deepa Raj", token: "OPD-0073", medicine: "Ondansetron 4mg", batch: "BN-OND-2025-04", qty: 6, unitPrice: 7, total: 42.0, dosage: "1 tab 30 min before meals", pharmacist: "Suresh R.", time: "15-Apr-2026 12:35" },
];

interface StoreShape {
  user: User | null;
  setUser: (u: User | null) => void;

  patients: Patient[]; addPatient: (p: Patient) => void;
  emergencies: Emergency[]; addEmergency: (e: Emergency) => void;
  opd: OPDToken[]; addOPD: (o: OPDToken) => void;
  ipd: IPDAdmission[]; addIPD: (i: IPDAdmission) => void;
  beds: Bed[]; addBed: (b: Bed) => void;
  labs: LabTest[]; addLab: (l: LabTest) => void;
  medicines: Medicine[]; addMedicine: (m: Medicine) => void;
  doctors: Doctor[]; addDoctor: (d: Doctor) => void; updateDoctor: (id: string, patch: Partial<Doctor>) => void; removeDoctor: (id: string) => void;
  staff: Staff[]; addStaff: (s: Staff) => void;
  payments: Payment[]; addPayment: (p: Payment) => void;

  catalogue: CatalogueMed[];
  stock: StockRow[];
  prescriptions: Prescription[];
  log: DispenseLog[];
  dispense: (rxId: string, items: { medId: string; qty: number; dosage: string }[], pharmacist: string) => { ok: boolean; error?: string };

  toasts: Toast[]; pushToast: (msg: string, type?: Toast["type"]) => void; dismissToast: (id: number) => void;
}

const Ctx = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    try { const raw = localStorage.getItem("hms_user"); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const setUser = (u: User | null) => {
    setUserState(u);
    if (u) localStorage.setItem("hms_user", JSON.stringify(u));
    else localStorage.removeItem("hms_user");
  };

  const [patients, setPatients] = useState<Patient[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [opd, setOpd] = useState<OPDToken[]>([]);
  const [ipd, setIpd] = useState<IPDAdmission[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [labs, setLabs] = useState<LabTest[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [catalogue] = useState<CatalogueMed[]>(initialCatalogue);
  const [stock, setStock] = useState<StockRow[]>(initialStock);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialPrescriptions);
  const [log, setLog] = useState<DispenseLog[]>(initialLog);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const dispense: StoreShape["dispense"] = (rxId, items, pharmacist) => {
    // Validate stock
    const newStock = [...stock];
    for (const it of items) {
      const idx = newStock.findIndex((s) => s.medId === it.medId);
      if (idx === -1) return { ok: false, error: `Stock not found for ${it.medId}` };
      if (newStock[idx].available < it.qty) return { ok: false, error: `Insufficient stock for ${newStock[idx].medicine}` };
    }
    // Apply
    const newLog: DispenseLog[] = [];
    const rx = prescriptions.find((p) => p.rxId === rxId);
    if (!rx) return { ok: false, error: "Prescription not found" };
    let total = 0;
    items.forEach((it, i) => {
      const idx = newStock.findIndex((s) => s.medId === it.medId);
      const cat = catalogue.find((c) => c.id === it.medId);
      const row = newStock[idx];
      newStock[idx] = { ...row, available: row.available - it.qty, dispensed: row.dispensed + it.qty, updated: new Date().toISOString().replace("T", " ").slice(0, 16) };
      const unit = cat?.price || 0;
      const lineTotal = unit * it.qty;
      total += lineTotal;
      newLog.push({
        dispenseId: `DL-${String(log.length + i + 100).padStart(3, "0")}`,
        rxId, uhid: rx.uhid, patient: rx.patient, token: rx.token,
        medicine: row.medicine, batch: row.batch, qty: it.qty, unitPrice: unit, total: lineTotal,
        dosage: it.dosage, pharmacist, time: new Date().toLocaleString(),
      });
    });
    setStock(newStock);
    setLog((l) => [...newLog, ...l]);
    setPrescriptions((ps) => ps.map((p) => (p.rxId === rxId ? { ...p, status: "dispensed" } : p)));
    setPayments((ps) => [...ps, {
      invoice: `INV-${Date.now().toString().slice(-6)}`, uhid: rx.uhid, patient: rx.patient,
      type: "Pharmacy", description: `${items.length} medicines`, amount: total,
      method: "Cash", status: "Completed", date: new Date().toLocaleDateString(), txnId: `PHARM-${Date.now()}`,
    }]);
    pushToast(`Dispensed ${items.length} medicines for ${rx.patient}`, "success");
    return { ok: true };
  };

  const value: StoreShape = {
    user, setUser,
    patients, addPatient: (p) => setPatients((x) => [...x, p]),
    emergencies, addEmergency: (e) => setEmergencies((x) => [...x, e]),
    opd, addOPD: (o) => setOpd((x) => [...x, o]),
    ipd, addIPD: (i) => setIpd((x) => [...x, i]),
    beds, addBed: (b) => setBeds((x) => [...x, b]),
    labs, addLab: (l) => setLabs((x) => [...x, l]),
    medicines, addMedicine: (m) => setMedicines((x) => [...x, m]),
    doctors, addDoctor: (d) => setDoctors((x) => [...x, d]),
    updateDoctor: (id, patch) => setDoctors((x) => x.map((d) => (d.id === id ? { ...d, ...patch } : d))),
    removeDoctor: (id) => setDoctors((x) => x.filter((d) => d.id !== id)),
    staff, addStaff: (s) => setStaff((x) => [...x, s]),
    payments, addPayment: (p) => setPayments((x) => [...x, p]),
    catalogue, stock, prescriptions, log, dispense,
    toasts, pushToast, dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be inside StoreProvider");
  return v;
}
