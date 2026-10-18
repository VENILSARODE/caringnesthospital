const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const { monitorEventLoopDelay } = require("perf_hooks");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5001;
const server = http.createServer(app);

/* =========================================================
   CORS CONFIGURATION
   Development-safe localhost handling: Vite may use a different port.
   Configure FRONTEND_URL for a specific non-localhost frontend origin.
========================================================= */
const allowedOrigins = new Set([
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://dashboard.vapi.ai",
]);

if (process.env.FRONTEND_URL) {
    allowedOrigins.add(process.env.FRONTEND_URL.trim().replace(/\/$/, ""));
}

function isAllowedOrigin(origin) {
    // Requests without Origin (health checks/CLI) are allowed.
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;

    // Local development servers may run on Vite's alternate ports.
    try {
        const parsed = new URL(origin);
        const isLoopbackHost = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
        return isLoopbackHost && ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
}

const corsOptions = {
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        console.warn(`[CORS] Blocked origin: ${origin}`);
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
};

/* =========================================================
   SOCKET.IO
========================================================= */
const SOCKET_PING_INTERVAL_MS = 25000;
// Safari/devtools and local development can occasionally pause timers or delay
// heartbeat responses. Keep the standard ping interval but allow a longer grace
// period before declaring a client dead. This improves tolerance; it does not
// replace investigating persistent network or event-loop stalls.
const SOCKET_PING_TIMEOUT_MS = 120000;
const SOCKET_CONNECT_TIMEOUT_MS = 45000;

// Temporary diagnostics for investigating intermittent Socket.IO ping timeouts.
// This observes Node.js event-loop delays only; it does not change socket behavior.
const eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelayMonitor.enable();
const eventLoopDiagnosticsTimer = setInterval(() => {
    const p99Ms = eventLoopDelayMonitor.percentile(99) / 1e6;
    const maxMs = eventLoopDelayMonitor.max / 1e6;
    if (maxMs >= 1000) {
        console.warn(
            `[Diagnostics] Event-loop delay detected in the last 30s: p99=${p99Ms.toFixed(1)}ms, max=${maxMs.toFixed(1)}ms`
        );
    } else {
        console.info(
            `[Diagnostics] Event-loop delay in the last 30s: p99=${p99Ms.toFixed(1)}ms, max=${maxMs.toFixed(1)}ms (no delay >= 1s)`
        );
    }
    eventLoopDelayMonitor.reset();
}, 30000);
eventLoopDiagnosticsTimer.unref();

const io = new Server(server, {
    cors: corsOptions,
    pingInterval: SOCKET_PING_INTERVAL_MS,
    pingTimeout: SOCKET_PING_TIMEOUT_MS,
    connectTimeout: SOCKET_CONNECT_TIMEOUT_MS,
});

// Make Socket.IO available to Express route handlers.
app.set("io", io);

/* =========================================================
   MIDDLEWARE
========================================================= */
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan("dev"));

/* =========================================================
   SOCKET CONNECTION LOGGING
========================================================= */
io.on("connection", (socket) => {
    const connectedAt = Date.now();
    console.log(
        `[Socket.IO] Client connected: ${socket.id} | transport=${socket.conn.transport.name} | ` +
        `pingInterval=${SOCKET_PING_INTERVAL_MS}ms | pingTimeout=${SOCKET_PING_TIMEOUT_MS}ms`
    );

    socket.conn.on("upgrade", (transport) => {
        console.log(
            `[Socket.IO] ${socket.id} upgraded to ${transport.name}`
        );
    });

    // TEMPORARY diagnostic: tests Socket.IO request/acknowledgement without
    // creating or modifying any hospital database records.
    socket.on("caringnest:diagnostic:ping", (payload, acknowledge) => {
        console.log(
            `[Socket.IO] Diagnostic ping received from ${socket.id}`,
            payload
        );

        if (typeof acknowledge === "function") {
            acknowledge({
                success: true,
                message: "Caring Nest Socket.IO diagnostic succeeded",
                socketId: socket.id,
                transport: socket.conn.transport.name,
                timestamp: new Date().toISOString(),
            });
        }
    });

    // TEMPORARY Phase 13 test. Emits harmless marker payloads only when
    // explicitly requested; it does not read or modify hospital records.
    socket.on("caringnest:diagnostic:event-delivery", (payload, acknowledge) => {
        const testId = typeof payload?.testId === "string" ? payload.testId : `phase13-${Date.now()}`;
        const marker = { __caringNestDiagnostic: true, testId, timestamp: new Date().toISOString() };
        console.log(`[Socket.IO] Phase 13 event-delivery test requested by ${socket.id}; testId=${testId}`);

        // Emit to all connected clients so the existing OPD/Consultations
        // listeners can refresh. Payload is diagnostic-only and no DB writes occur.
        io.emit("appointment:created", { ...marker, appointmentId: "DIAGNOSTIC-ONLY" });
        io.emit("appointment:updated", { ...marker, appointmentId: "DIAGNOSTIC-ONLY", status: "DIAGNOSTIC" });
        io.emit("consultation:created", { ...marker, consultationId: "DIAGNOSTIC-ONLY" });

        if (typeof acknowledge === "function") {
            acknowledge({ success: true, message: "Phase 13 event-delivery test events emitted", testId, timestamp: new Date().toISOString() });
        }
    });

    socket.on("disconnect", (reason) => {
        const durationSeconds = Math.round((Date.now() - connectedAt) / 1000);
        console.log(
            `[Socket.IO] Client disconnected: ${socket.id} | reason=${reason} | ` +
            `connectedFor=${durationSeconds}s | lastTransport=${socket.conn.transport.name}`
        );
    });

    socket.on("error", (error) => {
        console.error(
            `[Socket.IO] Client socket error (${socket.id}):`,
            error.message || error
        );
    });
});

io.engine.on("connection_error", (error) => {
    console.error("[Socket.IO] Engine connection error:", {
        code: error.code,
        message: error.message,
        context: error.context,
    });
});

/* =========================================================
   ROUTES
========================================================= */
const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const consultationRoutes = require("./routes/consultationRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const pharmacyRoutes = require("./routes/pharmacyRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/emergencies", emergencyRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/pharmacy", pharmacyRoutes);

/* =========================================================
   HEALTH CHECK
========================================================= */
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Caring Nest backend is running",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        realtime: {
            socketIo: true,
            connectedClients: io.engine.clientsCount,
        },
    });
});

/* =========================================================
   START SERVER
========================================================= */
const startServer = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is missing from backend/.env");
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB Atlas connected successfully");

        server.listen(PORT, () => {
            console.log(`Caring Nest backend running on port ${PORT}`);
            console.log(`Socket.IO realtime server running on port ${PORT}`);
            console.log("Allowed frontend origins:", [...allowedOrigins].join(", "));
        });
    } catch (error) {
        console.error("Caring Nest backend startup failed:");
        console.error(error.message);
        process.exit(1);
    }
};

startServer();
