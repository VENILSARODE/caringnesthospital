const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
    {
        appointmentId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },

        patientUhid: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },

        doctorId: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },

        appointmentDate: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },

        tokenNumber: {
            type: Number,
            required: true,
            min: 1,
        },

        appointmentTime: {
            type: String,
            required: true,
            trim: true,
        },

        visitType: {
            type: String,
            enum: [
                "New Consultation",
                "Follow-up",
                "Emergency",
            ],
            default: "New Consultation",
        },

        reason: {
            type: String,
            trim: true,
            default: "",
        },

        bookingSource: {
            type: String,
            enum: [
                "Reception",
                "Voice Agent",
                "Frontend",
                "Admin",
            ],
            default: "Reception",
        },

        status: {
            type: String,
            enum: [
                "BOOKED",
                "CONFIRMED",
                "COMPLETED",
                "CANCELLED",
                "NO_SHOW",
            ],
            default: "BOOKED",
        },
    },
    {
        timestamps: true,
    }
);

/*
 * IMPORTANT:
 * A doctor cannot have the same token number
 * twice on the same appointment date.
 *
 * Example:
 *
 * DOC-0001 + 2026-09-21 + Token 10
 *
 * can exist only once.
 */
appointmentSchema.index(
    {
        doctorId: 1,
        appointmentDate: 1,
        tokenNumber: 1,
    },
    {
        unique: true,
    }
);

/*
 * Useful for finding a patient's appointments
 * for a particular date.
 */
appointmentSchema.index({
    patientUhid: 1,
    appointmentDate: 1,
});

module.exports = mongoose.model(
    "Appointment",
    appointmentSchema
);