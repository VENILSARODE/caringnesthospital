import { useCallback, useEffect, useState } from "react";
import { useStore, type Emergency } from "./store";
import { C } from "./theme";
import {
  Card,
  PrimaryBtn,
  DangerBtn,
  GhostBtn,
  StatCard,
  Pill,
  Table,
  TR,
  TD,
  EmptyRow,
  Field,
  Modal,
  inputStyle,
  PageHeading,
  ChartPlaceholder,
} from "./ui";
import {
  createAppointment,
  createConsultation,
  getConsultations,
  getPendingPrescriptions,
  createPatient,
  createDoctor,
  deleteDoctor,
  getAppointments,
  getDoctorAvailability,
  getDoctors,
  getPatients,
  getMedicines,
  createMedicine,
  dispensePrescription,
  getApiBaseUrl,
  getAuthToken,
  apiRequest,
  updateDoctor,
} from "./api";
import { connectSocket, subscribeSocketEvent } from "./socket";

// ============================================================
// DOCTOR PAGE TYPES AND DEFAULTS
// ============================================================

type DoctorForm = {
  name: string;
  specialization: string;
  department: string;
  phone: string;
  workingDays: string[];
  startTime: string;
  endTime: string;
  dailyTokenCapacity: string;
};

type DoctorRecord = {
  doctorId: string;
  fullName: string;
  specialization: string;
  department: string;
  phone?: string;
  workingDays?: string[];
  startTime?: string;
  endTime?: string;
  dailyTokenCapacity?: number;
  isActive: boolean;
};

const DOCTOR_WORKING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_DOCTOR_FORM: DoctorForm = {
  name: "",
  specialization: "",
  department: "",
  phone: "",
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  startTime: "09:00",
  endTime: "17:00",
  dailyTokenCapacity: "30",
};

// ============================================================
// COMMON HELPERS
// ============================================================

