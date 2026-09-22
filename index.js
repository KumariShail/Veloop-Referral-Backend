const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
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
      "https://veloop-referral-frontend-mnhs.vercel.app",
    ],
  })
);

// Rate limiting
app.use(apiRateLimiter);

// ===============================
// New PostgreSQL / Prisma Routes
// ===============================

app.use("/api/auth", authRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/ad-events", adEventRoutes);
app.use("/api/rewards", rewardRoutes);

// ===============================
// MongoDB Connection
// ===============================

const client = new MongoClient(process.env.MONGODB_URI);

let db;
let referralsCollection;

async function connectDB() {
  try {
    await client.connect();

    db = client.db("veloop");
    referralsCollection = db.collection("referrals");

    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    throw error;
  }
}

// ===============================
// Existing Referral Data
// ===============================

const referralData = {
  referralCode: "18642076",
  referralLink: "https://veloop.com/referral/18642076",
};

// ===============================
// Referral Progress
// ===============================

const referralProgress = {
  current: 12,
  target: 15,
  remaining: 3,
  percent: 80,
  nextReward: 5000,
};

// ===============================
// Rewards
// ===============================

const referralRewards = [
  {
    id: "reward-1",
    title: "₹1000 Reward",
    subtitle: "First Milestone",
    condition: "Complete 5 Ad Watch tasks",
    requiredTasks: 5,
  },
  {
    id: "reward-2",
    title: "₹2500 Reward",
    subtitle: "Second Milestone",
    condition: "Complete 10 Ad Watch tasks",
    requiredTasks: 10,
  },
  {
    id: "reward-3",
    title: "₹5000 Reward",
    subtitle: "Next Milestone",
    condition: "Complete 15 Ad Watch tasks",
    requiredTasks: 15,
  },
];

// ===============================
// LEGACY MONGODB ROUTES
// ===============================

// GET - All Referral Data
app.get("/api/referrals/me", async (req, res) => {
  try {
    const referrals = await referralsCollection.find({}).toArray();

    res.json({
      referralCode: referralData.referralCode,
      referralLink: referralData.referralLink,

      totalReferrals: referrals.length,

      successfulReferrals: referrals.filter(
        (item) => item.status === "Successful"
      ).length,

      pendingReferrals: referrals.filter(
        (item) => item.status === "Pending"
      ).length,

      referralProgress: referralProgress,

      rewards: referralRewards,

      referralActivity: referrals,
    });
  } catch (error) {
    console.error("Error fetching referrals:", error);

    res.status(500).json({
      message: "Failed to fetch referrals",
    });
  }
});

// POST - Create Referral
app.post("/api/referrals", async (req, res) => {
  try {
    const {
      referralId,
      id,
      status,
      tasksCompleted,
      targetTasks,
    } = req.body;

    if (
      !referralId ||
      !id ||
      !status ||
      tasksCompleted === undefined ||
      targetTasks === undefined
    ) {
      return res.status(400).json({
        message: "All referral fields are required",
      });
    }

    if (status !== "Pending" && status !== "Successful") {
      return res.status(400).json({
        message: "Invalid status. Use Pending or Successful.",
      });
    }

    if (
      typeof tasksCompleted !== "number" ||
      typeof targetTasks !== "number"
    ) {
      return res.status(400).json({
        message: "tasksCompleted and targetTasks must be numbers",
      });
    }

    const existingReferral = await referralsCollection.findOne({
      referralId: referralId,
    });

    if (existingReferral) {
      return res.status(409).json({
        message: "Referral already exists",
      });
    }

    const newReferral = {
      referralId,
      id,
      status,
      tasksCompleted,
      targetTasks,
    };

    const result = await referralsCollection.insertOne(newReferral);

    res.status(201).json({
      message: "Referral added successfully",
      referral: {
        ...newReferral,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Error adding referral:", error);

    res.status(500).json({
      message: "Failed to add referral",
    });
  }
});

// PATCH - Update Referral Status
app.patch("/api/referrals/:id", async (req, res) => {
  try {
    const referralId = req.params.id;
    const newStatus = req.body.status;

    if (newStatus !== "Pending" && newStatus !== "Successful") {
      return res.status(400).json({
        message: "Invalid status. Use Pending or Successful.",
      });
    }

    const referral = await referralsCollection.findOne({
      referralId: referralId,
    });

    if (!referral) {
      return res.status(404).json({
        message: "Referral not found",
      });
    }

    await referralsCollection.updateOne(
      {
        referralId: referralId,
      },
      {
        $set: {
          status: newStatus,
        },
      }
    );

    const updatedReferral = {
      ...referral,
      status: newStatus,
    };

    res.json(updatedReferral);
  } catch (error) {
    console.error("Error updating referral:", error);

    res.status(500).json({
      message: "Failed to update referral",
    });
  }
});

// DELETE - Delete Referral
app.delete("/api/referrals/:id", async (req, res) => {
  try {
    const referralId = req.params.id;

    const referral = await referralsCollection.findOne({
      referralId: referralId,
    });

    if (!referral) {
      return res.status(404).json({
        message: "Referral not found",
      });
    }

    await referralsCollection.deleteOne({
      referralId: referralId,
    });

    res.json({
      message: "Referral deleted successfully",
      deletedReferral: referral,
    });
  } catch (error) {
    console.error("Error deleting referral:", error);

    res.status(500).json({
      message: "Failed to delete referral",
    });
  }
});

// ===============================
// Server
// ===============================

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();