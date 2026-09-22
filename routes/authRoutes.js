const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const authMiddleware = require("../middleware/authMiddleware");
const {
  hashDeviceToken,
  generateDeviceToken,
} = require("../utils/deviceUtils");

const router = express.Router();

let db;

async function getDatabase() {
  if (db) return db;

  const { default: postgres } = await import(
    "@prisma/orm-postgres/runtime"
  );

  const contractJson = JSON.parse(
    fs.readFileSync("./src/prisma/contract.json", "utf8")
  );

  db = postgres({
    contractJson,
    url: process.env.DATABASE_URL,
  });

  await db.connect();

  return db;
}

// ======================================================
// POST /api/auth/register
// ======================================================

router.post("/register", async (req, res) => {
  try {
    const database = await getDatabase();

    const { email, password, name, deviceToken } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message: "Email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        code: "WEAK_PASSWORD",
        message: "Password must be at least 8 characters",
      });
    }

    // Check existing email
    const existingUser = await database.orm.public.User
      .where((user) => user.email.eq(email))
      .first();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: "EMAIL_ALREADY_EXISTS",
        message: "An account with this email already exists",
      });
    }

    // ==================================================
    // Device token handling
    // ==================================================

    const newDeviceToken = deviceToken || generateDeviceToken();

    const deviceHash = hashDeviceToken(newDeviceToken);

    // Check whether this device is already registered
    const existingDeviceUser =
      await database.orm.public.User
        .where((user) => user.deviceHash.eq(deviceHash))
        .first();

    if (existingDeviceUser) {
      return res.status(409).json({
        success: false,
        code: "DEVICE_ALREADY_REGISTERED",
        message:
          "This device has already been associated with a VELOOP Rewards account.",
      });
    }

    // ==================================================
    // Generate referral code
    // ==================================================

    const referralCode =
      "REF" +
      Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase();

    // ==================================================
    // Hash password
    // ==================================================

    const passwordHash = await bcrypt.hash(password, 12);

    // ==================================================
    // Create user
    // ==================================================

    const user = await database.orm.public.User.create({
      email,
      name: name || null,
      referralCode,
      passwordHash,
      deviceHash,
      status: "ACTIVE",
    });

    // ==================================================
    // Response
    // ==================================================

    return res.status(201).json({
      success: true,
      message: "Account created successfully",

      // Client can store this token and send it
      // when making future registration/device-risk requests.
      deviceToken: newDeviceToken,

      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      code: "REGISTRATION_FAILED",
      message: "Failed to create account",
    });
  }
});

// ======================================================
// POST /api/auth/login
// ======================================================

router.post("/login", async (req, res) => {
  try {
    const database = await getDatabase();

    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await database.orm.public.User
      .where((item) => item.email.eq(email))
      .first();

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    // Compare password
    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        userId: user.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      code: "LOGIN_FAILED",
      message: "Failed to login",
    });
  }
});

// ======================================================
// GET /api/auth/me
// ======================================================

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();

    const user = await database.orm.public.User
      .where((item) => item.id.eq(req.user.id))
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Auth me error:", error);

    return res.status(500).json({
      success: false,
      code: "AUTH_ME_FAILED",
      message: "Failed to fetch authenticated user",
    });
  }
});

module.exports = router;