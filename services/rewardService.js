async function processMilestoneRewards(
  database,
  referralId,
  userId,
  adsCompleted
) {
  // Works with both the normal database object
  // and a Prisma transaction object.
  const orm = database.orm;

  // Get all active reward configurations.
  const rewardConfigs = await orm.public.RewardConfig
    .where((reward) => reward.isActive.eq(true))
    .all();

  // Find every milestone that has been reached.
  const eligibleRewards = rewardConfigs
    .filter((reward) => adsCompleted >= reward.milestone)
    .sort((a, b) => a.milestone - b.milestone);

  const creditedRewards = [];

  // Process each reached milestone.
  for (const reward of eligibleRewards) {
    const idempotencyKey =
      `REFERRAL-${referralId}-MILESTONE-${reward.milestone}-${reward.rewardType}`;

    // Prevent the same reward from being credited twice.
    const existingTransaction =
      await orm.public.RewardTransaction
        .where((transaction) =>
          transaction.idempotencyKey.eq(idempotencyKey)
        )
        .first();

    if (existingTransaction) {
      continue;
    }

    try {
      // 1. Create the reward ledger entry.
      const transaction =
        await orm.public.RewardTransaction.create({
          userId,
          referralId,
          rewardType: reward.rewardType,
          amount: reward.rewardAmount,
          reason: `Referral milestone ${reward.milestone} reached`,
          milestone: reward.milestone,
          status: "CREDITED",
          idempotencyKey,
        });

      // 2. Update the actual user's reward balance.
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

      // Read the current user balance.
      const user =
        await orm.public.User
          .where((u) => u.id.eq(userId))
          .first();

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      // Calculate the new balance.
      const currentBalance = Number(user[balanceField] || 0);
      const newBalance =
        currentBalance + Number(reward.rewardAmount);

      // Update the appropriate balance.
      await orm.public.User
        .where((u) => u.id.eq(userId))
        .update({
          [balanceField]: newBalance,
        });

      creditedRewards.push(transaction);
    } catch (error) {
      // Unique idempotency key protects against duplicate rewards.
      if (
        error?.code === "P2002" ||
        error?.message?.toLowerCase().includes("unique")
      ) {
        continue;
      }

      throw error;
    }
  }

  // Update the highest milestone reached.
  if (eligibleRewards.length > 0) {
    const highestMilestone =
      eligibleRewards[eligibleRewards.length - 1].milestone;

    await orm.public.ReferralProgress
      .where((progress) =>
        progress.referralId.eq(referralId)
      )
      .update({
        currentMilestone: highestMilestone,
      });
  }

  return creditedRewards;
}

module.exports = {
  processMilestoneRewards,
};