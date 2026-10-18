import { ReactNode, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { StoreProvider, useStore, Role } from "./store";
import LoginPage from "./Login";
import { ShellLayout } from "./Shell";

import {
  DashboardPage,
  PatientsPage,
  EmergencyPage,
  OPDPage,
  ConsultationsPage,
  IPDPage,
  BedsPage,
  LabPage,
  PharmacyPage,
  DoctorsPage,
  StaffPage,
  BillingPage,
  MLCPage,
  ReportsPage,
} from "./pages";

import {
  PharmacyLayout,
  PharmacyQueue,
  PharmacyStock,
  PharmacyCatalogue,
  PharmacyLog,
} from "./pharmacy";

import {
  connectSocket,
  disconnectSocket,
} from "./socket";

/* =========================================================
   PROTECTED ROUTE
========================================================= */

function Protected({
  role,
  children,
}: {
  role: Role | Role[];
  children: ReactNode;
}) {
  const { user } = useStore();

  const allowed = Array.isArray(role) ? role : [role];

  if (!user) {
    return (
      <Navigate
        to={
          allowed.includes("pharmacist") && allowed.length === 1
            ? "/pharmacy/login"
            : "/login"
        }
        replace
      />
    );
  }

  if (!allowed.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/* =========================================================
   REALTIME SOCKET CONNECTION MANAGER
========================================================= */

/**
 * Connects the logged-in Caring Nest frontend to the
 * backend Socket.IO server.
 *
 * The connection is created only when the application
 * is on an authenticated route.
 *
 * When the user returns to the login page, the Socket.IO
 * connection is disconnected.
 */
function RealtimeConnection() {
  const location = useLocation();

  const hasAuthToken =
    localStorage.getItem("caringnest_auth_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken");

  useEffect(() => {
    /*
     * Login pages should not maintain a realtime
     * hospital connection.
     */
    const isLoginRoute =
      location.pathname === "/login" ||
      location.pathname === "/pharmacy/login";

    if (isLoginRoute || !hasAuthToken) {
      disconnectSocket();
      return;
    }

    /*
     * Connect to the real backend Socket.IO server.
     */
    connectSocket();

    /*
     * Disconnect when leaving the authenticated
     * application or when this component unmounts.
     */
    return () => {
      disconnectSocket();
    };
  }, [location.pathname, hasAuthToken]);

  return null;
}

/* =========================================================
   ADMIN ROUTES
========================================================= */

function AdminRoutes() {
  return (
    <ShellLayout role="admin">
      <Routes>
        <Route
          path="dashboard"
          element={<DashboardPage role="admin" />}
        />

        <Route
          path="patients"
          element={<PatientsPage canEdit />}
        />

        <Route
          path="emergency"
          element={<EmergencyPage canEdit />}
        />

        <Route
          path="opd"
          element={<OPDPage canEdit />}
        />

        <Route
          path="consultations"
          element={<ConsultationsPage canEdit />}
        />

        <Route
          path="ipd"
          element={<IPDPage canEdit />}
        />

        <Route
          path="beds"
          element={<BedsPage />}
        />

        <Route
          path="lab"
          element={<LabPage canEdit />}
        />

        <Route
          path="pharmacy"
          element={<PharmacyPage canEdit />}
        />

        <Route
          path="doctors"
          element={<DoctorsPage canEdit />}
        />

        <Route
          path="staff"
          element={<StaffPage canEdit />}
        />

        <Route
          path="billing"
          element={<BillingPage canEdit />}
        />

        <Route
          path="mlc"
          element={<MLCPage />}
        />

        <Route
          path="reports"
          element={<ReportsPage />}
        />

        <Route
          path="*"
          element={<Navigate to="dashboard" replace />}
        />
      </Routes>
    </ShellLayout>
  );
}

/* =========================================================
   RECEPTIONIST ROUTES
========================================================= */

function ReceptionistRoutes() {
  return (
    <ShellLayout role="receptionist">
      <Routes>
        <Route
          path="dashboard"
          element={<DashboardPage role="receptionist" />}
        />

        <Route
          path="patients"
          element={<PatientsPage canEdit={false} />}
        />

        <Route
          path="emergency"
          element={<EmergencyPage canEdit={false} />}
        />

        <Route
          path="opd"
          element={<OPDPage canEdit={false} />}
        />

        <Route
          path="consultations"
          element={<ConsultationsPage canEdit={false} />}
        />

        <Route
          path="ipd"
          element={<IPDPage canEdit={false} />}
        />

        <Route
          path="beds"
          element={<BedsPage />}
        />

        <Route
          path="lab"
          element={<LabPage canEdit={false} />}
        />

        <Route
          path="pharmacy"
          element={<PharmacyPage canEdit={false} />}
        />

        <Route
          path="doctors"
          element={<DoctorsPage canEdit={false} />}
        />

        <Route
          path="staff"
          element={<StaffPage canEdit={false} />}
        />

        <Route
          path="billing"
          element={<BillingPage canEdit={false} />}
        />

        <Route
          path="mlc"
          element={<MLCPage />}
        />

        <Route
          path="reports"
          element={<ReportsPage />}
        />

        <Route
          path="*"
          element={<Navigate to="dashboard" replace />}
        />
      </Routes>
    </ShellLayout>
  );
}

/* =========================================================
   MAIN HMS APPLICATION
========================================================= */

export default function HMSApp() {
  /*
   * BrowserRouter requires `document`.
   * Keep the existing client-only mounting protection.
   */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <StoreProvider>
      <BrowserRouter>
        {/* =================================================
            REALTIME CONNECTION
        ================================================= */}
        <RealtimeConnection />

        {/* =================================================
            APPLICATION ROUTES
        ================================================= */}
        <Routes>
          {/* -------------------------
              LOGIN
          ------------------------- */}

          <Route
            path="/"
            element={
              <Navigate
                to="/login"
                replace
              />
            }
          />

          <Route
            path="/login"
            element={<LoginPage />}
          />

          <Route
            path="/pharmacy/login"
            element={<LoginPage pharmacist />}
          />

          {/* -------------------------
              ADMIN
          ------------------------- */}

          <Route
            path="/admin/*"
            element={
              <Protected role="admin">
                <AdminRoutes />
              </Protected>
            }
          />

          {/* -------------------------
              RECEPTIONIST
          ------------------------- */}

          <Route
            path="/receptionist/*"
            element={
              <Protected role="receptionist">
                <ReceptionistRoutes />
              </Protected>
            }
          />

          {/* -------------------------
              PHARMACIST
          ------------------------- */}

          <Route
            path="/pharmacy"
            element={
              <Protected role="pharmacist">
                <PharmacyLayout />
              </Protected>
            }
          >
            <Route
              index
              element={
                <Navigate
                  to="queue"
                  replace
                />
              }
            />

            <Route
              path="queue"
              element={<PharmacyQueue />}
            />

            <Route
              path="stock"
              element={<PharmacyStock />}
            />

            <Route
              path="catalogue"
              element={<PharmacyCatalogue />}
            />

            <Route
              path="log"
              element={<PharmacyLog />}
            />
          </Route>

          {/* -------------------------
              FALLBACK
          ------------------------- */}

          <Route
            path="*"
            element={
              <Navigate
                to="/login"
                replace
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}