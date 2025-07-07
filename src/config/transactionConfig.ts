export const transactionConfig = {
  strategy: process.env.TRANSACTION_STRATEGY ?? 'ATOMIC',
  isolationLevel: process.env.ISOLATION_LEVEL ?? 'Read Committed',
}
