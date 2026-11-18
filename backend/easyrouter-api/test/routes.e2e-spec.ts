import { INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { RoutesResolver } from '../src/modules/routes/graphql/resolvers/routes.resolver';
import { RoutesService } from '../src/modules/routes/routes.service';
import { GoogleMapsGateWay } from '../src/modules/routes/gateways/google-maps.gateway';
import { ValhallaGateway } from '../src/modules/routes/gateways/valhalla.gateway';
import { RouteRepository } from '../src/modules/routes/repositories/route.repository';

/**
 * Teste de integração da mutation calculateRoute.
 *
 * Sobe uma aplicação Nest de verdade (GraphQL + Passport/JWT + GqlAuthGuard + RoutesService),
 * faz requisições HTTP reais com supertest e só troca as pontas externas por mocks:
 * os gateways (Google/Valhalla) e o repositório (Postgres).
 */
const JWT_SECRET = 'segredo-de-teste';

const CALCULATE_ROUTE = `
  mutation CalculateRoute($input: CalculateRouteInput!) {
    calculateRoute(input: $input) {
      originAddress
      destinationAddress
      distanceKm
      durationText
      provider
      points { sequence lat lng }
    }
  }
`;

const fakeRoute = (provider: 'GOOGLE' | 'VALHALLA') => ({
  originAddress: 'Praça XV de Novembro, Florianópolis SC',
  destinationAddress: 'Aeroporto Internacional de Florianópolis SC',
  distanceKm: provider === 'VALHALLA' ? 14.9 : 15.23,
  durationText: provider === 'VALHALLA' ? '20 min' : '21 min',
  encodedPolyline: 'abc',
  provider,
  points: [
    { sequence: 1, lat: -27.5954, lng: -48.548 },
    { sequence: 2, lat: -27.6703, lng: -48.5525 },
  ],
});

describe('Mutation calculateRoute (integração)', () => {
  let app: INestApplication<App>;
  let token: string;

  const googleGateway = { calculateRoute: jest.fn() };
  const valhallaGateway = { calculateRoute: jest.fn() };

  const env = { JWT_SECRET, ROUTING_PROVIDER: 'GOOGLE' };

  const gql = (query: string, variables?: object, authToken?: string) => {
    const req = request(app.getHttpServer()).post('/graphql');
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req.send({ query, variables });
  };

  const input = (provider?: string) => ({
    originAddress: 'Praça XV de Novembro, Florianópolis SC',
    destinationAddress: 'Aeroporto Internacional de Florianópolis SC',
    ...(provider ? { provider } : {}),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          context: ({ req }) => ({ req }),
        }),
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      providers: [
        // Configuração controlada pelo teste (no lugar do .env)
        { provide: ConfigService, useValue: { get: (key: keyof typeof env) => env[key] } },
        JwtStrategy,
        RoutesResolver,
        RoutesService,
        { provide: GoogleMapsGateWay, useValue: googleGateway },
        { provide: ValhallaGateway, useValue: valhallaGateway },
        { provide: RouteRepository, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    token = moduleRef.get(JwtService).sign({ sub: 'user-1', email: 'fernando@teste.com', name: 'Fernando' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    env.ROUTING_PROVIDER = 'GOOGLE';
    googleGateway.calculateRoute.mockResolvedValue(fakeRoute('GOOGLE'));
    valhallaGateway.calculateRoute.mockResolvedValue(fakeRoute('VALHALLA'));
  });

  describe('autenticação (GqlAuthGuard)', () => {
    it('bloqueia a requisição sem token', async () => {
      const res = await gql(CALCULATE_ROUTE, { input: input('VALHALLA') });

      expect(res.body.data).toBeNull();
      expect(res.body.errors[0].message).toMatch(/Unauthorized/);
      expect(valhallaGateway.calculateRoute).not.toHaveBeenCalled();
    });

    it('bloqueia a requisição com token inválido', async () => {
      const res = await gql(CALCULATE_ROUTE, { input: input('VALHALLA') }, 'token.falso.123');

      expect(res.body.errors[0].message).toMatch(/Unauthorized/);
      expect(valhallaGateway.calculateRoute).not.toHaveBeenCalled();
    });

    it('bloqueia token assinado com outro segredo', async () => {
      const outroToken = new JwtService({ secret: 'outro-segredo' }).sign({ sub: 'hacker' });

      const res = await gql(CALCULATE_ROUTE, { input: input('VALHALLA') }, outroToken);

      expect(res.body.errors[0].message).toMatch(/Unauthorized/);
    });
  });

  describe('com usuário autenticado', () => {
    it('calcula pelo Valhalla quando provider = VALHALLA', async () => {
      const res = await gql(CALCULATE_ROUTE, { input: input('VALHALLA') }, token);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.calculateRoute).toMatchObject({
        provider: 'VALHALLA',
        distanceKm: 14.9,
        durationText: '20 min',
      });
      expect(res.body.data.calculateRoute.points).toHaveLength(2);
      expect(valhallaGateway.calculateRoute).toHaveBeenCalledTimes(1);
      expect(googleGateway.calculateRoute).not.toHaveBeenCalled();
    });

    it('calcula pelo Google quando provider = GOOGLE', async () => {
      const res = await gql(CALCULATE_ROUTE, { input: input('GOOGLE') }, token);

      expect(res.body.data.calculateRoute.provider).toBe('GOOGLE');
      expect(googleGateway.calculateRoute).toHaveBeenCalledTimes(1);
    });

    it('sem provider, usa o ROUTING_PROVIDER configurado', async () => {
      env.ROUTING_PROVIDER = 'VALHALLA';

      const res = await gql(CALCULATE_ROUTE, { input: input() }, token);

      expect(res.body.data.calculateRoute.provider).toBe('VALHALLA');
    });

    it('rejeita um provider que não existe no enum do schema', async () => {
      const res = await gql(CALCULATE_ROUTE, { input: input('OSRM') }, token);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/RoutingProvider/);
      expect(googleGateway.calculateRoute).not.toHaveBeenCalled();
      expect(valhallaGateway.calculateRoute).not.toHaveBeenCalled();
    });

    it('rejeita requisição sem os endereços obrigatórios', async () => {
      const res = await gql(CALCULATE_ROUTE, { input: { provider: 'VALHALLA' } }, token);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/originAddress/);
    });

    it('devolve a mensagem de erro do gateway para o front', async () => {
      valhallaGateway.calculateRoute.mockRejectedValue(
        new NotFoundException('Nenhuma rota encontrada pelo Valhalla entre os endereços informados.'),
      );

      const res = await gql(CALCULATE_ROUTE, { input: input('VALHALLA') }, token);

      expect(res.body.data).toBeNull();
      expect(res.body.errors[0].message).toMatch(/Nenhuma rota encontrada pelo Valhalla/);
    });

    it('query defaultRoutingProvider devolve o padrão do .env', async () => {
      env.ROUTING_PROVIDER = 'VALHALLA';

      const res = await gql('{ defaultRoutingProvider }', undefined, token);

      expect(res.body.data.defaultRoutingProvider).toBe('VALHALLA');
    });
  });
});
