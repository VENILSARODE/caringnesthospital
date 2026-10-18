import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useEffect,
} from "react";

import { getEmergencies } from "./api";

// ===== Types =====
export type Role = "admin" | "receptionist" | "pharmacist";

export interface User {
  name: string;
  role: Role;
  initial: string;
  roleLabel: string;
}

export interface Patient {
  uhid: string;
  name: string;
  age: number;
  gender: string;
  blood: string;
  contact: string;
  registered: string;
  lastVisit: string;
  visits: number;
  status: string;
}

export interface Emergency {
  id: string;
  patient: string;
  age: number;
  gender: string;
  contact: string;
  location: string;
  injury: string;
  condition: string;
  triage: string;
  mlc: boolean;
  doctor: string;
  arrived: string;
  time: string;
  uhid: string;

  // ===== Backend / MongoDB fields =====
  accidentType?: string;
  consciousness?: string;
  severity?: string;
  arrivalTime?: string;
  callerName?: string;
  callerPhone?: string;
  languageUsed?: string;
  status?: string;
}

export interface OPDToken {
  token: string;
  uhid: string;
  patient: string;
  age: number;
  city: string;
  complaint: string;
  doctor: string;
  status: string;
  appointment: string;
}

export interface IPDAdmission {
  ipd: string;
  uhid: string;
  patient: string;
  age: number;
  gender: string;
  ward: string;
  bed: string;
  doctor: string;
  diagnosis: string;
  admitDate: string;
  status: string;
}

export interface Bed {
  id: string;
  ward: string;
  number: string;
  status: string;
}

export interface LabTest {
  id: string;
  uhid: string;
  patient: string;
  doctor: string;
  tests: string;
  priority: string;
  status: string;
  ordered: string;
  result: string;
}

export interface Medicine {
  name: string;
  category: string;
  stock: number;
  unit: string;
  price: number;
  expiry: string;
  supplier: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  department: string;
  available: boolean;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  department: string;
  contact: string;
  shift: string;
  status: string;
  joined: string;
}

export interface Payment {
  invoice: string;
  uhid: string;
  patient: string;
  type: string;
  description: string;
  amount: number;
  method: string;
  status: string;
  date: string;
  txnId: string;
}

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warn";
}

// ===== Pharmacist domain =====
export interface CatalogueMed {
  id: string;
  name: string;
  generic: string;
  category: string;
  form: string;
  strength: string;
  manufacturer: string;
  supplier: string;
  rx: boolean;
  hsn: string;
  storage: string;
  price: number;
  shelf: string;
  status: "Active" | "Inactive";
}

export interface StockRow {
  stockId: string;
  medId: string;
  medicine: string;
  batch: string;
  expiry: string;
  received: number;
  dispensed: number;
  available: number;
  reorder: number;
  rack: string;
  updated: string;
}

export interface Prescription {
  rxId: string;
  uhid: string;
  patient: string;
  token: string;
  doctor: string;
  notes: string;
  issued: string;
  status: "pending" | "partial" | "dispensed";
}

export interface DispenseLog {
  dispenseId: string;
  rxId: string;
  uhid: string;
  patient: string;
  token: string;
  medicine: string;
  batch: string;
  qty: number;
  unitPrice: number;
  total: number;
  dosage: string;
  pharmacist: string;
  time: string;
}

// ===== Initial local data intentionally disabled =====
// Phase 12I: the application must not start with mock/demo records.
// Backend-backed modules load their real data from Node.js + MongoDB.
// These arrays remain empty only for legacy/deferred UI modules so their
// existing TypeScript contracts continue to compile.
const initialCatalogue: CatalogueMed[] = [];
const initialStock: StockRow[] = [];
const initialPrescriptions: Prescription[] = [];
const initialLog: DispenseLog[] = [];

interface StoreShape {
  user: User | null;
  setUser: (u: User | null) => void;

  patients: Patient[];
  addPatient: (p: Patient) => void;

  emergencies: Emergency[];
  addEmergency: (e: Emergency) => void;

  opd: OPDToken[];
  addOPD: (o: OPDToken) => void;

  ipd: IPDAdmission[];
  addIPD: (i: IPDAdmission) => void;

  beds: Bed[];
  addBed: (b: Bed) => void;

  labs: LabTest[];
  addLab: (l: LabTest) => void;

  medicines: Medicine[];
  addMedicine: (m: Medicine) => void;

  doctors: Doctor[];
  addDoctor: (d: Doctor) => void;
  updateDoctor: (id: string, patch: Partial<Doctor>) => void;
  removeDoctor: (id: string) => void;

  staff: Staff[];
  addStaff: (s: Staff) => void;

  payments: Payment[];
  addPayment: (p: Payment) => void;

  catalogue: CatalogueMed[];
  stock: StockRow[];
  prescriptions: Prescription[];
  log: DispenseLog[];

  dispense: (
    rxId: string,
    items: { medId: string; qty: number; dosage: string }[],
    pharmacist: string
  ) => { ok: boolean; error?: string };

  toasts: Toast[];
  pushToast: (msg: string, type?: Toast["type"]) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem("hms_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const setUser = (u: User | null) => {
    setUserState(u);

    if (u) {
      localStorage.setItem("hms_user", JSON.stringify(u));
    } else {
      localStorage.removeItem("hms_user");
    }
  };

