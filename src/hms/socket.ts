// ============================================================
// CARING NEST — SOCKET.IO CLIENT
// Phase 13: Real-Time Updates
// ============================================================

import { io, type Socket } from "socket.io-client";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5001/api";

/** Socket.IO connects to the backend origin, not /api. */
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

function getStoredToken(): string | null {
    return (
        localStorage.getItem("caringnest_auth_token") ||
        localStorage.getItem("token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("accessToken")
    );
}

/** Update Socket.IO authentication after login. */
export function updateSocketAuthToken(token?: string): void {
    if (!socket) return;

    const storedToken = token || getStoredToken();
    socket.auth = storedToken ? { token: storedToken } : {};

    // A connected socket must reconnect for the new auth payload to be sent.
    if (socket.connected) {
        socket.disconnect();
        socket.connect();
    } else if (!socket.active) {
        socket.connect();
    }
}

/** Create one Socket.IO client and reuse it across the application. */
export function connectSocket(): Socket {
    if (socket) {
        if (!socket.connected && !socket.active) {
            const token = getStoredToken();
            socket.auth = token ? { token } : {};
            socket.connect();
        }
        return socket;
    }

    const token = getStoredToken();
    socket = io(SOCKET_URL, {
        transports: ["polling", "websocket"],
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        auth: token ? { token } : {},
    });

    socket.on("connect", () => {
        console.info(
            `[Caring Nest Socket.IO] Connected. Socket ID: ${socket?.id}; transport: ${socket?.io.engine?.transport?.name}`
        );
    });

    socket.on("disconnect", (reason) => {
        console.warn("[Caring Nest Socket.IO] Disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
        console.error(
            "[Caring Nest Socket.IO] Connection error:",
            error.message
        );
    });

    socket.io.on("reconnect_attempt", (attemptNumber) => {
        if (!socket) return;
        const currentToken = getStoredToken();
        socket.auth = currentToken ? { token: currentToken } : {};
        console.warn(
            `[Caring Nest Socket.IO] Reconnection attempt ${attemptNumber}`
        );
    });

    socket.io.on("reconnect", (attemptNumber) => {
        console.info(
            `[Caring Nest Socket.IO] Reconnected after ${attemptNumber} attempt(s).`
        );
    });

    socket.on("error", (error) => {
        console.error("[Caring Nest Socket.IO] Socket error:", error);
    });

    socket.connect();
    return socket;
}

/** Return the existing socket or create it if needed. */
export function getSocket(): Socket {
    return socket ?? connectSocket();
}

/** Use on logout/application teardown, not ordinary page changes. */
export function disconnectSocket(): void {
    if (!socket) return;
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
}

export function isSocketConnected(): boolean {
    return socket?.connected === true;
}

/** Read-only snapshot for browser-console diagnostics. */
export function getSocketStatus(): {
    connected: boolean;
    active: boolean;
    socketId: string | undefined;
    transport: string | undefined;
    url: string;
} {
    const currentSocket = socket;
    return {
        connected: currentSocket?.connected === true,
        active: currentSocket?.active === true,
        socketId: currentSocket?.id,
        transport: currentSocket?.io.engine?.transport?.name,
        url: SOCKET_URL,
    };
}

/** Subscribe to an event and return its cleanup function. */
export function subscribeSocketEvent<T = unknown>(
    eventName: string,
    handler: (data: T) => void
): () => void {
    const currentSocket = getSocket();
    currentSocket.on(eventName, handler);
    return () => currentSocket.off(eventName, handler);
}

/**
 * Temporary Phase 13 diagnostic. It does not mutate hospital records.
 * Requires the backend diagnostic handler to emit the three matching
 * diagnostic events and acknowledge the request with success: true.
 */
export async function testSocketEventDelivery(): Promise<{
    success: boolean;
    testId: string;
    receivedEvents: string[];
}> {
    const currentSocket = getSocket();
    if (!currentSocket.connected) {
        throw new Error(
            "Socket.IO is not connected. Wait for the Connected log and retry."
        );
    }

    const testId = `phase13-${Date.now()}`;
    const expectedEvents = [
        "appointment:created",
        "appointment:updated",
        "consultation:created",
    ] as const;
    type DiagnosticEvent = (typeof expectedEvents)[number];

    const receivedEvents = new Set<string>();

    return new Promise((resolve, reject) => {
        let finished = false;
        let timer: number | undefined;

        const cleanup = () => {
            expectedEvents.forEach((eventName) => {
                currentSocket.off(eventName, handlers[eventName]);
            });
            if (timer !== undefined) window.clearTimeout(timer);
        };

        const finish = (callback: () => void) => {
            if (finished) return;
            finished = true;
            cleanup();
            callback();
        };

        const receive = (eventName: DiagnosticEvent, payload: unknown) => {
            const diagnosticPayload = payload as {
                __caringNestDiagnostic?: boolean;
                testId?: string;
            } | null;

            if (
                diagnosticPayload?.__caringNestDiagnostic !== true ||
                diagnosticPayload.testId !== testId
            ) return;

            receivedEvents.add(eventName);
            console.info(
                `[Caring Nest Socket.IO] Diagnostic event received: ${eventName}`,
                payload
            );

            if (receivedEvents.size === expectedEvents.length) {
                finish(() => resolve({
                    success: true,
                    testId,
                    receivedEvents: [...receivedEvents],
                }));
            }
        };

        const handlers: Record<DiagnosticEvent, (payload: unknown) => void> = {
            "appointment:created": (payload) => receive("appointment:created", payload),
            "appointment:updated": (payload) => receive("appointment:updated", payload),
            "consultation:created": (payload) => receive("consultation:created", payload),
        };

        expectedEvents.forEach((eventName) => {
            currentSocket.on(eventName, handlers[eventName]);
        });

        timer = window.setTimeout(() => {
            finish(() => reject(new Error(
                `Event delivery timed out. Received: ${[...receivedEvents].join(", ") || "none"}`
            )));
        }, 8000);

        currentSocket.emit(
            "caringnest:diagnostic:event-delivery",
            { testId },
            (ack: { success?: boolean; message?: string } | undefined) => {
                console.info(
                    "[Caring Nest Socket.IO] Event-delivery acknowledgement:",
                    ack
                );
                if (!ack?.success) {
                    finish(() => reject(new Error(
                        ack?.message || "Backend did not confirm diagnostic event emission."
                    )));
                }
            }
        );
    });
}
