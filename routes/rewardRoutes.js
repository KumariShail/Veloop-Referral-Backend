const express = require("express");
const fs = require("fs");
const authMiddleware = require("../middleware/authMiddleware");

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
// GET /api/rewards/:referralId/eligibility
// ======================================================

router.get(
  "/:referralId/eligibility",
  authMiddleware,
  async (req, res) => {
    try {
      const database = await getDatabase();

      const referralId = Number(req.params.referralId);

      if (!Number.isInteger(referralId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_REFERRAL_ID",
          message: "Referral ID must be a number",
        });
      }

      // ----------------------------------------
      // 1. Find referral progress
      // ----------------------------------------

      const progress =
        await database.orm.public.ReferralProgress
          .where((p) => p.referralId.eq(referralId))
          .first();

      if (!progress) {
        return res.status(404).json({
          success: false,
          code: "PROGRESS_NOT_FOUND",
          message: "Referral progress not found",
        });
      }

      // ----------------------------------------
      // 2. Ownership check
      // ----------------------------------------

      if (progress.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message:
            "You are not allowed to access this referral",
        });
      }

      // ----------------------------------------
      // 3. Get active reward configurations
      // ----------------------------------------

      const rewardConfigs =
        await database.orm.public.RewardConfig
          .where((r) => r.isActive.eq(true))
          .all();

      // ----------------------------------------
      // 4. Find unlocked rewards
      // ----------------------------------------

      const unlockedRewards = rewardConfigs
        .filter(
          (reward) =>
            progress.adsCompleted >= reward.milestone
        )
        .sort(
          (a, b) => a.milestone - b.milestone
        );

      // ----------------------------------------
      // 5. Find next milestone
      // ----------------------------------------

      const nextReward =
        rewardConfigs
          .filter(
            (reward) =>
              progress.adsCompleted <
              reward.milestone
          )
          .sort(
            (a, b) => a.milestone - b.milestone
          )[0] || null;

      return res.json({
        success: true,
        referralId,
        adsCompleted: progress.adsCompleted,
        unlockedRewards,
        nextMilestone: nextReward
          ? {
              milestone: nextReward.milestone,
              rewardType: nextReward.rewardType,
              rewardAmount: nextReward.rewardAmount,
              remainingAds:
                nextReward.milestone -
                progress.adsCompleted,
            }
          : null,
      });
    } catch (error) {
      console.error(
        "Error checking reward eligibility:",
        error
      );

      return res.status(500).json({
        success: false,
        code: "REWARD_ELIGIBILITY_FAILED",
        message:
          "Failed to check reward eligibility",
      });
    }
  }
);

// ======================================================
// POST /api/rewards/:referralId/claim
// ======================================================

