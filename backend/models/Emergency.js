const mongoose = require("mongoose");

const emergencySchema = new mongoose.Schema(
    {
        emergencyId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        patientUhid: {
            type: String,
            default: null,
            index: true,
        },

        patientName: {
            type: String,
            required: true,
            trim: true,
        },

        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
            default: "Other",
        },

        assignedDoctor: {
            type: String,
            default: "",
            trim: true,
        },

        condition: {
            type: String,
            default: "",
            trim: true,
        },

        triage: {
            type: String,
            default: "",
            trim: true,
        },

        age: {
            type: Number,
            required: true,
            min: 0,
        },

        accidentType: {
            type: String,
            required: true,
            trim: true,
        },

        injuries: {
            type: String,
            required: true,
            trim: true,
        },

        consciousness: {
            type: String,
            enum: [
                "CONSCIOUS",
                "UNCONSCIOUS",
                "UNKNOWN",
            ],
            required: true,
        },

        severity: {
            type: String,
            enum: [
                "CRITICAL",
                "MODERATE",
                "MINOR",
                "UNKNOWN",
            ],
            required: true,
        },

        location: {
            type: String,
            required: true,
            trim: true,
        },

        arrivalTime: {
            type: String,
            default: null,
        },

        arrivalDate: {
            type: String,
            default: null,
            trim: true,
        },

        vapiCallId: {
            type: String,
            default: null,
            index: true,
            sparse: true,
        },

        callerName: {
            type: String,
            required: true,
            trim: true,
        },

        callerPhone: {
            type: String,
            required: true,
            trim: true,
        },

        mlcCase: {
            type: Boolean,
            default: false,
        },

        languageUsed: {
            type: String,
            default: "English",
            trim: true,
        },

        status: {
            type: String,
            enum: [
                "NEW",
                "ACKNOWLEDGED",
                "ARRIVED",
                "ADMITTED",
                "CLOSED",
            ],
            default: "NEW",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "Emergency",
    emergencySchema
);