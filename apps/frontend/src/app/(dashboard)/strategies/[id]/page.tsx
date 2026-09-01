import { StrategyEntryDetail } from '../../../../features/strategies/components/StrategyEntryDetail';

export default async function StrategyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StrategyEntryDetail entryId={id} />;
}
