const express = require("express");
const fs = require("fs");

const authMiddleware = require("../middleware/authMiddleware");
const { createAuditLog } = require("../utils/auditLog");

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

// GET /api/referrals
router.get("/", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();

    const userId = req.user.id;

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      100
    );

    const status = req.query.status
      ? String(req.query.status).toUpperCase()
      : null;

    const allReferrals = await database.orm.public.Referral
      .where((r) => r.referrerId.eq(userId))
      .all();

    const filteredReferrals = status
      ? allReferrals.filter(
          (referral) => referral.status === status
        )
      : allReferrals;

    const total = filteredReferrals.length;
    const totalPages = Math.ceil(total / limit);

    const startIndex = (page - 1) * limit;

    const referrals = filteredReferrals.slice(
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
        status: status || "ALL",
      },
      referrals,
    });
  } catch (error) {
    console.error("Error fetching referrals:", error);

    return res.status(500).json({
      success: false,
      code: "REFERRAL_FETCH_FAILED",
      message: "Failed to fetch referrals",
    });
  }
});

// GET /api/referrals/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();

    const userId = req.user.id;

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

    return res.json({
      success: true,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
      },

      referralLink:
        `https://veloop.com/referral/${user.referralCode}`,

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

      referrals,
    });
  } catch (error) {
    console.error(
      "Error fetching PostgreSQL referrals:",
      error
    );

    return res.status(500).json({
      success: false,
      code: "REFERRAL_FETCH_FAILED",
      message: "Failed to fetch referrals",
    });
  }
});

// POST /api/referrals/attribute
router.post("/attribute", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();

    const userId = req.user.id;
    const referralCode = String(
      req.body.referralCode || ""
    ).trim();

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        code: "REFERRAL_CODE_REQUIRED",
        message: "Referral code is required",
      });
    }

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

    const referrer = await database.orm.public.User
      .where((u) => u.referralCode.eq(referralCode))
      .first();

    if (!referrer) {
      return res.status(404).json({
        success: false,
        code: "REFERRER_NOT_FOUND",
        message: "Invalid referral code",
      });
    }

    if (referrer.id === userId) {
      await createAuditLog(database, {
        userId,
        action: "SELF_REFERRAL_ATTEMPT",
        status: "REJECTED",
        details: {
          referralCode,
        },
      });

      return res.status(400).json({
        success: false,
        code: "SELF_REFERRAL_DETECTED",
        message: "You cannot use your own referral code",
      });
    }

    const existingReferral =
      await database.orm.public.Referral
        .where((r) => r.referredUserId.eq(userId))
        .first();

    if (existingReferral) {
      return res.status(409).json({
        success: false,
        code: "REFERRAL_ALREADY_ATTRIBUTED",
        message: "Referral attribution already exists",
      });
    }

    const referral =
      await database.orm.public.Referral.create({
        referrerId: referrer.id,
        referredUserId: userId,
        referralCode,
        status: "PENDING",
      });

    await database.orm.public.ReferralProgress.create({
      userId,
      referralId: referral.id,
      adsCompleted: 0,
      currentMilestone: 0,
    });

    await createAuditLog(database, {
      userId,
      referralId: referral.id,
      action: "REFERRAL_ATTRIBUTED",
      status: "SUCCESS",
      details: {
        referralCode,
        referrerId: referrer.id,
        referredUserId: userId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Referral attributed successfully",
      referral,
    });
  } catch (error) {
    console.error("Error attributing referral:", error);

    return res.status(500).json({
      success: false,
      code: "REFERRAL_ATTRIBUTION_FAILED",
      message: "Failed to attribute referral",
    });
  }
});

// PATCH /api/referrals/:id/register
router.patch("/:id/register", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();

    const referralId = Number(req.params.id);

    if (!Number.isInteger(referralId)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REFERRAL_ID",
        message: "Referral ID must be a number",
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

    if (referral.referrerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "You are not allowed to update this referral",
      });
    }

    if (referral.status !== "PENDING" &&
        referral.status !== "REGISTERED") {
      return res.status(400).json({
        success: false,
        code: "INVALID_REFERRAL_STATUS",
        message: "Referral cannot be registered in its current status",
      });
    }

    await database.transaction(async (tx) => {
      await tx.orm.public.Referral
        .where((r) => r.id.eq(referralId))
        .update({
          status: "SUCCESSFUL",
          registeredAt: new Date(),
          successfulAt: new Date(),
        });

      const idempotencyKey =
        `REFERRAL-${referralId}-SUCCESS-XP`;

      const existingReward =
        await tx.orm.public.RewardTransaction
          .where((transaction) =>
            transaction.idempotencyKey.eq(idempotencyKey)
          )
          .first();

      if (!existingReward) {
        await tx.orm.public.RewardTransaction.create({
          userId: referral.referrerId,
          referralId,
          rewardType: "XP",
          amount: 20,
          reason: "Successful referral",
          milestone: null,
          status: "CREDITED",
          idempotencyKey,
        });

        const referrer =
          await tx.orm.public.User
            .where((u) => u.id.eq(referral.referrerId))
            .first();

        if (referrer) {
          await tx.orm.public.User
            .where((u) => u.id.eq(referral.referrerId))
            .update({
              xp: Number(referrer.xp || 0) + 20,
            });
        }
      }
    });

    await createAuditLog(database, {
      userId: req.user.id,
      referralId,
      action: "REFERRAL_REGISTERED",
      status: "SUCCESS",
      details: {
        referrerId: referral.referrerId,
        referredUserId: referral.referredUserId,
      },
    });

    return res.json({
      success: true,
      message: "Referral registered successfully",
      referralId,
      status: "SUCCESSFUL",
      xpReward: 20,
    });
  } catch (error) {
    console.error("Error registering referral:", error);

    return res.status(500).json({
      success: false,
      code: "REFERRAL_REGISTER_FAILED",
      message: "Failed to register referral",
    });
  }
});

module.exports = router;