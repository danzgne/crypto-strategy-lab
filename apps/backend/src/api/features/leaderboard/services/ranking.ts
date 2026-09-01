import type { LeaderboardEntrySnapshot } from '@crypto-strategy-lab/shared';

import type { LeaderboardEntryCandidate } from '../types';

export function rankTopK(
  entries: readonly (LeaderboardEntryCandidate | LeaderboardEntrySnapshot)[],
  k: number,
): LeaderboardEntrySnapshot[] {
  const uniqueEntries = new Map<string, LeaderboardEntryCandidate>();
  for (const entry of entries) {
    const candidate = 'rank' in entry ? omitRank(entry) : entry;
    uniqueEntries.set(entry.experimentId, candidate);
  }

  return [...uniqueEntries.values()]
    .sort(compareEntries)
    .slice(0, Math.max(0, Math.trunc(k)))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function omitRank(entry: LeaderboardEntrySnapshot): LeaderboardEntryCandidate {
  const candidate = { ...entry } as LeaderboardEntryCandidate & {
    rank?: number;
  };
  delete candidate.rank;
  return candidate;
}

export function snapshotEntriesEqual(
  left: readonly LeaderboardEntrySnapshot[],
  right: readonly LeaderboardEntrySnapshot[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    if (other === undefined) return false;
    return (
      entry.experimentId === other.experimentId &&
      entry.rank === other.rank &&
      entry.strategyVersionId === other.strategyVersionId &&
      entry.strategyDisplayName === other.strategyDisplayName &&
      JSON.stringify(entry.memberStrategies) ===
        JSON.stringify(other.memberStrategies) &&
      entry.pair === other.pair &&
      entry.timeframe === other.timeframe &&
      entry.startTime === other.startTime &&
      entry.endTime === other.endTime &&
      entry.score === other.score &&
      entry.return === other.return &&
      entry.winRate === other.winRate &&
      entry.maxDrawdown === other.maxDrawdown &&
      entry.totalProfit === other.totalProfit &&
      entry.totalTrades === other.totalTrades
    );
  });
}

function compareEntries(
  left: LeaderboardEntryCandidate,
  right: LeaderboardEntryCandidate,
): number {
  const scoreOrder = compareDecimalStrings(right.score, left.score);
  return scoreOrder === 0
    ? left.experimentId.localeCompare(right.experimentId)
    : scoreOrder;
}

function compareDecimalStrings(left: string, right: string): number {
  const leftDecimal = parseDecimal(left);
  const rightDecimal = parseDecimal(right);
  if (leftDecimal !== null && rightDecimal !== null) {
    if (leftDecimal.sign !== rightDecimal.sign) {
      return leftDecimal.sign > rightDecimal.sign ? 1 : -1;
    }
    const magnitudeOrder = compareMagnitude(leftDecimal, rightDecimal);
    return leftDecimal.sign === -1 ? -magnitudeOrder : magnitudeOrder;
  }
  return left.localeCompare(right);
}

interface ParsedDecimal {
  digits: bigint;
  fractionalDigits: number;
  sign: -1 | 1;
}

function parseDecimal(value: string): ParsedDecimal | null {
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(
    value.trim(),
  );
  if (match === null) return null;

  const parsedSign: -1 | 1 = match[1] === '-' ? -1 : 1;
  const coefficient = match[2]!.split('.');
  const integerPart = coefficient[0] ?? '';
  const fractionalPart = coefficient[1] ?? '';
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1_000) {
    return null;
  }

  const digits = BigInt(`${integerPart}${fractionalPart}` || '0');
  const sign: -1 | 1 = digits === 0n ? 1 : parsedSign;
  const fractionalDigits = fractionalPart.length - exponent;
  if (fractionalDigits < 0) {
    return {
      digits: digits * 10n ** BigInt(-fractionalDigits),
      fractionalDigits: 0,
      sign,
    };
  }
  return { digits, fractionalDigits, sign };
}

function compareMagnitude(left: ParsedDecimal, right: ParsedDecimal): number {
  const fractionalDigits = Math.max(
    left.fractionalDigits,
    right.fractionalDigits,
  );
  const leftScaled =
    left.digits * 10n ** BigInt(fractionalDigits - left.fractionalDigits);
  const rightScaled =
    right.digits * 10n ** BigInt(fractionalDigits - right.fractionalDigits);
  return leftScaled === rightScaled ? 0 : leftScaled > rightScaled ? 1 : -1;
}
