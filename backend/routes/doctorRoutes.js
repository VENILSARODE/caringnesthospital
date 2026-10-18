const express = require("express");

const Doctor = require("../models/Doctor");
const Counter = require("../models/Counter");

const {
    authenticate,
    authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

const ALLOWED_WORKING_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];

// ============================================================
// CREATE A NEW DOCTOR
// POST /api/doctors
//
// ADMIN only
// ============================================================
router.post(
    "/",
    authenticate,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {
            const {
                fullName,
                specialization,
                department,
                phone,
                workingDays,
                startTime,
                endTime,
                dailyTokenCapacity,
            } = req.body;

            // ------------------------------------------------
            // Validate required fields
            // ------------------------------------------------
            if (
                !fullName ||
                !specialization ||
                !department ||
                !phone ||
                !workingDays ||
                !startTime ||
                !endTime ||
                dailyTokenCapacity === undefined
            ) {
                return res.status(400).json({
                    success: false,
                    message: "All doctor details are required",
                });
            }

            // ------------------------------------------------
            // Clean required string fields
            // ------------------------------------------------
            const cleanedFullName = String(fullName).trim();
            const cleanedSpecialization =
                String(specialization).trim();
            const cleanedDepartment =
                String(department).trim();
            const cleanedPhone =
                String(phone).trim();

            if (
                !cleanedFullName ||
                !cleanedSpecialization ||
                !cleanedDepartment ||
                !cleanedPhone
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Doctor name, specialization, department and phone cannot be empty",
                });
            }

            // ------------------------------------------------
            // Validate working days
            // ------------------------------------------------
            if (
                !Array.isArray(workingDays) ||
                workingDays.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "At least one working day is required",
                });
            }

            const invalidWorkingDays =
                workingDays.filter(
                    (day) =>
                        !ALLOWED_WORKING_DAYS.includes(
                            day
                        )
                );

            if (
                invalidWorkingDays.length > 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid working day(s): ${invalidWorkingDays.join(
                        ", "
                    )}`,
                });
            }

            // ------------------------------------------------
            // Remove duplicate working days
            // ------------------------------------------------
            const uniqueWorkingDays = [
                ...new Set(workingDays),
            ];

            // ------------------------------------------------
            // Validate token capacity
            // ------------------------------------------------
            const tokenCapacity =
                Number(dailyTokenCapacity);

            if (
                !Number.isInteger(
                    tokenCapacity
                ) ||
                tokenCapacity < 1
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Daily token capacity must be a positive integer",
                });
            }

            // ------------------------------------------------
            // Validate time format HH:MM
            // ------------------------------------------------
            const timeRegex =
                /^([01]\d|2[0-3]):([0-5]\d)$/;

            if (
                !timeRegex.test(startTime) ||
                !timeRegex.test(endTime)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Start time and end time must use HH:MM format",
                });
            }

            // ------------------------------------------------
            // Make sure end time is after start time
            // ------------------------------------------------
            if (startTime >= endTime) {
                return res.status(400).json({
                    success: false,
                    message:
                        "End time must be later than start time",
                });
            }

            // =================================================
            // ATOMIC DOCTOR ID COUNTER
            // =================================================

            const counter =
                await Counter.findOneAndUpdate(
                    {
                        name: "doctor",
                    },
                    {
                        $inc: {
                            sequence: 1,
                        },
                    },
                    {
                        new: true,
                        upsert: true,
                        setDefaultsOnInsert: true,
                    }
                );

            const doctorId =
                `DOC-${String(
                    counter.sequence
                ).padStart(4, "0")}`;

            // =================================================
            // CREATE DOCTOR IN MONGODB
            // =================================================

            const doctor =
                await Doctor.create({
                    doctorId,
                    fullName:
                        cleanedFullName,
                    specialization:
                        cleanedSpecialization,
                    department:
                        cleanedDepartment,
                    phone:
                        cleanedPhone,
                    workingDays:
                        uniqueWorkingDays,
                    startTime,
                    endTime,
                    dailyTokenCapacity:
                        tokenCapacity,
                });

            // =================================================
            // REAL-TIME DOCTOR EVENT
            // =================================================
            // server.js exposes Socket.IO through req.app.get("io").
            // Emit only after MongoDB creation succeeds.
            const io = req.app.get("io");

            if (io) {
                io.emit("doctor:created", {
                    doctor,
                });
            }

            // =================================================
            // SUCCESS RESPONSE
            // =================================================

            return res.status(201).json({
                success: true,
                message:
                    "Doctor registered successfully",
                doctor,
            });
        } catch (error) {
            console.error(
                "Doctor registration failed:",
                error.message
            );

            // Handle duplicate doctor ID
            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Doctor ID already exists. Please try again.",
                });
            }

            return res.status(500).json({
                success: false,
                message:
                    "Doctor registration failed",
            });
        }
    }
);

// ============================================================
// GET ALL DOCTORS
// GET /api/doctors
//
// ADMIN + FRONT_OFFICER
// ============================================================
router.get(
    "/",
    authenticate,
    authorizeRoles(
        "ADMIN",
        "FRONT_OFFICER"
    ),
    async (req, res) => {
        try {
            const doctors =
                await Doctor.find().sort({
                    createdAt: -1,
                });

            return res.status(200).json({
                success: true,
                count: doctors.length,
                doctors,
            });
        } catch (error) {
            console.error(
                "Fetching doctors failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch doctors",
            });
        }
    }
);

// ============================================================
// UPDATE DOCTOR
// PATCH /api/doctors/:doctorId
//
// ADMIN only
//
// IMPORTANT:
// This route fixes the 404 error from the Availability toggle.
// The frontend api.ts sends:
// PATCH /api/doctors/:doctorId
//
// The most common use is:
// {
//     isActive: false
// }
//
// It also supports updating the other doctor fields.
// ============================================================
router.patch(
    "/:doctorId",
    authenticate,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {
            const {
                doctorId,
            } = req.params;

            const doctor =
                await Doctor.findOne({
                    doctorId,
                });

            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Doctor not found",
                });
            }

            const {
                fullName,
                specialization,
                department,
                phone,
                workingDays,
                startTime,
                endTime,
                dailyTokenCapacity,
                isActive,
            } = req.body;

            // ------------------------------------------------
            // Update full name
            // ------------------------------------------------
            if (
                fullName !== undefined
            ) {
                const value =
                    String(
                        fullName
                    ).trim();

                if (!value) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Doctor name cannot be empty",
                    });
                }

                doctor.fullName =
                    value;
            }

            // ------------------------------------------------
            // Update specialization
            // ------------------------------------------------
            if (
                specialization !==
                undefined
            ) {
                const value =
                    String(
                        specialization
                    ).trim();

                if (!value) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Specialization cannot be empty",
                    });
                }

                doctor.specialization =
                    value;
            }

            // ------------------------------------------------
            // Update department
            // ------------------------------------------------
            if (
                department !==
                undefined
            ) {
                const value =
                    String(
                        department
                    ).trim();

                if (!value) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Department cannot be empty",
                    });
                }

                doctor.department =
                    value;
            }

            // ------------------------------------------------
            // Update phone
            // ------------------------------------------------
            if (
                phone !== undefined
            ) {
                const value =
                    String(
                        phone
                    ).trim();

                if (!value) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Phone cannot be empty",
                    });
                }

                doctor.phone =
                    value;
            }

            // ------------------------------------------------
            // Update working days
            // ------------------------------------------------
            if (
                workingDays !==
                undefined
            ) {
                if (
                    !Array.isArray(
                        workingDays
                    ) ||
                    workingDays.length ===
                    0
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "At least one working day is required",
                    });
                }

                const invalidWorkingDays =
                    workingDays.filter(
                        (day) =>
                            !ALLOWED_WORKING_DAYS.includes(
                                day
                            )
                    );

                if (
                    invalidWorkingDays.length >
                    0
                ) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid working day(s): ${invalidWorkingDays.join(
                            ", "
                        )}`,
                    });
                }

                doctor.workingDays =
                    [
                        ...new Set(
                            workingDays
                        ),
                    ];
            }

            // ------------------------------------------------
            // Validate/update start time
            // ------------------------------------------------
            const timeRegex =
                /^([01]\d|2[0-3]):([0-5]\d)$/;

            if (
                startTime !==
                undefined
            ) {
                if (
                    !timeRegex.test(
                        String(
                            startTime
                        )
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Start time must use HH:MM format",
                    });
                }

                doctor.startTime =
                    String(
                        startTime
                    );
            }

            // ------------------------------------------------
            // Validate/update end time
            // ------------------------------------------------
            if (
                endTime !==
                undefined
            ) {
                if (
                    !timeRegex.test(
                        String(
                            endTime
                        )
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "End time must use HH:MM format",
                    });
                }

                doctor.endTime =
                    String(
                        endTime
                    );
            }

            // ------------------------------------------------
            // Make sure end time is later
            // than start time
            // ------------------------------------------------
            if (
                doctor.startTime >=
                doctor.endTime
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "End time must be later than start time",
                });
            }

            // ------------------------------------------------
            // Update daily token capacity
            // ------------------------------------------------
            if (
                dailyTokenCapacity !==
                undefined
            ) {
                const tokenCapacity =
                    Number(
                        dailyTokenCapacity
                    );

                if (
                    !Number.isInteger(
                        tokenCapacity
                    ) ||
                    tokenCapacity < 1
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Daily token capacity must be a positive integer",
                    });
                }

                doctor.dailyTokenCapacity =
                    tokenCapacity;
            }

            // ------------------------------------------------
            // Update availability
            // ------------------------------------------------
            if (
                isActive !==
                undefined
            ) {
                if (
                    typeof isActive !==
                    "boolean"
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "isActive must be a boolean",
                    });
                }

                doctor.isActive =
                    isActive;
            }

            // ------------------------------------------------
            // Save changes to MongoDB
            // ------------------------------------------------
            await doctor.save();

            // ------------------------------------------------
            // REAL-TIME DOCTOR UPDATE
            // ------------------------------------------------
            const io = req.app.get("io");

            if (io) {
                io.emit("doctor:updated", {
                    doctor,
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Doctor updated successfully",
                doctor,
            });
        } catch (error) {
            console.error(
                "Doctor update failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Doctor update failed",
            });
        }
    }
);

