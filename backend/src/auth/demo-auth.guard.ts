import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  isRiskWritePath,
  isSupplementUploadPath,
  isWorkbenchWritePath,
  mutationDeniedReason,
  normalizeDemoRole,
  type MutationKind,
} from './roles';

@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.resolveUser(req);
    if (user) {
      req.demoUser = user;
      req.headers = req.headers || {};
      req.headers['x-actor-id'] = user.id;
    }

    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const url = String(req.originalUrl || req.url || req.path || '');
    const kind: MutationKind = isSupplementUploadPath(url)
      ? 'supplement'
      : isRiskWritePath(url)
        ? 'risk'
        : isWorkbenchWritePath(url)
          ? 'workbench'
          : 'business';
    const reason = mutationDeniedReason(user?.role, kind);
    if (reason) throw new ForbiddenException(reason);
    return true;
  }

  private async resolveUser(req: { headers?: Record<string, unknown>; query?: Record<string, unknown> }) {
    const actorId = readHeader(req, 'x-actor-id');
    if (actorId) {
      const byId = await this.prisma.user.findUnique({ where: { id: actorId } });
      if (byId) return byId;
    }
    const rawRole = readHeader(req, 'x-demo-role') || queryValue(req, 'demoRole');
    const role = normalizeDemoRole(rawRole);
    if (!role) return null;
    const exact = await this.prisma.user.findFirst({ where: { role }, orderBy: { createdAt: 'asc' } });
    if (exact) return exact;
    const all = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return all.find((u) => normalizeDemoRole(u.role) === role) || null;
  }
}

function readHeader(req: { headers?: Record<string, unknown> }, name: string): string | undefined {
  const h = req.headers || {};
  const v = h[name] ?? h[name.toLowerCase()];
  if (Array.isArray(v)) return String(v[0] || '').trim() || undefined;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function queryValue(req: { query?: Record<string, unknown> }, name: string): string | undefined {
  const v = req.query?.[name];
  if (Array.isArray(v)) return String(v[0] || '').trim() || undefined;
  return v != null && String(v).trim() ? String(v).trim() : undefined;
}
