const express = require("express");
const fs = require("fs");
const {
  processMilestoneRewards,
} = require("../services/rewardService");
const authMiddleware = require("../middleware/authMiddleware");
const {
  verifyAdCompletion,
} = require("../services/adVerificationService");

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
// POST /api/ad-events
// ======================================================

router.post("/", authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();

    const {
      referralId,
      externalEventId,
      adProvider,
      eventType,
    } = req.body;

    const userId = req.user.id;

    // -------------------------------
    // 1. Validate input
    // -------------------------------

    if (
      !externalEventId ||
      !adProvider ||
      !eventType ||
      !referralId
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_AD_EVENT",
        message:
          "referralId, externalEventId, adProvider and eventType are required",
      });
    }

    if (
      typeof externalEventId !== "string" ||
      externalEventId.length > 100
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_EVENT_ID",
        message: "Invalid external event ID",
      });
    }

    if (adProvider !== "TEST_PROVIDER") {
      return res.status(400).json({
        success: false,
        code: "INVALID_AD_PROVIDER",
        message: "Unsupported ad provider",
      });
    }

    if (eventType !== "AD_COMPLETED") {
      return res.status(400).json({
        success: false,
        code: "INVALID_EVENT_TYPE",
        message: "Unsupported ad event type",
      });
    }

    // -------------------------------
    // 2. Verify ad completion
    // -------------------------------

    const verification = await verifyAdCompletion({
      adProvider,
      externalEventId,
      eventType,
    });

    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        code: "AD_VERIFICATION_FAILED",
        message: "Ad completion could not be verified",
      });
    }

    // -------------------------------
    // 3. Check user
    // -------------------------------

    const user = await database.orm.public.User
      .where((u) => u.id.eq(Number(userId)))
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // -------------------------------
    // 4. Check referral
    // -------------------------------

    const referral = await database.orm.public.Referral
      .where((r) => r.id.eq(Number(referralId)))
      .first();

    if (!referral) {
      return res.status(404).json({
        success: false,
        code: "REFERRAL_NOT_FOUND",
        message: "Referral not found",
      });
    }

    // Make sure the ad belongs to the referred user
    if (referral.referredUserId !== Number(userId)) {
      return res.status(403).json({
        success: false,
        code: "REFERRAL_USER_MISMATCH",
        message: "Referral does not belong to this user",
      });
    }

    // -------------------------------
    // 5. Prevent duplicate event
    // -------------------------------

    const existingEvent =
      await database.orm.public.AdEvent
        .where((event) =>
          event.externalEventId.eq(externalEventId)
        )
        .first();

    if (existingEvent) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_AD_EVENT",
        message: "This ad event has already been processed",
      });
    }

    // ==================================================
    // 6. TRANSACTION
    // ==================================================

    let adEvent;
    let updatedProgress;
    let creditedRewards;

    await database.transaction(async (tx) => {
      // -------------------------------
      // Create verified ad event
      // -------------------------------

      adEvent = await tx.orm.public.AdEvent.create({
        userId: Number(userId),
        referralId: Number(referralId),
        externalEventId,
        adProvider,
        eventType,
        verified: verification.verified,
      });

      // -------------------------------
      // Find referral progress
      // -------------------------------

      const progress =
        await tx.orm.public.ReferralProgress
          .where((p) =>
            p.referralId.eq(Number(referralId))
          )
          .first();

      if (!progress) {
        throw new Error("PROGRESS_NOT_FOUND");
      }

      // -------------------------------
      // Increase ad progress
      // -------------------------------

      const newAdsCompleted =
        progress.adsCompleted + 1;

      updatedProgress =
        await tx.orm.public.ReferralProgress
          .where((p) =>
            p.referralId.eq(Number(referralId))
          )
          .update({
            adsCompleted: newAdsCompleted,
          });

      // -------------------------------
      // Process milestone rewards
      // -------------------------------

      creditedRewards =
        await processMilestoneRewards(
          tx,
          Number(referralId),
          Number(userId),
          newAdsCompleted
        );
    });

    // -------------------------------
    // 7. Send response
    // -------------------------------

    return res.status(201).json({
      success: true,
      message: "Ad event recorded and progress updated",
      adEvent,
      progress: updatedProgress,
      creditedRewards,
    });
  } catch (error) {
    console.error(
      "Error recording ad event:",
      error
    );

    if (error?.message === "PROGRESS_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        code: "PROGRESS_NOT_FOUND",
        message: "Referral progress not found",
      });
    }

    return res.status(500).json({
      success: false,
      code: "AD_EVENT_FAILED",
      message: "Failed to record ad event",
    });
  }
});

module.exports = router;