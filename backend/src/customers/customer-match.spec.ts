import { NodeStatus } from '../common/constants';
import {
  countryKey,
  hasReachedN3,
  nameKey,
  pickMatchingCustomer,
  registrationKey,
} from './customer-match';

describe('客户匹配（N3 录入合并）', () => {
  it('规范化名称去掉 GmbH / Ltd 等后缀', () => {
    expect(nameKey('Nordlicht GmbH')).toBe('NORDLICHT');
    expect(nameKey('Pacific Tools Pte Ltd')).toBe('PACIFIC TOOLS');
    expect(nameKey('  nordlicht gmbh  ')).toBe('NORDLICHT');
  });

  it('国家与税号规范化', () => {
    expect(countryKey(' de ')).toBe('DE');
    expect(registrationKey('DE 123-456.7')).toBe('DE1234567');
    expect(registrationKey('  ')).toBeNull();
  });

  it('税号优先匹配，即使名称不同', () => {
    const rows = [
      { id: 'a', name: 'Nordlicht GmbH', country: 'DE', registrationNo: 'HRB-111' },
      { id: 'b', name: 'Other GmbH', country: 'DE', registrationNo: 'HRB-222' },
    ];
    const hit = pickMatchingCustomer(rows, { name: 'Nordlicht Maschinen', country: 'DE', registrationNo: 'hrb 111' });
    expect(hit?.id).toBe('a');
  });

  it('无税号时按规范化名称 + 国家合并', () => {
    const rows = [{ id: 'nl', name: 'Nordlicht GmbH', country: 'DE', registrationNo: null }];
    const hit = pickMatchingCustomer(rows, { name: 'Nordlicht', country: 'DE' });
    expect(hit?.id).toBe('nl');
  });

  it('同名不同国家不合并', () => {
    const rows = [{ id: 'nl', name: 'Nordlicht GmbH', country: 'DE', registrationNo: null }];
    expect(pickMatchingCustomer(rows, { name: 'Nordlicht GmbH', country: 'AT' })).toBeNull();
  });

  it('名称+国家相同但税号冲突则不合并', () => {
    const rows = [{ id: 'a', name: 'Acme Industrial Co', country: 'US', registrationNo: 'TAX-1' }];
    expect(
      pickMatchingCustomer(rows, { name: 'Acme Industrial Co', country: 'US', registrationNo: 'TAX-2' }),
    ).toBeNull();
  });

  it('未填国家且规范化名称唯一时合并', () => {
    const rows = [{ id: 'nl', name: 'Nordlicht GmbH', country: 'DE', registrationNo: null }];
    expect(pickMatchingCustomer(rows, { name: 'Nordlicht' })?.id).toBe('nl');
  });

  it('未填国家且存在多个同名客户则不合并', () => {
    const rows = [
      { id: 'de', name: 'Acme Co', country: 'DE', registrationNo: null },
      { id: 'us', name: 'Acme Co', country: 'US', registrationNo: null },
    ];
    expect(pickMatchingCustomer(rows, { name: 'Acme Co' })).toBeNull();
  });
});

describe('是否到达 N3', () => {
  it('N1 / N2 未到达', () => {
    expect(hasReachedN3('N1')).toBe(false);
    expect(hasReachedN3('N2', NodeStatus.NOT_STARTED)).toBe(false);
  });

  it('currentNode 为 N3 及之后即视为到达', () => {
    expect(hasReachedN3('N3')).toBe(true);
    expect(hasReachedN3('N5')).toBe(true);
    expect(hasReachedN3('N9')).toBe(true);
    expect(hasReachedN3('N8')).toBe(true);
  });

  it('N3 节点已开始（即使 currentNode 仍为 N2）视为到达', () => {
    expect(hasReachedN3('N2', NodeStatus.IN_PROGRESS)).toBe(true);
    expect(hasReachedN3('N2', NodeStatus.PASSED)).toBe(true);
  });
});
