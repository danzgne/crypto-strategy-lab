import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { DEFAULT_NEWS_SOURCES } from '@crypto-strategy-lab/shared';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'dev@example.com';

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: 'dummy_hash',
      role: 'USER',
    },
  });

  console.log('Seeded development user:', user.email);

  for (const source of DEFAULT_NEWS_SOURCES) {
    const existing = await prisma.newsSource.findFirst({
      where: { url: source.url },
    });
    if (!existing) {
      await prisma.newsSource.create({ data: source });
    }
  }

  console.log('Seeded default news sources');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
