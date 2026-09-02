import type { Request, Response } from 'express';
import type { SearchScheduler } from '../services/searchScheduler';
import type { TradeRetentionService } from '../services/tradeRetentionService';
import type { StartDiscoverySessionInput } from '@crypto-strategy-lab/shared';

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return 'Unknown error occurred';
}

export class SearchController {
  public constructor(
    private readonly scheduler: SearchScheduler,
    private readonly tradeRetentionService?: TradeRetentionService | undefined,
  ) {}

  public startSession = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as StartDiscoverySessionInput;
    if (!body || !body.searchSpace) {
      res.status(400).json({ error: 'Missing searchSpace in request body' });
      return;
    }

    try {
      const session = await this.scheduler.startSession({
        algorithm: body.algorithm,
        searchSpace: body.searchSpace,
        stopPolicy: body.stopPolicy,
        userId,
      });

      res.status(201).json({ session });
    } catch (err) {
      res.status(400).json({ error: toErrorMessage(err) });
    }
  };

  public getCurrentSession = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const session = this.scheduler.getSession(userId);
    res.json({ session });
  };

  public pauseSession = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const success = await this.scheduler.pauseSession(userId);
    if (!success) {
      res.status(404).json({ error: 'No active session found to pause' });
      return;
    }

    res.json({ status: 'PAUSED' });
  };

  public resumeSession = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const success = await this.scheduler.resumeSession(userId);
    if (!success) {
      res.status(404).json({ error: 'No paused session found to resume' });
      return;
    }

    res.json({ status: 'ACTIVE' });
  };

  public stopSession = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const success = await this.scheduler.stopSession(userId);
    if (!success) {
      res
        .status(404)
        .json({ error: 'No active or paused session found to stop' });
      return;
    }

    res.json({ status: 'STOPPED' });
  };

  public getHistoricalRuns = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const runs = await this.scheduler.getHistoricalRuns(userId);
    res.json({ runs });
  };

  public setExperimentPinned = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const experimentId = req.params.id as string;
    if (!experimentId) {
      res.status(400).json({ error: 'Missing experiment id parameter' });
      return;
    }

    const isPinned = req.body?.isPinned === true;

    if (!this.tradeRetentionService) {
      res.status(501).json({ error: 'Trade retention service not configured' });
      return;
    }

    const success = await this.tradeRetentionService.setExperimentPinned(
      experimentId,
      userId,
      isPinned,
    );

    if (!success) {
      res.status(404).json({ error: 'Experiment not found or unauthorized' });
      return;
    }

    res.json({ experimentId, isPinned });
  };
}