router.post(
  "/:referralId/claim",
  authMiddleware,
  async (req, res) => {
    try {
      const database = await getDatabase();

      const referralId = Number(req.params.referralId);

      if (!Number.isInteger(referralId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_REFERRAL_ID",
          message: "Referral ID must be a number",
        });
      }

      // ----------------------------------------
      // 1. Find referral progress
      // ----------------------------------------

      const progress =
        await database.orm.public.ReferralProgress
          .where((p) => p.referralId.eq(referralId))
          .first();

      if (!progress) {
        return res.status(404).json({
          success: false,
          code: "PROGRESS_NOT_FOUND",
          message: "Referral progress not found",
        });
      }

      // ----------------------------------------
      // 2. Ownership check
      // ----------------------------------------

      if (progress.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message:
            "You are not allowed to claim rewards for this referral",
        });
      }

      // ----------------------------------------
      // 3. Get active reward configurations
      // ----------------------------------------

      const rewardConfigs =
        await database.orm.public.RewardConfig
          .where((r) => r.isActive.eq(true))
          .all();

      // ----------------------------------------
      // 4. Find all currently unlocked rewards
      // ----------------------------------------

      const unlockedRewards = rewardConfigs
        .filter(
          (reward) =>
            progress.adsCompleted >= reward.milestone
        )
        .sort(
          (a, b) => a.milestone - b.milestone
        );

      if (unlockedRewards.length === 0) {
        return res.status(400).json({
          success: false,
          code: "NO_REWARDS_AVAILABLE",
          message:
            "No rewards are available to claim yet",
          adsCompleted: progress.adsCompleted,
        });
      }

      const claimedRewards = [];
      const alreadyClaimed = [];

      // ----------------------------------------
      // 5. Claim rewards transactionally
      // ----------------------------------------

      await database.transaction(async (tx) => {
        for (const reward of unlockedRewards) {
          const idempotencyKey =
            `REFERRAL-${referralId}-MILESTONE-${reward.milestone}-${reward.rewardType}`;

          // ----------------------------------------
          // Check duplicate / previous claim
          // ----------------------------------------

          const existingTransaction =
            await tx.orm.public.RewardTransaction
              .where((transaction) =>
                transaction.idempotencyKey.eq(
                  idempotencyKey
                )
              )
              .first();

          if (existingTransaction) {
            alreadyClaimed.push(
              existingTransaction
            );
            continue;
          }

          // ----------------------------------------
          // Determine balance field
          // ----------------------------------------

          let balanceField;

          switch (reward.rewardType) {
            case "SVE":
              balanceField = "sveBalance";
              break;

            case "SPINS":
              balanceField = "spinBalance";
              break;

            case "TOKENS":
              balanceField = "tokenBalance";
              break;

            case "GEMS":
              balanceField = "gemBalance";
              break;

            default:
              throw new Error(
                `UNSUPPORTED_REWARD_TYPE: ${reward.rewardType}`
              );
          }

          // ----------------------------------------
          // Find user
          // ----------------------------------------

          const user =
            await tx.orm.public.User
              .where((u) =>
                u.id.eq(progress.userId)
              )
              .first();

          if (!user) {
            throw new Error("USER_NOT_FOUND");
          }

          // ----------------------------------------
          // Create reward ledger transaction
          // ----------------------------------------

          const rewardTransaction =
            await tx.orm.public.RewardTransaction
              .create({
                userId: progress.userId,
                referralId,
                rewardType:
                  reward.rewardType,
                amount:
                  reward.rewardAmount,
                reason:
                  `Claimed referral milestone ${reward.milestone}`,
                milestone:
                  reward.milestone,
                status: "CREDITED",
                idempotencyKey,
              });

          // ----------------------------------------
          // Update user's balance
          // ----------------------------------------

          const currentBalance =
            Number(user[balanceField] || 0);

          const newBalance =
            currentBalance +
            Number(reward.rewardAmount);

          await tx.orm.public.User
            .where((u) =>
              u.id.eq(progress.userId)
            )
            .update({
              [balanceField]: newBalance,
            });

          claimedRewards.push(
            rewardTransaction
          );
        }

        // ----------------------------------------
        // Update highest milestone
        // ----------------------------------------

        const highestMilestone =
          unlockedRewards[
            unlockedRewards.length - 1
          ].milestone;

        if (
          highestMilestone >
          Number(progress.currentMilestone || 0)
        ) {
          await tx.orm.public.ReferralProgress
            .where((p) =>
              p.referralId.eq(referralId)
            )
            .update({
              currentMilestone:
                highestMilestone,
            });
        }
      });

      // ----------------------------------------
      // 6. Final response
      // ----------------------------------------

      return res.json({
        success: true,
        message:
          claimedRewards.length > 0
            ? "Rewards claimed successfully"
            : "All unlocked rewards were already claimed",
        referralId,
        adsCompleted:
          progress.adsCompleted,
        claimedRewards,
        alreadyClaimed,
      });
    } catch (error) {
      console.error(
        "Error claiming rewards:",
        error
      );

      if (
        error?.message === "USER_NOT_FOUND"
      ) {
        return res.status(404).json({
          success: false,
          code: "USER_NOT_FOUND",
          message: "User not found",
        });
      }

      if (
        error?.message?.startsWith(
          "UNSUPPORTED_REWARD_TYPE"
        )
      ) {
        return res.status(500).json({
          success: false,
          code: "UNSUPPORTED_REWARD_TYPE",
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        code: "REWARD_CLAIM_FAILED",
        message: "Failed to claim rewards",
      });
    }
  }
);

module.exports = router;