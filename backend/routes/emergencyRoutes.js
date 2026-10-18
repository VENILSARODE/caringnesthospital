const express = require("express");
const Emergency = require("../models/Emergency");

const router = express.Router();

const ALLOWED_STATUSES = [
    "NEW",
    "ACKNOWLEDGED",
    "ARRIVED",
    "ADMITTED",
    "CLOSED",
];

function parseAge(rawAge) {
    if (rawAge === undefined || rawAge === null || rawAge === "") {
        return { valid: false, value: null };
    }
    if (typeof rawAge === "number") {
        if (!Number.isFinite(rawAge) || rawAge < 0) {
            return { valid: false, value: rawAge };
        }
        return { valid: true, value: Math.round(rawAge) };
    }
    if (typeof rawAge === "string") {
        const trimmed = rawAge.trim();
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const num = Number(trimmed);
            if (Number.isFinite(num) && num >= 0) {
                return { valid: true, value: Math.round(num) };
            }
        }
    }
    return { valid: false, value: null };
}

function normalizeGender(rawGender) {
    if (!rawGender) return "Other";
    const lower = String(rawGender).trim().toLowerCase();
    if (lower === "male" || lower === "m") return "Male";
    if (lower === "female" || lower === "f") return "Female";
    return "Other";
}

function normalizeMlc(rawMlc) {
    if (typeof rawMlc === "boolean") return rawMlc;
    if (typeof rawMlc === "number") return rawMlc === 1;
    if (typeof rawMlc === "string") {
        const lower = rawMlc.trim().toLowerCase();
        if (["true", "yes", "1", "y", "mlc"].includes(lower)) return true;
        if (["false", "no", "0", "n", "non-mlc"].includes(lower)) return false;
    }
    return false;
}

function normalizeConsciousness(rawConsciousness, rawCondition) {
    if (rawConsciousness) {
        const upper = String(rawConsciousness).trim().toUpperCase();
        if (upper === "CONSCIOUS" || upper === "ALERT") return "CONSCIOUS";
        if (upper === "UNCONSCIOUS" || upper === "COMA" || upper === "UNRESPONSIVE") return "UNCONSCIOUS";
        if (upper === "UNKNOWN") return "UNKNOWN";
        if (upper.includes("UNCONSCIOUS")) return "UNCONSCIOUS";
        if (upper.includes("CONSCIOUS")) return "CONSCIOUS";
    }
    if (rawCondition) {
        const upper = String(rawCondition).trim().toUpperCase();
        if (upper === "CONSCIOUS") return "CONSCIOUS";
        if (upper === "UNCONSCIOUS") return "UNCONSCIOUS";
    }
    return "UNKNOWN";
}

function normalizeSeverity(rawSeverity, rawTriage) {
    const val = (rawSeverity || rawTriage || "").toString().trim().toUpperCase();
    if (!val) return "UNKNOWN";

    if (["CRITICAL", "RED", "HIGH", "SEVERE", "EMERGENCY"].includes(val)) return "CRITICAL";
    if (["MODERATE", "YELLOW", "MEDIUM", "SERIOUS", "URGENT"].includes(val)) return "MODERATE";
    if (["MINOR", "GREEN", "LOW", "STABLE", "NON-URGENT"].includes(val)) return "MINOR";
    if (["UNKNOWN"].includes(val)) return "UNKNOWN";

    if (val.includes("CRITIC") || val.includes("RED")) return "CRITICAL";
    if (val.includes("MODERAT") || val.includes("YELLOW")) return "MODERATE";
    if (val.includes("MINOR") || val.includes("GREEN")) return "MINOR";

    return "UNKNOWN";
}

