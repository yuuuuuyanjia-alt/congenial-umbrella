import {
  isQuotePriceUnit,
  parseQuoteIncludedItems,
  parseQuotePriceUnit,
  quoteIncludedItemLabels,
  serializeQuoteIncludedItems,
} from './quote-fields';

describe('报价所含项目 / 单价单位', () => {
  it('解析 JSON 数组与旧自由文本', () => {
    expect(parseQuoteIncludedItems('["OCEAN_FREIGHT","PORT_CHARGES"]')).toEqual(['OCEAN_FREIGHT', 'PORT_CHARGES']);
    expect(parseQuoteIncludedItems('海运费、出口报关费')).toEqual(['OCEAN_FREIGHT']);
    expect(parseQuoteIncludedItems('陆运费 / 港杂')).toEqual(['INLAND_FREIGHT', 'PORT_CHARGES']);
    expect(parseQuoteIncludedItems(['海运费', 'PORT_CHARGES'])).toEqual(['OCEAN_FREIGHT', 'PORT_CHARGES']);
    expect(parseQuoteIncludedItems('')).toEqual([]);
    expect(parseQuoteIncludedItems(null)).toEqual([]);
  });

  it('序列化为结构化 JSON', () => {
    expect(serializeQuoteIncludedItems(['海运费', 'INLAND_FREIGHT', 'INLAND_FREIGHT'])).toBe(
      JSON.stringify(['OCEAN_FREIGHT', 'INLAND_FREIGHT']),
    );
    expect(quoteIncludedItemLabels(['OCEAN_FREIGHT', 'PORT_CHARGES'])).toBe('海运费、港杂');
  });

  it('单价单位仅吨或千克', () => {
    expect(parseQuotePriceUnit('TON')).toBe('TON');
    expect(parseQuotePriceUnit('千克')).toBe('KG');
    expect(isQuotePriceUnit('吨')).toBe(true);
    expect(isQuotePriceUnit('USD')).toBe(false);
    expect(isQuotePriceUnit('')).toBe(false);
  });
});
