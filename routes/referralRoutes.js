const express = require("express");
const fs = require("fs");
const authMiddleware = require("../middleware/authMiddleware");
const { createAuditLog } = require("../utils/auditLogger");

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
// GET /api/referrals/me
// Logged-in user's referral dashboard
// ======================================================

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const userId = Number(req.user.id);

    const user = await database.orm.public.User
      .where((u) => u.id.eq(userId))
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    const referrals =
      await database.orm.public.Referral
        .where((r) => r.referrerId.eq(userId))
        .all();

    const totalReferrals = referrals.length;

    const successfulReferrals = referrals.filter(
      (referral) => referral.status === "SUCCESSFUL"
    ).length;

    const pendingReferrals = referrals.filter(
      (referral) => referral.status === "PENDING"
    ).length;

    const spamReferrals = referrals.filter(
      (referral) =>
        referral.status === "SPAM" ||
        referral.status === "FRAUD_REVIEW" ||
        referral.status === "REJECTED"
    ).length;

    const registeredReferrals = referrals.filter(
      (referral) => referral.status === "REGISTERED"
    ).length;

    const rewardConfigs =
      await database.orm.public.RewardConfig
        .where((r) => r.isActive.eq(true))
        .all();

    const allProgress =
      await database.orm.public.ReferralProgress.all();

    const myReferralIds = new Set(
      referrals.map((referral) => Number(referral.id))
    );

    const myProgressRecords = allProgress.filter(
      (progress) =>
        myReferralIds.has(Number(progress.referralId))
    );

    const progress =
      myProgressRecords
        .sort(
          (a, b) =>
            Number(b.adsCompleted) -
            Number(a.adsCompleted)
        )[0] || null;

    let referralProgress = null;

    if (progress) {
      const nextReward =
        rewardConfigs
          .filter(
            (reward) =>
              Number(progress.adsCompleted) <
              Number(reward.milestone)
          )
          .sort(
            (a, b) =>
              Number(a.milestone) -
              Number(b.milestone)
          )[0] || null;

      const current = Number(progress.adsCompleted);

      const target = nextReward
        ? Number(nextReward.milestone)
        : current;

      const remaining = nextReward
        ? Math.max(
            Number(nextReward.milestone) - current,
            0
          )
        : 0;

      const percent =
        target > 0
          ? Math.min(
              Math.round((current / target) * 100),
              100
            )
          : 100;

      referralProgress = {
        referralId: progress.referralId,
        current,
        target,
        remaining,
        percent,
        nextReward: nextReward
          ? `${nextReward.rewardAmount} ${nextReward.rewardType}`
          : "All milestones completed",
      };
    }

    const referralProgressDetails = referrals.map(
      (referral) => {
        const progressRecord =
          myProgressRecords.find(
            (progress) =>
              Number(progress.referralId) ===
              Number(referral.id)
          );

        return {
          referralId: referral.id,
          status: referral.status,
          adsCompleted: progressRecord
            ? Number(progressRecord.adsCompleted)
            : 0,
          currentMilestone: progressRecord
            ? Number(progressRecord.currentMilestone)
            : 0,
        };
      }
    );

    return res.json({
      success: true,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
      },

      referralLink:
        `https://veloop-referral-frontend.vercel.app/referral/${user.referralCode}`,

      statistics: {
        totalReferrals,
        successfulReferrals,
        pendingReferrals,
        registeredReferrals,
        spamReferrals,
      },

      balances: {
        sve: user.sveBalance,
        spins: user.spinBalance,
        tokens: user.tokenBalance,
        gems: user.gemBalance,
        xp: user.xp,
      },

      referralProgress,

      referralProgressDetails,

      rewards: rewardConfigs,

      referrals,
    });
  } catch (error) {
    console.error(
      "Get referral dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      code: "REFERRAL_DASHBOARD_ERROR",
      message: "Failed to load referral dashboard",
    });
  }
});

// ======================================================
// POST /api/referrals/attribute
// Attribute logged-in user to a referral code
// ======================================================

