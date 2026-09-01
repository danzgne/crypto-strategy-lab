import { BacktestResultView } from '../../../../features/backtests';

export default async function BacktestResultPage({
  params,
}: {
  params: Promise<{ experimentId: string }>;
}) {
  const { experimentId } = await params;
  return <BacktestResultView experimentId={experimentId} />;
}
