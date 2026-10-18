const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
    {
        uhid: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        age: {
            type: Number,
            required: true,
            min: 0,
        },

        gender: {
            type: String,
            required: true,
            enum: ["Male", "Female", "Other"],
        },

        phone: {
            type: String,
            required: true,
            trim: true,
        },

        address: {
            type: String,
            trim: true,
        },

        emergencyContact: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Patient", patientSchema);