router.post(
  "/attribute",
  authMiddleware,
  async (req, res) => {
    try {
      const database = await getDatabase();

      const referralCode =
        typeof req.body.referralCode === "string"
          ? req.body.referralCode.trim()
          : "";

      const referredUserId = Number(req.user.id);

      if (!referralCode) {
        return res.status(400).json({
          success: false,
          code: "INVALID_REFERRAL_CODE",
          message: "Referral code is required",
        });
      }

      const referrer =
        await database.orm.public.User
          .where((u) =>
            u.referralCode.eq(referralCode)
          )
          .first();

      if (!referrer) {
        return res.status(404).json({
          success: false,
          code: "INVALID_REFERRAL_CODE",
          message: "Invalid referral code",
        });
      }

      if (Number(referrer.id) === referredUserId) {
        await createAuditLog(database, {
          userId: referredUserId,
          action: "SELF_REFERRAL_ATTEMPT",
          status: "REJECTED",
          details: {
            referralCode,
          },
        });

        return res.status(409).json({
          success: false,
          code: "SELF_REFERRAL",
          message: "Self-referrals are not allowed",
        });
      }

      const existingReferral =
        await database.orm.public.Referral
          .where((r) =>
            r.referredUserId.eq(referredUserId)
          )
          .first();

      if (existingReferral) {
        return res.status(409).json({
          success: false,
          code: "REFERRAL_ALREADY_EXISTS",
          message:
            "This user has already been attributed to a referral",
        });
      }

      let referral;
      let progress;

      await database.transaction(async (tx) => {
        referral =
          await tx.orm.public.Referral.create({
            referrerId: Number(referrer.id),
            referredUserId,
            referralCode,
            status: "PENDING",
          });

        progress =
          await tx.orm.public.ReferralProgress.create({
            userId: referredUserId,
            referralId: referral.id,
            adsCompleted: 0,
            currentMilestone: 0,
          });
      });

      await createAuditLog(database, {
        userId: referredUserId,
        referralId: referral.id,
        action: "REFERRAL_ATTRIBUTED",
        status: "SUCCESS",
        details: {
          referralCode,
          referrerId: Number(referrer.id),
        },
      });

      return res.status(201).json({
        success: true,
        message: "Referral attributed successfully",
        referral,
        progress,
      });
    } catch (error) {
      console.error(
        "Referral attribution error:",
        error
      );

      return res.status(500).json({
        success: false,
        code: "REFERRAL_ATTRIBUTION_FAILED",
        message: "Failed to attribute referral",
      });
    }
  }
);

// ======================================================
// GET /api/referrals
// Referral list with pagination and status filtering
// ======================================================

router.get("/", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const userId = Number(req.user.id);

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      100
    );

    const requestedStatus =
      typeof req.query.status === "string"
        ? req.query.status.toUpperCase()
        : "ALL";

    let referrals =
      await database.orm.public.Referral
        .where((r) => r.referrerId.eq(userId))
        .all();

    if (requestedStatus !== "ALL") {
      referrals = referrals.filter(
        (referral) =>
          referral.status === requestedStatus
      );
    }

    const total = referrals.length;

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(total / limit);

    const startIndex = (page - 1) * limit;

    const paginatedReferrals =
      referrals.slice(
        startIndex,
        startIndex + limit
      );

    return res.json({
      success: true,

      pagination: {
        page,
        limit,
        total,
        totalPages,
      },

      filters: {
        status: requestedStatus,
      },

      referrals: paginatedReferrals,
    });
  } catch (error) {
    console.error(
      "Get referrals error:",
      error
    );

    return res.status(500).json({
      success: false,
      code: "REFERRALS_FETCH_FAILED",
      message: "Failed to fetch referrals",
    });
  }
});

// ======================================================
// PATCH /api/referrals/:id/register
// Mark a referred user as successfully registered
// ======================================================

router.patch(
  "/:id/register",
  authMiddleware,
  async (req, res) => {
    try {
      const database = await getDatabase();

      const referralId = Number(req.params.id);
      const currentUserId = Number(req.user.id);

      if (!Number.isInteger(referralId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_REFERRAL_ID",
          message: "Invalid referral ID",
        });
      }

      const referral =
        await database.orm.public.Referral
          .where((r) => r.id.eq(referralId))
          .first();

      if (!referral) {
        return res.status(404).json({
          success: false,
          code: "REFERRAL_NOT_FOUND",
          message: "Referral not found",
        });
      }

      if (
        Number(referral.referredUserId) !==
        currentUserId
      ) {
        return res.status(403).json({
          success: false,
          code: "REFERRAL_USER_MISMATCH",
          message:
            "You cannot register this referral",
        });
      }

      if (
        referral.status === "SUCCESSFUL" ||
        referral.status === "REGISTERED"
      ) {
        return res.json({
          success: true,
          message: "Referral is already registered",
          referral,
        });
      }

      const idempotencyKey =
        `REFERRAL-${referralId}-SUCCESS-XP`;

      let updatedReferral;
      let rewardTransaction;

      await database.transaction(async (tx) => {
        updatedReferral =
          await tx.orm.public.Referral
            .where((r) => r.id.eq(referralId))
            .update({
              status: "SUCCESSFUL",
              registeredAt: new Date(),
              successfulAt: new Date(),
            });

        const existingTransaction =
          await tx.orm.public.RewardTransaction
            .where((t) =>
              t.idempotencyKey.eq(
                idempotencyKey
              )
            )
            .first();

        if (!existingTransaction) {
          rewardTransaction =
            await tx.orm.public.RewardTransaction.create({
              userId: Number(referral.referrerId),
              referralId,
              rewardType: "XP",
              amount: 20,
              reason: "Successful referral",
              milestone: null,
              idempotencyKey,
              status: "CREDITED",
            });

          const referrer =
            await tx.orm.public.User
              .where((u) =>
                u.id.eq(
                  Number(referral.referrerId)
                )
              )
              .first();

          if (referrer) {
            await tx.orm.public.User
              .where((u) =>
                u.id.eq(
                  Number(referral.referrerId)
                )
              )
              .update({
                xp: referrer.xp + 20,
              });
          }
        } else {
          rewardTransaction =
            existingTransaction;
        }
      });

      await createAuditLog(database, {
        userId: currentUserId,
        referralId,
        action: "REFERRAL_REGISTERED",
        status: "SUCCESS",
        details: {
          referrerId: Number(
            referral.referrerId
          ),
          xpAwarded: 20,
        },
      });

      return res.json({
        success: true,
        message: "Referral registered successfully",
        referral: updatedReferral,
        rewardTransaction,
      });
    } catch (error) {
      console.error(
        "Referral registration error:",
        error
      );

      return res.status(500).json({
        success: false,
        code: "REFERRAL_REGISTRATION_FAILED",
        message:
          "Failed to register referral",
      });
    }
  }
);

