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

    const referrals = await database.orm.public.Referral
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

    // ----------------------------------------
    // Referral progress
    // ----------------------------------------

    const progress =
      await database.orm.public.ReferralProgress
        .where((p) => p.userId.eq(userId))
        .first();

    let referralProgress = null;

    if (progress) {
      const rewardConfigs =
        await database.orm.public.RewardConfig
          .where((r) => r.isActive.eq(true))
          .all();

      const nextReward =
        rewardConfigs
          .filter(
            (reward) =>
              progress.adsCompleted < reward.milestone
          )
          .sort(
            (a, b) => a.milestone - b.milestone
          )[0] || null;

      const target = nextReward
        ? nextReward.milestone
        : progress.adsCompleted;

      const remaining = nextReward
        ? Math.max(
            nextReward.milestone -
              progress.adsCompleted,
            0
          )
        : 0;

      const percent =
        target > 0
          ? Math.min(
              Math.round(
                (progress.adsCompleted / target) * 100
              ),
              100
            )
          : 100;

      referralProgress = {
        current: progress.adsCompleted,
        target,
        remaining,
        percent,
        nextReward: nextReward
          ? `${nextReward.rewardAmount} ${nextReward.rewardType}`
          : "All milestones completed",
      };
    }

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

      // ----------------------------------------
      // Find referrer
      // ----------------------------------------

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

      // ----------------------------------------
      // Prevent self-referral
      // ----------------------------------------

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

      // ----------------------------------------
      // Prevent duplicate referral
      // ----------------------------------------

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

      // ----------------------------------------
      // Create referral + progress
      // ----------------------------------------

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

      // Only the referred user can complete registration
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

      // ----------------------------------------
      // Idempotency
      // ----------------------------------------

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

        // --------------------------------------
        // Check whether XP was already credited
        // --------------------------------------

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

module.exports = router;