// ============================================================
// DELETE / DEACTIVATE DOCTOR
// DELETE /api/doctors/:doctorId
//
// ADMIN only
//
// IMPORTANT:
// This is a SOFT DELETE.
// The doctor remains in MongoDB so historical
// appointment/consultation references are preserved.
//
// It changes:
// isActive = false
// ============================================================
router.delete(
    "/:doctorId",
    authenticate,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {
            const {
                doctorId,
            } = req.params;

            const doctor =
                await Doctor.findOne({
                    doctorId,
                });

            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Doctor not found",
                });
            }

            doctor.isActive =
                false;

            await doctor.save();

            // ------------------------------------------------
            // REAL-TIME DOCTOR DEACTIVATION
            // ------------------------------------------------
            const io = req.app.get("io");

            if (io) {
                io.emit("doctor:deactivated", {
                    doctor,
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Doctor deactivated successfully",
                doctor,
            });
        } catch (error) {
            console.error(
                "Doctor deactivation failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Doctor deactivation failed",
            });
        }
    }
);

// ============================================================
// CHECK DOCTOR AVAILABILITY
//
// GET /api/doctors/:doctorId/availability?date=YYYY-MM-DD
//
// ADMIN + FRONT_OFFICER
// ============================================================
router.get(
    "/:doctorId/availability",
    authenticate,
    authorizeRoles(
        "ADMIN",
        "FRONT_OFFICER"
    ),
    async (req, res) => {
        try {
            const {
                doctorId,
            } = req.params;

            const {
                date,
            } = req.query;

            // ------------------------------------------------
            // Date is required
            // ------------------------------------------------
            if (!date) {
                return res.status(400).json({
                    success: false,
                    message:
                        "date query parameter is required in YYYY-MM-DD format",
                });
            }

            // ------------------------------------------------
            // Validate YYYY-MM-DD format
            // ------------------------------------------------
            if (
                !/^\d{4}-\d{2}-\d{2}$/.test(
                    date
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid date format. Use YYYY-MM-DD",
                });
            }

            const [
                year,
                month,
                day,
            ] =
                date
                    .split("-")
                    .map(
                        Number
                    );

            // ------------------------------------------------
            // Validate actual calendar date
            // ------------------------------------------------
            const selectedDate =
                new Date(
                    year,
                    month - 1,
                    day
                );

            if (
                selectedDate.getFullYear() !==
                year ||
                selectedDate.getMonth() !==
                month - 1 ||
                selectedDate.getDate() !==
                day
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid calendar date",
                });
            }

            // ------------------------------------------------
            // Find doctor
            // ------------------------------------------------
            const doctor =
                await Doctor.findOne({
                    doctorId,
                });

            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Doctor not found",
                });
            }

            // ------------------------------------------------
            // Check doctor active status
            // ------------------------------------------------
            if (
                !doctor.isActive
            ) {
                return res.status(200).json({
                    success: true,
                    available: false,
                    date,
                    day: selectedDate.toLocaleDateString(
                        "en-US",
                        {
                            weekday:
                                "long",
                        }
                    ),
                    doctor: {
                        doctorId:
                            doctor.doctorId,
                        fullName:
                            doctor.fullName,
                        specialization:
                            doctor.specialization,
                        department:
                            doctor.department,
                    },
                    schedule: {
                        workingDay:
                            false,
                        startTime:
                            doctor.startTime,
                        endTime:
                            doctor.endTime,
                        dailyTokenCapacity:
                            doctor.dailyTokenCapacity,
                    },
                    message:
                        "Doctor is inactive",
                });
            }

            // ------------------------------------------------
            // Get weekday
            // ------------------------------------------------
            const dayName =
                selectedDate.toLocaleDateString(
                    "en-US",
                    {
                        weekday:
                            "long",
                    }
                );

            // ------------------------------------------------
            // Check working day
            // ------------------------------------------------
            const isWorkingDay =
                doctor.workingDays.includes(
                    dayName
                );

            return res.status(200).json({
                success: true,
                available:
                    isWorkingDay,
                date,
                day:
                    dayName,
                doctor: {
                    doctorId:
                        doctor.doctorId,
                    fullName:
                        doctor.fullName,
                    specialization:
                        doctor.specialization,
                    department:
                        doctor.department,
                },
                schedule: {
                    workingDay:
                        isWorkingDay,
                    startTime:
                        doctor.startTime,
                    endTime:
                        doctor.endTime,
                    dailyTokenCapacity:
                        doctor.dailyTokenCapacity,
                },
                message:
                    isWorkingDay
                        ? "Doctor is available on this working day"
                        : "Doctor is not working on this day",
            });
        } catch (error) {
            console.error(
                "Checking doctor availability failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to check doctor availability",
            });
        }
    }
);

// ============================================================
// GET ONE DOCTOR
// GET /api/doctors/:doctorId
//
// ADMIN + FRONT_OFFICER
// ============================================================
router.get(
    "/:doctorId",
    authenticate,
    authorizeRoles(
        "ADMIN",
        "FRONT_OFFICER"
    ),
    async (req, res) => {
        try {
            const doctor =
                await Doctor.findOne({
                    doctorId:
                        req.params.doctorId,
                });

            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Doctor not found",
                });
            }

            return res.status(200).json({
                success: true,
                doctor,
            });
        } catch (error) {
            console.error(
                "Fetching doctor failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch doctor",
            });
        }
    }
);

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;