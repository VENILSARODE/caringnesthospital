const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5001/api";

type ApiOptions = {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    token?: string | null;
};

function getStoredToken(): string | null {
    try {
        return localStorage.getItem(
            "caringnest_auth_token"
        );
    } catch {
        return null;
    }
}

function shouldSkipAuthentication(
    endpoint: string
): boolean {
    return (
        endpoint === "/auth/login" ||
        endpoint === "/auth/register" ||
        endpoint === "/health"
    );
}

export async function apiRequest<T>(
    endpoint: string,
    options: ApiOptions = {}
): Promise<T> {
    const {
        method = "GET",
        body,
        token,
    } = options;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    /*
     * Public endpoints do not need JWT.
     */
    const isPublicEndpoint =
        shouldSkipAuthentication(endpoint);

    /*
     * Use an explicitly supplied token when it exists.
     *
     * IMPORTANT:
     * If token is null/undefined, automatically use
     * the JWT stored after login.
     */
    const authToken =
        !isPublicEndpoint
            ? token || getStoredToken()
            : null;

    if (authToken) {
        headers.Authorization =
            `Bearer ${authToken}`;
    }

    const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
            method,
            headers,
            body:
                body !== undefined
                    ? JSON.stringify(body)
                    : undefined,
        }
    );

    let data: unknown = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    /*
     * Authentication failure.
     */
    if (response.status === 401) {
        try {
            localStorage.removeItem(
                "caringnest_auth_token"
            );

            localStorage.removeItem(
                "caringnest_auth_user"
            );
        } catch {
            // Ignore localStorage errors.
        }

        const message =
            typeof data === "object" &&
                data !== null &&
                "message" in data &&
                typeof data.message === "string"
                ? data.message
                : "Authentication required. Please sign in again.";

        throw new Error(message);
    }

    /*
     * Other backend errors.
     */
    if (!response.ok) {
        const message =
            typeof data === "object" &&
                data !== null &&
                "message" in data &&
                typeof data.message === "string"
                ? data.message
                : `Request failed with status ${response.status}`;

        throw new Error(message);
    }

    return data as T;
}

/*
|--------------------------------------------------------------------------
| API methods
|--------------------------------------------------------------------------
*/

export const api = {
    get: <T>(
        endpoint: string,
        token?: string | null
    ) =>
        apiRequest<T>(endpoint, {
            method: "GET",
            token,
        }),

    post: <T>(
        endpoint: string,
        body: unknown,
        token?: string | null
    ) =>
        apiRequest<T>(endpoint, {
            method: "POST",
            body,
            token,
        }),

    patch: <T>(
        endpoint: string,
        body: unknown,
        token?: string | null
    ) =>
        apiRequest<T>(endpoint, {
            method: "PATCH",
            body,
            token,
        }),

    put: <T>(
        endpoint: string,
        body: unknown,
        token?: string | null
    ) =>
        apiRequest<T>(endpoint, {
            method: "PUT",
            body,
            token,
        }),

    delete: <T>(
        endpoint: string,
        token?: string | null
    ) =>
        apiRequest<T>(endpoint, {
            method: "DELETE",
            token,
        }),
};

/*
|--------------------------------------------------------------------------
| Backend health check
|--------------------------------------------------------------------------
*/

export type BackendHealthResponse = {
    success: boolean;
    message: string;
    database:
    | "connected"
    | "disconnected"
    | string;
};

export async function testBackendConnection(): Promise<BackendHealthResponse> {
    return api.get<BackendHealthResponse>(
        "/health"
    );
};