function extractVapiPayload(body = {}, req = {}) {
    let payload = { ...body };
    let vapiToolCallId = null;
    let vapiCallId =
        req.headers?.["x-vapi-call-id"] ||
        req.headers?.["x-call-id"] ||
        req.headers?.["idempotency-key"] ||
        body.vapiCallId ||
        body.vapi_call_id ||
        body.callId ||
        body.call_id ||
        null;

    if (body.message?.toolCalls && Array.isArray(body.message.toolCalls) && body.message.toolCalls.length > 0) {
        const firstTool = body.message.toolCalls[0];
        vapiToolCallId = firstTool.id;
        vapiCallId = vapiCallId || body.message.call?.id;
        let args = firstTool.function?.arguments;
        if (typeof args === "string") {
            try {
                args = JSON.parse(args);
            } catch {
                args = {};
            }
        }
        if (args && typeof args === "object") {
            payload = { ...payload, ...args };
        }
    } else if (body.message?.toolCallList && Array.isArray(body.message.toolCallList) && body.message.toolCallList.length > 0) {
        const firstTool = body.message.toolCallList[0];
        vapiToolCallId = firstTool.id;
        vapiCallId = vapiCallId || body.message.call?.id;
        let args = firstTool.function?.arguments;
        if (typeof args === "string") {
            try {
                args = JSON.parse(args);
            } catch {
                args = {};
            }
        }
        if (args && typeof args === "object") {
            payload = { ...payload, ...args };
        }
    } else if (body.message?.call?.id) {
        vapiCallId = vapiCallId || body.message.call.id;
        if (body.message?.analysis?.structuredData) {
            payload = { ...payload, ...body.message.analysis.structuredData };
        }
    } else if (body.parameters && typeof body.parameters === "object") {
        payload = { ...payload, ...body.parameters };
    } else if (body.arguments && typeof body.arguments === "object") {
        payload = { ...payload, ...body.arguments };
    }

    return { payload, vapiToolCallId, vapiCallId };
}

function normalizeEmergencyPayload(raw = {}) {
    // 1. patientName: patient_name -> patientName (also patient)
    const patientName = (
        raw.patientName !== undefined
            ? raw.patientName
            : raw.patient_name !== undefined
                ? raw.patient_name
                : raw.patient !== undefined
                    ? raw.patient
                    : ""
    ).toString().trim();

    // 2. age: numeric validation
    const rawAge =
        raw.age !== undefined
            ? raw.age
            : raw.patient_age !== undefined
                ? raw.patient_age
                : undefined;
    const parsedAge = parseAge(rawAge);

    // 3. gender: normalize
    const gender = normalizeGender(raw.gender || raw.patient_gender);

    // 4. accidentType: accident_type -> accidentType (defaults to "Emergency" if not provided or empty)
    const rawAccidentType = raw.accidentType || raw.accident_type || raw.accident;
    const accidentType = (rawAccidentType !== undefined && rawAccidentType !== null && String(rawAccidentType).trim())
        ? String(rawAccidentType).trim()
        : (raw.accidentType === "" || raw.accident_type === "" ? "" : "Emergency");

    // 5. injuries: injury -> injuries
    const injuries = (
        raw.injuries ||
        raw.injury ||
        raw.patient_injuries ||
        ""
    ).toString().trim();

    // 6. consciousness
    const consciousness = normalizeConsciousness(
        raw.consciousness,
        raw.condition
    );

    // 7. severity
    const severity = normalizeSeverity(raw.severity, raw.triage);

    // 8. condition & triage
    const condition = (
        raw.condition ||
        raw.patient_condition ||
        (consciousness === "CONSCIOUS"
            ? "Conscious"
            : consciousness === "UNCONSCIOUS"
                ? "Unconscious"
                : "Stable")
    ).toString().trim();

    const triage = (
        raw.triage ||
        (severity === "CRITICAL"
            ? "Critical"
            : severity === "MODERATE"
                ? "Moderate"
                : severity === "MINOR"
                    ? "Minor"
                    : "Yellow")
    ).toString().trim();

    // 9. location: accident_location -> location (also accidentLocation, incident_location)
    const location = (
        raw.location ||
        raw.accident_location ||
        raw.accidentLocation ||
        raw.incident_location ||
        ""
    ).toString().trim();

    // 10. callerPhone: contact -> callerPhone (also phone, caller_phone)
    const callerPhone = (
        raw.callerPhone ||
        raw.contact ||
        raw.caller_phone ||
        raw.phone ||
        raw.caller_contact ||
        ""
    ).toString().trim();

    // 11. callerName: caller_name -> callerName (defaults to patientName if omitted)
    const rawCallerName = raw.callerName || raw.caller_name;
    const callerName = (
        rawCallerName !== undefined && rawCallerName !== null && String(rawCallerName).trim()
            ? String(rawCallerName).trim()
            : patientName
    );

    // 12. mlcCase: mlc -> mlcCase (also mlc_case, isMlc)
    const rawMlc =
        raw.mlcCase !== undefined
            ? raw.mlcCase
            : raw.mlc !== undefined
                ? raw.mlc
                : raw.mlc_case !== undefined
                    ? raw.mlc_case
                    : raw.isMlc;
    const mlcCase = normalizeMlc(rawMlc);

    // 13. languageUsed: language_used -> languageUsed (also language)
    const languageUsed = (
        raw.languageUsed ||
        raw.language_used ||
        raw.language ||
        "English"
    ).toString().trim();

    // 14. assignedDoctor: doctor -> assignedDoctor (also assigned_doctor)
    const assignedDoctor = (
        raw.assignedDoctor ||
        raw.doctor ||
        raw.assigned_doctor ||
        ""
    ).toString().trim();

    // 15. arrivalTime: arrival_time -> arrivalTime
    const arrivalTime = raw.arrivalTime || raw.arrival_time || null;

    // 16. arrivalDate: arrival_date -> arrivalDate
    const arrivalDate = raw.arrivalDate || raw.arrival_date || null;

    // 17. patientUhid
    const patientUhid = raw.patientUhid || raw.uhid || null;

    return {
        patientUhid,
        patientName,
        age: parsedAge.valid ? parsedAge.value : rawAge,
        parsedAge,
        gender,
        accidentType,
        injuries,
        consciousness,
        severity,
        condition,
        triage,
        location,
        arrivalTime,
        arrivalDate,
        callerName,
        callerPhone,
        mlcCase,
        languageUsed,
        assignedDoctor,
        vapiCallId: raw.vapiCallId || raw.callId || raw.call_id || null,
    };
}

