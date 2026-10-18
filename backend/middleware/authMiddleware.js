const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;

// --------------------------------------------------
// Check JWT secret
// --------------------------------------------------
if (!JWT_SECRET) {
    throw new Error(
        "JWT_SECRET is missing from environment variables"
    );
}

// --------------------------------------------------
// Authenticate user using JWT
// --------------------------------------------------
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // No Authorization header
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization token is required",
            });
        }

        // Expected format:
        // Authorization: Bearer <token>
        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format",
            });
        }

        const token = authHeader.substring(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authorization token is required",
            });
        }

        // Verify JWT
        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        // Our login route stores the ID as "userId"
        if (!decoded.userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid token payload",
            });
        }

        // Find user in MongoDB
        const user = await User.findById(
            decoded.userId
        ).select("-password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User no longer exists",
            });
        }

        // Check account status
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "User account is inactive",
            });
        }

        // Attach authenticated user to request
        req.user = user;

        // Continue to protected route
        next();
    } catch (error) {
        // Expired JWT
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token has expired",
            });
        }

        // Invalid JWT
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Invalid token",
            });
        }

        console.error(
            "Authentication error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Authentication failed",
        });
    }
};

// --------------------------------------------------
// Role-based authorization
// --------------------------------------------------
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        // User must already be authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        // Check user's role
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to access this resource",
            });
        }

        // Role accepted
        next();
    };
};

// --------------------------------------------------
// Export middleware
// --------------------------------------------------
module.exports = {
    authenticate,
    authorizeRoles,
};