  const [patients, setPatients] = useState<Patient[]>([]);

  const [emergencies, setEmergencies] = useState<Emergency[]>([]);

  // ============================================================
  // REAL BACKEND → MONGODB → REACT
  // Loads actual emergency records from Node.js backend.
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    async function loadEmergencies() {
      try {
        console.log("Loading real emergencies from backend...");

        const data = await getEmergencies();

        if (!data.success || !Array.isArray(data.emergencies)) {
          throw new Error("Invalid emergency API response");
        }

        const severityToTriage: Record<string, string> = {
          CRITICAL: "Red",
          MODERATE: "Yellow",
          MINOR: "Green",
          UNKNOWN: "Yellow",
        };

        const mappedEmergencies: Emergency[] = data.emergencies.map(
          (e: any) => {
            const createdDate = e.createdAt
              ? new Date(e.createdAt)
              : new Date();

            const severity = String(e.severity || "UNKNOWN").toUpperCase();

            return {
              id: e.emergencyId,
              patient: e.patientName || "—",
              age: Number(e.age) || 0,
              gender: e.gender || "—",
              contact: e.callerPhone || "",
              location: e.location || "—",
              injury: e.injuries || "—",
              condition: e.consciousness || "—",
              triage: severityToTriage[severity] || "Yellow",
              mlc: Boolean(e.mlcCase),
              doctor: e.doctorName || "—",

              arrived: createdDate.toLocaleDateString(),
              time: createdDate.toLocaleTimeString(),

              uhid: e.patientUhid || "—",

              // Keep original backend fields as well
              accidentType: e.accidentType,
              consciousness: e.consciousness,
              severity: e.severity,
              arrivalTime: e.arrivalTime,
              callerName: e.callerName,
              callerPhone: e.callerPhone,
              languageUsed: e.languageUsed,
              status: e.status,
            };
          }
        );

        if (!cancelled) {
          setEmergencies(mappedEmergencies);

          console.log(
            `Loaded ${mappedEmergencies.length} real emergency record(s) from backend.`
          );
        }
      } catch (error) {
        console.error("Loading emergencies failed:", error);

        if (!cancelled) {
          setEmergencies([]);
        }
      }
    }

    loadEmergencies();

    return () => {
      cancelled = true;
    };
  }, []);

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
  const [prescriptions, setPrescriptions] =
    useState<Prescription[]>(initialPrescriptions);
  const [log, setLog] = useState<DispenseLog[]>(initialLog);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback(
    (message: string, type: Toast["type"] = "info") => {
      const id = Date.now() + Math.random();

      setToasts((t) => [...t, { id, message, type }]);

      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = (id: number) =>
    setToasts((t) => t.filter((x) => x.id !== id));

  // ============================================================
  // LEGACY LOCAL PHARMACY DISPENSING DISABLED
  // ============================================================
  // Pharmacy is now controlled by the real backend:
  //   Node.js -> MongoDB
  // Use the API functions from ./api and PharmacyPage instead.
  // This adapter deliberately refuses local/mock dispensing so that
  // a prescription can never appear to be dispensed without a real
  // backend transaction.
  const dispense: StoreShape["dispense"] = () => {
    const message =
      "Local pharmacy dispensing is disabled. Use the backend pharmacy API.";
    pushToast(message, "warn");

    return {
      ok: false,
      error: message,
    };
  };

  const value: StoreShape = {
    user,
    setUser,

    patients,
    addPatient: (p) =>
      setPatients((x) => [...x, p]),

    emergencies,

    // Emergency creation is backend-controlled in Phase 12G.
    // EmergencyPage uses createEmergency() from ./api.
    // This legacy adapter remains only for deferred/legacy consumers.
    addEmergency: (e) =>
      setEmergencies((x) => [...x, e]),

    opd,
    addOPD: (o) =>
      setOpd((x) => [...x, o]),

    ipd,
    addIPD: (i) =>
      setIpd((x) => [...x, i]),

    beds,
    addBed: (b) =>
      setBeds((x) => [...x, b]),

    labs,
    addLab: (l) =>
      setLabs((x) => [...x, l]),

    medicines,
    addMedicine: (m) =>
      setMedicines((x) => [...x, m]),

    doctors,
    addDoctor: (d) =>
      setDoctors((x) => [...x, d]),

    updateDoctor: (id, patch) =>
      setDoctors((x) =>
        x.map((d) =>
          d.id === id
            ? { ...d, ...patch }
            : d
        )
      ),

    removeDoctor: (id) =>
      setDoctors((x) =>
        x.filter((d) => d.id !== id)
      ),

    staff,
    addStaff: (s) =>
      setStaff((x) => [...x, s]),

    payments,
    addPayment: (p) =>
      setPayments((x) => [...x, p]),

    catalogue,
    stock,
    prescriptions,
    log,
    dispense,

    toasts,
    pushToast,
    dismissToast,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const v = useContext(Ctx);

  if (!v) {
    throw new Error(
      "useStore must be inside StoreProvider"
    );
  }

  return v;
};
