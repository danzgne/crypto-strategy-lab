import { prisma } from '../src/db';

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create a Strategy and Version
  const strategy = await prisma.strategy.upsert({
    where: { name: 'MACrossover' },
    update: {},
    create: {
      name: 'MACrossover',
      description: 'Moving Average Crossover Strategy',
      versions: {
        create: {
          versionTag: 'v1.0.0',
          parameters: { fastPeriod: 10, slowPeriod: 50 },
        },
      },
    },
    include: {
      versions: true,
    },
  });
  
  const versionId = strategy.versions[0].id;
  console.log(`Created Strategy Version: ${versionId}`);

  // 2. Create an Experiment
  const experiment = await prisma.experiment.create({
    data: {
      strategyVersionId: versionId,
      pair: 'BTCUSDT',
      timeframe: '5m',
      fromDate: new Date('2025-01-01T00:00:00Z'),
      toDate: new Date('2025-01-02T00:00:00Z'),
      initialInvestment: 100,
      status: 'COMPLETED',
      winRate: 0.618,
      wins: 110,
      losses: 68,
      totalProfit: 8.42,
      maxDrawdown: -3.21,
      totalTrades: 178,
    },
  });
  console.log(`Created Experiment: ${experiment.id}`);

  // 3. Create a Trade
  await prisma.trade.create({
    data: {
      experimentId: experiment.id,
      pair: 'BTCUSDT',
      entryTime: new Date('2025-01-01T06:15:00Z'),
      exitTime: new Date('2025-01-01T08:30:00Z'),
      direction: 'LONG',
      weight: 100,
      entryPrice: 68120.5,
      exitPrice: 68650.8,
      stopLoss: 67600.0,
      takeProfit: 69120.0,
      transactionCost: 0.05,
      slippage: 0.03,
      profit: 0.8,
    },
  });
  console.log('Created sample Trade');

  // 4. Create a Leaderboard Entry
  await prisma.leaderboardEntry.create({
    data: {
      strategyVersionId: versionId,
      experimentId: experiment.id,
      score: 85.5,
      rank: 1,
    },
  });
  console.log('Created Leaderboard Entry');

  // 5. Create a News Item and Sentiment
  await prisma.newsItem.create({
    data: {
      title: 'Bitcoin Surges Past 70k',
      content: 'Bitcoin reaches new all-time high amidst institutional adoption.',
      source: 'CryptoNews',
      url: 'https://example.com/news',
      publishedAt: new Date(),
      relatedCoins: ['BTC'],
      sentiments: {
        create: {
          classification: 'POSITIVE',
          score: 0.95,
        },
      },
    },
  });
  console.log('Created News & Sentiment');

  // 6. Create a PENDING BacktestJob so the worker has something to pick up
  await prisma.backtestJob.create({
    data: {
      experimentId: experiment.id,
      status: 'PENDING',
    },
  });
  console.log('Created PENDING BacktestJob for the worker');

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
