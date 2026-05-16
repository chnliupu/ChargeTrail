import { Router, type Request, type Response } from 'express';
import { createInvite, deleteInvite, listInvites } from '../services/auth/invite.js';
import { requireAdmin } from '../services/auth/middleware.js';
import { validateBody, getValidatedBody } from '../middleware/validate.js';
import { CreateInviteRequest, type CreateInviteRequestValue } from '../schemas/invites.js';

export const invitesRouter: Router = Router();

invitesRouter.use(requireAdmin);

invitesRouter.post('/invites', validateBody(CreateInviteRequest), (req: Request, res: Response) => {
  const body = getValidatedBody<CreateInviteRequestValue>(res);
  const ttlDays =
    typeof body.ttlDays === 'number' && body.ttlDays > 0 ? Math.floor(body.ttlDays) : undefined;
  const adminId = req.user!.id;
  const { code, row } = createInvite(adminId, ttlDays);
  res.status(201).json({
    code,
    invite: {
      id: row.id,
      expiresAt: row.expiresAt,
    },
  });
});

invitesRouter.get('/invites', (_req: Request, res: Response) => {
  const rows = listInvites().map((r) => ({
    id: r.id,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    usedAt: r.usedAt,
    usedBy: r.usedBy,
  }));
  res.json({
    invites: rows,
  });
});

invitesRouter.delete('/invites/:id', (req: Request, res: Response) => {
  const ok = deleteInvite(String(req.params.id));
  if (!ok) {
    res.status(404).json({
      error: 'invite not found',
    });
    return;
  }
  res.status(204).end();
});
