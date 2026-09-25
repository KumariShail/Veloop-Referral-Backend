require("dotenv").config();

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

  const users = await db.orm.public.User.all();

  console.log(
    users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      hasPassword: !!user.passwordHash,
    }))
  );
}

main().catch((error) => {
  console.error("Error:", error);
});