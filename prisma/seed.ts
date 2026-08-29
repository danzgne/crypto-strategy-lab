import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

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

  const defaultSources = [
    {
      name: 'CoinDesk',
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      providerType: 'RSS' as const,
      isActive: true,
    },
    {
      name: 'Cointelegraph',
      url: 'https://cointelegraph.com/rss',
      providerType: 'RSS' as const,
      isActive: true,
    },
    {
      name: 'Decrypt',
      url: 'https://decrypt.co/feed',
      providerType: 'RSS' as const,
      isActive: true,
    },
    {
      name: 'The Block',
      url: 'https://www.theblock.co/rss.xml',
      providerType: 'RSS' as const,
      isActive: true,
    },
    {
      name: 'Bankless',
      url: 'https://www.bankless.com/rss/feed',
      providerType: 'RSS' as const,
      isActive: true,
    },
  ];

  for (const source of defaultSources) {
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
