const express = require("express");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

const PORT = 5000;
const referralData = {
  referralCode: "18642076",
  referralLink: "velooprewards.vercel.app/register?ref=18642076",

  totalReferrals: 18,
  successfulReferrals: 14,
  pendingReferrals: 4,

  adWatchTasksCompleted: 12,
};
const referralActivity = [
  {
    id: "ref1",
    referralId: "Referral #1042",
    status: "Successful",
    tasksCompleted: 20,
    targetTasks: 20,
  },
  {
    id: "ref2",
    referralId: "Referral #1047",
    status: "Successful",
    tasksCompleted: 15,
    targetTasks: 15,
  },
  {
    id: "ref3",
    referralId: "Referral #1051",
    status: "Pending",
    tasksCompleted: 8,
    targetTasks: 15,
  },
  {
    id: "ref4",
    referralId: "Referral #1058",
    status: "Pending",
    tasksCompleted: 3,
    targetTasks: 15,
  },
];

const referralRewards = [
  {
    id: "r1",
    title: "5000 SVE",
    subtitle: "≈ ₹10",
    condition: "Friend completes 15 Ad Watch tasks",
    requiredTasks: 15,
  },
  {
    id: "r2",
    title: "2 Lucky Spins",
    subtitle: null,
    condition: "Friend completes 20 Ad Watch tasks",
    requiredTasks: 20,
  },
  {
    id: "r3",
    title: "5000 Tokens",
    subtitle: null,
    condition: "Friend completes 30 Ad Watch tasks",
    requiredTasks: 30,
  },
  {
    id: "r4",
    title: "10 Gems",
    subtitle: null,
    condition: "Friend completes 35 Ad Watch tasks",
    requiredTasks: 35,
  },
  {
    id: "r5",
    title: "+20 XP",
    subtitle: null,
    condition: "Awarded for every successful referral",
    requiredTasks: 0,
  },
];
const current = referralData.adWatchTasksCompleted;

const milestoneRewards = referralRewards
  .filter((reward) => reward.requiredTasks > 0)
  .sort((a, b) => a.requiredTasks - b.requiredTasks);

const nextReward = milestoneRewards.find(
  (reward) => current < reward.requiredTasks
);

const milestoneComplete = !nextReward;

const target = nextReward ? nextReward.requiredTasks : current;

const remaining = nextReward
  ? Math.max(target - current, 0)
  : 0;

const percent = nextReward
  ? Math.min(Math.round((current / target) * 100), 100)
  : 100;

app.get("/", (req, res) => {
  res.send("VELOOP Backend is running!");
});

app.get("/api/referrals/me", (req, res) => {
  res.json({
    referralCode: referralData.referralCode,
    referralLink: referralData.referralLink,

    totalReferrals: referralData.totalReferrals,
    successfulReferrals: referralData.successfulReferrals,
    pendingReferrals: referralData.pendingReferrals,

    referralProgress: {
      current,
      target,
      remaining,
      percent,
      nextReward: nextReward?nextReward.title:"Milestone Complete",
    },

    rewards: referralRewards,
    referralActivity,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});