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
      const loggedInUserId = Number(req.user.id);

      if (!Number.isInteger(referralId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_REFERRAL_ID",
          message: "Referral ID must be a number",
        });
      }

      // ----------------------------------------
      // 1. Find the referral
      // ----------------------------------------

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

      // ----------------------------------------
      // 2. Verify that the logged-in user
      //    is the referrer / owner
      // ----------------------------------------

      if (
        Number(referral.referrerId) !==
        loggedInUserId
      ) {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message:
            "You are not allowed to access this referral",
        });
      }

      // ----------------------------------------
      // 3. Find referral progress
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
      // 4. Get active reward configurations
      // ----------------------------------------

      const rewardConfigs =
        await database.orm.public.RewardConfig
          .where((r) => r.isActive.eq(true))
          .all();

      // ----------------------------------------
      // 5. Find unlocked rewards
      // ----------------------------------------

      const unlockedRewards = rewardConfigs
        .filter(
          (reward) =>
            Number(progress.adsCompleted) >=
            Number(reward.milestone)
        )
        .sort(
          (a, b) =>
            Number(a.milestone) -
            Number(b.milestone)
        );

      // ----------------------------------------
      // 6. Find next milestone
      // ----------------------------------------

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

      return res.json({
        success: true,
        referralId,

        adsCompleted:
          Number(progress.adsCompleted),

        unlockedRewards,

        nextMilestone: nextReward
          ? {
              milestone:
                Number(nextReward.milestone),

              rewardType:
                nextReward.rewardType,

              rewardAmount:
                Number(nextReward.rewardAmount),

              remainingAds:
                Number(nextReward.milestone) -
                Number(progress.adsCompleted),
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
      const loggedInUserId = Number(req.user.id);

      if (!Number.isInteger(referralId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_REFERRAL_ID",
          message: "Referral ID must be a number",
        });
      }

      // ----------------------------------------
      // 1. Find the referral
      // ----------------------------------------

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

      // ----------------------------------------
      // 2. Verify ownership
      // ----------------------------------------

      if (
        Number(referral.referrerId) !==
        loggedInUserId
      ) {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          message:
            "You are not allowed to claim rewards for this referral",
        });
      }

      // ----------------------------------------
      // 3. Find referral progress
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
      // 4. Get active reward configurations
      // ----------------------------------------

      const rewardConfigs =
        await database.orm.public.RewardConfig
          .where((r) => r.isActive.eq(true))
          .all();

      // ----------------------------------------
      // 5. Find unlocked rewards
      // ----------------------------------------

      const unlockedRewards = rewardConfigs
        .filter(
          (reward) =>
            Number(progress.adsCompleted) >=
            Number(reward.milestone)
        )
        .sort(
          (a, b) =>
            Number(a.milestone) -
            Number(b.milestone)
        );

      if (unlockedRewards.length === 0) {
        return res.status(400).json({
          success: false,
          code: "NO_REWARDS_AVAILABLE",
          message:
            "No rewards are available to claim yet",
          adsCompleted:
            Number(progress.adsCompleted),
        });
      }

      const claimedRewards = [];
      const alreadyClaimed = [];

      // ----------------------------------------
      // 6. Claim rewards transactionally
      // ----------------------------------------

      await database.transaction(async (tx) => {
        for (const reward of unlockedRewards) {
          const idempotencyKey =
            `REFERRAL-${referralId}-MILESTONE-${reward.milestone}-${reward.rewardType}`;

          // ----------------------------------------
          // Check previous claim
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
          // Find the REFERRER
          // ----------------------------------------

          const user =
            await tx.orm.public.User
              .where((u) =>
                u.id.eq(loggedInUserId)
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
                userId: loggedInUserId,

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
          // Update referrer's balance
          // ----------------------------------------

          const currentBalance =
            Number(user[balanceField] || 0);

          const newBalance =
            currentBalance +
            Number(reward.rewardAmount);

          await tx.orm.public.User
            .where((u) =>
              u.id.eq(loggedInUserId)
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
          Number(highestMilestone) >
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
      // 7. Final response
      // ----------------------------------------

      return res.json({
        success: true,

        message:
          claimedRewards.length > 0
            ? "Rewards claimed successfully"
            : "All unlocked rewards were already claimed",

        referralId,

        adsCompleted:
          Number(progress.adsCompleted),

        claimedRewards,

        alreadyClaimed,
      });
    } catch (error) {
      console.error(
        "Error claiming rewards:",
        error
      );

      if (
        error?.message ===
        "USER_NOT_FOUND"
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
        message:
          "Failed to claim rewards",
      });
    }
  }
);

module.exports = router;