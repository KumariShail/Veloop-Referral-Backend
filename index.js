const express = require("express");
const cors = require("cors");
require("dotenv").config();

const referralRoutes = require("./routes/referralRoutes");
const adEventRoutes = require("./routes/adEventRoutes");
const rewardRoutes = require("./routes/rewardRoutes");
const authRoutes = require("./routes/authRoutes");
const { apiRateLimiter } = require("./middleware/rateLimitMiddleware");

const app = express();

// ===============================
// Middleware
// ===============================

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://veloop-referral-frontend.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle CORS preflight requests
app.options("*", cors());

// Rate limiting
app.use(apiRateLimiter);

// ===============================
// PostgreSQL / Prisma Routes
// ===============================

app.use("/api/auth", authRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/ad-events", adEventRoutes);
app.use("/api/rewards", rewardRoutes);

// ===============================
// Health Check
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "VELOOP backend is running",
  });
});

// ===============================
// Server
// ===============================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});