function validateRequiredFields(data) {
    const errors = [];
    if (!String(data.patientName || "").trim()) errors.push("patientName");
    if (!data.parsedAge || !data.parsedAge.valid) errors.push("age");
    if (!String(data.accidentType || "").trim()) errors.push("accidentType");
    if (!String(data.injuries || "").trim()) errors.push("injuries");
    if (!["CONSCIOUS", "UNCONSCIOUS", "UNKNOWN"].includes(data.consciousness)) errors.push("consciousness");
    if (!["CRITICAL", "MODERATE", "MINOR", "UNKNOWN"].includes(data.severity)) errors.push("severity");
    if (!String(data.location || "").trim()) errors.push("location");
    if (!String(data.callerName || "").trim()) errors.push("callerName");
    if (!String(data.callerPhone || "").trim()) errors.push("callerPhone");
    return errors;
}

function verifyVapiSecret(req, res, next) {
    const expectedSecret = process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SECRET;
    if (!expectedSecret) {
        return res.status(500).json({
            success: false,
            message: "Vapi webhook secret is not configured on the server",
        });
    }

    const providedSecret =
        req.headers["x-vapi-secret"] ||
        req.headers["x-api-key"] ||
        (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
            ? req.headers.authorization.substring(7).trim()
            : null) ||
        req.query.secret;

    if (!providedSecret || providedSecret !== expectedSecret) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized: Invalid or missing Vapi secret",
        });
    }

    next();
}

