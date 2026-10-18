const express = require("express");
const Medicine = require("../models/Medicine");
const Counter = require("../models/Counter");
const {
    authenticate,
    authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Helper: Generate Medicine ID
|--------------------------------------------------------------------------
| Medicine IDs are generated ONLY by the backend.
|
| MED-0001
| MED-0002
| MED-0003
|--------------------------------------------------------------------------
*/

const generateMedicineId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "medicine" },
        { $inc: { sequence: 1 } },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }
    );

    return `MED-${String(counter.sequence).padStart(4, "0")}`;
};

/*
|--------------------------------------------------------------------------
| GET ALL MEDICINES
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    authenticate,
    authorizeRoles("ADMIN", "PHARMACIST"),
    async (req, res) => {
        try {
            const medicines = await Medicine.find()
                .sort({ createdAt: -1 })
                .lean();

            return res.status(200).json({
                success: true,
                count: medicines.length,
                medicines,
            });
        } catch (error) {
            console.error("GET medicines error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch medicines",
                error: error.message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| GET LOW STOCK MEDICINES
|--------------------------------------------------------------------------
*/

router.get(
    "/low-stock",
    authenticate,
    authorizeRoles("ADMIN", "PHARMACIST"),
    async (req, res) => {
        try {
            const medicines = await Medicine.find({
                isActive: true,
                $expr: {
                    $lte: ["$quantity", "$reorderLevel"],
                },
            })
                .sort({ quantity: 1 })
                .lean();

            return res.status(200).json({
                success: true,
                count: medicines.length,
                medicines,
            });
        } catch (error) {
            console.error("GET low-stock medicines error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch low-stock medicines",
                error: error.message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| GET MEDICINE BY ID
|--------------------------------------------------------------------------
*/

router.get(
    "/:medicineId",
    authenticate,
    authorizeRoles("ADMIN", "PHARMACIST"),
    async (req, res) => {
        try {
            const medicine = await Medicine.findOne({
                medicineId: req.params.medicineId,
            }).lean();

            if (!medicine) {
                return res.status(404).json({
                    success: false,
                    message: "Medicine not found",
                });
            }

            return res.status(200).json({
                success: true,
                medicine,
            });
        } catch (error) {
            console.error("GET medicine error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch medicine",
                error: error.message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| CREATE MEDICINE
|--------------------------------------------------------------------------
| IMPORTANT:
| medicineId is NOT accepted from the frontend.
| The backend generates it automatically.
|--------------------------------------------------------------------------
*/

router.post(
    "/",
    authenticate,
    authorizeRoles("ADMIN", "PHARMACIST"),
    async (req, res) => {
        try {
            const {
                medicineName,
                genericName,
                category,
                batchNumber,
                expiryDate,
                quantity,
                reorderLevel,
                unitPrice,
                supplier,
            } = req.body;

            /*
            |--------------------------------------------------------------------------
            | Required field validation
            |--------------------------------------------------------------------------
            */

            if (
                !medicineName ||
                !batchNumber ||
                !expiryDate
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "medicineName, batchNumber and expiryDate are required",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Validate quantity
            |--------------------------------------------------------------------------
            */

            if (
                quantity === undefined ||
                quantity === null ||
                Number.isNaN(Number(quantity)) ||
                Number(quantity) < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "quantity must be a valid non-negative number",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Validate reorder level
            |--------------------------------------------------------------------------
            */

            if (
                reorderLevel === undefined ||
                reorderLevel === null ||
                Number.isNaN(Number(reorderLevel)) ||
                Number(reorderLevel) < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "reorderLevel must be a valid non-negative number",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Validate unit price
            |--------------------------------------------------------------------------
            */

            if (
                unitPrice === undefined ||
                unitPrice === null ||
                Number.isNaN(Number(unitPrice)) ||
                Number(unitPrice) < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "unitPrice must be a valid non-negative number",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Validate expiry date
            |--------------------------------------------------------------------------
            */

            const parsedExpiryDate = new Date(expiryDate);

            if (Number.isNaN(parsedExpiryDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "expiryDate must be a valid date",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Prevent duplicate batch
            |--------------------------------------------------------------------------
            */

            const existingMedicine = await Medicine.findOne({
                medicineName: medicineName.trim(),
                batchNumber: batchNumber.trim(),
            });

            if (existingMedicine) {
                return res.status(409).json({
                    success: false,
                    message:
                        "A medicine with the same medicine name and batch number already exists",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Generate Medicine ID on backend
            |--------------------------------------------------------------------------
            */

            const medicineId = await generateMedicineId();

            /*
            |--------------------------------------------------------------------------
            | Create medicine
            |--------------------------------------------------------------------------
            */

            const medicine = await Medicine.create({
                medicineId,
                medicineName: medicineName.trim(),
                genericName: genericName?.trim() || "",
                category: category?.trim() || "",
                batchNumber: batchNumber.trim(),
                expiryDate: parsedExpiryDate,
                quantity: Number(quantity),
                reorderLevel: Number(reorderLevel),
                unitPrice: Number(unitPrice),
                supplier: supplier?.trim() || "",
                isActive: true,
            });

            return res.status(201).json({
                success: true,
                message: "Medicine added successfully",
                medicine,
            });
        } catch (error) {
            console.error("CREATE medicine error:", error);

            /*
            |--------------------------------------------------------------------------
            | Handle duplicate medicine ID safely
            |--------------------------------------------------------------------------
            */

            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Duplicate medicine record detected. Please try again.",
                });
            }

            return res.status(500).json({
                success: false,
                message: "Failed to create medicine",
                error: error.message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| UPDATE MEDICINE
|--------------------------------------------------------------------------
*/

router.patch(
    "/:medicineId",
    authenticate,
    authorizeRoles("ADMIN", "PHARMACIST"),
    async (req, res) => {
        try {
            /*
            | Never allow frontend to change medicineId.
            */

            const updateData = { ...req.body };

            delete updateData.medicineId;
            delete updateData._id;
            delete updateData.createdAt;
            delete updateData.updatedAt;

            /*
            | Convert numeric fields
            */

            if (updateData.quantity !== undefined) {
                updateData.quantity = Number(updateData.quantity);
            }

            if (updateData.reorderLevel !== undefined) {
                updateData.reorderLevel = Number(updateData.reorderLevel);
            }

            if (updateData.unitPrice !== undefined) {
                updateData.unitPrice = Number(updateData.unitPrice);
            }

            /*
            | Convert expiry date
            */

            if (updateData.expiryDate !== undefined) {
                const parsedExpiryDate = new Date(updateData.expiryDate);

                if (Number.isNaN(parsedExpiryDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "expiryDate must be a valid date",
                    });
                }

                updateData.expiryDate = parsedExpiryDate;
            }

            /*
            | Trim string fields
            */

            const stringFields = [
                "medicineName",
                "genericName",
                "category",
                "batchNumber",
                "supplier",
            ];

            for (const field of stringFields) {
                if (updateData[field] !== undefined) {
                    updateData[field] = String(updateData[field]).trim();
                }
            }

            const medicine = await Medicine.findOneAndUpdate(
                {
                    medicineId: req.params.medicineId,
                },
                {
                    $set: updateData,
                },
                {
                    new: true,
                    runValidators: true,
                }
            ).lean();

            if (!medicine) {
                return res.status(404).json({
                    success: false,
                    message: "Medicine not found",
                });
            }

            return res.status(200).json({
                success: true,
                message: "Medicine updated successfully",
                medicine,
            });
        } catch (error) {
            console.error("UPDATE medicine error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to update medicine",
                error: error.message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| DELETE / DEACTIVATE MEDICINE
|--------------------------------------------------------------------------
| Soft delete only.
|--------------------------------------------------------------------------
*/

router.delete(
    "/:medicineId",
    authenticate,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {
            const medicine = await Medicine.findOneAndUpdate(
                {
                    medicineId: req.params.medicineId,
                },
                {
                    $set: {
                        isActive: false,
                    },
                },
                {
                    new: true,
                }
            ).lean();

            if (!medicine) {
                return res.status(404).json({
                    success: false,
                    message: "Medicine not found",
                });
            }

            return res.status(200).json({
                success: true,
                message: "Medicine deactivated successfully",
                medicine,
            });
        } catch (error) {
            console.error("DELETE medicine error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to deactivate medicine",
                error: error.message,
            });
        }
    }
);

module.exports = router;