const express = require("express");

const Consultation = require("../models/Consultation");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const Medicine = require("../models/Medicine");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| DATE VALIDATION HELPER
|--------------------------------------------------------------------------
*/

const isValidDateString = (dateString) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
    }

    const [year, month, day] = dateString.split("-").map(Number);

    const date = new Date(
        Date.UTC(year, month - 1, day)
    );

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
};

/*
|--------------------------------------------------------------------------
| CREATE CONSULTATION
|--------------------------------------------------------------------------
| POST /api/consultations
|
| Flow:
| 1. Validate request
| 2. Find appointment
| 3. Verify patient
| 4. Verify doctor
| 5. Prevent duplicate consultation
| 6. Validate prescription
| 7. Verify prescription medicines against pharmacy inventory
| 8. Validate follow-up
| 9. Generate consultation ID
| 10. Store consultation in MongoDB
|--------------------------------------------------------------------------
*/

router.post("/", async (req, res) => {
    try {
        const {
            appointmentId,
            consultationDate,
            symptoms,
            diagnosis,
            clinicalNotes,
            prescription,
            followUpRequired,
            followUpDate,
            status,
        } = req.body;

        // ----------------------------------------------------
        // Validate required fields
        // ----------------------------------------------------

        if (
            !appointmentId ||
            !consultationDate ||
            !symptoms ||
            !diagnosis
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Appointment ID, consultation date, symptoms and diagnosis are required",
            });
        }

        // ----------------------------------------------------
        // Validate consultation date
        // ----------------------------------------------------

        if (!isValidDateString(consultationDate)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid consultation date. Use YYYY-MM-DD format",
            });
        }

        // ----------------------------------------------------
        // Find appointment
        // ----------------------------------------------------

        const appointment = await Appointment.findOne({
            appointmentId,
        });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found",
            });
        }

        // ----------------------------------------------------
        // Find patient linked to appointment
        // ----------------------------------------------------

        const patient = await Patient.findOne({
            uhid: appointment.patientUhid,
        });

        if (!patient) {
            return res.status(404).json({
                success: false,
                message:
                    "Patient linked to appointment was not found",
            });
        }

        // ----------------------------------------------------
        // Find doctor linked to appointment
        // ----------------------------------------------------

        const doctor = await Doctor.findOne({
            doctorId: appointment.doctorId,
        });

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message:
                    "Doctor linked to appointment was not found",
            });
        }

        // ----------------------------------------------------
        // Prevent duplicate consultation
        // ----------------------------------------------------

        const existingConsultation =
            await Consultation.findOne({
                appointmentId,
            });

        if (existingConsultation) {
            return res.status(409).json({
                success: false,
                message:
                    "A consultation already exists for this appointment",
                consultation: existingConsultation,
            });
        }

        // ----------------------------------------------------
        // Validate prescription array
        // ----------------------------------------------------

        if (
            prescription !== undefined &&
            !Array.isArray(prescription)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Prescription must be an array",
            });
        }

        // ----------------------------------------------------
        // Validate prescription items
        // ----------------------------------------------------

        let validatedPrescription = [];

        if (Array.isArray(prescription)) {
            for (const item of prescription) {
                // Medicine ID is required for pharmacy linkage
                if (!item.medicineId) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "medicineId is required for every prescription item",
                    });
                }

                // Basic prescription fields
                if (
                    !item.dosage ||
                    !item.frequency ||
                    !item.duration
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Each prescription must contain medicineId, dosage, frequency and duration",
                    });
                }

                // ------------------------------------------------
                // Verify medicine exists in pharmacy inventory
                // ------------------------------------------------

                const medicine =
                    await Medicine.findOne({
                        medicineId:
                            item.medicineId.trim(),
                        isActive: true,
                    });

                if (!medicine) {
                    return res.status(404).json({
                        success: false,
                        message:
                            `Medicine ${item.medicineId} was not found in active pharmacy inventory`,
                    });
                }

                // ------------------------------------------------
                // Validate quantity
                // ------------------------------------------------

                if (
                    item.quantity === undefined ||
                    item.quantity === null ||
                    item.quantity === ""
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            `Quantity is required for medicine ${medicine.medicineId}`,
                    });
                }

                const quantity = Number(
                    item.quantity
                );

                if (
                    !Number.isInteger(quantity) ||
                    quantity < 1
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            `Quantity for medicine ${medicine.medicineId} must be a positive integer`,
                    });
                }

                // ------------------------------------------------
                // Build validated prescription
                // ------------------------------------------------

                validatedPrescription.push({
                    medicineId:
                        medicine.medicineId,

                    // IMPORTANT:
                    // Medicine name comes from MongoDB inventory.
                    medicineName:
                        medicine.medicineName,

                    dosage:
                        item.dosage.trim(),

                    frequency:
                        item.frequency.trim(),

                    duration:
                        item.duration.trim(),

                    quantity,

                    instructions:
                        item.instructions?.trim() || "",

                    dispensingStatus: "PENDING",
                });
            }
        }

        // ----------------------------------------------------
        // Validate follow-up
        // ----------------------------------------------------

        if (
            followUpRequired === true &&
            !followUpDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Follow-up date is required when follow-up is marked as required",
            });
        }

        // ----------------------------------------------------
        // Validate follow-up date
        // ----------------------------------------------------

        if (followUpDate) {
            if (!isValidDateString(followUpDate)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid follow-up date. Use YYYY-MM-DD format",
                });
            }

            const consultationDateObject =
                new Date(
                    `${consultationDate}T00:00:00Z`
                );

            const followUpDateObject =
                new Date(
                    `${followUpDate}T00:00:00Z`
                );

            if (
                followUpDateObject <
                consultationDateObject
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Follow-up date cannot be earlier than consultation date",
                });
            }
        }

        // ----------------------------------------------------
        // Generate next consultation ID
        // ----------------------------------------------------

        const consultationCount =
            await Consultation.countDocuments();

        const consultationId = `CON-${String(
            consultationCount + 1
        ).padStart(6, "0")}`;

        /*
        |--------------------------------------------------------------------------
        | CREATE CONSULTATION
        |--------------------------------------------------------------------------
        |
        | patientUhid and doctorId come from the verified
        | appointment.
        |
        | Prescription medicines come from verified
        | pharmacy inventory.
        |--------------------------------------------------------------------------
        */

        const consultation =
            await Consultation.create({
                consultationId,
                appointmentId,
                patientUhid: patient.uhid,
                doctorId: doctor.doctorId,
                consultationDate,
                symptoms: symptoms.trim(),
                diagnosis: diagnosis.trim(),
                clinicalNotes: clinicalNotes || "",
                prescription: validatedPrescription,
                followUpRequired: followUpRequired === true,
                followUpDate: followUpRequired === true ? followUpDate : null,
                status: followUpRequired === true ? "FOLLOW_UP_REQUIRED" : "COMPLETED",
            });

        // Keep the appointment and consultation lifecycle in sync.
        // Only mark completed after the consultation record has been created.
        await Appointment.updateOne(
            { appointmentId },
            { $set: { status: "COMPLETED" } }
        );

        // Notify connected Caring Nest clients after the records are saved.
        try {
            const io = req.app.get("io");
            if (io) {
                io.emit("consultation:created", consultation.toObject());
                io.emit("appointment:updated", {
                    appointmentId: appointment.appointmentId,
                    status: "COMPLETED",
                    consultationId: consultation.consultationId,
                });
                console.log(
                    `[Socket.IO] consultation:created emitted for ${consultation.consultationId}`
                );
                console.log(
                    `[Socket.IO] appointment:updated emitted for ${appointment.appointmentId}`
                );
            }
        } catch (socketError) {
            // A realtime notification failure must not undo saved clinical records.
            console.error(
                "Socket.IO consultation event emission failed:",
                socketError.message
            );
        }

        return res.status(201).json({
            success: true,

            message:
                "Consultation recorded successfully",

            consultation,

            patient: {
                uhid: patient.uhid,
                name: patient.fullName,
            },

            doctor: {
                doctorId: doctor.doctorId,
                name: doctor.fullName,
            },

            appointment: {
                appointmentId:
                    appointment.appointmentId,

                tokenNumber:
                    appointment.tokenNumber,

                appointmentDate:
                    appointment.appointmentDate,

                appointmentTime:
                    appointment.appointmentTime,
            },
        });
    } catch (error) {
        console.error(
            "Consultation creation failed:",
            error
        );

        // ----------------------------------------------------
        // MongoDB duplicate-key error
        // ----------------------------------------------------

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    "Duplicate consultation detected. Please try again.",
            });
        }

        // ----------------------------------------------------
        // Mongoose validation error
        // ----------------------------------------------------

        if (
            error.name === "ValidationError"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Consultation validation failed",

                errors:
                    Object.values(
                        error.errors
                    ).map(
                        (err) =>
                            err.message
                    ),
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "Consultation creation failed",
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET ALL CONSULTATIONS
|--------------------------------------------------------------------------
| GET /api/consultations
|--------------------------------------------------------------------------
*/

router.get("/", async (req, res) => {
    try {
        const {
            appointmentId,
            date,
            status,
        } = req.query;

        const filter = {};

        if (appointmentId) {
            filter.appointmentId =
                appointmentId;
        }

        if (date) {
            filter.consultationDate =
                date;
        }

        if (status) {
            filter.status = status;
        }

        const consultations =
            await Consultation.find(
                filter
            ).sort({
                createdAt: -1,
            });

        return res.status(200).json({
            success: true,
            count: consultations.length,
            consultations,
        });
    } catch (error) {
        console.error(
            "Fetching consultations failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch consultations",
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET PATIENT CONSULTATION HISTORY
|--------------------------------------------------------------------------
| GET /api/consultations/patient/:patientUhid
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This route MUST come before /:consultationId
|--------------------------------------------------------------------------
*/

router.get(
    "/patient/:patientUhid",
    async (req, res) => {
        try {
            const patientUhid =
                req.params.patientUhid;

            // Verify patient exists
            const patient =
                await Patient.findOne({
                    uhid: patientUhid,
                });

            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Patient not found",
                });
            }

            // Find all appointments of patient
            const appointments =
                await Appointment.find({
                    patientUhid,
                }).select(
                    "appointmentId"
                );

            const appointmentIds =
                appointments.map(
                    (appointment) =>
                        appointment.appointmentId
                );

            // Find consultations linked
            // to those appointments
            const consultations =
                await Consultation.find({
                    appointmentId: {
                        $in: appointmentIds,
                    },
                }).sort({
                    consultationDate: -1,
                    createdAt: -1,
                });

            return res.status(200).json({
                success: true,

                patientUhid,

                patientName:
                    patient.fullName,

                count:
                    consultations.length,

                consultations,
            });
        } catch (error) {
            console.error(
                "Fetching patient consultation history failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch patient consultation history",
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| GET ONE CONSULTATION
|--------------------------------------------------------------------------
| GET /api/consultations/:consultationId
|--------------------------------------------------------------------------
*/

router.get(
    "/:consultationId",
    async (req, res) => {
        try {
            const consultation =
                await Consultation.findOne({
                    consultationId:
                        req.params.consultationId,
                });

            if (!consultation) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Consultation not found",
                });
            }

            return res.status(200).json({
                success: true,
                consultation,
            });
        } catch (error) {
            console.error(
                "Fetching consultation failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch consultation",
            });
        }
    }
);

module.exports = router;