// Reusable emergency creation logic
async function createEmergencyCase(req, res) {
    try {
        const { payload, vapiToolCallId, vapiCallId } = extractVapiPayload(req.body, req);
        const data = normalizeEmergencyPayload({ ...payload, vapiCallId });
        const errors = validateRequiredFields(data);

        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: `Missing or invalid required fields: ${errors.join(", ")}`,
                fields: errors,
            });
        }

        // 1. Avoid creating duplicate emergency records on retries by call ID / idempotency key
        if (data.vapiCallId) {
            const existing = await Emergency.findOne({ vapiCallId: data.vapiCallId });
            if (existing) {
                const responseData = {
                    success: true,
                    message: "Emergency case already recorded (idempotent retry)",
                    emergency: existing,
                    isDuplicate: true,
                };
                if (vapiToolCallId) {
                    responseData.results = [
                        {
                            toolCallId: vapiToolCallId,
                            result: `Emergency case ${existing.emergencyId} is already recorded for patient ${existing.patientName}.`,
                        },
                    ];
                }
                return res.status(200).json(responseData);
            }
        }

        // 2. Avoid creating duplicate emergency records on rapid retries within 60 seconds
        const recentDuplicate = await Emergency.findOne({
            patientName: data.patientName,
            callerPhone: data.callerPhone,
            location: data.location,
            accidentType: data.accidentType,
            createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
        });

        if (recentDuplicate) {
            const responseData = {
                success: true,
                message: "Emergency case already recorded recently (duplicate retry prevented)",
                emergency: recentDuplicate,
                isDuplicate: true,
            };
            if (vapiToolCallId) {
                responseData.results = [
                    {
                        toolCallId: vapiToolCallId,
                        result: `Emergency case ${recentDuplicate.emergencyId} was already recorded recently for patient ${recentDuplicate.patientName}.`,
                    },
                ];
            }
            return res.status(200).json(responseData);
        }

        // 3. Generate a unique, human-readable emergency ID (preserves EMG-0001 format)
        let emergencyId;
        let attempts = 0;
        do {
            const count = await Emergency.countDocuments();
            emergencyId = `EMG-${String(count + 1 + attempts).padStart(4, "0")}`;
            attempts += 1;
        } while (await Emergency.exists({ emergencyId }));

        // 4. Save record through Mongoose
        const emergency = await Emergency.create({
            patientUhid: data.patientUhid,
            patientName: data.patientName,
            age: Number(data.age),
            gender: data.gender,
            accidentType: data.accidentType,
            injuries: data.injuries,
            consciousness: data.consciousness,
            severity: data.severity,
            condition: data.condition,
            triage: data.triage,
            location: data.location,
            arrivalTime: data.arrivalTime,
            arrivalDate: data.arrivalDate,
            callerName: data.callerName,
            callerPhone: data.callerPhone,
            mlcCase: data.mlcCase,
            languageUsed: data.languageUsed,
            assignedDoctor: data.assignedDoctor,
            vapiCallId: data.vapiCallId,
            emergencyId,
            status: "NEW",
        });

        // 5. Emit Socket.IO event AFTER successful database save
        try {
            const io = req.app?.get ? req.app.get("io") : null;
            if (io) {
                const payloadToEmit = emergency.toObject ? emergency.toObject() : emergency;
                io.emit("emergency:created", payloadToEmit);
                console.log(
                    `[Socket.IO] emergency:created emitted for ${emergency.emergencyId}`
                );
            }
        } catch (socketError) {
            // A realtime notification failure must not undo a saved emergency.
            console.error(
                "Socket.IO emergency:created emission failed:",
                socketError.message
            );
        }

        const responseData = {
            success: true,
            message: "Emergency case created successfully",
            emergency,
        };

        if (vapiToolCallId) {
            responseData.results = [
                {
                    toolCallId: vapiToolCallId,
                    result: `Emergency case ${emergency.emergencyId} registered successfully for patient ${emergency.patientName}.`,
                },
            ];
        }

        return res.status(201).json(responseData);
    } catch (error) {
        console.error("Creating emergency failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create emergency case",
            error: error.message,
        });
    }
}

// --------------------------------------------------------
// CREATE EMERGENCY CASE (Hospital UI / Standard API)
// --------------------------------------------------------
router.post("/", async (req, res) => {
    return createEmergencyCase(req, res);
});

// --------------------------------------------------------
// VAPI WEBHOOK ENDPOINTS (Protected by Vapi secret)
// --------------------------------------------------------
router.post("/vapi", verifyVapiSecret, async (req, res) => {
    return createEmergencyCase(req, res);
});

router.post("/webhook", verifyVapiSecret, async (req, res) => {
    return createEmergencyCase(req, res);
});

// --------------------------------------------------------
// GET ALL EMERGENCY CASES
// --------------------------------------------------------
router.get("/", async (_req, res) => {
    try {
        const emergencies = await Emergency.find().sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            count: emergencies.length,
            emergencies,
        });
    } catch (error) {
        console.error("Fetching emergencies failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch emergency cases",
        });
    }
});

