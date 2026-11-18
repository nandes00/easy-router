import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as polyline from '@mapbox/polyline';
import { GoogleMapsGateWay } from './google-maps.gateway';
import { RoutingProvider } from '../enums/routing-provider.enum';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleMapsGateWay', () => {
  const config = { get: jest.fn() };
  let gateway: GoogleMapsGateWay;
  const input = { originAddress: 'Centro, Florianópolis', destinationAddress: 'Aeroporto, Florianópolis' };

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue('chave-de-teste');
    gateway = new GoogleMapsGateWay(config as unknown as ConfigService);
  });

  it('converte a resposta da Routes API e marca o provider como GOOGLE', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        routes: [
          {
            distanceMeters: 15230,
            duration: '1260s',
            polyline: { encodedPolyline: polyline.encode([[-27.59, -48.54], [-27.67, -48.55]]) },
            localizedValues: { duration: { text: '21 min' } },
          },
        ],
      },
    });

    const result = await gateway.calculateRoute(input);

    expect(result).toMatchObject({ distanceKm: 15.23, durationText: '21 min', provider: RoutingProvider.GOOGLE });
    expect(result.points).toHaveLength(2);
  });

  it('formata a duração quando o Google não manda o texto pronto', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { routes: [{ distanceMeters: 1000, duration: '3900s', polyline: { encodedPolyline: '' } }] },
    });

    const result = await gateway.calculateRoute(input);

    expect(result.durationText).toBe('1 h 5 min');
  });

  it('lança erro quando a Routes API não devolve rota', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });

    await expect(gateway.calculateRoute(input)).rejects.toThrow(/Nenhuma rota encontrada/);
  });

  it('não chama o Google quando a chave não está configurada', async () => {
    config.get.mockReturnValue(undefined);

    await expect(gateway.calculateRoute(input)).rejects.toThrow(/API key não configurada/);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('repassa a mensagem de erro da Routes API (ex.: chave inválida)', async () => {
    mockedAxios.post.mockRejectedValue({
      message: 'Request failed with status code 403',
      response: { data: { error: { message: 'API key not valid' } } },
    });

    await expect(gateway.calculateRoute(input)).rejects.toThrow('Erro ao consultar Google Maps: API key not valid');
  });
});
