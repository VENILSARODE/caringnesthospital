import { ReactNode, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider, useStore, Role } from "./store";
import LoginPage from "./Login";
import { ShellLayout } from "./Shell";
import {
  DashboardPage, PatientsPage, EmergencyPage, OPDPage, IPDPage, BedsPage,
  LabPage, PharmacyPage, DoctorsPage, StaffPage, BillingPage, MLCPage, ReportsPage,
} from "./pages";
import { PharmacyLayout, PharmacyQueue, PharmacyStock, PharmacyCatalogue, PharmacyLog } from "./pharmacy";

function Protected({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const { user } = useStore();
  const allowed = Array.isArray(role) ? role : [role];
  if (!user) return <Navigate to={allowed.includes("pharmacist") && allowed.length === 1 ? "/pharmacy/login" : "/login"} replace />;
  if (!allowed.includes(user.role)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoutes() {
  return (
    <ShellLayout role="admin">
      <Routes>
        <Route path="dashboard" element={<DashboardPage role="admin" />} />
        <Route path="patients" element={<PatientsPage canEdit />} />
        <Route path="emergency" element={<EmergencyPage canEdit />} />
        <Route path="opd" element={<OPDPage canEdit />} />
        <Route path="ipd" element={<IPDPage canEdit />} />
        <Route path="beds" element={<BedsPage />} />
        <Route path="lab" element={<LabPage canEdit />} />
        <Route path="pharmacy" element={<PharmacyPage canEdit />} />
        <Route path="doctors" element={<DoctorsPage canEdit />} />
        <Route path="staff" element={<StaffPage canEdit />} />
        <Route path="billing" element={<BillingPage canEdit />} />
        <Route path="mlc" element={<MLCPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </ShellLayout>
  );
}

function ReceptionistRoutes() {
  return (
    <ShellLayout role="receptionist">
      <Routes>
        <Route path="dashboard" element={<DashboardPage role="receptionist" />} />
        <Route path="patients" element={<PatientsPage canEdit={false} />} />
        <Route path="emergency" element={<EmergencyPage canEdit={false} />} />
        <Route path="opd" element={<OPDPage canEdit={false} />} />
        <Route path="ipd" element={<IPDPage canEdit={false} />} />
        <Route path="beds" element={<BedsPage />} />
        <Route path="lab" element={<LabPage canEdit={false} />} />
        <Route path="pharmacy" element={<PharmacyPage canEdit={false} />} />
        <Route path="doctors" element={<DoctorsPage canEdit={false} />} />
        <Route path="staff" element={<StaffPage canEdit={false} />} />
        <Route path="billing" element={<BillingPage canEdit={false} />} />
        <Route path="mlc" element={<MLCPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </ShellLayout>
  );
}

export default function HMSApp() {
  // BrowserRouter requires `document` — only render on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pharmacy/login" element={<LoginPage pharmacist />} />

          <Route path="/admin/*" element={<Protected role="admin"><AdminRoutes /></Protected>} />
          <Route path="/receptionist/*" element={<Protected role="receptionist"><ReceptionistRoutes /></Protected>} />

          <Route path="/pharmacy" element={<Protected role="pharmacist"><PharmacyLayout /></Protected>}>
            <Route index element={<Navigate to="queue" replace />} />
            <Route path="queue" element={<PharmacyQueue />} />
            <Route path="stock" element={<PharmacyStock />} />
            <Route path="catalogue" element={<PharmacyCatalogue />} />
            <Route path="log" element={<PharmacyLog />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