// --------------------------------------------------------
// UPDATE EMERGENCY DETAILS
// --------------------------------------------------------
router.patch("/:emergencyId", async (req, res) => {
    try {
        const existing = await Emergency.findOne({
            emergencyId: req.params.emergencyId,
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Emergency case not found",
            });
        }

        const allowedFields = [
            "patientUhid",
            "patientName",
            "age",
            "gender",
            "accidentType",
            "injuries",
            "consciousness",
            "severity",
            "condition",
            "triage",
            "location",
            "arrivalTime",
            "arrivalDate",
            "callerName",
            "callerPhone",
            "mlcCase",
            "languageUsed",
            "assignedDoctor",
            "vapiCallId",
        ];

        const incoming = normalizeEmergencyPayload({
            ...existing.toObject(),
            ...req.body,
        });

        const updates = {};
        for (const field of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                updates[field] = incoming[field];
            }
        }

        // Re-normalize the merged existing record and requested updates before
        // validation. validateRequiredFields expects parsedAge, which is created
        // by normalizeEmergencyPayload; validating a raw Mongoose object caused
        // every partial PATCH (including an injury-only update) to fail on age.
        const candidate = normalizeEmergencyPayload({
            ...existing.toObject(),
            ...updates,
        });
        const errors = validateRequiredFields(candidate);
        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: `Missing or invalid required fields: ${errors.join(", ")}`,
                fields: errors,
            });
        }

        if (Object.prototype.hasOwnProperty.call(updates, "age")) {
            updates.age = Number(candidate.age);
        }
        if (Object.prototype.hasOwnProperty.call(updates, "mlcCase")) {
            updates.mlcCase = normalizeMlc(req.body.mlcCase !== undefined ? req.body.mlcCase : req.body.mlc);
        }

        Object.assign(existing, updates);
        await existing.save();

        try {
            const io = req.app?.get ? req.app.get("io") : null;
            if (io) {
                io.emit("emergency:updated", existing.toObject());
            }
        } catch (socketError) {
            console.error(
                "Socket.IO emergency:updated emission failed:",
                socketError.message
            );
        }

        return res.status(200).json({
            success: true,
            message: "Emergency case updated successfully",
            emergency: existing,
        });
    } catch (error) {
        console.error("Updating emergency case failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update emergency case",
            error: error.message,
        });
    }
});

// --------------------------------------------------------
// GET ONE EMERGENCY CASE
// --------------------------------------------------------
router.get("/:emergencyId", async (req, res) => {
    try {
        const emergency = await Emergency.findOne({
            emergencyId: req.params.emergencyId,
        });

        if (!emergency) {
            return res.status(404).json({
                success: false,
                message: "Emergency case not found",
            });
        }

        return res.status(200).json({ success: true, emergency });
    } catch (error) {
        console.error("Fetching emergency failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch emergency case",
        });
    }
});

// --------------------------------------------------------
// UPDATE EMERGENCY STATUS WITH TRANSITION VALIDATION
// --------------------------------------------------------
router.patch("/:emergencyId/status", async (req, res) => {
    try {
        const { status } = req.body;

        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Allowed statuses: NEW, ACKNOWLEDGED, ARRIVED, ADMITTED, CLOSED",
            });
        }

        const emergency = await Emergency.findOne({
            emergencyId: req.params.emergencyId,
        });

        if (!emergency) {
            return res.status(404).json({
                success: false,
                message: "Emergency case not found",
            });
        }

        const validNextStatuses = {
            NEW: ["ACKNOWLEDGED"],
            ACKNOWLEDGED: ["ARRIVED"],
            ARRIVED: ["ADMITTED"],
            ADMITTED: ["CLOSED"],
            CLOSED: [],
        };

        const currentStatus = emergency.status;
        if (
            status !== currentStatus &&
            !(validNextStatuses[currentStatus] || []).includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: `Invalid status transition: ${currentStatus} → ${status}`,
            });
        }

        emergency.status = status;
        await emergency.save();

        try {
            const io = req.app?.get ? req.app.get("io") : null;
            if (io) {
                io.emit("emergency:updated", emergency.toObject());
            }
        } catch (socketError) {
            console.error(
                "Socket.IO emergency:updated emission failed:",
                socketError.message
            );
        }

        return res.status(200).json({
            success: true,
            message: "Emergency status updated successfully",
            emergency,
        });
    } catch (error) {
        console.error("Updating emergency status failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update emergency status",
            error: error.message,
        });
    }
});

// Expose internal helpers for safe automated testing without live DB side-effects
router.normalizeEmergencyPayload = normalizeEmergencyPayload;
router.validateRequiredFields = validateRequiredFields;
router.parseAge = parseAge;
router.normalizeMlc = normalizeMlc;
router.normalizeGender = normalizeGender;
router.normalizeConsciousness = normalizeConsciousness;
router.normalizeSeverity = normalizeSeverity;
router.extractVapiPayload = extractVapiPayload;
router.verifyVapiSecret = verifyVapiSecret;
router.createEmergencyCase = createEmergencyCase;

module.exports = router;
