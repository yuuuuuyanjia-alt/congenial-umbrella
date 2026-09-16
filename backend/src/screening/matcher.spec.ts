import { classifyConfidence, matchAgainstLists, normalizeName } from './matcher';

describe('模拟黑名单匹配（置信度分层）', () => {
  const lists = [
    {
      listCode: 'OFAC',
      name: 'BANNED TRADING LLC',
      aliases: ['BANNED TRADING'],
    },
    {
      listCode: 'OFAC',
      name: 'ACME INDUSTRIES LIMITED',
      aliases: [],
    },
    {
      listCode: 'CN_UNRELIABLE',
      name: '某不可靠实体贸易有限公司',
      aliases: [],
    },
  ];

  it('精确命中为高置信', () => {
    const hits = matchAgainstLists('Banned Trading LLC', lists);
    expect(hits[0].confidence).toBe('HIGH');
    expect(hits[0].listCode).toBe('OFAC');
  });

  it('近似名称为低/中置信而非高置信', () => {
    const hits = matchAgainstLists('Acme Industrial Co', lists);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].confidence).not.toBe('HIGH');
  });

  it('无关名称不命中', () => {
    expect(matchAgainstLists('Nordlicht GmbH', lists)).toHaveLength(0);
  });

  it('normalize 去掉公司后缀', () => {
    expect(normalizeName('Nordlicht GmbH')).toBe('NORDLICHT');
  });

  it('classifyConfidence 完全一致为 HIGH', () => {
    expect(classifyConfidence('Foo Bar Ltd', 'FOO BAR LIMITED')).toBe('HIGH');
  });
});
