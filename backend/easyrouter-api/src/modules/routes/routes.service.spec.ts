import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RoutesService } from './routes.service';
import { GoogleMapsGateWay } from './gateways/google-maps.gateway';
import { ValhallaGateway } from './gateways/valhalla.gateway';
import { RouteRepository } from './repositories/route.repository';
import { RoutingProvider } from './enums/routing-provider.enum';
import { CalculateRouteInput } from './graphql/inputs/calculate-route.input';

/**
 * Testa a REGRA DE NEGÓCIO principal da integração:
 * qual motor de rota é usado em cada situação.
 * Os gateways são mocks: nenhum Google/Valhalla de verdade é chamado.
 */
describe('RoutesService - escolha do motor de rota', () => {
  const googleGateway = { calculateRoute: jest.fn() };
  const valhallaGateway = { calculateRoute: jest.fn() };
  const repository = { saveRoute: jest.fn(), findAll: jest.fn(), findById: jest.fn() };
  const env: Record<string, string | undefined> = {};

  let service: RoutesService;

  const input = (provider?: RoutingProvider): CalculateRouteInput => ({
    originAddress: 'Praça XV de Novembro, Florianópolis SC',
    destinationAddress: 'Aeroporto Internacional de Florianópolis SC',
    provider,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const key of Object.keys(env)) delete env[key];

    googleGateway.calculateRoute.mockResolvedValue({ provider: RoutingProvider.GOOGLE });
    valhallaGateway.calculateRoute.mockResolvedValue({ provider: RoutingProvider.VALHALLA });

    // Monta o service pela injeção de dependências do Nest, trocando as dependências por mocks
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutesService,
        { provide: GoogleMapsGateWay, useValue: googleGateway },
        { provide: ValhallaGateway, useValue: valhallaGateway },
        { provide: RouteRepository, useValue: repository },
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      ],
    }).compile();

    service = moduleRef.get(RoutesService);
  });

  it('usa o Valhalla quando a requisição pede VALHALLA', async () => {
    const result = await service.calculateRoute(input(RoutingProvider.VALHALLA));

    expect(valhallaGateway.calculateRoute).toHaveBeenCalledTimes(1);
    expect(googleGateway.calculateRoute).not.toHaveBeenCalled();
    expect(result.provider).toBe(RoutingProvider.VALHALLA);
  });

  it('usa o Google quando a requisição pede GOOGLE, mesmo com o .env em VALHALLA', async () => {
    env.ROUTING_PROVIDER = 'VALHALLA';

    await service.calculateRoute(input(RoutingProvider.GOOGLE));

    expect(googleGateway.calculateRoute).toHaveBeenCalledTimes(1);
    expect(valhallaGateway.calculateRoute).not.toHaveBeenCalled();
  });

  it('sem provider na requisição, segue o ROUTING_PROVIDER do .env', async () => {
    env.ROUTING_PROVIDER = 'valhalla';

    await service.calculateRoute(input());

    expect(valhallaGateway.calculateRoute).toHaveBeenCalledTimes(1);
  });

  it('sem provider e sem .env, usa o Google como padrão', async () => {
    await service.calculateRoute(input());

    expect(googleGateway.calculateRoute).toHaveBeenCalledTimes(1);
    expect(service.defaultProvider()).toBe(RoutingProvider.GOOGLE);
  });

  it('repassa o input sem alterações para o gateway escolhido', async () => {
    const payload = input(RoutingProvider.VALHALLA);

    await service.calculateRoute(payload);

    expect(valhallaGateway.calculateRoute).toHaveBeenCalledWith(payload);
  });

  describe('rotas salvas (repassa para o repositório com o usuário logado)', () => {
    it('saveRoute', async () => {
      const route = { originAddress: 'a', destinationAddress: 'b', distanceKm: 1, durationText: '1 min', points: [] };
      repository.saveRoute.mockResolvedValue({ id: 'r1', ...route });

      await expect(service.saveRoute(route, 'user-1')).resolves.toMatchObject({ id: 'r1' });
      expect(repository.saveRoute).toHaveBeenCalledWith(route, 'user-1');
    });

    it('findAll', async () => {
      repository.findAll.mockResolvedValue([]);

      await service.findAll('user-1');

      expect(repository.findAll).toHaveBeenCalledWith('user-1');
    });

    it('findById', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('r1', 'user-1')).resolves.toBeNull();
      expect(repository.findById).toHaveBeenCalledWith('r1', 'user-1');
    });
  });

  it('health', () => {
    expect(service.health()).toBe('easyrouter API Online');
  });
});
