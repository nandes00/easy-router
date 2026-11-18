import { parseRoutingProvider, RoutingProvider } from './routing-provider.enum';

describe('parseRoutingProvider', () => {
  it.each([
    ['VALHALLA', RoutingProvider.VALHALLA],
    ['valhalla', RoutingProvider.VALHALLA],
    ['  Valhalla  ', RoutingProvider.VALHALLA],
    ['GOOGLE', RoutingProvider.GOOGLE],
    ['google', RoutingProvider.GOOGLE],
  ])('converte "%s" em %s', (value, expected) => {
    expect(parseRoutingProvider(value)).toBe(expected);
  });

  it.each([undefined, null, '', 'osrm', '123'])(
    'cai em GOOGLE quando o valor é inválido ou ausente (%p)',
    (value) => {
      expect(parseRoutingProvider(value)).toBe(RoutingProvider.GOOGLE);
    },
  );
});
