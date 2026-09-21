import { displayGoodsName, parseContractUnit, parseTtVouchers, resolveCarriedGoods } from './goods-fields';

describe('货物名称 / 规格贯通', () => {
  it('展示回填剔除默认「机械」，保存侧不依赖此函数', () => {
    expect(displayGoodsName('机械')).toBe('');
    expect(displayGoodsName(' 数控机床配件 ')).toBe('数控机床配件');
    expect(displayGoodsName('')).toBe('');
  });

  it('合同优先于报价、报价优先于案件；规格同步携带', () => {
    expect(
      resolveCarriedGoods({
        contract: { goodsDesc: '合同货', goodsSpec: '合同规格' },
        quote: { goodsDesc: '报价货', goodsSpec: '报价规格' },
        caseGoodsDesc: '案件货',
        caseGoodsSpec: '案件规格',
      }),
    ).toEqual({ goodsDesc: '合同货', goodsSpec: '合同规格' });

    expect(
      resolveCarriedGoods({
        quote: { goodsDesc: '报价货', snapshot: { goodsSpec: '快照规格' } },
        caseGoodsDesc: '案件货',
        caseGoodsSpec: '案件规格',
      }),
    ).toEqual({ goodsDesc: '报价货', goodsSpec: '快照规格' });

    expect(
      resolveCarriedGoods({
        caseGoodsDesc: '机械',
        caseGoodsSpec: 'Φ12',
      }),
    ).toEqual({ goodsDesc: '', goodsSpec: 'Φ12' });
  });

  it('合同单位仅吨/千克，旧套/台回退为吨', () => {
    expect(parseContractUnit('千克')).toBe('KG');
    expect(parseContractUnit('TON')).toBe('TON');
    expect(parseContractUnit('套')).toBe('TON');
    expect(parseContractUnit('台')).toBe('TON');
    expect(parseContractUnit('')).toBeNull();
  });

  it('前 T/T 凭证 JSON 解析', () => {
    expect(parseTtVouchers('[{"ref":"TT-1","fileName":"水单.png"}]')).toEqual([
      { ref: 'TT-1', fileName: '水单.png' },
    ]);
    expect(parseTtVouchers([{ ref: '  ', fileName: '' }])).toEqual([]);
  });
});
