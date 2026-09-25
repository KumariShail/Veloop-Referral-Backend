require("dotenv").config();

const fs = require("fs");

(async () => {
  const { default: postgres } = await import("@prisma/orm-postgres/runtime");

  const contractJson = JSON.parse(
    fs.readFileSync("./src/prisma/contract.json", "utf8")
  );

  const db = postgres({
    contractJson,
    url: process.env.DATABASE_URL,
  });

  await db.connect();

  const existing = await db.orm.public.ReferralProgress
    .where((p) => p.referralId.eq(7))
    .first();

  if (existing) {
    console.log("Progress already exists:", existing);
  } else {
    const progress = await db.orm.public.ReferralProgress.create({
      userId: 12,
      referralId: 7,
      adsCompleted: 0,
      currentMilestone: 0,
    });

    console.log("Progress created:", progress);
  }

  process.exit(0);
})();
