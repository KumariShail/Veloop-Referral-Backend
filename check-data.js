const fs = require("fs");

async function main() {
  const { default: postgres } = await import(
    "@prisma/orm-postgres/runtime"
  );

  const contractJson = JSON.parse(
    fs.readFileSync("./src/prisma/contract.json", "utf8")
  );

  const db = postgres({
    contractJson,
    url: process.env.DATABASE_URL,
  });

  await db.connect();

  console.log("\n=== REWARD CONFIGS ===");

  const rewards =
    await db.orm.public.RewardConfig.all();

  console.log(rewards);

  console.log("\n=== REFERRALS ===");

  const referrals =
    await db.orm.public.Referral.all();

  console.log(referrals);

  console.log("\n=== REFERRAL PROGRESS ===");

  const progress =
    await db.orm.public.ReferralProgress.all();

  console.log(progress);

  process.exit(0);
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});