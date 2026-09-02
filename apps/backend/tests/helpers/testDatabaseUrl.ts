export function getTestDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public'
  );
}
