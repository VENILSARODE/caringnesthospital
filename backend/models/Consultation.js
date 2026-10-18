const mongoose = require("mongoose");

const prescriptionSchema = new mongoose.Schema(
    {
        medicineId: {
            type: String,
            trim: true,
            default: "",
        },

        medicineName: {
            type: String,
            required: true,
            trim: true,
        },

        dosage: {
            type: String,
            required: true,
            trim: true,
        },

        frequency: {
            type: String,
            required: true,
            trim: true,
        },

        duration: {
            type: String,
            required: true,
            trim: true,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
            default: 1,
        },

        instructions: {
            type: String,
            trim: true,
            default: "",
        },

        dispensingStatus: {
            type: String,
            enum: ["PENDING", "DISPENSED"],
            default: "PENDING",
        },
    },
    { _id: false }
);

const consultationSchema = new mongoose.Schema(
    {
        consultationId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        appointmentId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        patientUhid: {
            type: String,
            required: true,
            index: true,
        },

        doctorId: {
            type: String,
            required: true,
            index: true,
        },

        consultationDate: {
            type: String,
            required: true,
        },

        symptoms: {
            type: String,
            required: true,
            trim: true,
        },

        diagnosis: {
            type: String,
            required: true,
            trim: true,
        },

        clinicalNotes: {
            type: String,
            trim: true,
            default: "",
        },

        prescription: {
            type: [prescriptionSchema],
            default: [],
        },

        followUpRequired: {
            type: Boolean,
            default: false,
        },

        followUpDate: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: [
                "COMPLETED",
                "FOLLOW_UP_REQUIRED",
                "CANCELLED",
            ],
            default: "COMPLETED",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "Consultation",
    consultationSchema
);