// ============================================================
// CARING NEST - FRONTEND API CLIENT
// ============================================================
//
// React Frontend
//      ↓
// this api.ts
//      ↓
// Node.js + Express
//      ↓
// MongoDB Atlas
//
// IMPORTANT:
// This file communicates with the REAL backend.
// No mock API responses are used here.
// ============================================================

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5001/api";

// ============================================================
// TYPES
// ============================================================

export type BackendRole =
    | "ADMIN"
    | "FRONT_OFFICER"
    | "PHARMACIST";

export interface ApiUser {
    id?: string;
    _id?: string;
    fullName: string;
    email: string;
    role: BackendRole;
    isActive?: boolean;
}

export interface LoginResponse {
    success: boolean;
    message: string;
    token: string;
    user: ApiUser;
}

export interface RegisterResponse {
    success: boolean;
    message: string;
    user: ApiUser;
}

// ============================================================
// AUTH TOKEN
// ============================================================

/**
 * Login.tsx stores the real JWT here:
 *
 * caringnest_auth_token
 *
 * Older token keys are also checked for compatibility.
 */
export function getAuthToken(): string | null {
    return (
        localStorage.getItem(
            "caringnest_auth_token"
        ) ||
        localStorage.getItem("token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("accessToken")
    );
}

/**
 * Store the real JWT.
 */
export function setAuthToken(
    token: string
): void {
    localStorage.setItem(
        "caringnest_auth_token",
        token
    );
}

/**
 * Remove authentication information.
 */
export function clearAuthToken(): void {
    localStorage.removeItem(
        "caringnest_auth_token"
    );

    localStorage.removeItem("token");
    localStorage.removeItem("authToken");
    localStorage.removeItem("accessToken");

    localStorage.removeItem(
        "caringnest_auth_user"
    );

    localStorage.removeItem("hms_user");
}

/**
 * Clear frontend authentication state.
 */
export function logout(): void {
    clearAuthToken();
}

// ============================================================
// COMMON REQUEST HELPER
// ============================================================

export async function apiRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getAuthToken();

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
    };

    // --------------------------------------------------------
    // Attach JWT
    // --------------------------------------------------------

    if (token) {
        (
            headers as Record<
                string,
                string
            >
        ).Authorization =
            `Bearer ${token}`;
    }

    // --------------------------------------------------------
    // Request
    // --------------------------------------------------------

    const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
            ...options,
            headers,
        }
    );

    // --------------------------------------------------------
    // Read response safely
    // --------------------------------------------------------

    const data = await response
        .json()
        .catch(() => null);

    console.log(
        `[Caring Nest API] ${options.method || "GET"
        } ${endpoint}`,
        response.status,
        data
    );

    // --------------------------------------------------------
    // Authentication failure
    // --------------------------------------------------------

    if (response.status === 401) {
        console.error(
            "[Caring Nest API] Authentication failed."
        );

        /*
         * Do NOT automatically delete the JWT.
         *
         * The login/session layer decides when the
         * user should actually be logged out.
         */
    }

    // --------------------------------------------------------
    // HTTP failure
    // --------------------------------------------------------

    if (!response.ok) {
        throw new Error(
            data?.message ||
            `Request failed with status ${response.status}`
        );
    }

    // --------------------------------------------------------
    // Backend-level failure
    // --------------------------------------------------------

    if (
        data &&
        data.success === false
    ) {
        throw new Error(
            data.message ||
            "Backend request failed"
        );
    }

    return data as T;
}

// ============================================================
// AUTH
// ============================================================

export async function login(
    email: string,
    password: string
): Promise<LoginResponse> {
    return apiRequest<LoginResponse>(
        "/auth/login",
        {
            method: "POST",
            body: JSON.stringify({
                email: email
                    .trim()
                    .toLowerCase(),
                password,
            }),
        }
    );
}

export async function register(
    fullName: string,
    email: string,
    password: string,
    role: BackendRole
): Promise<RegisterResponse> {
    return apiRequest<RegisterResponse>(
        "/auth/register",
        {
            method: "POST",
            body: JSON.stringify({
                fullName:
                    fullName.trim(),
                email: email
                    .trim()
                    .toLowerCase(),
                password,
                role,
            }),
        }
    );
}

export async function getCurrentUser() {
    return apiRequest(
        "/auth/me"
    );
}

// ============================================================
// HEALTH
// ============================================================

export async function getBackendHealth() {
    return apiRequest(
        "/health"
    );
}

// ============================================================
// PATIENTS
// ============================================================

export async function getPatients() {
    return apiRequest(
        "/patients"
    );
}

export async function createPatient(
    patient: {
        fullName: string;
        age: number;
        gender:
        | "Male"
        | "Female"
        | "Other";
        phone: string;
        address?: string;
        emergencyContact?: string;
    }
) {
    return apiRequest(
        "/patients",
        {
            method: "POST",
            body: JSON.stringify(
                patient
            ),
        }
    );
}

// ============================================================
// DOCTORS
// ============================================================

export async function getDoctors() {
    return apiRequest(
        "/doctors"
    );
}

export async function createDoctor(
    doctor: {
        fullName: string;
        specialization: string;
        department: string;
        phone?: string;
        workingDays?: string[];
        startTime?: string;
        endTime?: string;
        dailyTokenCapacity?: number;
    }
) {
    return apiRequest(
        "/doctors",
        {
            method: "POST",
            body: JSON.stringify(
                doctor
            ),
        }
    );
}

export async function getDoctor(
    doctorId: string
) {
    return apiRequest(
        `/doctors/${encodeURIComponent(
            doctorId
        )}`
    );
}

