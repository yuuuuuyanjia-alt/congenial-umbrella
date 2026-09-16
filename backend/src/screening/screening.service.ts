import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { matchAgainstLists, riskFromScore } from './matcher';
import { MockListEntry } from './matcher';

@Injectable()
export class ScreeningService {
  constructor(private readonly prisma: PrismaService) {}

  async loadLists(): Promise<MockListEntry[]> {
    const rows = await this.prisma.blacklistEntry.findMany();
    return rows.map((r) => ({
      listCode: r.listCode,
      name: r.name,
      aliases: safeArr(r.aliases),
      country: r.country,
      note: r.note,
    }));
  }

  async screenName(name: string) {
    const lists = await this.loadLists();
    return matchAgainstLists(name, lists).map((h) => ({
      ...h,
      riskLevel: riskFromScore(h.score),
    }));
  }
}

function safeArr(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
