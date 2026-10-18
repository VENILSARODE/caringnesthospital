const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const {
    authenticate,
    authorizeRoles,
} = require("../middleware/authMiddleware");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        "JWT_SECRET is missing from environment variables"
    );
}

// ==================================================
// HOSPITAL STAFF ROLES
// ==================================================

const ALL_ROLES = [
    "ADMIN",
    "FRONT_OFFICER",
    "PHARMACIST",
];

// Roles allowed for normal/self registration
const SELF_REGISTER_ROLES = [
    "FRONT_OFFICER",
    "PHARMACIST",
];

// ==================================================
// HELPER — CREATE USER
// ==================================================

const createStaffUser = async ({
    fullName,
    email,
    password,
    role,
}) => {
    const normalizedEmail = email
        .trim()
        .toLowerCase();

    // Check existing user
    const existingUser = await User.findOne({
        email: normalizedEmail,
    });

    if (existingUser) {
        const error = new Error(
            "User with this email already exists"
        );

        error.statusCode = 409;

        throw error;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
        password,
        12
    );

    // Create user
    const user = await User.create({
        fullName: fullName.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
    });

    return user;
};

// ==================================================
// REGISTER — FRONT OFFICER / PHARMACIST
// ==================================================
//
// ADMIN CANNOT BE CREATED THROUGH THIS ROUTE.
//
// POST /api/auth/register
// ==================================================

router.post("/register", async (req, res) => {
    try {
        const {
            fullName,
            email,
            password,
            role,
        } = req.body;

        // Validate required fields
        if (
            !fullName ||
            !email ||
            !password ||
            !role
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "fullName, email, password and role are required",
            });
        }

        // Only Front Officer and Pharmacist
        // can use normal registration.
        if (!SELF_REGISTER_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid role. ADMIN accounts must be created by an authenticated ADMIN.",
            });
        }

        // Basic password validation
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message:
                    "Password must contain at least 6 characters",
            });
        }

        const user = await createStaffUser({
            fullName,
            email,
            password,
            role,
        });

        return res.status(201).json({
            success: true,
            message:
                "User registered successfully",
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
            },
        });
    } catch (error) {
        console.error(
            "User registration failed:",
            error.message
        );

        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message: error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message: "User registration failed",
        });
    }
});

// ==================================================
// ADMIN — CREATE HOSPITAL STAFF
// ==================================================
//
// Only an authenticated ADMIN can create users
// through this route.
//
// POST /api/auth/admin/register
//
// This route can create:
// ADMIN
// FRONT_OFFICER
// PHARMACIST
// ==================================================

router.post(
    "/admin/register",
    authenticate,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {
            const {
                fullName,
                email,
                password,
                role,
            } = req.body;

            // Validate required fields
            if (
                !fullName ||
                !email ||
                !password ||
                !role
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "fullName, email, password and role are required",
                });
            }

            // Validate role
            if (!ALL_ROLES.includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid role",
                });
            }

            // Basic password validation
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Password must contain at least 6 characters",
                });
            }

            const user = await createStaffUser({
                fullName,
                email,
                password,
                role,
            });

            return res.status(201).json({
                success: true,
                message:
                    "Hospital staff user created successfully",
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive,
                },
            });
        } catch (error) {
            console.error(
                "Admin user creation failed:",
                error.message
            );

            if (error.statusCode) {
                return res
                    .status(error.statusCode)
                    .json({
                        success: false,
                        message: error.message,
                    });
            }

            return res.status(500).json({
                success: false,
                message:
                    "Hospital staff user creation failed",
            });
        }
    }
);

// ==================================================
// LOGIN HOSPITAL STAFF USER
// ==================================================
//
// POST /api/auth/login
// ==================================================

router.post("/login", async (req, res) => {
    try {
        const {
            email,
            password,
        } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "Email and password are required",
            });
        }

        // Normalize email
        const normalizedEmail = email
            .trim()
            .toLowerCase();

        // Find user
        const user = await User.findOne({
            email: normalizedEmail,
        });

        // Do not reveal whether email exists
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message:
                    "Invalid email or password",
            });
        }

        // Verify password
        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message:
                    "Invalid email or password",
            });
        }

        // Generate JWT
        const token = jwt.sign(
            {
                userId: user._id.toString(),
                role: user.role,
            },
            JWT_SECRET,
            {
                expiresIn: "8h",
            }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
            },
        });
    } catch (error) {
        console.error(
            "User login failed:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
});

// ==================================================
// GET CURRENTLY AUTHENTICATED USER
// ==================================================
//
// GET /api/auth/me
// Header:
// Authorization: Bearer <JWT>
// ==================================================

router.get(
    "/me",
    authenticate,
    async (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "Authenticated user retrieved successfully",
            user: {
                id: req.user._id,
                fullName: req.user.fullName,
                email: req.user.email,
                role: req.user.role,
                isActive: req.user.isActive,
            },
        });
    }
);

// ==================================================
// RBAC TEST ROUTES
// ==================================================
//
// These routes verify that backend role protection
// actually works.
// ==================================================

// --------------------------------------------------
// ADMIN ONLY
// --------------------------------------------------

router.get(
    "/rbac/admin-test",
    authenticate,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        return res.status(200).json({
            success: true,
            message: "ADMIN access granted",
            role: req.user.role,
        });
    }
);

// --------------------------------------------------
// FRONT OFFICER ONLY
// --------------------------------------------------

router.get(
    "/rbac/front-office-test",
    authenticate,
    authorizeRoles("FRONT_OFFICER"),
    async (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "FRONT_OFFICER access granted",
            role: req.user.role,
        });
    }
);

// --------------------------------------------------
// PHARMACIST ONLY
// --------------------------------------------------

router.get(
    "/rbac/pharmacist-test",
    authenticate,
    authorizeRoles("PHARMACIST"),
    async (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "PHARMACIST access granted",
            role: req.user.role,
        });
    }
);

// ==================================================
// EXPORT ROUTER
// ==================================================

module.exports = router;