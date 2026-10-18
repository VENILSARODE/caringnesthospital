const express = require("express");
const mongoose = require("mongoose");

const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const Consultation = require("../models/Consultation");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| CREATE APPOINTMENT
|--------------------------------------------------------------------------
| POST /api/appointments
|
| The backend:
| 1. Verifies patient
| 2. Verifies doctor
| 3. Checks doctor availability
| 4. Checks daily capacity
| 5. Generates the next token
| 6. Creates the appointment
|--------------------------------------------------------------------------
*/

router.post("/", async (req, res) => {
    try {
        const {
            patientUhid,
            doctorId,
            appointmentDate,
            appointmentTime,
            visitType,
            reason,
            bookingSource,
        } = req.body;

        // Validate required fields
        if (
            !patientUhid ||
            !doctorId ||
            !appointmentDate ||
            !appointmentTime
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Patient UHID, doctor ID, appointment date and appointment time are required",
            });
        }

        // Find patient
        const patient = await Patient.findOne({
            uhid: patientUhid,
        });

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: "Patient not found",
            });
        }

        // Find doctor
        const doctor = await Doctor.findOne({
            doctorId: doctorId,
            isActive: true,
        });

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: "Active doctor not found",
            });
        }

        // Convert appointment date to Date object
        const requestedDate = new Date(`${appointmentDate}T00:00:00`);

        if (Number.isNaN(requestedDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid appointment date",
            });
        }

        // Get day of week
        const dayName = requestedDate.toLocaleDateString("en-US", {
            weekday: "long",
        });

        // Check doctor's working day
        if (!doctor.workingDays.includes(dayName)) {
            return res.status(400).json({
                success: false,
                message: `Doctor is not available on ${dayName}`,
            });
        }

        // Validate appointment time format
        const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

        if (!timePattern.test(appointmentTime)) {
            return res.status(400).json({
                success: false,
                message: "Appointment time must be in HH:MM format",
            });
        }

        // Convert time to minutes for comparison
        const [requestedHour, requestedMinute] =
            appointmentTime.split(":").map(Number);

        const [startHour, startMinute] =
            doctor.startTime.split(":").map(Number);

        const [endHour, endMinute] =
            doctor.endTime.split(":").map(Number);

        const requestedMinutes =
            requestedHour * 60 + requestedMinute;

        const startMinutes =
            startHour * 60 + startMinute;

        const endMinutes =
            endHour * 60 + endMinute;

        // Check doctor's working hours
        if (
            requestedMinutes < startMinutes ||
            requestedMinutes > endMinutes
        ) {
            return res.status(400).json({
                success: false,
                message: `Doctor is available only between ${doctor.startTime} and ${doctor.endTime}`,
            });
        }

        // Check how many appointments already exist
        const existingAppointments = await Appointment.countDocuments({
            doctorId: doctor.doctorId,
            appointmentDate: appointmentDate,
            status: {
                $in: ["BOOKED", "CONFIRMED"],
            },
        });

        // Check daily token capacity
        if (existingAppointments >= doctor.dailyTokenCapacity) {
            return res.status(400).json({
                success: false,
                message: "Daily token capacity has been reached",
            });
        }

        // Generate next token number
        const lastAppointment = await Appointment.findOne({
            doctorId: doctor.doctorId,
            appointmentDate: appointmentDate,
        }).sort({
            tokenNumber: -1,
        });

        const tokenNumber = lastAppointment
            ? lastAppointment.tokenNumber + 1
            : 1;

        // Generate appointment ID
        const appointmentCount = await Appointment.countDocuments();

        const appointmentId = `APT-${String(
            appointmentCount + 1
        ).padStart(6, "0")}`;

        // Prevent duplicate booking for same patient,
        // doctor and date
        const existingPatientAppointment =
            await Appointment.findOne({
                patientUhid,
                doctorId: doctor.doctorId,
                appointmentDate,
                status: {
                    $in: ["BOOKED", "CONFIRMED"],
                },
            });

        if (existingPatientAppointment) {
            return res.status(409).json({
                success: false,
                message:
                    "Patient already has an active appointment with this doctor on this date",
                appointment: existingPatientAppointment,
            });
        }

        // Create appointment
        const appointment = await Appointment.create({
            appointmentId,
            patientUhid,
            doctorId: doctor.doctorId,
            appointmentDate,
            tokenNumber,
            appointmentTime,
            visitType: visitType || "New Consultation",
            reason: reason || "",
            bookingSource: bookingSource || "Frontend",
            status: "BOOKED",
        });

        // Notify connected Caring Nest clients after the database save succeeds.
        try {
            const io = req.app.get("io");
            if (io) {
                io.emit("appointment:created", appointment.toObject());
                console.log(
                    `[Socket.IO] appointment:created emitted for ${appointment.appointmentId}`
                );
            }
        } catch (socketError) {
            // A realtime notification failure must not undo a saved appointment.
            console.error(
                "Socket.IO appointment:created emission failed:",
                socketError.message
            );
        }

        return res.status(201).json({
            success: true,
            message: "Appointment booked successfully",
            appointment,
        });
    } catch (error) {
        console.error(
            "Appointment booking failed:",
            error.message
        );

        // Handle MongoDB duplicate-key error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    "Duplicate appointment ID detected. Please try again.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Appointment booking failed",
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET ALL APPOINTMENTS
|--------------------------------------------------------------------------
| GET /api/appointments
|--------------------------------------------------------------------------
*/

router.get("/", async (req, res) => {
    try {
        const {
            date,
            doctorId,
            patientUhid,
            status,
        } = req.query;

        const filter = {};

        if (date) {
            filter.appointmentDate = date;
        }

        if (doctorId) {
            filter.doctorId = doctorId;
        }

        if (patientUhid) {
            filter.patientUhid = patientUhid;
        }

        if (status) {
            filter.status = status;
        }

        const appointments = await Appointment.find(filter).sort({
            appointmentDate: 1,
            tokenNumber: 1,
        });

        // Reconcile legacy records too: an appointment with a saved
        // consultation must not appear as Waiting just because its old
        // appointment status was never updated.
        const appointmentIds = appointments.map((item) => item.appointmentId);
        const consultations = appointmentIds.length
            ? await Consultation.find({
                appointmentId: { $in: appointmentIds },
            }).select("appointmentId status consultationId")
            : [];
        const consultationByAppointment = new Map(
            consultations.map((item) => [item.appointmentId, item])
        );

        const reconciledAppointments = appointments.map((item) => {
            const plain = item.toObject();
            const consultation = consultationByAppointment.get(item.appointmentId);
            if (consultation && !["CANCELLED"].includes(String(consultation.status || "").toUpperCase())) {
                plain.status = "COMPLETED";
                plain.consultationId = consultation.consultationId;
            }
            return plain;
        });

        return res.status(200).json({
            success: true,
            count: reconciledAppointments.length,
            appointments: reconciledAppointments,
        });
    } catch (error) {
        console.error(
            "Fetching appointments failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch appointments",
        });
    }
});

/*
|--------------------------------------------------------------------------
| GET ONE APPOINTMENT
|--------------------------------------------------------------------------
| GET /api/appointments/:appointmentId
|--------------------------------------------------------------------------
*/

router.get("/:appointmentId", async (req, res) => {
    try {
        const appointment = await Appointment.findOne({
            appointmentId: req.params.appointmentId,
        });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: "Appointment not found",
            });
        }

        return res.status(200).json({
            success: true,
            appointment,
        });
    } catch (error) {
        console.error(
            "Fetching appointment failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch appointment",
        });
    }
});

module.exports = router;