function escapeHTML(value: unknown): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTodayISO(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Converts common date formats used by this frontend into YYYY-MM-DD.
 * Supports:
 * - YYYY-MM-DD
 * - DD/MM/YYYY
 * - DD-MM-YYYY
 * - MM/DD/YYYY
 * - values containing a date followed by a time
 */
function dateToISO(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // MongoDB timestamps are commonly ISO strings. For these, preserve the
  // calendar date written by the backend instead of converting through the
  // browser's timezone (which can shift the date by one day).
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
      check.getUTCFullYear() === year &&
      check.getUTCMonth() === month - 1 &&
      check.getUTCDate() === day
    ) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    return null;
  }

  // Accept DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and US MM/DD/YYYY.
  const numericMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:$|\s)/);
  if (numericMatch) {
    const first = Number(numericMatch[1]);
    const second = Number(numericMatch[2]);
    const year = Number(numericMatch[3]);
    let day = first;
    let month = second;

    // Resolve unambiguous US dates; otherwise use the app's Indian DD/MM/YYYY
    // convention (for example 01/10/2026 means 1 October 2026).
    if (first <= 12 && second > 12) {
      month = first;
      day = second;
    }

    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      month < 1 || month > 12 || day < 1 || day > 31 ||
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) {
      return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  // Use local date parts for non-ISO values parsed by the browser.
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function isDateInRange(
  value: unknown,
  from: string,
  to: string
): boolean {
  const date = dateToISO(value);

  if (!date) {
    return false;
  }

  return date >= from && date <= to;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadCSV(
  filename: string,
  rows: Array<Array<unknown>>
) {
  const csv = rows
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function printHTMLReport(
  title: string,
  bodyHTML: string
) {
  const w = window.open(
    "",
    "_blank",
    "width=1000,height=900"
  );

  if (!w) {
    alert(
      "Pop-up blocked. Please allow pop-ups and try again."
    );
    return;
  }

  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>${escapeHTML(title)}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, sans-serif;
            color: #222;
            margin: 30px;
            font-size: 13px;
          }

          h1 {
            color: #0F2A5F;
            margin-bottom: 6px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }

          th,
          td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }

          th {
            background: #F5F7FA;
            font-weight: 700;
          }

          .footer {
            margin-top: 25px;
            font-size: 11px;
            color: #666;
          }

          @media print {
            body {
              margin: 15px;
            }
          }
        </style>
      </head>

      <body>
        ${bodyHTML}
      </body>
    </html>
  `);

  w.document.close();
  w.focus();

  setTimeout(() => {
    w.print();
  }, 400);
}

// ============================================================
// MLC REPORT HELPERS
// ============================================================

const HOSPITAL_NAME =
  "Ballari Hrudayalaya Hospital, Ballari";

const HOSPITAL_ADDR =
  "Hospital Road, Ballari, Karnataka 583101 · Ph: +91 8392 123456";

function buildMLCReportHTML(
  e: Emergency
): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>MLC Report ${escapeHTML(e.uhid)}</title>

<style>
  * {
    box-sizing: border-box;
  }

  body {
    font-family: Arial, sans-serif;
    color: #222;
    margin: 40px;
    font-size: 13px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    color: #0F2A5F;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    color: #666;
    font-weight: 400;
  }

  .hdr {
    border-bottom: 3px double #0F2A5F;
    padding-bottom: 14px;
    margin-bottom: 18px;
    text-align: center;
  }

  .badge {
    display: inline-block;
    background: #DC2626;
    color: #fff;
    padding: 6px 14px;
    border-radius: 4px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-top: 10px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
  }

  td {
    padding: 8px 10px;
    border: 1px solid #ddd;
    vertical-align: top;
  }

  td.k {
    background: #F5F7FA;
    font-weight: 700;
    width: 32%;
  }

  .sec {
    margin-top: 22px;
    font-weight: 700;
    color: #0F2A5F;
    font-size: 14px;
    border-bottom: 1px solid #ccc;
    padding-bottom: 4px;
  }

  .sign {
    display: flex;
    justify-content: space-between;
    margin-top: 60px;
  }

  .sign div {
    width: 30%;
    border-top: 1px solid #333;
    padding-top: 6px;
    text-align: center;
    font-size: 12px;
  }

  .footer {
    margin-top: 30px;
    font-size: 11px;
    color: #666;
    text-align: center;
    border-top: 1px dashed #ccc;
    padding-top: 10px;
  }

  @media print {
    body {
      margin: 20px;
    }
  }
</style>

</head>

<body>

<div class="hdr">
  <h1>${escapeHTML(HOSPITAL_NAME)}</h1>
  <h2>${escapeHTML(HOSPITAL_ADDR)}</h2>

  <div class="badge">
    ⚖ MEDICO-LEGAL CASE (MLC) REPORT
  </div>
</div>

<div class="sec">
  Case Identification
</div>

<table>
  <tr>
    <td class="k">MLC / UHID No.</td>
    <td><b>${escapeHTML(e.uhid)}</b></td>

    <td class="k">Emergency ID</td>
    <td>${escapeHTML(e.id)}</td>
  </tr>

  <tr>
    <td class="k">Date of Arrival</td>
    <td>${escapeHTML(e.arrived)}</td>

    <td class="k">Time of Arrival</td>
    <td>${escapeHTML(e.time)}</td>
  </tr>
</table>

<div class="sec">
  Patient Particulars
</div>

<table>
  <tr>
    <td class="k">Patient Name</td>
    <td>${escapeHTML(e.patient)}</td>

    <td class="k">Age / Gender</td>
    <td>${escapeHTML(e.age)} yrs / ${escapeHTML(e.gender)}</td>
  </tr>

  <tr>
    <td class="k">Contact Number</td>
    <td colspan="3">${escapeHTML(e.contact || "—")}</td>
  </tr>
</table>

<div class="sec">
  Incident Details
</div>

<table>
  <tr>
    <td class="k">Place of Incident</td>
    <td colspan="3">${escapeHTML(e.location || "—")}</td>
  </tr>

  <tr>
    <td class="k">Nature of Injury</td>
    <td colspan="3">${escapeHTML(e.injury)}</td>
  </tr>

  <tr>
    <td class="k">Condition on Arrival</td>
    <td>${escapeHTML(e.condition)}</td>

    <td class="k">Triage Level</td>
    <td>${escapeHTML(e.triage)}</td>
  </tr>
</table>

<div class="sec">
  Medical Officer
</div>

<table>
  <tr>
    <td class="k">Attending Doctor</td>
    <td colspan="3">${escapeHTML(e.doctor || "—")}</td>
  </tr>
</table>

<div class="sec">
  Documentation Note
</div>

<p style="line-height:1.6">
  This document contains the emergency and medico-legal
  information recorded by the hospital for the selected case.
  Findings, treatment, observations, and subsequent actions
  should be completed and verified by the authorized medical
  and hospital personnel according to applicable procedures.
</p>

<div class="sign">
  <div>
    Medical Officer
    <br/>
    <small>Signature &amp; Stamp</small>
  </div>

  <div>
    Casualty In-charge
    <br/>
    <small>Signature &amp; Stamp</small>
  </div>

  <div>
    Hospital Seal
    <br/>
    <small>${escapeHTML(HOSPITAL_NAME)}</small>
  </div>
</div>

<div class="footer">
  Generated on ${escapeHTML(new Date().toLocaleString())}
  · Confidential — for authorized hospital use
</div>

</body>
</html>`;
}

function printMLCReport(
  e: Emergency
) {
  const w = window.open(
    "",
    "_blank",
    "width=900,height=1000"
  );

  if (!w) {
    alert(
      "Pop-up blocked. Please allow pop-ups to print the MLC report."
    );
    return;
  }

  w.document.write(
    buildMLCReportHTML(e)
  );

  w.document.close();
  w.focus();

  setTimeout(() => {
    w.print();
  }, 500);
}

function buildMLCEmailBody(
  e: Emergency
): string {
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

Please verify the case details and complete the applicable hospital/police documentation procedures.

Regards,
Casualty Medical Officer
${HOSPITAL_NAME}
${HOSPITAL_ADDR}`;
}

// ============================================================
// DASHBOARD
// ============================================================

export function DashboardPage({
  role,
}: {
  role: "admin" | "receptionist";
}) {
  const s = useStore();

  // Dashboard emergency/OPD totals must come from the same backend data
  // used by their respective pages, not from a possibly stale local store.
  const [activeEmergencyCount, setActiveEmergencyCount] = useState(0);
  const [activeOpdTokenCount, setActiveOpdTokenCount] = useState(0);
  const [activeDoctorCount, setActiveDoctorCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadOperationalCounts = async () => {
      try {
        const [emergencyResult, appointmentResult] = await Promise.all([
          apiRequest("/emergencies"),
          getAppointments(),
        ]);

        const emergencyRecords =
          (emergencyResult as any)?.emergencies ??
          (emergencyResult as any)?.data?.emergencies ??
          [];
        const appointmentRecords =
          (appointmentResult as any)?.appointments ??
          (appointmentResult as any)?.data?.appointments ??
          [];

        if (!Array.isArray(emergencyRecords)) {
          throw new Error("Emergency API response did not contain an emergency list.");
        }
        if (!Array.isArray(appointmentRecords)) {
          throw new Error("Appointment API response did not contain an appointment list.");
        }

        const terminalStatuses = new Set([
          "closed",
          "resolved",
          "completed",
          "cancelled",
          "canceled",
        ]);
        const nextActiveEmergencyCount = emergencyRecords.filter((record: any) => {
          const status = String(record?.status ?? "").trim().toLowerCase();
          return !terminalStatuses.has(status);
        }).length;
        const nextActiveOpdTokenCount = appointmentRecords.filter((record: any) => {
          const status = String(record?.status ?? "").trim().toLowerCase();
          return !terminalStatuses.has(status);
        }).length;

        if (!cancelled) {
          setActiveEmergencyCount(nextActiveEmergencyCount);
          setActiveOpdTokenCount(nextActiveOpdTokenCount);
        }
      } catch (error) {
        console.error("[Dashboard] Failed to load emergency/OPD counts from backend:", error);
        if (!cancelled) {
          // Keep safe zero defaults rather than display stale local-store totals.
          setActiveEmergencyCount(0);
          setActiveOpdTokenCount(0);
        }
      }
    };

    void loadOperationalCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  // Doctor Management reads doctors from the backend. Use that same source
  // for the dashboard metric instead of the legacy local-store doctor array.
  // In this application, the Doctor Management availability toggle updates
  // the backend `isActive` field, so count active doctors from that field.
  useEffect(() => {
    let cancelled = false;

    const loadActiveDoctors = async () => {
      try {
        const result: any = await getDoctors();
        const doctorRecords =
          result?.doctors ??
          result?.data?.doctors ??
          result?.data ??
          result;

        if (!Array.isArray(doctorRecords)) {
          throw new Error("Doctor API response did not contain a doctor list.");
        }

        const count = doctorRecords.filter(
          (doctor: any) => doctor?.isActive === true
        ).length;

        if (!cancelled) setActiveDoctorCount(count);
      } catch (error) {
        console.error("[Dashboard] Failed to load doctors from backend:", error);
        if (!cancelled) setActiveDoctorCount(0);
      }
    };

    void loadActiveDoctors();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = getTodayISO();

  const patientsToday = s.patients.filter(
    (p) =>
      dateToISO(p.registered) === today
  ).length;

  const beds = s.beds.filter(
    (b) => b.status === "Available"
  ).length;

  const docs = activeDoctorCount;

  const labsP = s.labs.filter(
    (l) => l.status !== "Completed"
  ).length;

  const revenue = s.payments
    .filter(
      (p) =>
        p.status === "Completed" &&
        dateToISO(p.date) === today
    )
    .reduce(
      (a, b) => a + b.amount,
      0
    );

  return (
    <div>
      <div
        style={{
          background: `linear-gradient(135deg, ${C.navy} 0%, #1a3a70 100%)`,
          color: C.white,
          borderRadius: 14,
          padding: "26px 30px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            Good Afternoon,{" "}
            {role === "admin"
              ? "Admin"
              : "Front Officer"}{" "}
            👋
          </div>

          <div
            style={{
              opacity: 0.85,
              marginTop: 4,
            }}
          >
            Here's what's happening at Ballari
            Hrudayalaya today
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <DangerBtn>
            🚨 New Emergency
          </DangerBtn>

          <button
            type="button"
            style={{
              background: "#1a3a70",
              color: C.white,
              border: "none",
              padding: "10px 16px",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🎫 Add OPD Token
          </button>

          <button
            type="button"
            style={{
              background: "#1a3a70",
              color: C.white,
              border: "none",
              padding: "10px 16px",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🏥 Admit Patient
          </button>
        </div>
      </div>

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <StatCard
          label="Total Patients Today"
          value={patientsToday}
          icon="👥"
          color={C.navy}
        />

        <StatCard
          label="Active Emergencies"
          value={activeEmergencyCount}
          icon="🚨"
          color={C.red}
        />

        <StatCard
          label="OPD Tokens"
          value={activeOpdTokenCount}
          icon="🎫"
          color={C.yellow}
        />

        <StatCard
          label="IPD Admissions"
          value={s.ipd.length}
          icon="🏥"
          color={C.blue}
        />
      </div>

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard
          label="Beds Available"
          value={beds}
          icon="🛏️"
          color={C.green}
        />

        <StatCard
          label="Doctors On-Duty"
          value={docs}
          icon="👨‍⚕️"
          color={C.blue}
        />

        <StatCard
          label="Lab Tests Pending"
          value={labsP}
          icon="✏️"
          color={C.orange}
        />

        <StatCard
          label="Revenue Today"
          value={`₹${revenue}`}
          icon="💰"
          color={C.green}
        />
      </div>

      <h3
        style={{
          margin: "8px 0 16px",
          color: C.textDark,
        }}
      >
        ⚡ Quick Actions
      </h3>

      <div
        className="hms-grid-6"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(6, 1fr)",
          gap: 14,
          marginBottom: 30,
        }}
      >
        {[
          {
            label: "🚨 New Emergency",
            bg: C.redLight,
            color: C.red,
          },
          {
            label: "🎫 Add OPD Token",
            bg: C.yellowLight,
            color: C.tan,
          },
          {
            label: "🏥 Admit Patient",
            bg: C.blueLight,
            color: C.blue,
          },
          {
            label: "✏️ Order Lab Test",
            bg: C.pinkLight,
            color: C.pink,
          },
          {
            label: "💰 New Payment",
            bg: C.greenLight,
            color: C.green,
          },
          {
            label: "🛏️ View Beds",
            bg: "#FEF3C7",
            color: C.tan,
          },
        ].map((q) => (
          <div
            key={q.label}
            style={{
              background: q.bg,
              borderRadius: 12,
              padding: 22,
              textAlign: "center",
              cursor: "pointer",
              color: q.color,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {q.label}
          </div>
        ))}
      </div>

      <div
        style={{
          textAlign: "center",
          color: C.textMuted,
          fontStyle: "italic",
          padding: 20,
        }}
      >
        Start by adding doctors, patients, and beds
        to see dashboard analytics populate here.
      </div>
    </div>
  );
}

// ============================================================
// PATIENTS
// ============================================================

type BackendPatient = {
  _id: string;
  uhid: string;
  fullName: string;
  age: number;
  gender: "Male" | "Female" | "Other";
  phone: string;
  address?: string;
  emergencyContact?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function PatientsPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const {
    pushToast,
  } = useStore();

  const [patients, setPatients] =
    useState<BackendPatient[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [open, setOpen] =
    useState(false);

  const [editingPatient, setEditingPatient] =
    useState<BackendPatient | null>(null);

  const [search, setSearch] =
    useState("");

  const [form, setForm] =
    useState({
      name: "",
      age: "",
      gender: "Male",
      contact: "",
      address: "",
      emergencyContact: "",
    });

  const [errs, setErrs] =
    useState<Record<string, string>>({});

  // ------------------------------------------------------------
  // LOAD REAL PATIENTS FROM BACKEND
  // ------------------------------------------------------------

  const loadPatients = async () => {
    try {
      setLoading(true);

      const response =
        await getPatients();

      setPatients(
        response.patients || []
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load patients.";

      console.error(
        "Caring Nest patient load error:",
        error
      );

      setErrs({
        general: message,
      });

      pushToast(
        message,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // LOAD PATIENTS WHEN PAGE OPENS
  // ------------------------------------------------------------

  useEffect(() => {
    loadPatients();
  }, []);

  // ------------------------------------------------------------
  // REGISTER PATIENT THROUGH REAL BACKEND
  // ------------------------------------------------------------

  const submit = async () => {
    const e: Record<string, string> = {};

    const age = Number(form.age);

    if (!form.name.trim()) {
      e.name = "Name required";
    }

    if (
      !form.age ||
      !Number.isFinite(age) ||
      age <= 0 ||
      age > 120
    ) {
      e.age = "Enter a valid age";
    }

    if (!/^\d{10}$/.test(form.contact)) {
      e.contact =
        "10-digit number required";
    }

    setErrs(e);

    if (Object.keys(e).length) {
      return;
    }

    setSaving(true);
    setErrs({});

    try {
      const response =
        await createPatient({
          fullName: form.name.trim(),
          age,
          gender:
            form.gender as
            | "Male"
            | "Female"
            | "Other",
          phone: form.contact,
          address:
            form.address.trim(),
          emergencyContact:
            form.emergencyContact.trim(),
        });

      if (!response.success) {
        throw new Error(
          response.message ||
          "Patient registration failed."
        );
      }

      /*
       * IMPORTANT:
       *
       * UHID is generated by the backend.
       * The frontend NEVER generates the UHID.
       */

      pushToast(
        `Patient registered successfully. UHID: ${response.patient.uhid}`,
        "success"
      );

      setOpen(false);

      setForm({
        name: "",
        age: "",
        gender: "Male",
        contact: "",
        address: "",
        emergencyContact: "",
      });

      setErrs({});

      /*
       * Reload from the backend so the table
       * reflects the actual MongoDB state.
       */
      await loadPatients();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to register patient.";

      console.error(
        "Caring Nest patient registration error:",
        error
      );

      setErrs({
        general: message,
      });

      pushToast(
        message,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------
  // OPEN EDIT PATIENT FORM
  // ------------------------------------------------------------

  const openEditPatient = (patient: BackendPatient) => {
    setEditingPatient(patient);
    setForm({
      name: patient.fullName ?? "",
      age: String(patient.age ?? ""),
      gender: patient.gender ?? "Male",
      contact: patient.phone ?? "",
      address: patient.address ?? "",
      emergencyContact: patient.emergencyContact ?? "",
    });
    setErrs({});
    setOpen(true);
  };

  // ------------------------------------------------------------
  // SAVE PATIENT CHANGES TO THE BACKEND
  // ------------------------------------------------------------

  const savePatientChanges = async () => {
    if (!editingPatient) return;

    const e: Record<string, string> = {};
    const age = Number(form.age);

    if (!form.name.trim()) e.name = "Name required";
    if (!form.age || !Number.isInteger(age) || age < 1 || age > 120) {
      e.age = "Enter a valid age between 1 and 120";
    }
    if (!/^\d{10}$/.test(form.contact)) {
      e.contact = "Enter a valid 10-digit phone number";
    }
    if (
      form.emergencyContact.trim() &&
      !/^\d{10}$/.test(form.emergencyContact.trim())
    ) {
      e.emergencyContact = "Enter a valid 10-digit emergency contact";
    }

    setErrs(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    setErrs({});

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const response = await fetch(
        `${getApiBaseUrl()}/patients/${encodeURIComponent(editingPatient.uhid)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: form.name.trim(),
            age,
            gender: form.gender as "Male" | "Female" | "Other",
            phone: form.contact,
            address: form.address.trim(),
            emergencyContact: form.emergencyContact.trim(),
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || `Patient update failed (${response.status})`
        );
      }

      pushToast(
        `Patient ${editingPatient.uhid} updated successfully.`,
        "success"
      );
      setOpen(false);
      setEditingPatient(null);
      setForm({
        name: "",
        age: "",
        gender: "Male",
        contact: "",
        address: "",
        emergencyContact: "",
      });
      setErrs({});
      await loadPatients();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update patient.";
      console.error("Caring Nest patient update error:", error);
      setErrs({ general: message });
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------
  // SEARCH
  // ------------------------------------------------------------

  const filtered =
    patients.filter((p) => {
      const query =
        search.trim().toLowerCase();

      if (!query) {
        return true;
      }

      return (
        p.fullName
          .toLowerCase()
          .includes(query) ||
        p.uhid
          .toLowerCase()
          .includes(query) ||
        p.phone.includes(query)
      );
    });

  // ------------------------------------------------------------
  // DATE FORMAT
  // ------------------------------------------------------------

  const formatPatientDate = (
    value?: string
  ) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString(
      "en-IN"
    );
  };

  return (
    <div>
      <PageHeading
        title="👥 Patient Registry"
        action={
          canEdit ? (
            <PrimaryBtn
              onClick={() => {
                setOpen(true);
                setErrs({});
              }}
            >
              + Register Patient
            </PrimaryBtn>
          ) : undefined
        }
      />

      {/* ======================================================
          STATISTICS
          ====================================================== */}

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Total Patients"
          value={patients.length}
          icon="👥"
          color={C.navy}
        />

        <StatCard
          label="Active"
          value={patients.length}
          icon="✅"
          color={C.green}
        />

        <StatCard
          label="Discharged"
          value={0}
          icon="🏠"
          color={C.blue}
        />

        <StatCard
          label="Follow-Up"
          value={0}
          icon="🔄"
          color={C.orange}
        />
      </div>

      {/* ======================================================
          SEARCH
          ====================================================== */}

      <input
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
        placeholder="Search by name, UHID, or phone..."
        style={{
          ...inputStyle,
          marginBottom: 14,
        }}
      />

      {/* ======================================================
          PATIENT TABLE
          ====================================================== */}

      <Table
        columns={[
          "UHID",
          "PATIENT NAME",
          "AGE",
          "GENDER",
          "BLOOD GROUP",
          "CONTACT",
          "REGISTERED",
          "LAST VISIT",
          "VISITS",
          "STATUS",
          "ACTION",
        ]}
      >
        {loading ? (
          <EmptyRow
            colSpan={11}
            message="Loading patients from Caring Nest backend..."
          />
        ) : filtered.length === 0 ? (
          <EmptyRow
            colSpan={11}
            message="No patients registered yet. Click '+ Register Patient' to add one."
          />
        ) : (
          filtered.map((p) => (
            <TR key={p.uhid}>
              <TD>{p.uhid}</TD>

              <TD>{p.fullName}</TD>

              <TD>{p.age}</TD>

              <TD>{p.gender}</TD>

              {/* Blood group is not yet stored in backend */}
              <TD>—</TD>

              <TD>{p.phone}</TD>

              <TD>
                {formatPatientDate(
                  p.createdAt
                )}
              </TD>

              {/* Actual patient update timestamp */}
              <TD>
                {formatPatientDate(
                  p.updatedAt
                )}
              </TD>

              {/* Visit history will come from appointment/consultation data */}
              <TD>—</TD>

              <TD>
                <Pill
                  bg={C.greenLight}
                  color={C.green}
                >
                  Active
                </Pill>
              </TD>

              <TD>
                {canEdit ? (
                  <GhostBtn
                    onClick={() => openEditPatient(p)}
                  >
                    Edit
                  </GhostBtn>
                ) : (
                  "—"
                )}
              </TD>
            </TR>
          ))
        )}
      </Table>

      {/* ======================================================
          REGISTER PATIENT MODAL
          ====================================================== */}

      <Modal
        open={open}
        onClose={() => {
          if (!saving) {
            setOpen(false);
            setEditingPatient(null);
            setErrs({});
          }
        }}
        title={editingPatient ? `Edit Patient — ${editingPatient.uhid}` : "Register New Patient"}
      >
        {errs.general && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#FEF2F2",
              color: C.red,
              border:
                "1px solid #FECACA",
              fontSize: 13,
            }}
          >
            {errs.general}
          </div>
        )}

        <Field
          label="Full Name"
          error={errs.name}
        >
          <input
            style={inputStyle}
            value={form.name}
            disabled={saving}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
          />
        </Field>

        <Field
          label="Age"
          error={errs.age}
        >
          <input
            type="number"
            min="1"
            max="120"
            style={inputStyle}
            value={form.age}
            disabled={saving}
            onChange={(e) =>
              setForm({
                ...form,
                age: e.target.value,
              })
            }
          />
        </Field>

        <Field label="Gender">
          <select
            style={inputStyle}
            value={form.gender}
            disabled={saving}
            onChange={(e) =>
              setForm({
                ...form,
                gender:
                  e.target.value,
              })
            }
          >
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </Field>

        <Field
          label="Contact"
          error={errs.contact}
        >
          <input
            style={inputStyle}
            value={form.contact}
            inputMode="numeric"
            maxLength={10}
            disabled={saving}
            onChange={(e) =>
              setForm({
                ...form,
                contact:
                  e.target.value.replace(
                    /\D/g,
                    ""
                  ),
              })
            }
          />
        </Field>

        <Field label="Address">
          <input
            style={inputStyle}
            value={form.address}
            disabled={saving}
            onChange={(e) =>
              setForm({
                ...form,
                address:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Emergency Contact">
          <input
            style={inputStyle}
            value={
              form.emergencyContact
            }
            inputMode="numeric"
            disabled={saving}
            onChange={(e) =>
              setForm({
                ...form,
                emergencyContact:
                  e.target.value.replace(
                    /\D/g,
                    ""
                  ),
              })
            }
          />
        </Field>

        <PrimaryBtn
          onClick={editingPatient ? savePatientChanges : submit}
          disabled={saving}
        >
          {saving
            ? editingPatient ? "Saving Changes..." : "Registering..."
            : editingPatient ? "Save Changes" : "Register Patient"}
        </PrimaryBtn>
      </Modal>
    </div>
  );
}

// ============================================================
// EMERGENCY
// ============================================================

export function EmergencyPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const { pushToast } = useStore();

  // Emergency assignments must use the live backend doctor list, not the
  // legacy local-store doctor shape (which uses id/name and may be empty).
  type EmergencyDoctorOption = {
    doctorId: string;
    fullName: string;
    isActive?: boolean;
  };
  const [doctorOptions, setDoctorOptions] = useState<EmergencyDoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  const [displayEmergencies, setDisplayEmergencies] =
    useState<Emergency[]>([]);
  const [loadingEmergencies, setLoadingEmergencies] = useState(true);
  const [savingEmergency, setSavingEmergency] = useState(false);

  const loadEmergencyDoctors = useCallback(async () => {
    setLoadingDoctors(true);
    try {
      const result: any = await getDoctors();
      const records = result?.doctors ?? result?.data?.doctors ?? result?.data ?? result;
      const normalized: EmergencyDoctorOption[] = (Array.isArray(records) ? records : [])
        .map((raw: any) => ({
          doctorId: String(raw?.doctorId ?? raw?.id ?? raw?._id ?? raw?.fullName ?? raw?.name ?? ""),
          fullName: String(raw?.fullName ?? raw?.name ?? raw?.doctorName ?? "").trim(),
          isActive: raw?.isActive,
        }))
        .filter((doctor: EmergencyDoctorOption) => doctor.doctorId && doctor.fullName && doctor.isActive !== false);
      setDoctorOptions(normalized);
      if (normalized.length === 0) {
        console.warn("[EmergencyPage] The backend returned no active doctors for the assignment dropdown.", result);
      }
    } catch (error) {
      console.error("[EmergencyPage] Failed to load doctors:", error);
      setDoctorOptions([]);
      pushToast(error instanceof Error ? `Could not load doctors: ${error.message}` : "Could not load doctors for emergency assignment.", "error");
    } finally {
      setLoadingDoctors(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadEmergencyDoctors();
  }, [loadEmergencyDoctors]);

  const mapBackendEmergency = (raw: any): Emergency => {
    const arrival = raw?.arrivalTime ? new Date(raw.arrivalTime) : null;
    const created = raw?.createdAt ? new Date(raw.createdAt) : new Date();
    const validArrival = arrival && !Number.isNaN(arrival.getTime()) ? arrival : created;
    const severityToTriage: Record<string, string> = {
      CRITICAL: "Critical",
      MODERATE: "Moderate",
      MINOR: "Minor",
      UNKNOWN: "Yellow",
    };
    const consciousnessToCondition: Record<string, string> = {
      CONSCIOUS: "Conscious",
      UNCONSCIOUS: "Unconscious",
      UNKNOWN: "Stable",
    };
    return {
      id: String(raw?.emergencyId ?? raw?._id ?? ""),
      uhid: String(raw?.patientUhid ?? ""),
      patient: String(raw?.patientName ?? ""),
      age: Number(raw?.age ?? 0),
      gender: String(raw?.gender ?? "Other"),
      contact: String(raw?.callerPhone ?? ""),
      location: String(raw?.location ?? ""),
      injury: String(raw?.injuries ?? ""),
      condition: String(raw?.condition ?? consciousnessToCondition[String(raw?.consciousness ?? "UNKNOWN")] ?? "Stable"),
      triage: String(raw?.triage ?? severityToTriage[String(raw?.severity ?? "UNKNOWN")] ?? "Yellow"),
      mlc: Boolean(raw?.mlcCase),
      doctor: String(raw?.assignedDoctor ?? ""),
      status: String(raw?.status ?? "NEW"),
      arrived: validArrival.toLocaleDateString(),
      time: validArrival.toLocaleTimeString(),
    } as Emergency;
  };

  const loadEmergencyCases = useCallback(async () => {
    setLoadingEmergencies(true);
    try {
      const result: any = await apiRequest("/emergencies");
      const records = result?.emergencies ?? result?.data?.emergencies;
      if (!Array.isArray(records)) {
        throw new Error("The backend response did not contain an emergency list.");
      }
      setDisplayEmergencies(records.map(mapBackendEmergency));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to load emergency cases from the backend.", "error");
    } finally {
      setLoadingEmergencies(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadEmergencyCases();

    // Keep the emergency list synchronized with records created or updated
    // through the backend/Vapi without opening another Socket.IO connection.
    const unsubscribeCreated = subscribeSocketEvent("emergency:created", (payload) => {
      console.info("[Caring Nest Emergency] emergency:created received", payload);
      void loadEmergencyCases();
    });
    const unsubscribeUpdated = subscribeSocketEvent("emergency:updated", (payload) => {
      console.info("[Caring Nest Emergency] emergency:updated received", payload);
      void loadEmergencyCases();
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, [loadEmergencyCases]);

  const [open, setOpen] =
    useState(false);

  const [editOpen, setEditOpen] =
    useState(false);

  const [editingCase, setEditingCase] =
    useState<Emergency | null>(null);

  const emptyForm = {
    patient: "",
    age: "",
    gender: "Male",
    contact: "",
    location: "",
    injury: "",
    condition: "Stable",
    triage: "Yellow",
    mlc: false,
    doctor: "",
  };

  const [form, setForm] =
    useState({
      ...emptyForm,
    });

  const [editForm, setEditForm] =
    useState({
      ...emptyForm,
    });

  const [editStatus, setEditStatus] = useState("NEW");

  const [errs, setErrs] =
    useState<Record<string, string>>({});

  const [editErrs, setEditErrs] =
    useState<Record<string, string>>({});

  // ----------------------------------------------------------
  // ADD EMERGENCY
  // ----------------------------------------------------------

  const submit = async () => {
    const e: Record<string, string> = {};
    const age = Number(form.age);

    if (!form.patient.trim()) e.patient = "Patient name is required";
    if (!form.age || !Number.isFinite(age) || age <= 0 || age > 120) {
      e.age = "Enter a valid age";
    }
    if (!form.injury.trim()) e.injury = "Nature of injury is required";
    if (!form.location.trim()) e.location = "Accident location is required";

    setErrs(e);
    if (Object.keys(e).length) return;
    if (!canEdit) {
      pushToast("You do not have permission to create emergency cases.", "error");
      return;
    }

    const now = new Date();
    const uhid = form.mlc
      ? `MLC-${now.getTime().toString().slice(-6)}`
      : `UHID-${now.getTime().toString().slice(-6)}`;

    const severityMap: Record<string, string> = {
      Red: "CRITICAL", Critical: "CRITICAL",
      Yellow: "MODERATE", Moderate: "MODERATE",
      Green: "MINOR", Minor: "MINOR",
    };
    const consciousnessMap: Record<string, string> = {
      Conscious: "CONSCIOUS",
      Unconscious: "UNCONSCIOUS",
      Stable: "UNKNOWN",
      Critical: "UNKNOWN",
      Serious: "UNKNOWN",
    };

    setSavingEmergency(true);
    try {
      const result: any = await apiRequest("/emergencies", {
        method: "POST",
        body: JSON.stringify({
          patientUhid: uhid,
          patientName: form.patient.trim(),
          age,
          gender: form.gender,
          accidentType: "Emergency",
          injuries: form.injury.trim(),
          consciousness: consciousnessMap[form.condition] || "UNKNOWN",
          severity: severityMap[form.triage] || "UNKNOWN",
          condition: form.condition,
          triage: form.triage,
          location: form.location.trim(),
          arrivalTime: now.toISOString(),
          callerName: form.patient.trim(),
          callerPhone: form.contact.trim() || "Not provided",
          mlcCase: form.mlc,
          languageUsed: "English",
          assignedDoctor: form.doctor,
        }),
      });

      const saved = result?.emergency ?? result?.data?.emergency;
      if (!saved?.emergencyId) {
        throw new Error("The backend did not confirm the saved emergency record.");
      }

      const newCase = mapBackendEmergency(saved);
      pushToast(
        form.mlc
          ? `MLC case registered: ${newCase.uhid || newCase.id}`
          : "Emergency case saved to MongoDB.",
        form.mlc ? "warn" : "success"
      );

      setOpen(false);
      setForm({ ...emptyForm });
      setErrs({});
      await loadEmergencyCases();

      if (form.mlc) {
        setTimeout(() => printMLCReport(newCase), 400);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to save emergency case.", "error");
    } finally {
      setSavingEmergency(false);
    }
  };

  // ----------------------------------------------------------
  // OPEN EDIT
  // ----------------------------------------------------------

  const openEdit = (
    emergency: Emergency
  ) => {
    setEditingCase(emergency);
    setEditStatus(String((emergency as any).status || "NEW").toUpperCase());

    setEditForm({
      patient:
        emergency.patient || "",
      age:
        emergency.age !== undefined &&
          emergency.age !== null
          ? String(emergency.age)
          : "",
      gender:
        emergency.gender || "Male",
      contact:
        emergency.contact || "",
      location:
        emergency.location || "",
      injury:
        emergency.injury || "",
      condition:
        emergency.condition || "Stable",
      triage:
        emergency.triage || "Yellow",
      mlc:
        Boolean(emergency.mlc),
      doctor:
        emergency.doctor || "",
    });

    setEditErrs({});
    setEditOpen(true);
  };

  // ----------------------------------------------------------
  // SAVE EDIT
  // ----------------------------------------------------------

  const saveEdit = async () => {
    if (!editingCase) return;
    if (!canEdit) {
      pushToast("You do not have permission to update emergency cases.", "error");
      return;
    }

    const e: Record<string, string> = {};
    const age = Number(editForm.age);
    if (!editForm.patient.trim()) e.patient = "Patient name is required";
    if (!editForm.age || !Number.isFinite(age) || age <= 0 || age > 120) {
      e.age = "Enter a valid age";
    }
    if (!editForm.injury.trim()) e.injury = "Nature of injury is required";
    if (!editForm.location.trim()) e.location = "Accident location is required";
    setEditErrs(e);
    if (Object.keys(e).length) return;

    const severityMap: Record<string, string> = {
      Red: "CRITICAL", Critical: "CRITICAL",
      Yellow: "MODERATE", Moderate: "MODERATE",
      Green: "MINOR", Minor: "MINOR",
    };
    const consciousnessMap: Record<string, string> = {
      Conscious: "CONSCIOUS",
      Unconscious: "UNCONSCIOUS",
      Stable: "UNKNOWN",
      Critical: "UNKNOWN",
      Serious: "UNKNOWN",
    };

    setSavingEmergency(true);
    try {
      const result: any = await apiRequest(`/emergencies/${encodeURIComponent(editingCase.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          patientUhid: editingCase.uhid || null,
          patientName: editForm.patient.trim(),
          age,
          gender: editForm.gender,
          accidentType: "Emergency",
          injuries: editForm.injury.trim(),
          consciousness: consciousnessMap[editForm.condition] || "UNKNOWN",
          severity: severityMap[editForm.triage] || "UNKNOWN",
          condition: editForm.condition,
          triage: editForm.triage,
          location: editForm.location.trim(),
          callerName: editForm.patient.trim(),
          callerPhone: editForm.contact.trim() || "Not provided",
          mlcCase: editForm.mlc,
          assignedDoctor: editForm.doctor,
        }),
      });

      const saved = result?.emergency ?? result?.data?.emergency;
      if (!saved?.emergencyId) {
        throw new Error("The backend did not confirm the emergency update.");
      }

      const previousStatus = String((editingCase as any).status || "NEW").toUpperCase();
      if (editStatus !== previousStatus) {
        await apiRequest(`/emergencies/${encodeURIComponent(editingCase.id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: editStatus }),
        });
      }

      pushToast("Emergency case and status updated in MongoDB.", "success");
      setEditOpen(false);
      setEditingCase(null);
      setEditErrs({});
      await loadEmergencyCases();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to update emergency case.", "error");
    } finally {
      setSavingEmergency(false);
    }
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingCase(null);
    setEditErrs({});
  };

  // ----------------------------------------------------------
  // TRIAGE COLOR
  // ----------------------------------------------------------

  const triageColor = (
    t: string
  ) =>
    t === "Red" ||
      t === "Critical"
      ? C.red
      : t === "Yellow" ||
        t === "Moderate"
        ? C.yellow
        : C.green;

  return (
    <div>
      <PageHeading
        title="Emergency Cases"
        action={
          <PrimaryBtn
            onClick={() => {
              setOpen(true);
              setErrs({});
            }}
          >
            + Add Emergency
          </PrimaryBtn>
        }
      />

      {/* ================================================== */}
      {/* EMERGENCY TABLE */}
      {/* ================================================== */}

      <Table
        columns={[
          "UHID",
          "PATIENT",
          "AGE",
          "GENDER",
          "CONTACT",
          "LOCATION",
          "INJURY",
          "CONDITION",
          "TRIAGE",
          "STATUS",
          "MLC",
          "DOCTOR",
          "ARRIVED",
          "TIME",
          "ACTION",
        ]}
      >
        {loadingEmergencies ? (
          <EmptyRow colSpan={15} message="Loading emergency cases from the backend..." />
        ) : displayEmergencies.length === 0 ? (
          <EmptyRow
            colSpan={15}
            message="No emergency cases. Click '+ Add Emergency' to add one."
          />
        ) : (
          displayEmergencies.map(
            (e) => (
              <TR key={e.id}>
                <TD
                  style={{
                    fontFamily:
                      "monospace",
                    fontWeight: 700,
                  }}
                >
                  {e.uhid || "—"}
                </TD>

                <TD>{e.patient}</TD>
                <TD>{e.age}</TD>
                <TD>{e.gender}</TD>
                <TD>
                  {e.contact || "—"}
                </TD>
                <TD>
                  {e.location || "—"}
                </TD>
                <TD>{e.injury}</TD>
                <TD>{e.condition}</TD>

                <TD>
                  <Pill
                    bg={
                      triageColor(
                        e.triage
                      ) + "22"
                    }
                    color={triageColor(
                      e.triage
                    )}
                  >
                    {e.triage}
                  </Pill>
                </TD>

                <TD>
                  <Pill
                    bg={String((e as any).status || "NEW").toUpperCase() === "CLOSED" ? C.greenLight : C.blueLight}
                    color={String((e as any).status || "NEW").toUpperCase() === "CLOSED" ? C.green : C.blue}
                  >
                    {String((e as any).status || "NEW").replace(/_/g, " ")}
                  </Pill>
                </TD>

                <TD>
                  {e.mlc ? (
                    <Pill
                      bg={C.redLight}
                      color={C.red}
                    >
                      MLC
                    </Pill>
                  ) : (
                    "No"
                  )}
                </TD>

                <TD>
                  {e.doctor || "—"}
                </TD>

                <TD>{e.arrived}</TD>
                <TD>{e.time}</TD>

                <TD>
                  {canEdit ? (
                    <GhostBtn
                      onClick={() =>
                        openEdit(e)
                      }
                    >
                      Edit
                    </GhostBtn>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            )
          )
        )}
      </Table>

      {/* ================================================== */}
      {/* ADD EMERGENCY MODAL */}
      {/* ================================================== */}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setErrs({});
        }}
        title="Add Emergency Case"
        width={680}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 14,
          }}
        >
          <Field
            label="Patient Name"
            error={errs.patient}
          >
            <input
              style={inputStyle}
              value={form.patient}
              onChange={(e) =>
                setForm({
                  ...form,
                  patient:
                    e.target.value,
                })
              }
            />
          </Field>

          <Field
            label="Age"
            error={errs.age}
          >
            <input
              type="number"
              min="1"
              max="120"
              style={inputStyle}
              value={form.age}
              onChange={(e) =>
                setForm({
                  ...form,
                  age: e.target.value,
                })
              }
            />
          </Field>

          <Field label="Gender">
            <select
              style={inputStyle}
              value={form.gender}
              onChange={(e) =>
                setForm({
                  ...form,
                  gender:
                    e.target.value,
                })
              }
            >
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </Field>

          <Field label="Contact">
            <input
              style={inputStyle}
              value={form.contact}
              inputMode="numeric"
              maxLength={10}
              onChange={(e) =>
                setForm({
                  ...form,
                  contact:
                    e.target.value.replace(
                      /\D/g,
                      ""
                    ),
                })
              }
            />
          </Field>

          <Field label="Accident Location" error={errs.location}>
            <input
              style={inputStyle}
              value={form.location}
              onChange={(e) =>
                setForm({
                  ...form,
                  location:
                    e.target.value,
                })
              }
            />
          </Field>

          <Field
            label="Nature of Injury"
            error={errs.injury}
          >
            <input
              style={inputStyle}
              value={form.injury}
              onChange={(e) =>
                setForm({
                  ...form,
                  injury:
                    e.target.value,
                })
              }
            />
          </Field>

          <Field label="Condition">
            <select
              style={inputStyle}
              value={form.condition}
              onChange={(e) =>
                setForm({
                  ...form,
                  condition:
                    e.target.value,
                })
              }
            >
              <option>Stable</option>
              <option>Critical</option>
              <option>Serious</option>
              <option>Conscious</option>
              <option>Unconscious</option>
            </select>
          </Field>

          <Field label="Triage Level">
            <select
              style={inputStyle}
              value={form.triage}
              onChange={(e) =>
                setForm({
                  ...form,
                  triage:
                    e.target.value,
                })
              }
            >
              <option>Red</option>
              <option>Yellow</option>
              <option>Green</option>
              <option>Critical</option>
              <option>Moderate</option>
              <option>Minor</option>
            </select>
          </Field>

          <Field label="Assigned Doctor">
            <select
              style={inputStyle}
              value={form.doctor}
              onChange={(e) =>
                setForm({
                  ...form,
                  doctor:
                    e.target.value,
                })
              }
            >
              <option value="">
                --Select--
              </option>

              {loadingDoctors ? (
                <option value="" disabled>Loading doctors…</option>
              ) : doctorOptions.length > 0 ? (
                doctorOptions.map((doctor) => (
                  <option key={doctor.doctorId} value={doctor.fullName}>
                    {doctor.fullName}
                  </option>
                ))
              ) : (
                <option value="" disabled>No active doctors found — check the Doctors page/API</option>
              )}
            </select>
          </Field>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              MLC:
            </span>

            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  mlc: !form.mlc,
                })
              }
              style={{
                background: form.mlc
                  ? C.red
                  : C.border,
                color: C.white,
                border: "none",
                padding:
                  "8px 18px",
                borderRadius: 20,
                fontWeight: 600,
                cursor:
                  "pointer",
              }}
            >
              {form.mlc
                ? "MLC: ON"
                : "MLC: OFF"}
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
          }}
        >
          <PrimaryBtn
            onClick={submit}
            disabled={savingEmergency || !canEdit}
          >
            {savingEmergency ? "Saving Emergency..." : "Save Emergency"}
          </PrimaryBtn>
        </div>
      </Modal>

      {/* ================================================== */}
      {/* EDIT EMERGENCY MODAL */}
      {/* ================================================== */}

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={
          editingCase
            ? `Edit Emergency Case — ${editingCase.id}`
            : "Edit Emergency Case"
        }
        width={680}
      >
        {editingCase && (
          <>
            <div
              style={{
                background:
                  C.bgGray,
                border:
                  `1px solid ${C.border}`,
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <div>
                <strong>
                  Emergency ID:
                </strong>{" "}
                {editingCase.id}
              </div>

              <div
                style={{
                  marginTop: 4,
                }}
              >
                <strong>
                  UHID:
                </strong>{" "}
                {editingCase.uhid ||
                  "—"}
              </div>

              <div
                style={{
                  marginTop: 4,
                }}
              >
                <strong>
                  Arrival:
                </strong>{" "}
                {editingCase.arrived}{" "}
                {editingCase.time}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: 14,
              }}
            >
              <Field
                label="Patient Name"
                error={
                  editErrs.patient
                }
              >
                <input
                  style={inputStyle}
                  value={
                    editForm.patient
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      patient:
                        e.target.value,
                    })
                  }
                />
              </Field>

              <Field
                label="Age"
                error={
                  editErrs.age
                }
              >
                <input
                  type="number"
                  min="1"
                  max="120"
                  style={inputStyle}
                  value={
                    editForm.age
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      age:
                        e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Gender">
                <select
                  style={inputStyle}
                  value={
                    editForm.gender
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      gender:
                        e.target.value,
                    })
                  }
                >
                  <option value="Male">
                    Male
                  </option>

                  <option value="Female">
                    Female
                  </option>

                  <option value="Other">
                    Other
                  </option>
                </select>
              </Field>

              <Field label="Contact">
                <input
                  style={inputStyle}
                  value={
                    editForm.contact
                  }
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      contact:
                        e.target.value.replace(
                          /\D/g,
                          ""
                        ),
                    })
                  }
                />
              </Field>

              <Field label="Accident Location" error={editErrs.location}>
                <input
                  style={inputStyle}
                  value={
                    editForm.location
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      location:
                        e.target.value,
                    })
                  }
                />
              </Field>

              <Field
                label="Nature of Injury"
                error={
                  editErrs.injury
                }
              >
                <input
                  style={inputStyle}
                  value={
                    editForm.injury
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      injury:
                        e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Condition">
                <select
                  style={inputStyle}
                  value={
                    editForm.condition
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      condition:
                        e.target.value,
                    })
                  }
                >
                  <option value="Stable">
                    Stable
                  </option>

                  <option value="Critical">
                    Critical
                  </option>

                  <option value="Serious">
                    Serious
                  </option>

                  <option value="Conscious">
                    Conscious
                  </option>

                  <option value="Unconscious">
                    Unconscious
                  </option>
                </select>
              </Field>

              <Field label="Triage Level">
                <select
                  style={inputStyle}
                  value={
                    editForm.triage
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      triage:
                        e.target.value,
                    })
                  }
                >
                  <option value="Red">
                    Red
                  </option>

                  <option value="Yellow">
                    Yellow
                  </option>

                  <option value="Green">
                    Green
                  </option>

                  <option value="Critical">
                    Critical
                  </option>

                  <option value="Moderate">
                    Moderate
                  </option>

                  <option value="Minor">
                    Minor
                  </option>
                </select>
              </Field>

              <Field label="Assigned Doctor">
                <select
                  style={inputStyle}
                  value={
                    editForm.doctor
                  }
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      doctor:
                        e.target.value,
                    })
                  }
                >
                  <option value="">
                    --Select--
                  </option>

                  {loadingDoctors ? (
                    <option value="" disabled>Loading doctors…</option>
                  ) : doctorOptions.length > 0 ? (
                    doctorOptions.map((doctor) => (
                      <option key={doctor.doctorId} value={doctor.fullName}>
                        {doctor.fullName}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No active doctors found — check the Doctors page/API</option>
                  )}
                </select>
              </Field>

              <Field label="Emergency Status">
                <select
                  style={inputStyle}
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option value="NEW">New</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="ARRIVED">Arrived</option>
                  <option value="ADMITTED">Admitted</option>
                  <option value="CLOSED">Closed</option>
                </select>
                <div style={{ marginTop: 5, color: "#64748b", fontSize: 12 }}>
                  Status must follow this sequence: New → Acknowledged → Arrived → Admitted → Closed.
                </div>
              </Field>

              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  MLC:
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setEditForm({
                      ...editForm,
                      mlc:
                        !editForm.mlc,
                    })
                  }
                  style={{
                    background:
                      editForm.mlc
                        ? C.red
                        : C.border,
                    color: C.white,
                    border:
                      "none",
                    padding:
                      "8px 18px",
                    borderRadius:
                      20,
                    fontWeight:
                      600,
                    cursor:
                      "pointer",
                  }}
                >
                  {editForm.mlc
                    ? "MLC: ON"
                    : "MLC: OFF"}
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: 22,
                display: "flex",
                justifyContent:
                  "flex-end",
                gap: 10,
              }}
            >
              <GhostBtn
                onClick={closeEdit}
              >
                Cancel
              </GhostBtn>

              <PrimaryBtn
                onClick={saveEdit}
                disabled={savingEmergency || !canEdit}
              >
                {savingEmergency ? "Saving Changes..." : "Update Emergency"}
              </PrimaryBtn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ============================================================
// OPD
// ============================================================

export function OPDPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  type BackendPatient = {
    uhid: string;
    fullName: string;
    age: number;
    gender: "Male" | "Female" | "Other";
    phone: string;
  };

  type BackendDoctor = {
    doctorId: string;
    fullName: string;
    specialization: string;
    department: string;
    isActive: boolean;
    workingDays: string[];
    startTime: string;
    endTime: string;
    dailyTokenCapacity: number;
  };

  type BackendAppointment = {
    appointmentId?: string;
    token?: number | string;
    tokenNumber?: number | string;
    patientUhid: string;
    doctorId: string;
    appointmentDate: string;
    appointmentTime: string;
    appointmentType?: string;
    reason?: string;
    status?: string;
    patient?: {
      fullName?: string;
      age?: number;
    };
    doctor?: {
      fullName?: string;
    };
  };

  const { pushToast } = useStore();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [doctors, setDoctors] = useState<BackendDoctor[]>([]);
  const [appointments, setAppointments] = useState<BackendAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingFormData, setLoadingFormData] = useState(false);

  const [form, setForm] = useState({
    patientUhid: "",
    doctorId: "",
    appointmentDate: getTodayISO(),
    appointmentTime: "",
    appointmentType: "New Consultation",
    reason: "",
  });

  const [errs, setErrs] = useState<Record<string, string>>({});

  const loadOPDData = useCallback(async () => {
    setLoading(true);

    try {
      const [appointmentResult, patientResult, doctorResult] =
        await Promise.all([
          getAppointments(),
          getPatients(),
          getDoctors(),
        ]);

      const appointmentData =
        appointmentResult?.appointments ??
        appointmentResult?.data?.appointments ??
        [];

      const patientData =
        patientResult?.patients ??
        patientResult?.data?.patients ??
        [];

      const doctorData =
        doctorResult?.doctors ??
        doctorResult?.data?.doctors ??
        [];

      setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
      setPatients(Array.isArray(patientData) ? patientData : []);
      setDoctors(Array.isArray(doctorData) ? doctorData : []);
    } catch (error) {
      console.error("Failed to load OPD data:", error);
      pushToast(
        error instanceof Error ? error.message : "Failed to load OPD data",
        "error"
      );
      setAppointments([]);
      setPatients([]);
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadOPDData();

    // Refresh the OPD token list when another client creates or updates an appointment.
    const socket = connectSocket();
    const handleAppointmentChange = () => {
      void loadOPDData();
    };

    socket.on("appointment:created", handleAppointmentChange);
    socket.on("appointment:updated", handleAppointmentChange);
    socket.on("consultation:created", handleAppointmentChange);

    return () => {
      socket.off("appointment:created", handleAppointmentChange);
      socket.off("appointment:updated", handleAppointmentChange);
      socket.off("consultation:created", handleAppointmentChange);
    };
  }, [loadOPDData]);

  const resetForm = () => {
    setForm({
      patientUhid: "",
      doctorId: "",
      appointmentDate: getTodayISO(),
      appointmentTime: "",
      appointmentType: "New Consultation",
      reason: "",
    });
    setErrs({});
  };

  const openCreateModal = async () => {
    setErrs({});
    setOpen(true);

    if (patients.length === 0 || doctors.length === 0) {
      setLoadingFormData(true);

      try {
        const [patientResult, doctorResult] = await Promise.all([
          getPatients(),
          getDoctors(),
        ]);

        const patientData =
          patientResult?.patients ??
          patientResult?.data?.patients ??
          [];

        const doctorData =
          doctorResult?.doctors ??
          doctorResult?.data?.doctors ??
          [];

        setPatients(Array.isArray(patientData) ? patientData : []);
        setDoctors(Array.isArray(doctorData) ? doctorData : []);
      } catch (error) {
        console.error("Failed to load appointment form data:", error);
        pushToast(
          error instanceof Error
            ? error.message
            : "Failed to load patients and doctors",
          "error"
        );
      } finally {
        setLoadingFormData(false);
      }
    }
  };

  const submit = async () => {
    const errors: Record<string, string> = {};

    if (!form.patientUhid) {
      errors.patientUhid = "Select a registered patient";
    }

    if (!form.doctorId) {
      errors.doctorId = "Select an active doctor";
    }

    if (!form.appointmentDate) {
      errors.appointmentDate = "Appointment date is required";
    }

    if (!form.appointmentTime) {
      errors.appointmentTime = "Appointment time is required";
    }

    setErrs(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const selectedDoctor = doctors.find(
      (doctor) => doctor.doctorId === form.doctorId
    );

    if (!selectedDoctor || !selectedDoctor.isActive) {
      setErrs({ doctorId: "Selected doctor is not active" });
      return;
    }

    setSubmitting(true);

    try {
      const availability = await getDoctorAvailability(
        form.doctorId,
        form.appointmentDate
      );

      if (!availability?.available) {
        setErrs({
          appointmentDate:
            availability?.message ||
            "Doctor is not available on the selected date",
        });
        return;
      }

      if (
        form.appointmentTime < selectedDoctor.startTime ||
        form.appointmentTime >= selectedDoctor.endTime
      ) {
        setErrs({
          appointmentTime: `Choose a time between ${selectedDoctor.startTime} and ${selectedDoctor.endTime}`,
        });
        return;
      }

      const result = await createAppointment({
        patientUhid: form.patientUhid,
        doctorId: form.doctorId,
        appointmentDate: form.appointmentDate,
        appointmentTime: form.appointmentTime,
        appointmentType: form.appointmentType,
        reason: form.reason.trim(),
      });

      const createdAppointment = result?.appointment;
      const createdToken =
        createdAppointment?.token ?? createdAppointment?.tokenNumber;

      pushToast(
        createdToken !== undefined
          ? `OPD appointment created. Token ${createdToken}`
          : "OPD appointment created successfully",
        "success"
      );

      setOpen(false);
      resetForm();
      await loadOPDData();
    } catch (error) {
      console.error("Creating OPD appointment failed:", error);
      pushToast(
        error instanceof Error
          ? error.message
          : "Failed to create OPD appointment",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getDisplayPatientName = (appointment: BackendAppointment) => {
    const patient = patients.find(
      (item) => item.uhid === appointment.patientUhid
    );
    return appointment.patient?.fullName || patient?.fullName || appointment.patientUhid;
  };

  const getDisplayAge = (appointment: BackendAppointment) => {
    const patient = patients.find(
      (item) => item.uhid === appointment.patientUhid
    );
    return appointment.patient?.age ?? patient?.age ?? "—";
  };

  const getDisplayDoctorName = (appointment: BackendAppointment) => {
    const doctor = doctors.find(
      (item) => item.doctorId === appointment.doctorId
    );
    return appointment.doctor?.fullName || doctor?.fullName || appointment.doctorId;
  };

  const getDisplayToken = (appointment: BackendAppointment) =>
    appointment.token ?? appointment.tokenNumber ?? "—";

  const normalizeStatus = (status?: string) => {
    const normalized = String(status || "BOOKED").toUpperCase();

    if (normalized === "BOOKED" || normalized === "WAITING") {
      return "Waiting";
    }

    if (
      normalized === "IN_CONSULTATION" ||
      normalized === "IN CONSULTATION"
    ) {
      return "In Consultation";
    }

    if (normalized === "COMPLETED" || normalized === "DONE") {
      return "Completed";
    }

    return status || "Waiting";
  };

  const stColor = (status: string) =>
    status === "Waiting"
      ? { bg: C.blueLight, c: C.blue }
      : status === "In Consultation"
        ? { bg: C.yellowLight, c: C.tan }
        : { bg: C.greenLight, c: C.green };

  const selectedPatient = patients.find(
    (patient) => patient.uhid === form.patientUhid
  );

  const activeDoctors = doctors.filter(
    (doctor) => doctor.isActive !== false
  );

  const filtered = appointments.filter((appointment) => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return true;
    }

    const patientName = getDisplayPatientName(appointment).toLowerCase();
    const doctorName = getDisplayDoctorName(appointment).toLowerCase();
    const token = String(getDisplayToken(appointment)).toLowerCase();
    const reason = String(appointment.reason || "").toLowerCase();

    return (
      patientName.includes(query) ||
      appointment.patientUhid.toLowerCase().includes(query) ||
      token.includes(query) ||
      doctorName.includes(query) ||
      reason.includes(query)
    );
  });

  const waitingCount = appointments.filter(
    (appointment) => normalizeStatus(appointment.status) === "Waiting"
  ).length;

  const consultationCount = appointments.filter(
    (appointment) =>
      normalizeStatus(appointment.status) === "In Consultation"
  ).length;

  const completedCount = appointments.filter(
    (appointment) => normalizeStatus(appointment.status) === "Completed"
  ).length;

  return (
    <div>
      <PageHeading
        title="🎫 OPD Token Queue"
        action={
          <PrimaryBtn
            onClick={() => void openCreateModal()}
            disabled={!canEdit}
          >
            + Add Token
          </PrimaryBtn>
        }
      />

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Total Tokens"
          value={appointments.length}
          icon="🎫"
          color={C.navy}
        />
        <StatCard
          label="Waiting"
          value={waitingCount}
          icon="⏳"
          color={C.blue}
        />
        <StatCard
          label="In Consultation"
          value={consultationCount}
          icon="🩺"
          color={C.yellow}
        />
        <StatCard
          label="Completed"
          value={completedCount}
          icon="✅"
          color={C.green}
        />
      </div>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name, UHID, token, doctor, or reason..."
        style={{ ...inputStyle, marginBottom: 14 }}
      />

      <Table
        columns={[
          "TOKEN NO",
          "UHID",
          "PATIENT NAME",
          "AGE",
          "REASON",
          "DOCTOR",
          "STATUS",
          "APPOINTMENT",
          "ACTIONS",
        ]}
      >
        {loading ? (
          <EmptyRow
            colSpan={9}
            message="Loading real OPD appointments..."
          />
        ) : filtered.length === 0 ? (
          <EmptyRow
            colSpan={9}
            message="No OPD appointments found. Click '+ Add Token' to create one."
          />
        ) : (
          filtered.map((appointment) => {
            const status = normalizeStatus(appointment.status);
            const colors = stColor(status);
            const token = getDisplayToken(appointment);

            return (
              <TR
                key={
                  appointment.appointmentId ||
                  `${appointment.patientUhid}-${appointment.appointmentDate}-${appointment.appointmentTime}-${token}`
                }
              >
                <TD>{token}</TD>
                <TD
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                  }}
                >
                  {appointment.patientUhid}
                </TD>
                <TD>{getDisplayPatientName(appointment)}</TD>
                <TD>{getDisplayAge(appointment)}</TD>
                <TD>{appointment.reason || "—"}</TD>
                <TD>{getDisplayDoctorName(appointment)}</TD>
                <TD>
                  <Pill bg={colors.bg} color={colors.c}>
                    {status}
                  </Pill>
                </TD>
                <TD>
                  {appointment.appointmentDate
                    ? `${appointment.appointmentDate} ${appointment.appointmentTime || ""}`
                    : "—"}
                </TD>
                <TD>
                  {canEdit && status === "Waiting" ? (
                    <a
                      href="/admin/consultations"
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: 7,
                        background: C.blue,
                        color: "#FFFFFF",
                        textDecoration: "none",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                      aria-label={`Start consultation for appointment ${appointment.appointmentId}`}
                    >
                      Start Consultation
                    </a>
                  ) : status === "Completed" ? (
                    <a
                      href="/admin/consultations"
                      style={{ color: C.blue, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
                    >
                      View Consultations
                    </a>
                  ) : "—"}
                </TD>
              </TR>
            );
          })
        )}
      </Table>

      <Modal
        open={open}
        onClose={() => {
          if (!submitting) {
            setOpen(false);
            resetForm();
          }
        }}
        title="Create OPD Appointment"
        width={680}
      >
        {loadingFormData ? (
          <div style={{ padding: 20, textAlign: "center" }}>
            Loading registered patients and active doctors...
          </div>
        ) : (
          <>
            <Field label="Patient" error={errs.patientUhid}>
              <select
                style={inputStyle}
                value={form.patientUhid}
                onChange={(event) =>
                  setForm({
                    ...form,
                    patientUhid: event.target.value,
                  })
                }
                disabled={submitting}
              >
                <option value="">
                  -- Select registered patient --
                </option>
                {patients.map((patient) => (
                  <option key={patient.uhid} value={patient.uhid}>
                    {patient.fullName} — {patient.uhid}
                  </option>
                ))}
              </select>
            </Field>

            {selectedPatient ? (
              <div
                style={{
                  marginTop: -4,
                  marginBottom: 14,
                  padding: 10,
                  borderRadius: 8,
                  background: C.blueLight,
                  color: C.navy,
                  fontSize: 13,
                }}
              >
                Age: <strong>{selectedPatient.age}</strong>
                {" · "}
                Gender: <strong>{selectedPatient.gender}</strong>
                {" · "}
                Phone: <strong>{selectedPatient.phone}</strong>
              </div>
            ) : null}

            <Field label="Doctor" error={errs.doctorId}>
              <select
                style={inputStyle}
                value={form.doctorId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    doctorId: event.target.value,
                  })
                }
                disabled={submitting}
              >
                <option value="">-- Select active doctor --</option>
                {activeDoctors.map((doctor) => (
                  <option key={doctor.doctorId} value={doctor.doctorId}>
                    {doctor.fullName} — {doctor.specialization} — {doctor.doctorId}
                  </option>
                ))}
              </select>
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <Field label="Appointment Date" error={errs.appointmentDate}>
                <input
                  type="date"
                  min={getTodayISO()}
                  style={inputStyle}
                  value={form.appointmentDate}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      appointmentDate: event.target.value,
                    })
                  }
                  disabled={submitting}
                />
              </Field>

              <Field label="Appointment Time" error={errs.appointmentTime}>
                <input
                  type="time"
                  style={inputStyle}
                  value={form.appointmentTime}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      appointmentTime: event.target.value,
                    })
                  }
                  disabled={submitting}
                />
              </Field>
            </div>

            <Field label="Appointment Type">
              <select
                style={inputStyle}
                value={form.appointmentType}
                onChange={(event) =>
                  setForm({
                    ...form,
                    appointmentType: event.target.value,
                  })
                }
                disabled={submitting}
              >
                <option>New Consultation</option>
                <option>Follow-up</option>
              </select>
            </Field>

            <Field label="Reason">
              <input
                style={inputStyle}
                value={form.reason}
                onChange={(event) =>
                  setForm({
                    ...form,
                    reason: event.target.value,
                  })
                }
                placeholder="Reason for visit"
                disabled={submitting}
              />
            </Field>

            {activeDoctors.length === 0 ? (
              <div
                style={{
                  marginBottom: 14,
                  padding: 10,
                  borderRadius: 8,
                  background: C.yellowLight,
                  color: C.tan,
                  fontSize: 13,
                }}
              >
                No active doctors are available. Activate a doctor in Doctor Management before creating an appointment.
              </div>
            ) : null}

            {patients.length === 0 ? (
              <div
                style={{
                  marginBottom: 14,
                  padding: 10,
                  borderRadius: 8,
                  background: C.yellowLight,
                  color: C.tan,
                  fontSize: 13,
                }}
              >
                No registered patients were returned by the backend. Register a patient before creating an OPD appointment.
              </div>
            ) : null}

            <PrimaryBtn
              onClick={() => void submit()}
              disabled={
                submitting ||
                loadingFormData ||
                patients.length === 0 ||
                activeDoctors.length === 0
              }
            >
              {submitting
                ? "Creating Appointment..."
                : "Create Appointment & Get Token"}
            </PrimaryBtn>
          </>
        )}
      </Modal>
    </div>
  );
}

// ============================================================
// IPD
// ============================================================

export function IPDPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const {
    ipd,
    addIPD,
    doctors,
    pushToast,
  } = useStore();

  const [open, setOpen] =
    useState(false);

  const [form, setForm] =
    useState({
      patient: "",
      age: "",
      gender: "Male",
      ward: "General",
      bed: "",
      doctor: "",
      diagnosis: "",
    });

  const [errs, setErrs] =
    useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    const age = Number(form.age);

    if (!form.patient.trim()) {
      e.patient = "Required";
    }

    if (
      !form.age ||
      !Number.isFinite(age) ||
      age <= 0 ||
      age > 120
    ) {
      e.age = "Valid age required";
    }

    if (!form.bed.trim()) {
      e.bed = "Required";
    }

    setErrs(e);

    if (Object.keys(e).length) {
      return;
    }

    addIPD({
      ipd: `IPD-${String(
        ipd.length + 1
      ).padStart(4, "0")}`,

      uhid: `UHID-${Date.now()
        .toString()
        .slice(-6)}`,

      patient:
        form.patient.trim(),

      age,

      gender:
        form.gender,

      ward:
        form.ward,

      bed:
        form.bed.trim(),

      doctor:
        form.doctor,

      diagnosis:
        form.diagnosis.trim(),

      admitDate:
        new Date().toLocaleDateString(),

      status: "Admitted",
    });

    pushToast(
      "Patient admitted",
      "success"
    );

    setOpen(false);

    setForm({
      patient: "",
      age: "",
      gender: "Male",
      ward: "General",
      bed: "",
      doctor: "",
      diagnosis: "",
    });

    setErrs({});
  };

  const criticalPatients =
    ipd.filter((i) => {
      const status =
        String(i.status || "")
          .toLowerCase();

      const diagnosis =
        String(i.diagnosis || "")
          .toLowerCase();

      return (
        status === "critical" ||
        status === "serious" ||
        diagnosis.includes(
          "critical"
        )
      );
    }).length;

  return (
    <div>
      <PageHeading
        title="🏥 IPD – Inpatient Department"
        action={
          <PrimaryBtn
            onClick={() => {
              setOpen(true);
              setErrs({});
            }}
          >
            + New Admission
          </PrimaryBtn>
        }
      />

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Currently Admitted"
          value={
            ipd.filter(
              (i) =>
                i.status ===
                "Admitted"
            ).length
          }
          icon="🏥"
          color={C.blue}
        />

        <StatCard
          label="Critical Patients"
          value={criticalPatients}
          icon="🚨"
          color={C.red}
        />

        <StatCard
          label="Discharged Total"
          value={
            ipd.filter(
              (i) =>
                i.status ===
                "Discharged"
            ).length
          }
          icon="🏠"
          color={C.green}
        />

        <StatCard
          label="Total Admissions"
          value={ipd.length}
          icon="📊"
          color={C.textMuted}
        />
      </div>

      <Table
        columns={[
          "IPD NO",
          "UHID",
          "PATIENT",
          "AGE",
          "GENDER",
          "WARD",
          "BED",
          "DOCTOR",
          "DIAGNOSIS",
          "ADMIT DATE",
          "STATUS",
          "ACTIONS",
        ]}
      >
        {ipd.length === 0 ? (
          <EmptyRow
            colSpan={12}
            message="No admissions yet. Click '+ New Admission' to add one."
          />
        ) : (
          ipd.map((i) => (
            <TR key={i.ipd}>
              <TD>{i.ipd}</TD>

              <TD
                style={{
                  fontFamily:
                    "monospace",
                  fontWeight: 700,
                }}
              >
                {i.uhid}
              </TD>

              <TD>{i.patient}</TD>
              <TD>{i.age}</TD>
              <TD>{i.gender}</TD>
              <TD>{i.ward}</TD>
              <TD>{i.bed}</TD>
              <TD>{i.doctor}</TD>
              <TD>{i.diagnosis}</TD>
              <TD>{i.admitDate}</TD>

              <TD>
                <Pill
                  bg={
                    i.status ===
                      "Discharged"
                      ? C.greenLight
                      : C.blueLight
                  }
                  color={
                    i.status ===
                      "Discharged"
                      ? C.green
                      : C.blue
                  }
                >
                  {i.status}
                </Pill>
              </TD>

              <TD>
                {canEdit ? (
                  <GhostBtn>
                    Edit
                  </GhostBtn>
                ) : (
                  "—"
                )}
              </TD>
            </TR>
          ))
        )}
      </Table>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setErrs({});
        }}
        title="New Admission"
        width={680}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 14,
          }}
        >
          <Field
            label="Patient Name"
            error={errs.patient}
          >
            <input
              style={inputStyle}
              value={form.patient}
              onChange={(e) =>
                setForm({
                  ...form,
                  patient:
                    e.target.value,
                })
              }
            />
          </Field>

          <Field
            label="Age"
            error={errs.age}
          >
            <input
              type="number"
              min="1"
              max="120"
              style={inputStyle}
              value={form.age}
              onChange={(e) =>
                setForm({
                  ...form,
                  age:
                    e.target.value,
                })
              }
            />
          </Field>

          <Field label="Gender">
            <select
              style={inputStyle}
              value={form.gender}
              onChange={(e) =>
                setForm({
                  ...form,
                  gender:
                    e.target.value,
                })
              }
            >
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </Field>

          <Field label="Ward">
            <select
              style={inputStyle}
              value={form.ward}
              onChange={(e) =>
                setForm({
                  ...form,
                  ward:
                    e.target.value,
                })
              }
            >
              <option>General</option>
              <option>ICU</option>
              <option>Private</option>
            </select>
          </Field>

          <Field
            label="Bed"
            error={errs.bed}
          >
            <input
              style={inputStyle}
              value={form.bed}
              onChange={(e) =>
                setForm({
                  ...form,
                  bed:
                    e.target.value,
                })
              }
            />
          </Field>

          <Field label="Doctor">
            <select
              style={inputStyle}
              value={form.doctor}
              onChange={(e) =>
                setForm({
                  ...form,
                  doctor:
                    e.target.value,
                })
              }
            >
              <option value="">
                --Select--
              </option>

              {doctors.map((d) => (
                <option
                  key={d.id}
                  value={d.name}
                >
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Diagnosis">
            <input
              style={inputStyle}
              value={form.diagnosis}
              onChange={(e) =>
                setForm({
                  ...form,
                  diagnosis:
                    e.target.value,
                })
              }
            />
          </Field>
        </div>

        <div
          style={{
            marginTop: 16,
          }}
        >
          <PrimaryBtn
            onClick={submit}
          >
            Admit
          </PrimaryBtn>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// BEDS
// ============================================================

export function BedsPage() {
  const {
    beds,
    addBed,
    pushToast,
  } = useStore();

  const [open, setOpen] =
    useState(false);

  const [form, setForm] =
    useState({
      ward: "General",
      number: "",
      status: "Available",
    });

  const totals = {
    total: beds.length,

    avail: beds.filter(
      (b) =>
        b.status ===
        "Available"
    ).length,

    occ: beds.filter(
      (b) =>
        b.status ===
        "Occupied"
    ).length,

    maint: beds.filter(
      (b) =>
        b.status ===
        "Maintenance"
    ).length,
  };

  const submit = () => {
    if (!form.number.trim()) {
      return;
    }

    addBed({
      id: `BED-${Date.now()
        .toString()
        .slice(-5)}`,

      ward:
        form.ward,

      number:
        form.number.trim(),

      status:
        form.status,
    });

    pushToast(
      "Bed added",
      "success"
    );

    setOpen(false);

    setForm({
      ward: "General",
      number: "",
      status: "Available",
    });
  };

  const bedStatusStyle = (
    status: string
  ) => {
    if (status === "Available") {
      return {
        bg: C.greenLight,
        color: C.green,
      };
    }

    if (status === "Occupied") {
      return {
        bg: C.redLight,
        color: C.red,
      };
    }

    return {
      bg: C.yellowLight,
      color: C.tan,
    };
  };

  return (
    <div>
      <PageHeading
        title="Ward & Bed Management"
        subtitle="Real-time bed occupancy tracking and configure beds"
        action={
          <PrimaryBtn
            onClick={() =>
              setOpen(true)
            }
          >
            + Add Bed
          </PrimaryBtn>
        }
      />

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: C.white,
            border:
              `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: C.navy,
            }}
          >
            {totals.total}
          </div>

          <div
            style={{
              color: C.textMuted,
              marginTop: 4,
            }}
          >
            Total Beds
          </div>
        </div>

        <div
          style={{
            background: C.greenLight,
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: C.green,
            }}
          >
            {totals.avail}
          </div>

          <div
            style={{
              color: C.green,
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            Available
          </div>
        </div>

        <div
          style={{
            background: C.redLight,
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: C.red,
            }}
          >
            {totals.occ}
          </div>

          <div
            style={{
              color: C.red,
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            Occupied
          </div>
        </div>

        <div
          style={{
            background: C.yellowLight,
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: C.tan,
            }}
          >
            {totals.maint}
          </div>

          <div
            style={{
              color: C.tan,
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            Maintenance
          </div>
        </div>
      </div>

      {beds.length === 0 ? (
        <Card>
          <div
            style={{
              textAlign: "center",
              color: C.textMuted,
              padding: 40,
              fontStyle: "italic",
            }}
          >
            No beds configured yet.
            Click '+ Add Bed' to add beds
            to wards.
          </div>
        </Card>
      ) : (
        <Table
          columns={[
            "BED ID",
            "WARD",
            "NUMBER",
            "STATUS",
          ]}
        >
          {beds.map((b) => {
            const statusStyle =
              bedStatusStyle(
                b.status
              );

            return (
              <TR key={b.id}>
                <TD>{b.id}</TD>
                <TD>{b.ward}</TD>
                <TD>{b.number}</TD>

                <TD>
                  <Pill
                    bg={
                      statusStyle.bg
                    }
                    color={
                      statusStyle.color
                    }
                  >
                    {b.status}
                  </Pill>
                </TD>
              </TR>
            );
          })}
        </Table>
      )}

      <Modal
        open={open}
        onClose={() =>
          setOpen(false)
        }
        title="Add Bed"
      >
        <Field label="Ward">
          <select
            style={inputStyle}
            value={form.ward}
            onChange={(e) =>
              setForm({
                ...form,
                ward:
                  e.target.value,
              })
            }
          >
            <option>General</option>
            <option>ICU</option>
            <option>Private</option>
          </select>
        </Field>

        <Field label="Bed Number">
          <input
            style={inputStyle}
            value={form.number}
            onChange={(e) =>
              setForm({
                ...form,
                number:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Status">
          <select
            style={inputStyle}
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status:
                  e.target.value,
              })
            }
          >
            <option>
              Available
            </option>

            <option>
              Occupied
            </option>

            <option>
              Maintenance
            </option>
          </select>
        </Field>

        <PrimaryBtn
          onClick={submit}
        >
          Save
        </PrimaryBtn>
      </Modal>
    </div>
  );
}

// ============================================================
// LAB
// ============================================================

export function LabPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const {
    labs,
    addLab,
    doctors,
    pushToast,
  } = useStore();

  const [open, setOpen] =
    useState(false);

  const [form, setForm] =
    useState({
      patient: "",
      doctor: "",
      tests: "",
      priority: "Normal",
    });

  const submit = () => {
    if (
      !form.patient.trim() ||
      !form.tests.trim()
    ) {
      return;
    }

    addLab({
      id: `LAB-${String(
        labs.length + 1
      ).padStart(4, "0")}`,

      uhid: `UHID-${Date.now()
        .toString()
        .slice(-6)}`,

      patient:
        form.patient.trim(),

      doctor:
        form.doctor,

      tests:
        form.tests.trim(),

      priority:
        form.priority,

      status: "Pending",

      ordered:
        new Date().toLocaleDateString(),

      result: "—",
    });

    pushToast(
      "Lab test ordered",
      "success"
    );

    setOpen(false);

    setForm({
      patient: "",
      doctor: "",
      tests: "",
      priority: "Normal",
    });
  };

  return (
    <div>
      <PageHeading
        title="✏️ Lab Management"
        action={
          <PrimaryBtn
            onClick={() =>
              setOpen(true)
            }
          >
            + Order Test
          </PrimaryBtn>
        }
      />

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Total Tests"
          value={labs.length}
          icon="🧪"
          color={C.green}
        />

        <StatCard
          label="Pending Tests"
          value={
            labs.filter(
              (l) =>
                l.status ===
                "Pending"
            ).length
          }
          icon="⏳"
          color={C.orange}
        />

        <StatCard
          label="STAT Priority"
          value={
            labs.filter(
              (l) =>
                l.priority ===
                "STAT"
            ).length
          }
          icon="🚨"
          color={C.red}
        />

        <StatCard
          label="Completed"
          value={
            labs.filter(
              (l) =>
                l.status ===
                "Completed"
            ).length
          }
          icon="✅"
          color={C.green}
        />
      </div>

      <Table
        columns={[
          "LAB ID",
          "UHID",
          "PATIENT",
          "DOCTOR",
          "TESTS",
          "PRIORITY",
          "STATUS",
          "ORDERED",
          "RESULT",
          "ACTIONS",
        ]}
      >
        {labs.length === 0 ? (
          <EmptyRow
            colSpan={10}
            message="No lab tests ordered yet. Click '+ Order Test' to create one."
          />
        ) : (
          labs.map((l) => (
            <TR key={l.id}>
              <TD>{l.id}</TD>

              <TD
                style={{
                  fontFamily:
                    "monospace",
                  fontWeight: 700,
                }}
              >
                {l.uhid}
              </TD>

              <TD>{l.patient}</TD>
              <TD>{l.doctor}</TD>
              <TD>{l.tests}</TD>

              <TD>
                <Pill
                  bg={
                    l.priority ===
                      "STAT"
                      ? C.redLight
                      : C.blueLight
                  }
                  color={
                    l.priority ===
                      "STAT"
                      ? C.red
                      : C.blue
                  }
                >
                  {l.priority}
                </Pill>
              </TD>

              <TD>
                <Pill
                  bg={
                    l.status ===
                      "Completed"
                      ? C.greenLight
                      : C.yellowLight
                  }
                  color={
                    l.status ===
                      "Completed"
                      ? C.green
                      : C.tan
                  }
                >
                  {l.status}
                </Pill>
              </TD>

              <TD>{l.ordered}</TD>
              <TD>{l.result}</TD>

              <TD>
                {canEdit ? (
                  <GhostBtn>
                    Edit
                  </GhostBtn>
                ) : (
                  "—"
                )}
              </TD>
            </TR>
          ))
        )}
      </Table>

      <Modal
        open={open}
        onClose={() =>
          setOpen(false)
        }
        title="Order Lab Test"
      >
        <Field label="Patient">
          <input
            style={inputStyle}
            value={form.patient}
            onChange={(e) =>
              setForm({
                ...form,
                patient:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Doctor">
          <select
            style={inputStyle}
            value={form.doctor}
            onChange={(e) =>
              setForm({
                ...form,
                doctor:
                  e.target.value,
              })
            }
          >
            <option value="">
              --Select--
            </option>

            {doctors.map((d) => (
              <option
                key={d.id}
                value={d.name}
              >
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tests">
          <input
            style={inputStyle}
            value={form.tests}
            onChange={(e) =>
              setForm({
                ...form,
                tests:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Priority">
          <select
            style={inputStyle}
            value={form.priority}
            onChange={(e) =>
              setForm({
                ...form,
                priority:
                  e.target.value,
              })
            }
          >
            <option>
              Normal
            </option>

            <option>
              STAT
            </option>
          </select>
        </Field>

        <PrimaryBtn
          onClick={submit}
        >
          Order
        </PrimaryBtn>
      </Modal>
    </div>
  );
}

// ============================================================
// PHARMACY
// ============================================================

type PharmacyMedicine = {
  _id?: string;
  medicineId: string;
  medicineName: string;
  genericName?: string;
  category?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  reorderLevel: number;
  unitPrice: number;
  supplier?: string;
  isActive: boolean;
};

type PharmacyForm = {
  medicineName: string;
  genericName: string;
  category: string;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  reorderLevel: string;
  unitPrice: string;
  supplier: string;
};

const EMPTY_PHARMACY_FORM: PharmacyForm = {
  medicineName: "",
  genericName: "",
  category: "",
  batchNumber: "",
  expiryDate: "",
  quantity: "",
  reorderLevel: "5",
  unitPrice: "",
  supplier: "",
};

export function PharmacyPage({ canEdit }: { canEdit: boolean }) {
  const { pushToast } = useStore();
  const [medicines, setMedicines] = useState<PharmacyMedicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"inv" | "rx">("inv");
  const [pendingPrescriptions, setPendingPrescriptions] = useState<any[]>([]);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(false);
  const [dispensingKey, setDispensingKey] = useState("");
  const [form, setForm] = useState<PharmacyForm>(EMPTY_PHARMACY_FORM);

  const loadMedicines = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result: any = await getMedicines();
      const records = Array.isArray(result?.medicines)
        ? result.medicines
        : Array.isArray(result?.data?.medicines)
          ? result.data.medicines
          : Array.isArray(result)
            ? result
            : null;

      if (!records) {
        throw new Error("The medicine API response did not contain a medicines array.");
      }

      setMedicines(records as PharmacyMedicine[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load medicine inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPendingPrescriptions = useCallback(async () => {
    try {
      setPrescriptionsLoading(true);
      const result: any = await getPendingPrescriptions();
      const records = Array.isArray(result?.prescriptions)
        ? result.prescriptions
        : Array.isArray(result?.pendingPrescriptions)
          ? result.pendingPrescriptions
          : Array.isArray(result?.data?.prescriptions)
            ? result.data.prescriptions
            : [];
      setPendingPrescriptions(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending prescriptions.");
    } finally {
      setPrescriptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMedicines();
    void loadPendingPrescriptions();
  }, [loadMedicines, loadPendingPrescriptions]);

  const dispenseItem = async (consultationId: string, prescriptionIndex: number) => {
    const key = `${consultationId}:${prescriptionIndex}`;
    try {
      setDispensingKey(key);
      setError("");
      await dispensePrescription(consultationId, prescriptionIndex);
      await Promise.all([loadMedicines(), loadPendingPrescriptions()]);
      pushToast("Prescription dispensed successfully", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dispense prescription.");
    } finally {
      setDispensingKey("");
    }
  };

  const submit = async () => {
    const quantity = Number(form.quantity);
    const reorderLevel = Number(form.reorderLevel);
    const unitPrice = Number(form.unitPrice);

    if (
      !form.medicineName.trim() ||
      !form.batchNumber.trim() ||
      !form.expiryDate ||
      form.quantity.trim() === "" ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      form.reorderLevel.trim() === "" ||
      !Number.isInteger(reorderLevel) ||
      reorderLevel < 0 ||
      form.unitPrice.trim() === "" ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      setError("Enter a medicine name, batch number, expiry date, valid quantity, reorder level and unit price.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      await createMedicine({
        medicineName: form.medicineName.trim(),
        genericName: form.genericName.trim(),
        category: form.category.trim(),
        batchNumber: form.batchNumber.trim(),
        expiryDate: form.expiryDate,
        quantity,
        reorderLevel,
        unitPrice,
        supplier: form.supplier.trim(),
      });

      await loadMedicines();
      setOpen(false);
      setForm(EMPTY_PHARMACY_FORM);
      pushToast("Medicine added to inventory", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add medicine.");
    } finally {
      setSaving(false);
    }
  };

  const activeMedicines = medicines.filter((m) => m.isActive);
  const lowStockCount = activeMedicines.filter(
    (m) => Number(m.quantity) <= Number(m.reorderLevel)
  ).length;
  const inventoryValue = activeMedicines.reduce(
    (sum, m) => sum + Number(m.quantity || 0) * Number(m.unitPrice || 0),
    0
  );

  const formatDate = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.white,
    color: C.textDark,
    font: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: C.textDark,
  };

  return (
    <div>
      <PageHeading
        title="💊 Pharmacy"
        subtitle="Medicine inventory connected to the Caring Nest backend"
        action={
          canEdit ? (
            <PrimaryBtn onClick={() => { setError(""); setOpen(true); }}>
              + Add Medicine
            </PrimaryBtn>
          ) : undefined
        }
      />

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard label="Total Medicines" value={medicines.length} icon="💊" color={C.blue} />
        <StatCard label="Low Stock Alerts" value={lowStockCount} icon="⚠️" color={C.orange} />
        <StatCard label="Inventory Value" value={`₹${inventoryValue.toLocaleString("en-IN")}`} icon="💰" color={C.green} />
        <StatCard label="Active Medicines" value={activeMedicines.length} icon="📋" color={C.blue} />
      </div>

      <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setTab("inv")}
          style={{
            padding: "12px 16px",
            border: "none",
            borderBottom: tab === "inv" ? `3px solid ${C.blue}` : "3px solid transparent",
            background: "transparent",
            color: tab === "inv" ? C.textDark : C.textMuted,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          💊 Medicine Inventory
        </button>
        <button
          type="button"
          onClick={() => setTab("rx")}
          style={{
            padding: "12px 16px",
            border: "none",
            borderBottom: tab === "rx" ? `3px solid ${C.blue}` : "3px solid transparent",
            background: "transparent",
            color: tab === "rx" ? C.textDark : C.textMuted,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          📋 Prescriptions
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${C.red}`,
            background: C.redLight,
            color: C.red,
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => { setError(""); void loadMedicines(); }}
            style={{ marginLeft: 12, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}

      {tab === "inv" ? (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#F8FAFC", textAlign: "left" }}>
                {["NAME / ID", "CATEGORY", "STOCK", "PRICE (₹)", "EXPIRY", "SUPPLIER", "STATUS"].map((heading) => (
                  <th key={heading} style={{ padding: "14px 12px", fontSize: 11, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: C.textMuted }}>Loading medicines from backend…</td></tr>
              ) : medicines.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: C.textMuted }}>No medicines were returned by the backend.</td></tr>
              ) : medicines.map((medicine) => (
                <tr key={medicine.medicineId} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 700, color: C.textDark }}>{medicine.medicineName}</div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>{medicine.medicineId}</div>
                    {medicine.genericName ? <div style={{ fontSize: 12, color: C.textMuted }}>{medicine.genericName}</div> : null}
                  </td>
                  <td style={{ padding: 12 }}>{medicine.category || "—"}</td>
                  <td style={{ padding: 12, fontWeight: 700 }}>{medicine.quantity}</td>
                  <td style={{ padding: 12 }}>₹{Number(medicine.unitPrice || 0).toFixed(2)}</td>
                  <td style={{ padding: 12 }}>{formatDate(medicine.expiryDate)}</td>
                  <td style={{ padding: 12 }}>{medicine.supplier || "—"}</td>
                  <td style={{ padding: 12 }}>
                    <span style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 12,
                      fontSize: 12,
                      background: medicine.isActive ? C.greenLight : C.redLight,
                      color: medicine.isActive ? C.green : C.red,
                    }}>
                      {medicine.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white }}>
          {prescriptionsLoading ? (
            <div style={{ padding: 28, textAlign: "center", color: C.textMuted }}>Loading pending prescriptions…</div>
          ) : pendingPrescriptions.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: C.textMuted }}>No pending prescriptions returned by the backend.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", textAlign: "left" }}>
                  {["CONSULTATION", "PATIENT", "MEDICINE", "DOSAGE", "FREQUENCY", "DURATION", "QUANTITY", "ACTION"].map((heading) => (
                    <th key={heading} style={{ padding: "14px 12px", fontSize: 11, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingPrescriptions.flatMap((record: any, recordIndex: number) => {
                  // The pharmacy API returns one FLAT row per pending prescription,
                  // including prescriptionIndex. Keep compatibility with older
                  // responses that returned a consultation containing a prescription array.
                  const isFlatPrescription =
                    typeof record?.medicineName === "string" &&
                    record?.prescriptionIndex !== undefined;

                  const consultationId =
                    record.consultationId || record.consultation?.consultationId || "";
                  const patientUhid =
                    record.patientUhid || record.consultation?.patientUhid || "—";

                  const items = isFlatPrescription
                    ? [record]
                    : Array.isArray(record.prescription)
                      ? record.prescription
                      : Array.isArray(record.pendingPrescriptions)
                        ? record.pendingPrescriptions
                        : [];

                  return items.map((item: any, itemIndex: number) => {
                    if (item.dispensingStatus === "DISPENSED") return null;

                    const rowConsultationId =
                      item.consultationId || consultationId;
                    const rowPatientUhid =
                      item.patientUhid || patientUhid;
                    const actualPrescriptionIndex = isFlatPrescription
                      ? Number(item.prescriptionIndex)
                      : itemIndex;
                    const key = `${rowConsultationId}:${actualPrescriptionIndex}`;

                    return (
                      <tr
                        key={`${rowConsultationId || recordIndex}-${actualPrescriptionIndex}`}
                        style={{ borderBottom: `1px solid ${C.border}` }}
                      >
                        <td style={{ padding: 12 }}>{rowConsultationId || "—"}</td>
                        <td style={{ padding: 12 }}>{rowPatientUhid}</td>
                        <td style={{ padding: 12 }}>{item.medicineName || item.medicineId || "—"}</td>
                        <td style={{ padding: 12 }}>{item.dosage || "—"}</td>
                        <td style={{ padding: 12 }}>{item.frequency || "—"}</td>
                        <td style={{ padding: 12 }}>{item.duration || "—"}</td>
                        <td style={{ padding: 12 }}>{item.quantity ?? "—"}</td>
                        <td style={{ padding: 12 }}>
                          {canEdit ? (
                            <PrimaryBtn
                              onClick={() => void dispenseItem(rowConsultationId, actualPrescriptionIndex)}
                            >
                              {dispensingKey === key ? "Dispensing…" : "Dispense"}
                            </PrimaryBtn>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => { if (!saving) setOpen(false); }}
        title="Add Medicine"
        width={680}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <label>
            <span style={labelStyle}>Medicine name *</span>
            <input style={fieldStyle} value={form.medicineName} onChange={(e) => setForm({ ...form, medicineName: e.target.value })} />
          </label>
          <label>
            <span style={labelStyle}>Generic name</span>
            <input style={fieldStyle} value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} />
          </label>
          <label>
            <span style={labelStyle}>Category</span>
            <input style={fieldStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </label>
          <label>
            <span style={labelStyle}>Batch number *</span>
            <input style={fieldStyle} value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} />
          </label>
          <label>
            <span style={labelStyle}>Expiry date *</span>
            <input type="date" style={fieldStyle} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          </label>
          <label>
            <span style={labelStyle}>Quantity *</span>
            <input type="number" min="0" step="1" style={fieldStyle} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </label>
          <label>
            <span style={labelStyle}>Reorder level *</span>
            <input type="number" min="0" step="1" style={fieldStyle} value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
          </label>
          <label>
            <span style={labelStyle}>Unit price (₹) *</span>
            <input type="number" min="0" step="0.01" style={fieldStyle} value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span style={labelStyle}>Supplier</span>
            <input style={fieldStyle} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <GhostBtn onClick={() => { if (!saving) setOpen(false); }}>Cancel</GhostBtn>
          <PrimaryBtn onClick={() => { void submit(); }}>
            {saving ? "Saving…" : "Save Medicine"}
          </PrimaryBtn>
        </div>
      </Modal>
    </div>
  );
}


export function DoctorsPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const { pushToast } = useStore();

  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<DoctorForm>(DEFAULT_DOCTOR_FORM);

  const loadDoctors = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await getDoctors();
      const backendDoctors = Array.isArray(result?.doctors)
        ? result.doctors
        : [];

      setDoctors(backendDoctors as DoctorRecord[]);
    } catch (err) {
      console.error("Failed to load doctors:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load doctors"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ------------------------------------------------------------
  // INITIAL LOAD + REAL-TIME SOCKET.IO UPDATES
  // ------------------------------------------------------------
  useEffect(() => {
    void loadDoctors();

    const socket = connectSocket();

    const handleDoctorEvent = () => {
      void loadDoctors();
    };

    socket.on("doctor:created", handleDoctorEvent);
    socket.on("doctor:updated", handleDoctorEvent);
    socket.on("doctor:deactivated", handleDoctorEvent);

    return () => {
      socket.off("doctor:created", handleDoctorEvent);
      socket.off("doctor:updated", handleDoctorEvent);
      socket.off("doctor:deactivated", handleDoctorEvent);
    };
  }, [loadDoctors]);

  // ------------------------------------------------------------
  // OPEN ADD MODAL
  // ------------------------------------------------------------
  const openAddDoctor = () => {
    setEditingDoctorId(null);
    setForm({
      ...DEFAULT_DOCTOR_FORM,
      workingDays: [...DEFAULT_DOCTOR_FORM.workingDays],
    });
    setError("");
    setOpen(true);
  };

  // ------------------------------------------------------------
  // OPEN EDIT MODAL
  // ------------------------------------------------------------
  const openEditDoctor = (doctor: DoctorRecord) => {
    setEditingDoctorId(doctor.doctorId);
    setForm({
      name: doctor.fullName ?? "",
      specialization: doctor.specialization ?? "",
      department: doctor.department ?? "",
      phone: doctor.phone ?? "",
      workingDays: Array.isArray(doctor.workingDays)
        ? [...doctor.workingDays]
        : [],
      startTime: doctor.startTime ?? "09:00",
      endTime: doctor.endTime ?? "17:00",
      dailyTokenCapacity: String(
        doctor.dailyTokenCapacity ?? 30
      ),
    });
    setError("");
    setOpen(true);
  };

  // ------------------------------------------------------------
  // SAVE DOCTOR — CREATE OR UPDATE
  // ------------------------------------------------------------
  const submit = async () => {
    if (!form.name.trim()) {
      setError("Doctor name is required.");
      return;
    }

    if (!form.specialization.trim()) {
      setError("Specialization is required.");
      return;
    }

    if (!form.department.trim()) {
      setError("Department is required.");
      return;
    }

    if (!form.phone.trim()) {
      setError("Phone number is required.");
      return;
    }

    if (!form.startTime || !form.endTime) {
      setError("Working time is required.");
      return;
    }

    if (form.startTime >= form.endTime) {
      setError("End time must be later than start time.");
      return;
    }

    const capacity = Number(form.dailyTokenCapacity);

    if (!Number.isInteger(capacity) || capacity < 1) {
      setError("Daily token capacity must be at least 1.");
      return;
    }

    if (form.workingDays.length === 0) {
      setError("Select at least one working day.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        fullName: form.name.trim(),
        specialization: form.specialization.trim(),
        department: form.department.trim(),
        phone: form.phone.trim(),
        workingDays: form.workingDays,
        startTime: form.startTime,
        endTime: form.endTime,
        dailyTokenCapacity: capacity,
      };

      if (editingDoctorId) {
        await updateDoctor(editingDoctorId, payload);
        pushToast("Doctor updated successfully", "success");
      } else {
        await createDoctor(payload);
        pushToast("Doctor added successfully", "success");
      }

      // Keep the current browser correct even if the socket is temporarily unavailable.
      await loadDoctors();

      setOpen(false);
      setEditingDoctorId(null);
      setForm({
        ...DEFAULT_DOCTOR_FORM,
        workingDays: [...DEFAULT_DOCTOR_FORM.workingDays],
      });
    } catch (err) {
      console.error("Failed to save doctor:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to save doctor"
      );
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------
  // TOGGLE DOCTOR AVAILABILITY
  // ------------------------------------------------------------
  const toggleAvailability = async (doctor: DoctorRecord) => {
    if (!canEdit) {
      return;
    }

    try {
      setError("");

      await updateDoctor(doctor.doctorId, {
        isActive: !doctor.isActive,
      });

      await loadDoctors();

      pushToast(
        doctor.isActive
          ? "Doctor deactivated"
          : "Doctor activated",
        "success"
      );
    } catch (err) {
      console.error("Failed to update doctor:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to update doctor"
      );
    }
  };

  // ------------------------------------------------------------
  // SOFT DELETE / DEACTIVATE DOCTOR
  // ------------------------------------------------------------
  const handleDelete = async (doctor: DoctorRecord) => {
    if (!canEdit) {
      return;
    }

    const confirmed = window.confirm(
      `Deactivate ${doctor.fullName} (${doctor.doctorId})? This keeps the doctor record for historical appointments.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      await deleteDoctor(doctor.doctorId);
      await loadDoctors();

      pushToast("Doctor deactivated successfully", "info");
    } catch (err) {
      console.error("Failed to deactivate doctor:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to deactivate doctor"
      );
    }
  };

  // ------------------------------------------------------------
  // WORKING DAY TOGGLE
  // ------------------------------------------------------------
  const toggleWorkingDay = (day: string) => {
    setForm((previous) => {
      const exists = previous.workingDays.includes(day);

      return {
        ...previous,
        workingDays: exists
          ? previous.workingDays.filter((item) => item !== day)
          : [...previous.workingDays, day],
      };
    });
  };

  return (
    <div>
      <PageHeading
        title="Doctor Management"
        action={
          canEdit ? (
            <PrimaryBtn onClick={openAddDoctor}>
              + Add Doctor
            </PrimaryBtn>
          ) : undefined
        }
      />

      {error && (
        <div
          style={{
            background: C.redLight,
            color: C.red,
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <Table
        columns={[
          "DOCTOR ID",
          "NAME",
          "SPECIALIZATION",
          "DEPARTMENT",
          "WORKING DAYS",
          "TIMING",
          "CAPACITY",
          "AVAILABILITY",
          "ACTIONS",
        ]}
      >
        {loading ? (
          <EmptyRow
            colSpan={9}
            message="Loading doctors from backend..."
          />
        ) : doctors.length === 0 ? (
          <EmptyRow
            colSpan={9}
            message="No doctors found in the backend."
          />
        ) : (
          doctors.map((doctor) => (
            <TR key={doctor.doctorId}>
              <TD>{doctor.doctorId}</TD>

              <TD>{doctor.fullName}</TD>

              <TD>{doctor.specialization}</TD>

              <TD>{doctor.department}</TD>

              <TD>
                {Array.isArray(doctor.workingDays)
                  ? doctor.workingDays.join(", ")
                  : "—"}
              </TD>

              <TD>
                {doctor.startTime && doctor.endTime
                  ? `${doctor.startTime} - ${doctor.endTime}`
                  : "—"}
              </TD>

              <TD>{doctor.dailyTokenCapacity ?? "—"}</TD>

              <TD>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleAvailability(doctor)}
                  aria-label={`${doctor.isActive ? "Deactivate" : "Activate"} ${doctor.fullName}`}
                  style={{
                    background: doctor.isActive
                      ? C.green
                      : C.border,
                    color: C.white,
                    border: "none",
                    width: 44,
                    height: 22,
                    borderRadius: 22,
                    cursor: canEdit ? "pointer" : "not-allowed",
                    position: "relative",
                    opacity: canEdit ? 1 : 0.6,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: doctor.isActive ? 24 : 2,
                      width: 18,
                      height: 18,
                      background: C.white,
                      borderRadius: "50%",
                    }}
                  />
                </button>
              </TD>

              <TD>
                {canEdit ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openEditDoctor(doctor)}
                      style={{
                        background: C.white,
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        padding: "6px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={!doctor.isActive}
                      onClick={() => handleDelete(doctor)}
                      style={{
                        background: C.redLight,
                        color: C.red,
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 6,
                        cursor: doctor.isActive
                          ? "pointer"
                          : "not-allowed",
                        fontWeight: 600,
                        opacity: doctor.isActive ? 1 : 0.5,
                      }}
                    >
                      Deactivate
                    </button>
                  </div>
                ) : (
                  "—"
                )}
              </TD>
            </TR>
          ))
        )}
      </Table>

      {/* -------------------------------------------------------
          ADD / EDIT DOCTOR MODAL
      -------------------------------------------------------- */}
      <Modal
        open={open}
        onClose={() => {
          if (!saving) {
            setOpen(false);
            setEditingDoctorId(null);
            setError("");
          }
        }}
        title={editingDoctorId ? "Edit Doctor" : "Add Doctor"}
      >
        <Field label="Full Name">
          <input
            style={inputStyle}
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
            placeholder="Dr. Anil Kumar"
            disabled={saving}
          />
        </Field>

        <Field label="Specialization">
          <input
            style={inputStyle}
            value={form.specialization}
            onChange={(e) =>
              setForm({
                ...form,
                specialization: e.target.value,
              })
            }
            placeholder="MBBS"
            disabled={saving}
          />
        </Field>

        <Field label="Department">
          <input
            style={inputStyle}
            value={form.department}
            onChange={(e) =>
              setForm({
                ...form,
                department: e.target.value,
              })
            }
            placeholder="General Medicine"
            disabled={saving}
          />
        </Field>

        <Field label="Phone">
          <input
            style={inputStyle}
            value={form.phone}
            inputMode="numeric"
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value.replace(/\D/g, ""),
              })
            }
            placeholder="10-digit phone number"
            disabled={saving}
          />
        </Field>

        <Field label="Working Days">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {DOCTOR_WORKING_DAYS.map((day) => {
              const selected = form.workingDays.includes(day);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={saving}
                  onClick={() => toggleWorkingDay(day)}
                  style={{
                    border: `1px solid ${selected ? C.green : C.border}`,
                    background: selected ? C.greenLight : C.white,
                    color: selected ? C.green : C.text,
                    padding: "7px 10px",
                    borderRadius: 6,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Field label="Start Time">
            <input
              type="time"
              style={inputStyle}
              value={form.startTime}
              onChange={(e) =>
                setForm({
                  ...form,
                  startTime: e.target.value,
                })
              }
              disabled={saving}
            />
          </Field>

          <Field label="End Time">
            <input
              type="time"
              style={inputStyle}
              value={form.endTime}
              onChange={(e) =>
                setForm({
                  ...form,
                  endTime: e.target.value,
                })
              }
              disabled={saving}
            />
          </Field>
        </div>

        <Field label="Daily Token Capacity">
          <input
            type="number"
            min="1"
            style={inputStyle}
            value={form.dailyTokenCapacity}
            onChange={(e) =>
              setForm({
                ...form,
                dailyTokenCapacity: e.target.value,
              })
            }
            disabled={saving}
          />
        </Field>

        <PrimaryBtn onClick={submit}>
          {saving
            ? editingDoctorId
              ? "Updating..."
              : "Saving..."
            : editingDoctorId
              ? "Update Doctor"
              : "Save Doctor"}
        </PrimaryBtn>
      </Modal>
    </div>
  );
}

// ============================================================
// STAFF
// ============================================================

export function StaffPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const {
    staff,
    addStaff,
    pushToast,
  } = useStore();

  const [open, setOpen] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [form, setForm] =
    useState({
      name: "",
      role: "Nurse",
      department: "",
      contact: "",
      shift: "Morning",
    });

  const submit = () => {
    if (!form.name.trim()) {
      return;
    }

    addStaff({
      id: `STF-${Date.now()
        .toString()
        .slice(-5)}`,

      name:
        form.name.trim(),

      role:
        form.role,

      department:
        form.department.trim(),

      contact:
        form.contact.trim(),

      shift:
        form.shift,

      status:
        "On Duty",

      joined:
        new Date().toLocaleDateString(),
    });

    pushToast(
      "Staff added",
      "success"
    );

    setOpen(false);

    setForm({
      name: "",
      role: "Nurse",
      department: "",
      contact: "",
      shift: "Morning",
    });
  };

  const filtered =
    staff.filter((s) => {
      const query =
        search.trim().toLowerCase();

      if (!query) {
        return true;
      }

      return (
        s.name
          .toLowerCase()
          .includes(query) ||
        s.role
          .toLowerCase()
          .includes(query) ||
        s.department
          .toLowerCase()
          .includes(query)
      );
    });

  const onLeave =
    staff.filter(
      (s) =>
        String(s.status)
          .toLowerCase() ===
        "on leave"
    ).length;

  return (
    <div>
      <PageHeading
        title="👥 Staff Management"
        action={
          <PrimaryBtn
            onClick={() =>
              setOpen(true)
            }
          >
            + Add Staff
          </PrimaryBtn>
        }
      />

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Total Staff"
          value={staff.length}
          icon="👥"
          color={C.navy}
        />

        <StatCard
          label="On Duty"
          value={
            staff.filter(
              (s) =>
                s.status ===
                "On Duty"
            ).length
          }
          icon="✅"
          color={C.green}
        />

        <StatCard
          label="On Leave"
          value={onLeave}
          icon="📋"
          color={C.yellow}
        />

        <StatCard
          label="Night Shift"
          value={
            staff.filter(
              (s) =>
                s.shift ===
                "Night"
            ).length
          }
          icon="🌙"
          color={C.blue}
        />
      </div>

      <input
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
        placeholder="Search staff..."
        style={{
          ...inputStyle,
          marginBottom: 14,
        }}
      />

      <Table
        columns={[
          "ID",
          "NAME",
          "ROLE",
          "DEPARTMENT",
          "CONTACT",
          "SHIFT",
          "STATUS",
          "JOINED",
          "ACTION",
        ]}
      >
        {filtered.length === 0 ? (
          <EmptyRow
            colSpan={9}
            message="No staff added yet. Click '+ Add Staff' to add one."
          />
        ) : (
          filtered.map((s) => (
            <TR key={s.id}>
              <TD>{s.id}</TD>
              <TD>{s.name}</TD>
              <TD>{s.role}</TD>

              <TD>
                {s.department}
              </TD>

              <TD>{s.contact}</TD>
              <TD>{s.shift}</TD>

              <TD>
                <Pill
                  bg={
                    s.status ===
                      "On Leave"
                      ? C.yellowLight
                      : C.greenLight
                  }
                  color={
                    s.status ===
                      "On Leave"
                      ? C.tan
                      : C.green
                  }
                >
                  {s.status}
                </Pill>
              </TD>

              <TD>{s.joined}</TD>

              <TD>
                {canEdit ? (
                  <GhostBtn>
                    Edit
                  </GhostBtn>
                ) : (
                  "—"
                )}
              </TD>
            </TR>
          ))
        )}
      </Table>

      <Modal
        open={open}
        onClose={() =>
          setOpen(false)
        }
        title="Add Staff"
      >
        <Field label="Name">
          <input
            style={inputStyle}
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Role">
          <select
            style={inputStyle}
            value={form.role}
            onChange={(e) =>
              setForm({
                ...form,
                role:
                  e.target.value,
              })
            }
          >
            <option>
              Nurse
            </option>

            <option>
              Technician
            </option>

            <option>
              Helper
            </option>
          </select>
        </Field>

        <Field label="Department">
          <input
            style={inputStyle}
            value={
              form.department
            }
            onChange={(e) =>
              setForm({
                ...form,
                department:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Contact">
          <input
            style={inputStyle}
            value={
              form.contact
            }
            inputMode="numeric"
            maxLength={10}
            onChange={(e) =>
              setForm({
                ...form,
                contact:
                  e.target.value.replace(
                    /\D/g,
                    ""
                  ),
              })
            }
          />
        </Field>

        <Field label="Shift">
          <select
            style={inputStyle}
            value={form.shift}
            onChange={(e) =>
              setForm({
                ...form,
                shift:
                  e.target.value,
              })
            }
          >
            <option>
              Morning
            </option>

            <option>
              Evening
            </option>

            <option>
              Night
            </option>
          </select>
        </Field>

        <PrimaryBtn
          onClick={submit}
        >
          Save
        </PrimaryBtn>
      </Modal>
    </div>
  );
}

// ============================================================
// BILLING
// ============================================================

export function BillingPage({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const {
    payments,
    addPayment,
    pushToast,
  } = useStore();

  const [open, setOpen] =
    useState(false);

  const [form, setForm] =
    useState({
      uhid: "",
      patient: "",
      type: "OPD",
      description: "",
      amount: "",
      method: "Cash",
    });

  const submit = () => {
    const amount =
      Number(form.amount);

    if (
      !form.patient.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return;
    }

    const isOnline = [
      "Razorpay",
      "PhonePe",
      "Google Pay",
      "UPI",
    ].includes(
      form.method
    );

    addPayment({
      invoice: `INV-${Date.now()
        .toString()
        .slice(-6)}`,

      uhid:
        form.uhid ||
        `UHID-${Date.now()
          .toString()
          .slice(-6)}`,

      patient:
        form.patient.trim(),

      type:
        form.type,

      description:
        form.description.trim(),

      amount,

      method:
        form.method,

      status:
        "Completed",

      date:
        new Date().toLocaleDateString(),

      txnId: isOnline
        ? `UTR${Date.now()}`
        : "—",
    });

    pushToast(
      "Payment recorded",
      "success"
    );

    setOpen(false);

    setForm({
      uhid: "",
      patient: "",
      type: "OPD",
      description: "",
      amount: "",
      method: "Cash",
    });
  };

  const collected =
    payments
      .filter(
        (p) =>
          p.status ===
          "Completed"
      )
      .reduce(
        (a, b) =>
          a + b.amount,
        0
      );

  const pending =
    payments
      .filter(
        (p) =>
          p.status ===
          "Pending"
      )
      .reduce(
        (a, b) =>
          a + b.amount,
        0
      );

  const failed =
    payments
      .filter(
        (p) =>
          p.status ===
          "Failed"
      )
      .reduce(
        (a, b) =>
          a + b.amount,
        0
      );

  return (
    <div>
      <PageHeading
        title="💰 Billing & Payments"
        action={
          <PrimaryBtn
            onClick={() =>
              setOpen(true)
            }
          >
            + New Payment
          </PrimaryBtn>
        }
      />

      <div
        className="hms-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Total Collected"
          value={`₹${collected}`}
          icon="💰"
          color={C.green}
        />

        <StatCard
          label="Pending Payments"
          value={`₹${pending}`}
          icon="⏳"
          color={C.orange}
        />

        <StatCard
          label="Failed Transactions"
          value={`₹${failed}`}
          icon="❌"
          color={C.red}
        />

        <StatCard
          label="Total Invoices"
          value={payments.length}
          icon="🧾"
          color={C.textMuted}
        />
      </div>

      <div
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems:
            "center",
          gap: 10,
          flexWrap:
            "wrap",
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: C.textDark,
          }}
        >
          Accepted Methods:
        </span>

        {[
          "Razorpay",
          "PhonePe",
          "Google Pay",
          "UPI",
          "Card",
          "Cash",
          "Net Banking",
        ].map((m) => (
          <Pill
            key={m}
            bg={C.blueLight}
            color={C.blue}
          >
            {m}
          </Pill>
        ))}
      </div>

      <Table
        columns={[
          "INVOICE",
          "UHID",
          "PATIENT",
          "TYPE",
          "DESCRIPTION",
          "AMOUNT",
          "METHOD",
          "STATUS",
          "DATE",
          "TRANSACTION ID",
          "ACTION",
        ]}
      >
        {payments.length === 0 ? (
          <EmptyRow
            colSpan={11}
            message="No payments yet. Click '+ New Payment' to create one."
          />
        ) : (
          payments.map((p) => (
            <TR key={p.invoice}>
              <TD>{p.invoice}</TD>

              <TD
                style={{
                  fontFamily:
                    "monospace",
                  fontWeight: 700,
                }}
              >
                {p.uhid}
              </TD>

              <TD>{p.patient}</TD>
              <TD>{p.type}</TD>

              <TD>
                {p.description}
              </TD>

              <TD>
                ₹{p.amount}
              </TD>

              <TD>{p.method}</TD>

              <TD>
                <Pill
                  bg={
                    p.status ===
                      "Completed"
                      ? C.greenLight
                      : p.status ===
                        "Failed"
                        ? C.redLight
                        : C.yellowLight
                  }
                  color={
                    p.status ===
                      "Completed"
                      ? C.green
                      : p.status ===
                        "Failed"
                        ? C.red
                        : C.tan
                  }
                >
                  {p.status}
                </Pill>
              </TD>

              <TD>{p.date}</TD>

              <TD
                style={{
                  fontFamily:
                    "monospace",
                  fontSize: 11,
                }}
              >
                {p.txnId}
              </TD>

              <TD>
                {canEdit ? (
                  <GhostBtn>
                    Edit
                  </GhostBtn>
                ) : (
                  "—"
                )}
              </TD>
            </TR>
          ))
        )}
      </Table>

      <Modal
        open={open}
        onClose={() =>
          setOpen(false)
        }
        title="New Payment"
      >
        <Field label="UHID (leave blank to auto-generate)">
          <input
            style={inputStyle}
            placeholder="UHID-XXXXXX"
            value={form.uhid}
            onChange={(e) =>
              setForm({
                ...form,
                uhid:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Patient">
          <input
            style={inputStyle}
            value={form.patient}
            onChange={(e) =>
              setForm({
                ...form,
                patient:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Type">
          <select
            style={inputStyle}
            value={form.type}
            onChange={(e) =>
              setForm({
                ...form,
                type:
                  e.target.value,
              })
            }
          >
            <option>OPD</option>
            <option>IPD</option>
            <option>Lab</option>
            <option>
              Pharmacy
            </option>
          </select>
        </Field>

        <Field label="Description">
          <input
            style={inputStyle}
            value={
              form.description
            }
            onChange={(e) =>
              setForm({
                ...form,
                description:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Amount (₹)">
          <input
            type="number"
            min="1"
            style={inputStyle}
            value={form.amount}
            onChange={(e) =>
              setForm({
                ...form,
                amount:
                  e.target.value,
              })
            }
          />
        </Field>

        <Field label="Payment Method">
          <select
            style={inputStyle}
            value={form.method}
            onChange={(e) =>
              setForm({
                ...form,
                method:
                  e.target.value,
              })
            }
          >
            {[
              "Cash",
              "Card",
              "UPI",
              "Razorpay",
              "PhonePe",
              "Google Pay",
              "Net Banking",
            ].map((m) => (
              <option key={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <PrimaryBtn
          onClick={submit}
        >
          Record
        </PrimaryBtn>
      </Modal>
    </div>
  );
}

// ============================================================
// MLC
// ============================================================

const POLICE_STATIONS: Record<
  string,
  string
> = {
  "Ballari City PS":
    "ballaricitypsbly@ksp.gov.in",

  "Cowl Bazar PS":
    "cowlbazarpsbly@ksp.gov.in",

  "Gandhi Nagar PS":
    "gandhinagarpsbly@ksp.gov.in",

  "Moka PS":
    "mokapsbly@ksp.gov.in",

  "Bruce Pet PS":
    "brucepetpsbly@ksp.gov.in",
};

export function MLCPage() {
  const {
    emergencies,
    pushToast,
  } = useStore();

  const mlc =
    emergencies.filter(
      (e) => e.mlc
    );

  const triageColor = (
    t: string
  ) =>
    t === "Red" ||
      t === "Critical"
      ? C.red
      : t === "Yellow" ||
        t === "Moderate"
        ? C.yellow
        : C.green;

  const [
    sendCase,
    setSendCase,
  ] =
    useState<Emergency | null>(
      null
    );

  const [
    station,
    setStation,
  ] =
    useState<string>(
      "Ballari City PS"
    );

  const [
    stationEmail,
    setStationEmail,
  ] =
    useState<string>(
      POLICE_STATIONS[
      "Ballari City PS"
      ]
    );

  const [io, setIo] =
    useState({
      name: "",
      rank: "",
      phone: "",
      firNo: "",
    });

  /*
   * This tracks whether the email draft was opened.
   * It does NOT claim that an email was actually sent.
   */
  const [
    draftMap,
    setDraftMap,
  ] = useState<
    Record<
      string,
      {
        station: string;
        at: string;
      }
    >
  >({});

  const openSend = (
    e: Emergency
  ) => {
    setSendCase(e);

    setStation(
      "Ballari City PS"
    );

    setStationEmail(
      POLICE_STATIONS[
      "Ballari City PS"
      ]
    );

    setIo({
      name: "",
      rank: "",
      phone: "",
      firNo: "",
    });
  };

  const sendEmail = () => {
    if (!sendCase) {
      return;
    }

    if (!stationEmail.trim()) {
      pushToast(
        "Police station email is required",
        "error"
      );
      return;
    }

    const body =
      buildMLCEmailBody(
        sendCase
      )
        .replace(
          "[Police Station Name]",
          station
        ) +
      (io.name ||
        io.firNo
        ? `\n\n— LIAISON —
IO Name : ${io.name || "—"}
Rank    : ${io.rank || "—"}
Phone   : ${io.phone || "—"}
FIR No. : ${io.firNo || "—"}`
        : "");

    const subject =
      `MLC Intimation — ${sendCase.uhid} (${sendCase.patient})`;

    const mailto =
      `mailto:${encodeURIComponent(
        stationEmail.trim()
      )}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(
        body
      )}`;

    /*
     * This opens the user's default email client.
     * It does not itself send the email.
     */
    window.location.href =
      mailto;

    setDraftMap((m) => ({
      ...m,
      [sendCase.id]: {
        station,
        at: new Date().toLocaleString(),
      },
    }));

    pushToast(
      `Email draft opened for ${station}`,
      "success"
    );

    setSendCase(null);
  };

  return (
    <div>
      <PageHeading title="⚖️ MLC Alerts" />

      <div
        style={{
          background: C.amberBg,
          border:
            `1px solid ${C.amber}`,
          borderLeft:
            `4px solid ${C.orange}`,
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          display: "flex",
          alignItems:
            "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 22,
          }}
        >
          ⚠️
        </span>

        <span
          style={{
            fontWeight: 700,
            color: C.orange,
          }}
        >
          MLC cases require appropriate
          hospital documentation and
          authorized follow-up with the
          jurisdictional authorities.
        </span>
      </div>

      <Table
        columns={[
          "UHID",
          "PATIENT",
          "AGE",
          "TRIAGE",
          "INJURY",
          "DOCTOR",
          "ARRIVED",
          "TIME",
          "POLICE",
          "ACTIONS",
        ]}
      >
        {mlc.length === 0 ? (
          <EmptyRow
            colSpan={10}
            message="No MLC cases. Cases marked as MLC in Emergency will appear here."
          />
        ) : (
          mlc.map((e) => {
            const sent =
              draftMap[e.id];

            return (
              <TR key={e.id}>
                <TD
                  style={{
                    fontFamily:
                      "monospace",
                    fontWeight: 700,
                  }}
                >
                  {e.uhid || "—"}
                </TD>

                <TD>{e.patient}</TD>
                <TD>{e.age}</TD>

                <TD>
                  <Pill
                    bg={
                      triageColor(
                        e.triage
                      ) + "22"
                    }
                    color={triageColor(
                      e.triage
                    )}
                  >
                    {e.triage}
                  </Pill>
                </TD>

                <TD>{e.injury}</TD>

                <TD>
                  {e.doctor || "—"}
                </TD>

                <TD>{e.arrived}</TD>
                <TD>{e.time}</TD>

                <TD>
                  {sent ? (
                    <Pill
                      bg={
                        C.greenLight
                      }
                      color={
                        C.green
                      }
                    >
                      ✓ Draft opened ·{" "}
                      {
                        sent.station
                      }
                    </Pill>
                  ) : (
                    <Pill
                      bg={
                        C.redLight
                      }
                      color={
                        C.red
                      }
                    >
                      Pending
                    </Pill>
                  )}
                </TD>

                <TD>
                  <div
                    style={{
                      display:
                        "flex",
                      gap: 6,
                    }}
                  >
                    <GhostBtn
                      onClick={() =>
                        printMLCReport(
                          e
                        )
                      }
                    >
                      🖨️ Print
                    </GhostBtn>

                    <button
                      type="button"
                      onClick={() =>
                        openSend(
                          e
                        )
                      }
                      style={{
                        background:
                          C.navy,
                        color:
                          C.white,
                        border:
                          "none",
                        padding:
                          "6px 12px",
                        borderRadius:
                          6,
                        cursor:
                          "pointer",
                        fontWeight:
                          600,
                        fontSize:
                          12,
                      }}
                    >
                      📧 Send to Police
                    </button>
                  </div>
                </TD>
              </TR>
            );
          })
        )}
      </Table>

      <Modal
        open={!!sendCase}
        onClose={() =>
          setSendCase(null)
        }
        title={`Send MLC Report to Police — ${sendCase?.uhid || ""
          }`}
        width={620}
      >
        {sendCase && (
          <>
            <div
              style={{
                background:
                  C.bgGray,
                padding: 12,
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              <strong>
                {sendCase.patient}
              </strong>{" "}
              · {sendCase.age}/
              {sendCase.gender} ·{" "}
              {sendCase.injury}
            </div>

            <Field label="Police Station">
              <select
                style={
                  inputStyle
                }
                value={station}
                onChange={(e) => {
                  const nextStation =
                    e.target.value;

                  setStation(
                    nextStation
                  );

                  setStationEmail(
                    POLICE_STATIONS[
                    nextStation
                    ] || ""
                  );
                }}
              >
                {Object.keys(
                  POLICE_STATIONS
                ).map((s) => (
                  <option
                    key={s}
                    value={s}
                  >
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Station Email">
              <input
                style={
                  inputStyle
                }
                value={
                  stationEmail
                }
                onChange={(e) =>
                  setStationEmail(
                    e.target.value
                  )
                }
                placeholder="ps@ksp.gov.in"
              />
            </Field>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: 12,
              }}
            >
              <Field label="Investigating Officer (optional)">
                <input
                  style={
                    inputStyle
                  }
                  value={
                    io.name
                  }
                  onChange={(e) =>
                    setIo({
                      ...io,
                      name:
                        e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Rank">
                <input
                  style={
                    inputStyle
                  }
                  value={
                    io.rank
                  }
                  onChange={(e) =>
                    setIo({
                      ...io,
                      rank:
                        e.target.value,
                    })
                  }
                  placeholder="SI / PSI / HC"
                />
              </Field>

              <Field label="Officer Phone">
                <input
                  style={
                    inputStyle
                  }
                  value={
                    io.phone
                  }
                  onChange={(e) =>
                    setIo({
                      ...io,
                      phone:
                        e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="FIR / DD No. (if known)">
                <input
                  style={
                    inputStyle
                  }
                  value={
                    io.firNo
                  }
                  onChange={(e) =>
                    setIo({
                      ...io,
                      firNo:
                        e.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color:
                  C.textMuted,
                padding: 10,
                background:
                  C.amberBg,
                borderRadius: 6,
              }}
            >
              ℹ️ This opens your default
              email client with the MLC
              details pre-filled. Attach
              the printed report PDF before
              sending.
            </div>

            <div
              style={{
                marginTop: 14,
                display:
                  "flex",
                gap: 10,
                justifyContent:
                  "flex-end",
              }}
            >
              <GhostBtn
                onClick={() =>
                  printMLCReport(
                    sendCase
                  )
                }
              >
                🖨️ Print First
              </GhostBtn>

              <PrimaryBtn
                onClick={
                  sendEmail
                }
              >
                📧 Open Email Draft
              </PrimaryBtn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ============================================================
// REPORTS
// ============================================================

type ReportTab =
  | "ov"
  | "doc"
  | "rev"
  | "pat";

const REPORT_TABS: Array<
  [ReportTab, string]
> = [
    [
      "ov",
      "📊 Overview",
    ],
    [
      "doc",
      "👨‍⚕️ Doctor Reports",
    ],
    [
      "rev",
      "💰 Revenue",
    ],
    [
      "pat",
      "👥 Patient Analytics",
    ],
  ];

export function ReportsPage() {
  const {
    payments,
    emergencies,
    doctors,
  } = useStore();

  // Reports must use the same MongoDB-backed patient records as Patient Registry.
  // The global store can contain demo/legacy patient data and is not the source
  // of truth for the live Patient Registry page.
  type ReportPatient = {
    _id?: string;
    uhid: string;
    name: string;
    age: number | string;
    gender: string;
    blood: string;
    registered: string;
    status: string;
  };
  const [reportPatients, setReportPatients] = useState<ReportPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsLoadError, setPatientsLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadReportPatients = async () => {
      setPatientsLoading(true);
      setPatientsLoadError("");
      try {
        const response: any = await getPatients();
        const records = Array.isArray(response?.patients)
          ? response.patients
          : Array.isArray(response?.data?.patients)
            ? response.data.patients
            : Array.isArray(response?.data?.data?.patients)
              ? response.data.data.patients
              : Array.isArray(response?.data)
                ? response.data
                : Array.isArray(response?.results)
                  ? response.results
                  : Array.isArray(response)
                    ? response
                    : null;

        if (!records) {
          throw new Error(response?.message || "The patient API returned an unexpected response format.");
        }

        const normalized: ReportPatient[] = records.map((patient: any) => {
          // createdAt is the canonical registration timestamp in the Patient
          // MongoDB schema. Prefer it over legacy display strings such as
          // "16/10/2026", which may have been stored in different formats.
          const rawRegistrationDate =
            patient.createdAt ??
            patient.created_at ??
            patient.registrationDate ??
            patient.registeredAt ??
            patient.dateRegistered ??
            patient.registered ??
            patient.registration_date ??
            "";
          const isoDate = dateToISO(rawRegistrationDate);
          const displayDate = isoDate
            ? `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`
            : String(rawRegistrationDate || "—");

          return {
            _id: patient._id,
            uhid: String(patient.uhid ?? patient.patientUhid ?? patient.patientUHID ?? "—"),
            name: String(patient.name ?? patient.fullName ?? patient.patientName ?? "—"),
            age: patient.age ?? "—",
            gender: String(patient.gender ?? "—"),
            blood: String(patient.blood ?? patient.bloodGroup ?? "—"),
            // Keep ISO date for filtering; the table renders a readable date below.
            registered: isoDate || displayDate,
            status: String(patient.status ?? (patient.isActive === false ? "Inactive" : "Active")),
          };
        });

        if (!cancelled) setReportPatients(normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load patients for reports.";
        console.error("Caring Nest reports patient load error:", error);
        if (!cancelled) {
          setPatientsLoadError(message);
          setReportPatients([]);
        }
      } finally {
        if (!cancelled) setPatientsLoading(false);
      }
    };

    void loadReportPatients();
    return () => { cancelled = true; };
  }, []);

  const [tab, setTab] =
    useState<ReportTab>("ov");

  const today =
    getTodayISO();

  const [from, setFrom] =
    useState(today);

  const [to, setTo] =
    useState(today);

  const [appliedFrom, setAppliedFrom] =
    useState(today);

  const [appliedTo, setAppliedTo] =
    useState(today);

  const [filterError, setFilterError] =
    useState("");

  const filteredPatients =
    reportPatients.filter((p) =>
      isDateInRange(
        p.registered,
        appliedFrom,
        appliedTo
      )
    );

  const filteredPayments =
    payments.filter((p) =>
      isDateInRange(
        p.date,
        appliedFrom,
        appliedTo
      )
    );

  const filteredEmergencies =
    emergencies.filter((e) =>
      isDateInRange(
        e.arrived,
        appliedFrom,
        appliedTo
      )
    );

  const completedRevenue =
    filteredPayments
      .filter(
        (p) =>
          p.status ===
          "Completed"
      )
      .reduce(
        (a, b) =>
          a + b.amount,
        0
      );

  const applyFilter = () => {
    if (!from || !to) {
      setFilterError(
        "Please select both dates."
      );
      return;
    }

    if (from > to) {
      setFilterError(
        "From date cannot be after To date."
      );
      return;
    }

    setFilterError("");

    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const exportPDF = () => {
    const body = `
      <h1>Ballari Hrudayalaya Hospital</h1>

      <p>
        <strong>Hospital Report</strong>
      </p>

      <p>
        Period:
        ${escapeHTML(
      appliedFrom
    )}
        to
        ${escapeHTML(
      appliedTo
    )}
      </p>

      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>Total Patients</td>
            <td>${filteredPatients.length}</td>
          </tr>

          <tr>
            <td>Revenue Collected</td>
            <td>₹${completedRevenue}</td>
          </tr>

          <tr>
            <td>Emergency Cases</td>
            <td>${filteredEmergencies.length}</td>
          </tr>

          <tr>
            <td>Doctors on Staff</td>
            <td>${doctors.length}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        Generated on ${escapeHTML(
      new Date().toLocaleString()
    )}
      </div>
    `;

    printHTMLReport(
      "Hospital Report",
      body
    );
  };

  const exportExcel = () => {
    downloadCSV(
      "hospital-report.csv",
      [
        [
          "Metric",
          "Value",
        ],

        [
          "Total Patients",
          filteredPatients.length,
        ],

        [
          "Revenue Collected",
          completedRevenue,
        ],

        [
          "Emergency Cases",
          filteredEmergencies.length,
        ],

        [
          "Doctors on Staff",
          doctors.length,
        ],
      ]
    );
  };

  return (
    <div>
      <PageHeading
        title="📊 Reports & Analytics"
        subtitle="Comprehensive insights into hospital performance"
      />

      <div
        style={{
          background:
            C.white,
          border:
            `1px solid ${C.border}`,
          borderRadius: 10,
          padding: 14,
          marginBottom: 18,
          display: "flex",
          alignItems:
            "center",
          gap: 12,
          flexWrap:
            "wrap",
        }}
      >
        <span>📅</span>

        <span
          style={{
            fontWeight: 600,
          }}
        >
          Date Range:
        </span>

        <input
          type="date"
          value={from}
          onChange={(e) =>
            setFrom(
              e.target.value
            )
          }
          style={{
            ...inputStyle,
            width: "auto",
          }}
        />

        <span>
          to
        </span>

        <input
          type="date"
          value={to}
          onChange={(e) =>
            setTo(
              e.target.value
            )
          }
          style={{
            ...inputStyle,
            width: "auto",
          }}
        />

        <PrimaryBtn
          onClick={applyFilter}
        >
          Apply Filter
        </PrimaryBtn>

        <GhostBtn
          onClick={exportPDF}
          style={{
            color: C.blue,
          }}
        >
          ⬇ Print / Save PDF
        </GhostBtn>

        <GhostBtn
          onClick={exportExcel}
          style={{
            color: C.green,
          }}
        >
          📊 Export Excel CSV
        </GhostBtn>

        {filterError && (
          <div
            style={{
              width: "100%",
              color: C.red,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {filterError}
          </div>
        )}
      </div>

      <div
        style={{
          display:
            "flex",
          gap: 4,
          borderBottom:
            `1px solid ${C.border}`,
          marginBottom: 18,
          overflowX: "auto",
        }}
      >
        {REPORT_TABS.map(
          ([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() =>
                setTab(key)
              }
              style={{
                background:
                  "none",
                border:
                  "none",
                padding:
                  "10px 16px",
                cursor:
                  "pointer",
                borderBottom:
                  tab === key
                    ? `2px solid ${C.navy}`
                    : "2px solid transparent",
                color:
                  tab === key
                    ? C.navy
                    : C.textMuted,
                fontWeight:
                  600,
                fontSize: 14,
                whiteSpace:
                  "nowrap",
              }}
            >
              {label}
            </button>
          )
        )}
      </div>

      {tab === "ov" && (
        <>
          <div
            className="hms-grid-4"
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(4, 1fr)",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <StatCard
              label="Total Patients"
              value={
                filteredPatients.length
              }
              icon="👥"
              color={C.navy}
            />

            <StatCard
              label="Revenue Collected"
              value={`₹${completedRevenue}`}
              icon="💰"
              color={C.green}
            />

            <StatCard
              label="Emergency Cases"
              value={
                filteredEmergencies.length
              }
              icon="🚨"
              color={C.red}
            />

            <StatCard
              label="Doctors on Staff"
              value={
                doctors.length
              }
              icon="👨‍⚕️"
              color={C.blue}
            />
          </div>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: 18,
            }}
          >
            <ChartPlaceholder
              title="Monthly Patient & Revenue Trend"
            />

            <ChartPlaceholder
              title="Revenue by Department"
            />
          </div>
        </>
      )}

      {tab === "doc" && (
        <Card>
          <div
            style={{
              padding: 10,
              fontWeight: 700,
              color: C.textDark,
            }}
          >
            Doctor Report
          </div>

          <Table
            columns={[
              "DOCTOR",
              "SPECIALIZATION",
              "DEPARTMENT",
              "AVAILABILITY",
            ]}
          >
            {doctors.length === 0 ? (
              <EmptyRow
                colSpan={4}
                message="No doctors available."
              />
            ) : (
              doctors.map(
                (doctor) => (
                  <TR
                    key={
                      doctor.id
                    }
                  >
                    <TD>
                      {
                        doctor.name
                      }
                    </TD>

                    <TD>
                      {
                        doctor.specialization
                      }
                    </TD>

                    <TD>
                      {
                        doctor.department
                      }
                    </TD>

                    <TD>
                      <Pill
                        bg={
                          doctor.available
                            ? C.greenLight
                            : C.redLight
                        }
                        color={
                          doctor.available
                            ? C.green
                            : C.red
                        }
                      >
                        {doctor.available
                          ? "Available"
                          : "Unavailable"}
                      </Pill>
                    </TD>
                  </TR>
                )
              )
            )}
          </Table>
        </Card>
      )}

      {tab === "rev" && (
        <Card>
          <div
            style={{
              padding: 20,
            }}
          >
            <h3
              style={{
                marginTop: 0,
                color: C.textDark,
              }}
            >
              Revenue Report
            </h3>

            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: C.green,
              }}
            >
              ₹{completedRevenue}
            </div>

            <div
              style={{
                marginTop: 8,
                color: C.textMuted,
              }}
            >
              Completed payments from{" "}
              {appliedFrom} to{" "}
              {appliedTo}.
            </div>
          </div>

          <Table
            columns={[
              "INVOICE",
              "PATIENT",
              "TYPE",
              "AMOUNT",
              "METHOD",
              "STATUS",
              "DATE",
            ]}
          >
            {filteredPayments.length ===
              0 ? (
              <EmptyRow
                colSpan={7}
                message="No payments found for the selected date range."
              />
            ) : (
              filteredPayments.map(
                (payment) => (
                  <TR
                    key={
                      payment.invoice
                    }
                  >
                    <TD>
                      {
                        payment.invoice
                      }
                    </TD>

                    <TD>
                      {
                        payment.patient
                      }
                    </TD>

                    <TD>
                      {
                        payment.type
                      }
                    </TD>

                    <TD>
                      ₹
                      {
                        payment.amount
                      }
                    </TD>

                    <TD>
                      {
                        payment.method
                      }
                    </TD>

                    <TD>
                      {
                        payment.status
                      }
                    </TD>

                    <TD>
                      {
                        payment.date
                      }
                    </TD>
                  </TR>
                )
              )
            )}
          </Table>
        </Card>
      )}

      {tab === "pat" && (
        <Card>
          <div
            style={{
              padding: 20,
            }}
          >
            <h3
              style={{
                marginTop: 0,
                color: C.textDark,
              }}
            >
              Patient Analytics
            </h3>

            <div
              style={{
                color: C.textMuted,
              }}
            >
              Patients registered from{" "}
              {appliedFrom} to{" "}
              {appliedTo}.
            </div>

            {patientsLoading ? (
              <div style={{ marginTop: 14, color: C.textMuted }}>Loading patients from the backend…</div>
            ) : patientsLoadError ? (
              <div role="alert" style={{ marginTop: 14, color: "#b91c1c" }}>
                Unable to load patient analytics: {patientsLoadError}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 14,
                  fontSize: 32,
                  fontWeight: 800,
                  color: C.navy,
                }}
              >
                {filteredPatients.length}
              </div>
            )}

            <div
              style={{
                color: C.textMuted,
              }}
            >
              Registered Patients
            </div>
          </div>

          <Table
            columns={[
              "UHID",
              "PATIENT",
              "AGE",
              "GENDER",
              "BLOOD",
              "REGISTERED",
              "STATUS",
            ]}
          >
            {patientsLoading ? (
              <EmptyRow colSpan={7} message="Loading patients from the backend…" />
            ) : patientsLoadError ? (
              <EmptyRow colSpan={7} message="Patient analytics could not be loaded. Check the error above and backend connection." />
            ) : filteredPatients.length === 0 ? (
              <EmptyRow
                colSpan={7}
                message={reportPatients.length === 0
                  ? "No patient records were returned by the backend."
                  : "No patients found for the selected date range."}
              />
            ) : (
              filteredPatients.map(
                (patient) => (
                  <TR
                    key={
                      patient.uhid
                    }
                  >
                    <TD>
                      {
                        patient.uhid
                      }
                    </TD>

                    <TD>
                      {
                        patient.name
                      }
                    </TD>

                    <TD>
                      {
                        patient.age
                      }
                    </TD>

                    <TD>
                      {
                        patient.gender
                      }
                    </TD>

                    <TD>
                      {
                        patient.blood
                      }
                    </TD>

                    <TD>
                      {dateToISO(patient.registered)
                        ? `${dateToISO(patient.registered)!.slice(8, 10)}/${dateToISO(patient.registered)!.slice(5, 7)}/${dateToISO(patient.registered)!.slice(0, 4)}`
                        : patient.registered}
                    </TD>

                    <TD>
                      {
                        patient.status
                      }
                    </TD>
                  </TR>
                )
              )
            )}
          </Table>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// CONSULTATIONS — REAL BACKEND INTEGRATION
// ============================================================

export function ConsultationsPage({ canEdit }: { canEdit: boolean }) {
  type Patient = { uhid: string; fullName: string; age?: number };
  type Doctor = { doctorId: string; fullName: string; isActive?: boolean };
  type Appointment = {
    appointmentId: string;
    patientUhid: string;
    doctorId: string;
    appointmentDate: string;
    appointmentTime: string;
    tokenNumber?: number | string;
    status?: string;
    visitType?: string;
    reason?: string;
  };
  type Medicine = {
    medicineId: string;
    medicineName: string;
    genericName?: string;
    batchNumber?: string;
    expiryDate?: string;
    quantity?: number;
    isActive?: boolean;
  };
  type Consultation = {
    consultationId: string;
    appointmentId: string;
    patientUhid: string;
    doctorId: string;
    consultationDate: string;
    symptoms: string;
    diagnosis: string;
    clinicalNotes?: string;
    prescription?: Array<{
      medicineId?: string;
      medicineName: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantity: number;
      instructions?: string;
      dispensingStatus?: string;
    }>;
    status?: string;
    followUpRequired?: boolean;
    followUpDate?: string | null;
  };
  const { pushToast } = useStore();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [viewingConsultation, setViewingConsultation] = useState<Consultation | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [medicineLoadError, setMedicineLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appointmentId, setAppointmentId] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [instructions, setInstructions] = useState("");
  const [prescription, setPrescription] = useState<Array<{
    medicineId?: string; medicineName: string; dosage: string; frequency: string;
    duration: string; quantity: number; instructions?: string;
  }>>([]);

  const unwrap = (result: any, key: string): any[] => {
    const values = result?.[key] ?? result?.data?.[key] ?? result?.data ?? result;
    return Array.isArray(values) ? values : [];
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, d, c] = await Promise.all([
        getAppointments(), getPatients(), getDoctors(), getConsultations()
      ]);
      setAppointments(unwrap(a, "appointments"));
      setPatients(unwrap(p, "patients"));
      setDoctors(unwrap(d, "doctors"));
      setConsultations(unwrap(c, "consultations"));

      // The medicine endpoint is restricted to ADMIN and PHARMACIST.
      // Read-only users do not need to load the prescription selector.
      if (canEdit) {
        try {
          const medicineResult = await getMedicines();
          const inventory = unwrap(medicineResult, "medicines") as Medicine[];
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const selectable = inventory.filter((medicine) => {
            if (medicine.isActive !== true || Number(medicine.quantity ?? 0) < 1) return false;
            if (!medicine.expiryDate) return false;
            const expiry = new Date(medicine.expiryDate);
            if (Number.isNaN(expiry.getTime())) return false;
            expiry.setHours(0, 0, 0, 0);
            return expiry >= today;
          });
          setMedicines(selectable);
          setMedicineLoadError("");
        } catch (medicineError) {
          setMedicines([]);
          setMedicineLoadError(medicineError instanceof Error ? medicineError.message : "Could not load medicine inventory.");
        }
      } else {
        setMedicines([]);
        setMedicineLoadError("");
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to load consultation data", "error");
    } finally {
      setLoading(false);
    }
  }, [pushToast, canEdit]);

  useEffect(() => {
    void loadData();

    // Refresh consultation and appointment data after real-time backend events.
    const socket = connectSocket();
    const handleConsultationChange = () => {
      void loadData();
    };

    socket.on("appointment:created", handleConsultationChange);
    socket.on("appointment:updated", handleConsultationChange);
    socket.on("consultation:created", handleConsultationChange);

    return () => {
      socket.off("appointment:created", handleConsultationChange);
      socket.off("appointment:updated", handleConsultationChange);
      socket.off("consultation:created", handleConsultationChange);
    };
  }, [loadData]);

  const selectedAppointment = appointments.find(a => a.appointmentId === appointmentId);
  const selectedMedicine = medicines.find(m => m.medicineId === selectedMedicineId);
  const selectedPatient = selectedAppointment
    ? patients.find(p => p.uhid === selectedAppointment.patientUhid) : undefined;
  const selectedDoctor = selectedAppointment
    ? doctors.find(d => d.doctorId === selectedAppointment.doctorId) : undefined;
  const usedAppointmentIds = new Set(consultations.map(c => c.appointmentId));
  const eligibleAppointments = appointments.filter(a =>
    !usedAppointmentIds.has(a.appointmentId) &&
    !["CANCELLED", "CANCELED"].includes(String(a.status || "").toUpperCase())
  );

  const addPrescription = () => {
    if (!selectedMedicine || !selectedMedicineId || !dosage.trim() || !frequency.trim() ||
      !duration.trim() || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      pushToast("Select an inventory medicine and enter dosage, frequency, duration and a positive whole-number quantity.", "error");
      return;
    }
    if (Number(quantity) > Number(selectedMedicine.quantity ?? 0)) {
      pushToast(`Only ${selectedMedicine.quantity ?? 0} unit(s) are currently in stock for ${selectedMedicine.medicineName}.`, "error");
      return;
    }
    setPrescription(prev => [...prev, {
      medicineId: selectedMedicine.medicineId,
      medicineName: selectedMedicine.medicineName,
      dosage: dosage.trim(), frequency: frequency.trim(),
      duration: duration.trim(), quantity: Number(quantity), instructions: instructions.trim()
    }]);
    setSelectedMedicineId(""); setDosage(""); setFrequency("");
    setDuration(""); setQuantity("1"); setInstructions("");
  };

  const saveConsultation = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!canEdit) {
      pushToast("You do not have permission to create consultations.", "error");
      return;
    }
    if (!selectedAppointment || !selectedPatient || !selectedDoctor) {
      pushToast("Select a valid appointment with a patient and doctor.", "error");
      return;
    }
    if (!symptoms.trim() || !diagnosis.trim()) {
      pushToast("Symptoms and diagnosis are required.", "error");
      return;
    }
    if (followUpRequired && !followUpDate) {
      pushToast("Select a follow-up date.", "error");
      return;
    }

    // Build the payload from the saved list plus any medicine currently
    // filled into the form. This prevents a medicine being silently omitted
    // when Save Consultation is clicked before “Add medicine to prescription”.
    const hasUnaddedPrescriptionInput = Boolean(
      selectedMedicineId.trim() || dosage.trim() || frequency.trim() ||
      duration.trim() || instructions.trim() || quantity !== "1"
    );
    const prescriptionToSave = [...prescription];

    if (hasUnaddedPrescriptionInput) {
      if (!selectedMedicine || !selectedMedicineId.trim()) {
        pushToast("Choose a medicine from inventory before saving the prescription.", "error");
        return;
      }
      if (!dosage.trim() || !frequency.trim() || !duration.trim()) {
        pushToast("Complete dosage, frequency and duration, then add the medicine or save again.", "error");
        return;
      }
      const parsedQuantity = Number(quantity);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
        pushToast("Prescription quantity must be a positive whole number.", "error");
        return;
      }
      if (parsedQuantity > Number(selectedMedicine.quantity ?? 0)) {
        pushToast(`Only ${selectedMedicine.quantity ?? 0} unit(s) are currently in stock for ${selectedMedicine.medicineName}.`, "error");
        return;
      }

      prescriptionToSave.push({
        medicineId: selectedMedicine.medicineId,
        medicineName: selectedMedicine.medicineName,
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        duration: duration.trim(),
        quantity: parsedQuantity,
        instructions: instructions.trim(),
      });
    }

    setSaving(true);
    try {
      const result: any = await createConsultation({
        appointmentId: selectedAppointment.appointmentId,
        patientUhid: selectedAppointment.patientUhid,
        doctorId: selectedAppointment.doctorId,
        consultationDate: getTodayISO(),
        symptoms: symptoms.trim(),
        diagnosis: diagnosis.trim(),
        clinicalNotes: clinicalNotes.trim(),
        prescription: prescriptionToSave,
        followUpRequired,
        followUpDate: followUpRequired ? followUpDate : null,
      });

      // The API should return the created MongoDB document. Verify the server
      // actually returned all prescription items before clearing the form.
      const savedConsultation = result?.consultation ?? result?.data?.consultation;
      const savedPrescription = savedConsultation?.prescription;
      if (
        prescriptionToSave.length > 0 &&
        (!Array.isArray(savedPrescription) || savedPrescription.length !== prescriptionToSave.length)
      ) {
        throw new Error(
          `The backend did not confirm saving all prescription items (sent ${prescriptionToSave.length}, received ${Array.isArray(savedPrescription) ? savedPrescription.length : 0}). The form has been kept so you can retry safely.`
        );
      }

      pushToast(
        prescriptionToSave.length > 0
          ? `Consultation saved with ${prescriptionToSave.length} prescription item(s).`
          : "Consultation saved to the backend.",
        "success"
      );
      setAppointmentId("");
      setSymptoms("");
      setDiagnosis("");
      setClinicalNotes("");
      setFollowUpRequired(false);
      setFollowUpDate("");
      setPrescription([]);
      setSelectedMedicineId("");
      setDosage("");
      setFrequency("");
      setDuration("");
      setQuantity("1");
      setInstructions("");
      await loadData();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to save consultation", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeading title="🩺 Consultations & Prescriptions" />
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: C.navy }}>Create Consultation</h3>
          <GhostBtn onClick={() => void loadData()}>Refresh Data</GhostBtn>
        </div>
        {!canEdit && <div style={{ padding: 12, marginBottom: 12, background: C.yellowLight, borderRadius: 8 }}>Read-only access: you cannot create consultations.</div>}
        {loading ? <p>Loading appointments and consultations from the backend…</p> : (
          <form onSubmit={saveConsultation}>
            <Field label="Appointment (ID · UHID · date · time · token)">
              <select style={inputStyle} value={appointmentId} disabled={!canEdit || saving}
                onChange={e => setAppointmentId(e.target.value)} required>
                <option value="">Select an appointment</option>
                {eligibleAppointments.map(a => <option key={a.appointmentId} value={a.appointmentId}>
                  {a.appointmentId} · {a.patientUhid} · {a.appointmentDate} {a.appointmentTime} · Token {a.tokenNumber ?? "—"}
                </option>)}
              </select>
            </Field>
            {selectedAppointment && <div style={{ padding: 12, marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}>
              <strong>Patient:</strong> {selectedPatient?.fullName ?? selectedAppointment.patientUhid} ({selectedAppointment.patientUhid}) &nbsp;|&nbsp;
              <strong>Doctor:</strong> {selectedDoctor?.fullName ?? selectedAppointment.doctorId} &nbsp;|&nbsp;
              <strong>Appointment:</strong> {selectedAppointment.appointmentDate} at {selectedAppointment.appointmentTime}
            </div>}
            <Field label="Symptoms">
              <textarea style={{ ...inputStyle, minHeight: 70 }} value={symptoms} disabled={!canEdit || saving} onChange={e => setSymptoms(e.target.value)} required />
            </Field>
            <Field label="Diagnosis">
              <textarea style={{ ...inputStyle, minHeight: 70 }} value={diagnosis} disabled={!canEdit || saving} onChange={e => setDiagnosis(e.target.value)} required />
            </Field>
            <Field label="Clinical Notes (optional)">
              <textarea style={{ ...inputStyle, minHeight: 70 }} value={clinicalNotes} disabled={!canEdit || saving} onChange={e => setClinicalNotes(e.target.value)} />
            </Field>
            <h4 style={{ color: C.navy, marginBottom: 8 }}>Prescription (optional)</h4>
            {medicineLoadError && <div role="alert" style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b" }}>
              Could not load medicine inventory: {medicineLoadError}. Refresh the page or sign in with an authorized account.
            </div>}
            <div className="hms-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
              <Field label="Select medicine from inventory">
                <select style={inputStyle} value={selectedMedicineId} disabled={!canEdit || saving || !!medicineLoadError} onChange={e => setSelectedMedicineId(e.target.value)}>
                  <option value="">Select an active, in-stock, unexpired medicine</option>
                  {medicines.map(m => <option key={m.medicineId} value={m.medicineId}>
                    {m.medicineName} · {m.medicineId} · Stock {m.quantity}
                  </option>)}
                </select>
              </Field>
              <Field label="Medicine ID (automatically selected)"><input style={inputStyle} value={selectedMedicine?.medicineId ?? ""} readOnly placeholder="Choose a medicine above" /></Field>
              <Field label="Dosage"><input style={inputStyle} value={dosage} disabled={!canEdit || saving} onChange={e => setDosage(e.target.value)} placeholder="e.g. 500 mg" /></Field>
              <Field label="Frequency"><input style={inputStyle} value={frequency} disabled={!canEdit || saving} onChange={e => setFrequency(e.target.value)} placeholder="e.g. Twice daily" /></Field>
              <Field label="Duration"><input style={inputStyle} value={duration} disabled={!canEdit || saving} onChange={e => setDuration(e.target.value)} placeholder="e.g. 5 days" /></Field>
              <Field label="Quantity"><input type="number" min="1" style={inputStyle} value={quantity} disabled={!canEdit || saving} onChange={e => setQuantity(e.target.value)} /></Field>
              <div style={{ gridColumn: "1 / -1" }}><Field label="Instructions (optional)"><input style={inputStyle} value={instructions} disabled={!canEdit || saving} onChange={e => setInstructions(e.target.value)} /></Field></div>
            </div>
            <button type="button" disabled={!canEdit || saving || !selectedMedicineId || !!medicineLoadError} onClick={addPrescription} style={{ padding: "9px 14px", border: `1px solid ${C.border}`, borderRadius: 8, background: "white", cursor: "pointer", marginBottom: 12 }}>+ Add medicine to prescription</button>
            {!loading && canEdit && !medicineLoadError && medicines.length === 0 && <p style={{ color: C.textMuted, fontSize: 13 }}>No active, unexpired medicines with stock are available. Add or restock a medicine in Pharmacy first.</p>}
            {prescription.length > 0 && <div style={{ marginBottom: 16 }}>
              {prescription.map((rx, i) => <div key={`${rx.medicineName}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 10, borderBottom: `1px solid ${C.border}` }}>
                <span><strong>{rx.medicineName}</strong> — {rx.dosage}, {rx.frequency}, {rx.duration}; Qty {rx.quantity}</span>
                <GhostBtn onClick={() => setPrescription(prev => prev.filter((_, index) => index !== i))}>Remove</GhostBtn>
              </div>)}
            </div>}
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
              <input type="checkbox" checked={followUpRequired} disabled={!canEdit || saving} onChange={e => setFollowUpRequired(e.target.checked)} />
              Follow-up required
            </label>
            {followUpRequired && <Field label="Follow-up date"><input type="date" style={inputStyle} min={getTodayISO()} value={followUpDate} disabled={!canEdit || saving} onChange={e => setFollowUpDate(e.target.value)} required /></Field>}
            <button
              type="submit"
              disabled={!canEdit || saving || !eligibleAppointments.length}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "11px 18px",
                border: "none",
                borderRadius: 8,
                background: (!canEdit || saving || !eligibleAppointments.length) ? "#94a3b8" : C.navy,
                color: C.white,
                fontWeight: 700,
                cursor: (!canEdit || saving || !eligibleAppointments.length) ? "not-allowed" : "pointer",
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Consultation"}
            </button>
            {!eligibleAppointments.length && <p style={{ color: C.textMuted, fontSize: 13 }}>No eligible appointments without a consultation were found.</p>}
          </form>
        )}
      </Card>
      <Card>
        <h3 style={{ marginTop: 0, color: C.navy }}>Saved Consultations ({consultations.length})</h3>
        {loading ? <p>Loading…</p> : consultations.length === 0 ? <p>No consultations saved yet.</p> : (
          <Table columns={["CONSULTATION ID", "APPOINTMENT", "PATIENT UHID", "DATE", "DIAGNOSIS", "PRESCRIPTIONS", "STATUS", "ACTIONS"]}>
            {consultations.map(c => <TR key={c.consultationId}>
              <TD>{c.consultationId}</TD><TD>{c.appointmentId}</TD><TD>{c.patientUhid}</TD>
              <TD>{c.consultationDate}</TD><TD>{c.diagnosis}</TD><TD>{c.prescription?.length ?? 0}</TD><TD>{c.status ?? "—"}</TD>
              <TD><GhostBtn onClick={() => setViewingConsultation(c)}>View Details</GhostBtn></TD>
            </TR>)}
          </Table>
        )}
      </Card>
      {viewingConsultation && (
        <Modal
          open={true}
          onClose={() => setViewingConsultation(null)}
          title={`Consultation ${viewingConsultation.consultationId}`}
          width={760}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
            <div><strong>Appointment:</strong> {viewingConsultation.appointmentId}</div>
            <div><strong>Patient UHID:</strong> {viewingConsultation.patientUhid}</div>
            <div><strong>Doctor ID:</strong> {viewingConsultation.doctorId}</div>
            <div><strong>Date:</strong> {viewingConsultation.consultationDate}</div>
            <div><strong>Status:</strong> {viewingConsultation.status || "—"}</div>
            <div><strong>Follow-up:</strong> {viewingConsultation.followUpRequired ? (viewingConsultation.followUpDate || "Required") : "No"}</div>
          </div>
          <div style={{ marginBottom: 12 }}><strong>Symptoms</strong><p style={{ whiteSpace: "pre-wrap" }}>{viewingConsultation.symptoms || "—"}</p></div>
          <div style={{ marginBottom: 12 }}><strong>Diagnosis</strong><p style={{ whiteSpace: "pre-wrap" }}>{viewingConsultation.diagnosis || "—"}</p></div>
          <div style={{ marginBottom: 12 }}><strong>Clinical notes</strong><p style={{ whiteSpace: "pre-wrap" }}>{viewingConsultation.clinicalNotes || "No clinical notes recorded."}</p></div>
          <div style={{ marginBottom: 12 }}>
            <strong>Prescription</strong>
            {!viewingConsultation.prescription?.length ? <p>No medicines were prescribed for this consultation.</p> : (
              <Table columns={["MEDICINE", "DOSAGE", "FREQUENCY", "DURATION", "QUANTITY", "INSTRUCTIONS", "DISPENSING"]}>
                {viewingConsultation.prescription.map((rx, index) => <TR key={`${rx.medicineId || rx.medicineName}-${index}`}>
                  <TD>{rx.medicineName}</TD><TD>{rx.dosage}</TD><TD>{rx.frequency}</TD><TD>{rx.duration}</TD>
                  <TD>{rx.quantity}</TD><TD>{rx.instructions || "—"}</TD><TD>{rx.dispensingStatus || "PENDING"}</TD>
                </TR>)}
              </Table>
            )}
          </div>
          <GhostBtn onClick={() => setViewingConsultation(null)}>Close</GhostBtn>
        </Modal>
      )}
    </div>
  );
}
