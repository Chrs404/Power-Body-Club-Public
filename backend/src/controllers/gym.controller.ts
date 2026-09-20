import { Request, Response } from 'express';
import * as gymService from '../services/gym.service';
import * as dashboardService from '../services/dashboard.service';
import { unauthorized, badRequest } from '../utils/app-error';

function parseId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identificativo non valido.');
  }
  return id;
}

export async function weeklySchedule(req: Request, res: Response): Promise<void> {
  const schedule = await gymService.getWeeklySchedule();
  res.json({ success: true, schedule });
}

export async function closures(req: Request, res: Response): Promise<void> {
  const items = await gymService.getUpcomingClosures(20);
  res.json({ success: true, closures: items });
}

export async function news(req: Request, res: Response): Promise<void> {
  const items = await gymService.listNews(20);
  res.json({ success: true, news: items });
}

export async function dashboard(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const data = await dashboardService.getClientDashboard(req.user.userId);
  res.json({ success: true, ...data });
}

// ---------------------------------------------------------------------------
// GESTIONE (solo istruttore)
// ---------------------------------------------------------------------------

export async function allNews(req: Request, res: Response): Promise<void> {
  const items = await gymService.listAllNews();
  res.json({ success: true, news: items });
}

export async function createNews(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw unauthorized('Autenticazione richiesta.');
  }
  const item = await gymService.createNews(req.user.userId, req.body);
  res.status(201).json({ success: true, message: 'Comunicazione pubblicata.', news: item });
}

export async function updateNews(req: Request, res: Response): Promise<void> {
  const item = await gymService.updateNews(parseId(req.params.id), req.body);
  res.json({ success: true, message: 'Comunicazione aggiornata.', news: item });
}

export async function deleteNews(req: Request, res: Response): Promise<void> {
  await gymService.deleteNews(parseId(req.params.id));
  res.json({ success: true, message: 'Comunicazione eliminata.' });
}

export async function updateSchedule(req: Request, res: Response): Promise<void> {
  const schedule = await gymService.replaceWeeklySchedule(req.body);
  res.json({ success: true, message: 'Orari aggiornati.', schedule });
}

export async function allClosures(req: Request, res: Response): Promise<void> {
  const items = await gymService.listAllClosures();
  res.json({ success: true, closures: items });
}

export async function createClosure(req: Request, res: Response): Promise<void> {
  const item = await gymService.createClosure(req.body);
  res.status(201).json({ success: true, message: 'Chiusura registrata.', closure: item });
}

export async function deleteClosure(req: Request, res: Response): Promise<void> {
  await gymService.deleteClosure(parseId(req.params.id));
  res.json({ success: true, message: 'Chiusura eliminata.' });
}