// ======================================================
// TEMPORARY DEBUG ROUTE
// ======================================================

router.get("/debug-data", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();

    const users =
      await database.orm.public.User.all();

    const rewards =
      await database.orm.public.RewardConfig.all();

    const referrals =
      await database.orm.public.Referral
        .where((r) =>
          r.referrerId.eq(Number(req.user.id))
        )
        .all();

    const progress =
      await database.orm.public.ReferralProgress.all();

    return res.json({
      users,
      rewards,
      referrals,
      progress,
    });
  } catch (error) {
    console.error("Debug data error:", error);

    return res.status(500).json({
      message: "Debug failed",
      error: error.message,
    });
  }
});

// ======================================================
// TEMPORARY DEMO SEED ROUTE
// ======================================================

router.post("/seed-demo", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const userId = Number(req.user.id);

    // Get logged-in user
    const user = await database.orm.public.User
      .where((u) => u.id.eq(userId))
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update existing user
    await database.orm.public.User
      .where((u) => u.id.eq(userId))
      .update({
        name: "Self Referral Test",
        referralCode: "REF1O638J17",
        sveBalance: 5000,
        spinBalance: 0,
        tokenBalance: 0,
        gemBalance: 0,
        xp: 0,
      });

    // Reward configuration
    const rewardConfigs = [
      {
        milestone: 15,
        rewardType: "SVE",
        rewardAmount: 5000,
      },
      {
        milestone: 20,
        rewardType: "SPINS",
        rewardAmount: 2,
      },
      {
        milestone: 30,
        rewardType: "TOKENS",
        rewardAmount: 5000,
      },
      {
        milestone: 35,
        rewardType: "GEMS",
        rewardAmount: 10,
      },
    ];

    for (const reward of rewardConfigs) {
      const existing =
        await database.orm.public.RewardConfig
          .where((r) =>
            r.milestone.eq(reward.milestone)
          )
          .first();

      if (!existing) {
        await database.orm.public.RewardConfig.create({
          milestone: reward.milestone,
          rewardType: reward.rewardType,
          rewardAmount: reward.rewardAmount,
          isActive: true,
        });
      }
    }

    // Existing referrals
    const existingReferrals =
      await database.orm.public.Referral
        .where((r) => r.referrerId.eq(userId))
        .all();

    // Create demo referrals
    if (existingReferrals.length === 0) {
      for (let i = 1; i <= 5; i++) {
        const referredUser =
          await database.orm.public.User.create({
            name: `Demo Referral ${i}`,
            email: `demo.referral.${i}@veloop.test`,
            referralCode: `DEMOREF${Date.now()}${i}`,
            referredByUserId: userId,
            status: "ACTIVE",
            passwordHash: null,
          });

        const referral =
          await database.orm.public.Referral.create({
            referrerId: userId,
            referredUserId: referredUser.id,
            referralCode: "REF1O638J17",
            status: "REGISTERED",
            registeredAt: new Date(),
          });

        await database.orm.public.ReferralProgress.create({
          userId: referredUser.id,
          referralId: referral.id,
          adsCompleted: 0,
          currentMilestone: 0,
        });
      }
    }

    return res.json({
      success: true,
      message: "Demo data seeded successfully",
      userId,
    });
  } catch (error) {
    console.error("Seed demo error:", error);

    return res.status(500).json({
      success: false,
      message: "Demo seed failed",
      error: error.message,
    });
  }
});

module.exports = router;