export async function updateDoctor(
    doctorId: string,
    updates: {
        fullName?: string;
        specialization?: string;
        department?: string;
        phone?: string;
        workingDays?: string[];
        startTime?: string;
        endTime?: string;
        dailyTokenCapacity?: number;
        isActive?: boolean;
    }
) {
    return apiRequest(
        `/doctors/${encodeURIComponent(
            doctorId
        )}`,
        {
            method: "PATCH",
            body: JSON.stringify(
                updates
            ),
        }
    );
}

export async function deleteDoctor(
    doctorId: string
) {
    return apiRequest(
        `/doctors/${encodeURIComponent(
            doctorId
        )}`,
        {
            method: "DELETE",
        }
    );
}

export async function getDoctorAvailability(
    doctorId: string,
    date: string
) {
    return apiRequest(
        `/doctors/${encodeURIComponent(
            doctorId
        )}/availability?date=${encodeURIComponent(
            date
        )}`
    );
}

// ============================================================
// APPOINTMENTS
// ============================================================

export async function getAppointments(
    query = ""
) {
    const suffix = query
        ? `?${query}`
        : "";

    return apiRequest(
        `/appointments${suffix}`
    );
}

export async function createAppointment(
    appointment: {
        patientUhid: string;
        doctorId: string;
        appointmentDate: string;
        appointmentTime: string;
        appointmentType?: string;
        reason?: string;
    }
) {
    const {
        appointmentType,
        ...rest
    } = appointment;

    return apiRequest(
        "/appointments",
        {
            method: "POST",
            body: JSON.stringify({
                ...rest,
                visitType: appointmentType,
            }),
        }
    );
}

// ============================================================
// CONSULTATIONS
// ============================================================

export async function getConsultations() {
    return apiRequest(
        "/consultations"
    );
}

export async function getPatientConsultations(
    patientUhid: string
) {
    return apiRequest(
        `/consultations/patient/${encodeURIComponent(
            patientUhid
        )}`
    );
}

export async function getConsultation(
    consultationId: string
) {
    return apiRequest(
        `/consultations/${encodeURIComponent(
            consultationId
        )}`
    );
}

export async function createConsultation(

    consultation: {

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

        }>;

        followUpRequired?: boolean;

        followUpDate?: string | null;

    }

) {

    return apiRequest(

        "/consultations",

        {

            method: "POST",

            body: JSON.stringify(

                consultation

            ),

        }

    );

}

// ============================================================
// EMERGENCIES
// ============================================================

export async function getEmergencies() {
    return apiRequest(
        "/emergencies"
    );
}

export async function createEmergency(
    emergency: {
        patientName: string;
        age: number;
        accidentType: string;
        injuries: string;
        consciousness: string;
        severity: string;
        location: string;
        arrivalTime?: string;
        callerName: string;
        callerPhone: string;
        mlcCase: boolean;
        languageUsed?: string;
        patientUhid?: string;
    }
) {
    return apiRequest(
        "/emergencies",
        {
            method: "POST",
            body: JSON.stringify(
                emergency
            ),
        }
    );
}

export async function updateEmergencyStatus(
    emergencyId: string,
    status:
        | "NEW"
        | "ACKNOWLEDGED"
        | "ARRIVED"
        | "ADMITTED"
        | "CLOSED"
) {
    return apiRequest(
        `/emergencies/${encodeURIComponent(
            emergencyId
        )}/status`,
        {
            method: "PATCH",
            body: JSON.stringify({
                status,
            }),
        }
    );
}

// ============================================================
// MEDICINES
// ============================================================

export async function getMedicines() {
    return apiRequest(
        "/medicines"
    );
}

export async function getMedicine(
    medicineId: string
) {
    return apiRequest(
        `/medicines/${encodeURIComponent(
            medicineId
        )}`
    );
}

export async function createMedicine(
    medicine: {
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
        isActive?: boolean;
    }
) {
    return apiRequest(
        "/medicines",
        {
            method: "POST",
            body: JSON.stringify(
                medicine
            ),
        }
    );
}

export async function updateMedicine(
    medicineId: string,
    updates: {
        medicineName?: string;
        genericName?: string;
        category?: string;
        batchNumber?: string;
        expiryDate?: string;
        quantity?: number;
        reorderLevel?: number;
        unitPrice?: number;
        supplier?: string;
        isActive?: boolean;
    }
) {
    return apiRequest(
        `/medicines/${encodeURIComponent(
            medicineId
        )}`,
        {
            method: "PATCH",
            body: JSON.stringify(
                updates
            ),
        }
    );
}

export async function deleteMedicine(
    medicineId: string
) {
    return apiRequest(
        `/medicines/${encodeURIComponent(
            medicineId
        )}`,
        {
            method: "DELETE",
        }
    );
}

export async function getLowStockMedicines() {
    return apiRequest(
        "/medicines/low-stock"
    );
}

// ============================================================
// PHARMACY
// ============================================================

export async function getPendingPrescriptions() {
    return apiRequest(
        "/pharmacy/pending-prescriptions"
    );
}

export async function dispensePrescription(
    consultationId: string,
    prescriptionIndex: number
) {
    return apiRequest(
        "/pharmacy/dispense",
        {
            method: "POST",
            body: JSON.stringify({
                consultationId,
                prescriptionIndex,
            }),
        }
    );
}

// ============================================================
// UTILITY
// ============================================================

export function isAuthenticated(): boolean {
    return Boolean(
        getAuthToken()
    );
}

// ============================================================
// API BASE URL
// ============================================================

export function getApiBaseUrl(): string {
    return API_BASE_URL;
}