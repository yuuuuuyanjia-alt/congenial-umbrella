import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: {
    caseId?: string | null;
    actorId?: string | null;
    action: string;
    nodeCode?: string | null;
    detail?: unknown;
  }) {
    return this.prisma.auditLog.create({
      data: {
        caseId: input.caseId ?? null,
        actorId: input.actorId?.trim() ? input.actorId : null,
        action: input.action,
        nodeCode: input.nodeCode ?? null,
        detail: JSON.stringify(input.detail ?? {}),
      },
    });
  }

  async list(caseId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
      include: { actor: true },
    });
    return rows.map((r) => ({
      ...r,
      detail: safeJson(r.detail),
    }));
  }
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
