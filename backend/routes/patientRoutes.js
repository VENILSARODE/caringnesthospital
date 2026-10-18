const express = require("express");

const Counter = require("../models/Counter");
const Patient = require("../models/Patient");

const {
    authenticate,
    authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ============================================================
// CREATE A NEW PATIENT
// ADMIN + FRONT_OFFICER only
// ============================================================
router.post(
    "/",
    authenticate,
    authorizeRoles("ADMIN", "FRONT_OFFICER"),
    async (req, res) => {
        try {
            const {
                fullName,
                age,
                gender,
                phone,
                address,
                emergencyContact,
            } = req.body;

            // -------------------------
            // Validate required fields
            // -------------------------
            if (
                !fullName ||
                age === undefined ||
                !gender ||
                !phone
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Full name, age, gender, and phone are required",
                });
            }

            // -------------------------
            // Validate age
            // -------------------------
            if (
                typeof age !== "number" ||
                !Number.isInteger(age) ||
                age < 0 ||
                age > 150
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Age must be a valid number between 0 and 150",
                });
            }

            // -------------------------
            // Clean input
            // -------------------------
            const cleanedFullName = fullName.trim();
            const cleanedPhone = String(phone).trim();

            if (!cleanedFullName) {
                return res.status(400).json({
                    success: false,
                    message: "Full name cannot be empty",
                });
            }

            if (!cleanedPhone) {
                return res.status(400).json({
                    success: false,
                    message: "Phone cannot be empty",
                });
            }

            // ==================================================
            // ATOMIC UHID COUNTER
            // ==================================================
            const counter = await Counter.findOneAndUpdate(
                { name: "patient" },
                { $inc: { sequence: 1 } },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true,
                }
            );

            const year = new Date().getFullYear();

            const uhid = `CNH-${year}-${String(
                counter.sequence
            ).padStart(6, "0")}`;

            // ==================================================
            // CREATE PATIENT IN MONGODB
            // ==================================================
            const patient = await Patient.create({
                uhid,
                fullName: cleanedFullName,
                age,
                gender,
                phone: cleanedPhone,
                address,
                emergencyContact,
            });

            // ==================================================
            // REAL-TIME PATIENT CREATED EVENT
            // ==================================================
            // MongoDB remains the source of truth. Socket.IO only
            // notifies connected hospital dashboards that the data
            // changed. The frontend will then reload from MongoDB.
            const io = req.app.get("io");

            if (io) {
                io.emit("patient:created", {
                    patient: {
                        uhid: patient.uhid,
                        fullName: patient.fullName,
                    },
                });

                console.log(
                    `[Socket.IO] patient:created emitted for ${patient.uhid}`
                );
            }

            // ==================================================
            // SUCCESS RESPONSE
            // ==================================================
            return res.status(201).json({
                success: true,
                message: "Patient registered successfully",
                patient,
            });
        } catch (error) {
            console.error(
                "Patient registration failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Patient registration failed",
            });
        }
    }
);

// ============================================================
// UPDATE AN EXISTING PATIENT
// PATCH /api/patients/:uhid
// ADMIN + FRONT_OFFICER only
// ============================================================
router.patch(
    "/:uhid",
    authenticate,
    authorizeRoles("ADMIN", "FRONT_OFFICER"),
    async (req, res) => {
        try {
            const { uhid } = req.params;
            const {
                fullName,
                age,
                gender,
                phone,
                address,
                emergencyContact,
            } = req.body;

            const patient = await Patient.findOne({ uhid });

            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found",
                });
            }

            if (fullName !== undefined) {
                if (typeof fullName !== "string" || !fullName.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: "Full name cannot be empty",
                    });
                }
                patient.fullName = fullName.trim();
            }

            if (age !== undefined) {
                if (!Number.isInteger(age) || age < 0 || age > 150) {
                    return res.status(400).json({
                        success: false,
                        message: "Age must be a whole number between 0 and 150",
                    });
                }
                patient.age = age;
            }

            if (gender !== undefined) {
                if (!["Male", "Female", "Other"].includes(gender)) {
                    return res.status(400).json({
                        success: false,
                        message: "Gender must be Male, Female, or Other",
                    });
                }
                patient.gender = gender;
            }

            if (phone !== undefined) {
                const cleanedPhone = String(phone).trim();
                if (!cleanedPhone) {
                    return res.status(400).json({
                        success: false,
                        message: "Phone cannot be empty",
                    });
                }
                patient.phone = cleanedPhone;
            }

            if (address !== undefined) {
                patient.address = String(address).trim();
            }

            if (emergencyContact !== undefined) {
                patient.emergencyContact = String(emergencyContact).trim();
            }

            await patient.save();

            const io = req.app.get("io");
            if (io) {
                io.emit("patient:updated", {
                    patient: {
                        uhid: patient.uhid,
                        fullName: patient.fullName,
                    },
                });
            }

            return res.status(200).json({
                success: true,
                message: "Patient updated successfully",
                patient,
            });
        } catch (error) {
            console.error("Patient update failed:", error.message);
            return res.status(500).json({
                success: false,
                message: "Patient update failed",
            });
        }
    }
);

// ============================================================
// GET ALL PATIENTS
// ADMIN + FRONT_OFFICER only
// ============================================================
router.get(
    "/",
    authenticate,
    authorizeRoles("ADMIN", "FRONT_OFFICER"),
    async (req, res) => {
        try {
            const patients = await Patient.find().sort({
                createdAt: -1,
            });

            return res.status(200).json({
                success: true,
                count: patients.length,
                patients,
            });
        } catch (error) {
            console.error(
                "Fetching patients failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Failed to fetch patients",
            });
        }
    }
);

module.exports = router;