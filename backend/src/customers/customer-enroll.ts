import { Prisma, PrismaClient } from '@prisma/client';
import { CUSTOMER_PARTY_ROLES, PartyRole } from '../common/constants';
import {
  countryKey,
  fillBlank,
  hasReachedN3,
  keysOf,
  nameKey,
  pickMatchingCustomer,
  registrationKey,
} from './customer-match';

export type EnrollResult = {
  id: string;
  name: string;
  created: boolean;
  merged: boolean;
  linked: boolean;
};

/**
 * 案件到达 N3 后，按匹配规则 upsert 客户并把本案买方/付款人/收货人挂到该客户。
 * 未到达 N3 时不录入。幂等。
 */
export async function enrollBuyerForCase(prisma: PrismaClient, caseId: string): Promise<EnrollResult | null> {
  const row = await prisma.tradeCase.findUnique({
    where: { id: caseId },
    include: { nodes: true, parties: true },
  });
  if (!row) return null;
  const n3 = row.nodes.find((n) => n.code === 'N3');
  if (!hasReachedN3(row.currentNode, n3?.status)) return null;

  const buyer = row.parties.find((p) => p.role === PartyRole.BUYER);
  const name = buyer?.name?.trim();
  if (!buyer || !name) return null;

  const prevCustomerId = buyer.customerId;

  const all = await prisma.customer.findMany();
  const matched = pickMatchingCustomer(all, buyer);
  const keys = keysOf(buyer);

  let customer: { id: string; name: string };
  let created = false;
  let merged = false;

  if (matched) {
    merged = true;
    const nextNameEn = fillBlank(matched.nameEn, buyer.nameEn);
    const nextCountry = fillBlank(matched.country, buyer.country);
    const nextAddress = fillBlank(matched.address, buyer.address);
    const nextReg = fillBlank(matched.registrationNo, buyer.registrationNo);
    customer = await prisma.customer.update({
      where: { id: matched.id },
      data: {
        nameEn: nextNameEn,
        country: nextCountry,
        address: nextAddress,
        registrationNo: nextReg,
        nameKey: nameKey(matched.name),
        countryKey: countryKey(nextCountry),
        registrationKey: registrationKey(nextReg),
      },
    });
  } else {
    try {
      customer = await prisma.customer.create({
        data: {
          name,
          nameEn: buyer.nameEn || null,
          country: buyer.country || null,
          address: buyer.address || null,
          registrationNo: buyer.registrationNo || null,
          nameKey: keys.nameKey,
          countryKey: keys.countryKey,
          registrationKey: keys.registrationKey,
        },
      });
      created = true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await prisma.customer.findFirst({
          where: { nameKey: keys.nameKey, countryKey: keys.countryKey },
        });
        if (!raced) throw e;
        customer = raced;
        merged = true;
      } else {
        throw e;
      }
    }
  }

  await prisma.party.updateMany({
    where: { caseId, role: { in: [...CUSTOMER_PARTY_ROLES] } },
    data: { customerId: customer.id },
  });

  return {
    id: customer.id,
    name: customer.name,
    created,
    merged,
    linked: prevCustomerId !== customer.id,
  };
}
