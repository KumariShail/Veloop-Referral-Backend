const express = require("express");
const cors = require("cors");

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://veloop-referral-frontend-mnhs.vercel.app",
    ],
  })
);

const PORT = process.env.PORT || 5000;

// Referral data
const referralData = {
  referralCode: "18642076",
  referralLink: "velooprewards.vercel.app/register?ref=18642076",

  totalReferrals: 18,
  successfulReferrals: 14,
  pendingReferrals: 4,

  adWatchTasksCompleted: 12,
};

// Referral activity
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

// Referral rewards
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

// Calculate referral progress
function calculateReferralProgress(current, rewards) {
  const milestoneRewards = rewards
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

  return {
    current,
    target,
    remaining,
    percent,
    milestoneComplete,
    nextReward: nextReward
      ? nextReward.title
      : "Milestone Complete",
  };
}

const current = referralData.adWatchTasksCompleted;

const referralProgress = calculateReferralProgress(
  current,
  referralRewards
);

// Home route
app.get("/", (req, res) => {
  res.send("VELOOP Backend is running!");
});

// Summary route
app.get("/api/referrals/summary", (req, res) => {
  const successRate = Math.round(
    (referralData.successfulReferrals /
      referralData.totalReferrals) *
      100
  );

  res.json({
    totalReferrals: referralData.totalReferrals,
    successfulReferrals: referralData.successfulReferrals,
    pendingReferrals: referralData.pendingReferrals,
    successRate,
  });
});

// Add new referral
app.post("/api/referrals", (req, res) => {
  const newReferral = req.body;

  console.log(newReferral);

  referralActivity.push(newReferral);

  referralData.totalReferrals += 1;

  if (newReferral.status === "Pending") {
    referralData.pendingReferrals += 1;
  } else if (newReferral.status === "Successful") {
    referralData.successfulReferrals += 1;
  }

  res.json(newReferral);
});

// Get referral data
app.get("/api/referrals/me", (req, res) => {
  res.json({
    referralCode: referralData.referralCode,
    referralLink: referralData.referralLink,

    totalReferrals: referralData.totalReferrals,
    successfulReferrals: referralData.successfulReferrals,
    pendingReferrals: referralData.pendingReferrals,

    referralProgress,

    rewards: referralRewards,
    referralActivity,
  });
});

// Update referral status
app.patch("/api/referrals/:id", (req, res) => {
  const referralId = req.params.id;
  const newStatus = req.body.status;

  const referral = referralActivity.find(
    (item) => item.referralId === referralId
  );
  if (newStatus !== "Pending" && newStatus !== "Successful") {
  return res.status(400).json({
    message: "Invalid status. Use Pending or Successful.",
  });
  }
  if (!referral) {
    return res.status(404).json({
      message: "Referral not found",
    });
  }

  if (referral.status === "Pending" && newStatus === "Successful") {
    referralData.pendingReferrals -= 1;
    referralData.successfulReferrals += 1;
  }

  referral.status = newStatus;

  res.json(referral);
});
app.delete("/api/referrals/:id", (req, res) => {
  const referralId = req.params.id;

  const index = referralActivity.findIndex(
    (item) => item.referralId === referralId
  );

  if (index === -1) {
    return res.status(404).json({
      message: "Referral not found",
    });
  }

  const deletedReferral = referralActivity[index];

  referralActivity.splice(index, 1);

  referralData.totalReferrals -= 1;

  if (deletedReferral.status === "Pending") {
    referralData.pendingReferrals -= 1;
  } else if (deletedReferral.status === "Successful") {
    referralData.successfulReferrals -= 1;
  }

  res.json({
    message: "Referral deleted successfully",
    deletedReferral,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});