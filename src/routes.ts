import express, { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

const router: Router = express.Router();

export type ReadinessCheck = () => Promise<Record<string, string>>;

export function healthRoutes(checkReadiness: ReadinessCheck): Router {
  router.get('/salud', (_req: Request, res: Response) => {
    res.status(StatusCodes.OK).send('Servicio de notificaciones operativo.');
  });
  router.get('/listo', async (_req: Request, res: Response) => {
    try {
      const dependencias = await checkReadiness();
      res.status(StatusCodes.OK).json({ estado: 'listo', dependencias });
    } catch (error) {
      res
        .status(StatusCodes.SERVICE_UNAVAILABLE)
        .json({ estado: 'no-listo', error: error instanceof Error ? error.message : String(error) });
    }
  });
  return router;
}
