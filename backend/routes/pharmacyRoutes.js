const express = require("express");
const mongoose = require("mongoose");

const Consultation = require("../models/Consultation");
const Medicine = require("../models/Medicine");

const {
    authenticate,
    authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

const pharmacyRoles = [
    "ADMIN",
    "PHARMACIST",
];

/*
|--------------------------------------------------------------------------
| GET PENDING PRESCRIPTIONS
|--------------------------------------------------------------------------
| GET /api/pharmacy/pending-prescriptions
|
| Returns consultation prescriptions that are still waiting
| to be dispensed.
|--------------------------------------------------------------------------
*/

router.get(
    "/pending-prescriptions",
    authenticate,
    authorizeRoles(...pharmacyRoles),
    async (req, res) => {
        try {
            const consultations =
                await Consultation.find({
                    "prescription.dispensingStatus":
                        "PENDING",
                }).sort({
                    consultationDate: -1,
                    createdAt: -1,
                });

            const pendingPrescriptions = [];

            for (const consultation of consultations) {
                for (
                    let index = 0;
                    index <
                    consultation.prescription.length;
                    index++
                ) {
                    const prescription =
                        consultation.prescription[index];

                    if (
                        prescription.dispensingStatus ===
                        "PENDING"
                    ) {
                        pendingPrescriptions.push({
                            consultationId:
                                consultation.consultationId,

                            appointmentId:
                                consultation.appointmentId,

                            patientUhid:
                                consultation.patientUhid,

                            doctorId:
                                consultation.doctorId,

                            consultationDate:
                                consultation.consultationDate,

                            prescriptionIndex:
                                index,

                            medicineId:
                                prescription.medicineId,

                            medicineName:
                                prescription.medicineName,

                            dosage:
                                prescription.dosage,

                            frequency:
                                prescription.frequency,

                            duration:
                                prescription.duration,

                            quantity:
                                prescription.quantity,

                            instructions:
                                prescription.instructions,

                            dispensingStatus:
                                prescription.dispensingStatus,
                        });
                    }
                }
            }

            return res.status(200).json({
                success: true,
                count:
                    pendingPrescriptions.length,
                prescriptions:
                    pendingPrescriptions,
            });
        } catch (error) {
            console.error(
                "Fetching pending prescriptions failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch pending prescriptions",
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| DISPENSE MEDICINE
|--------------------------------------------------------------------------
| POST /api/pharmacy/dispense
|
| Body:
|
| {
|   "consultationId": "CON-000003",
|   "prescriptionIndex": 0
| }
|
| The quantity is taken from the stored prescription.
| The client cannot choose a different quantity.
|--------------------------------------------------------------------------
*/

router.post(
    "/dispense",
    authenticate,
    authorizeRoles(...pharmacyRoles),
    async (req, res) => {
        const session =
            await mongoose.startSession();

        try {
            const {
                consultationId,
                prescriptionIndex,
            } = req.body;

            // ------------------------------------------------
            // Validate request
            // ------------------------------------------------

            if (
                !consultationId ||
                prescriptionIndex === undefined
            ) {
                await session.endSession();

                return res.status(400).json({
                    success: false,
                    message:
                        "consultationId and prescriptionIndex are required",
                });
            }

            if (
                !Number.isInteger(
                    Number(prescriptionIndex)
                ) ||
                Number(prescriptionIndex) < 0
            ) {
                await session.endSession();

                return res.status(400).json({
                    success: false,
                    message:
                        "prescriptionIndex must be a non-negative integer",
                });
            }

            const index = Number(
                prescriptionIndex
            );

            // ------------------------------------------------
            // Start MongoDB transaction
            // ------------------------------------------------

            session.startTransaction();

            // ------------------------------------------------
            // Find consultation
            // ------------------------------------------------

            const consultation =
                await Consultation.findOne({
                    consultationId,
                }).session(session);

            if (!consultation) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(404).json({
                    success: false,
                    message:
                        "Consultation not found",
                });
            }

            // ------------------------------------------------
            // Validate prescription index
            // ------------------------------------------------

            if (
                index >=
                consultation.prescription.length
            ) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid prescription index",
                });
            }

            const prescription =
                consultation.prescription[index];

            // ------------------------------------------------
            // Prevent double dispensing
            // ------------------------------------------------

            if (
                prescription.dispensingStatus ===
                "DISPENSED"
            ) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(409).json({
                    success: false,
                    message:
                        "This prescription has already been dispensed",
                });
            }

            // ------------------------------------------------
            // Validate medicine ID
            // ------------------------------------------------

            if (!prescription.medicineId) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(400).json({
                    success: false,
                    message:
                        "Prescription is not linked to a pharmacy medicine",
                });
            }

            // ------------------------------------------------
            // Find medicine
            // ------------------------------------------------

            const medicine =
                await Medicine.findOne({
                    medicineId:
                        prescription.medicineId,
                    isActive: true,
                }).session(session);

            if (!medicine) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(404).json({
                    success: false,
                    message:
                        "Medicine not found in active pharmacy inventory",
                });
            }

            // ------------------------------------------------
            // Reject expired medicines
            // ------------------------------------------------
            // Medicine cannot be dispensed if its expiry date
            // is before today's date.
            // Date comparison is performed using UTC midnight
            // to avoid timezone-related inconsistencies.
            // ------------------------------------------------

            const today = new Date();
            today.setUTCHours(
                0,
                0,
                0,
                0
            );

            const medicineExpiryDate =
                new Date(medicine.expiryDate);

            medicineExpiryDate.setUTCHours(
                0,
                0,
                0,
                0
            );

            if (
                medicineExpiryDate < today
            ) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(409).json({
                    success: false,
                    message:
                        "Medicine has expired and cannot be dispensed",
                    medicine: {
                        medicineId:
                            medicine.medicineId,

                        medicineName:
                            medicine.medicineName,

                        expiryDate:
                            medicine.expiryDate,
                    },
                });
            }

            // ------------------------------------------------
            // Validate prescribed quantity
            // ------------------------------------------------

            const prescribedQuantity =
                Number(
                    prescription.quantity
                );

            if (
                !Number.isInteger(
                    prescribedQuantity
                ) ||
                prescribedQuantity < 1
            ) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid prescribed quantity",
                });
            }

            // ------------------------------------------------
            // Check stock
            // ------------------------------------------------

            if (
                medicine.quantity <
                prescribedQuantity
            ) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(409).json({
                    success: false,
                    message:
                        "Insufficient medicine stock",
                    medicine: {
                        medicineId:
                            medicine.medicineId,

                        medicineName:
                            medicine.medicineName,

                        availableQuantity:
                            medicine.quantity,

                        requiredQuantity:
                            prescribedQuantity,
                    },
                });
            }

            // ------------------------------------------------
            // Reduce medicine stock atomically
            // ------------------------------------------------

            const updatedMedicine =
                await Medicine.findOneAndUpdate(
                    {
                        medicineId:
                            medicine.medicineId,

                        isActive: true,

                        quantity: {
                            $gte:
                                prescribedQuantity,
                        },
                    },
                    {
                        $inc: {
                            quantity:
                                -prescribedQuantity,
                        },
                    },
                    {
                        new: true,
                        session,
                        runValidators: true,
                    }
                );

            if (!updatedMedicine) {
                await session.abortTransaction();
                await session.endSession();

                return res.status(409).json({
                    success: false,
                    message:
                        "Medicine stock changed before dispensing. Please try again.",
                });
            }

            // ------------------------------------------------
            // Mark prescription as DISPENSED
            // ------------------------------------------------

            consultation.prescription[
                index
            ].dispensingStatus =
                "DISPENSED";

            await consultation.save({
                session,
            });

            // ------------------------------------------------
            // Commit transaction
            // ------------------------------------------------

            await session.commitTransaction();
            await session.endSession();

            return res.status(200).json({
                success: true,

                message:
                    "Medicine dispensed successfully",

                dispensing: {
                    consultationId:
                        consultation.consultationId,

                    appointmentId:
                        consultation.appointmentId,

                    patientUhid:
                        consultation.patientUhid,

                    medicineId:
                        updatedMedicine.medicineId,

                    medicineName:
                        updatedMedicine.medicineName,

                    quantityDispensed:
                        prescribedQuantity,

                    remainingStock:
                        updatedMedicine.quantity,

                    dispensingStatus:
                        "DISPENSED",
                },
            });
        } catch (error) {
            try {
                await session.abortTransaction();
            } catch (transactionError) {
                console.error(
                    "Transaction rollback failed:",
                    transactionError.message
                );
            }

            await session.endSession();

            console.error(
                "Medicine dispensing failed:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Medicine dispensing failed",
            });
        }
    }
);

module.exports = router;