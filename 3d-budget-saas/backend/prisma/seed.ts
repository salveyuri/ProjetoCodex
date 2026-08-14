import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Standardized seed for a fresh database — today it only promotes a
 * pre-registered user to ADMIN, replacing the ad-hoc "UPDATE users SET
 * role = 'ADMIN'" done by hand during development (see
 * Contextos/Conhecimento.md). Register the user through the app first;
 * this only flips the role. Safe to run more than once (idempotent).
 *
 * Usage: SEED_ADMIN_EMAIL=you@example.com npx prisma db seed
 */
async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim();

  if (!adminEmail) {
    console.log(
      "SEED_ADMIN_EMAIL not set — nothing to seed. " +
        "Set it to a registered user's email to promote them to ADMIN.",
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    console.warn(
      `No user found with email "${adminEmail}" — register through the app first, then re-run the seed.`,
    );
    return;
  }

  if (user.role === "ADMIN") {
    console.log(`"${adminEmail}" is already ADMIN — nothing to do.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });

  console.log(`Promoted "${adminEmail}" to ADMIN.`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
