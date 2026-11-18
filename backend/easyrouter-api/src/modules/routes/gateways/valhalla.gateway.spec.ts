import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as polyline from '@mapbox/polyline';
import { ValhallaGateway } from './valhalla.gateway';
import { GoogleGeocodingGateway } from './google-geocoding.gateway';
import { RoutingProvider } from '../enums/routing-provider.enum';

// Substitui o axios inteiro: nenhuma chamada HTTP real sai do teste
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ORIGIN = { lat: -27.5954, lng: -48.548, formattedAddress: 'Praça XV, Florianópolis' };
const DESTINATION = { lat: -27.6703, lng: -48.5525, formattedAddress: 'Aeroporto, Florianópolis' };
const ROUTE_POINTS: [number, number][] = [
  [-27.5954, -48.548],
  [-27.62, -48.55],
  [-27.6703, -48.5525],
];

describe('ValhallaGateway', () => {
  const geocoding = { geocode: jest.fn() };
  const config = { get: jest.fn() };
  let gateway: ValhallaGateway;

  const input = {
    originAddress: 'Praça XV de Novembro, Florianópolis SC',
    destinationAddress: 'Aeroporto Internacional de Florianópolis SC',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((key: string) =>
      key === 'ROUTER_MS_URL' ? 'http://router-ms:3001' : undefined,
    );
    geocoding.geocode.mockImplementation(async (address: string) =>
      address === input.originAddress ? ORIGIN : DESTINATION,
    );
    gateway = new ValhallaGateway(
      config as unknown as ConfigService,
      geocoding as unknown as GoogleGeocodingGateway,
    );
  });

  describe('caminho feliz', () => {
    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({
        data: {
          provider: 'valhalla',
          distanceMeters: 14905,
          durationSeconds: 1204,
          encodedPolyline: polyline.encode(ROUTE_POINTS, 5),
          polylinePrecision: 5,
        },
      });
    });

    it('geocodifica origem e destino', async () => {
      await gateway.calculateRoute(input);

      expect(geocoding.geocode).toHaveBeenCalledWith(input.originAddress);
      expect(geocoding.geocode).toHaveBeenCalledWith(input.destinationAddress);
    });

    it('chama o /simple_route do microserviço com as coordenadas em [lat, lng]', async () => {
      await gateway.calculateRoute(input);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://router-ms:3001/simple_route',
        {
          origin: [ORIGIN.lat, ORIGIN.lng],
          destination: [DESTINATION.lat, DESTINATION.lng],
          travelMode: 'DRIVE',
        },
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });

    it('converte a resposta no formato que o front espera', async () => {
      const result = await gateway.calculateRoute(input);

      expect(result).toMatchObject({
        originAddress: input.originAddress,
        destinationAddress: input.destinationAddress,
        distanceKm: 14.9, // 14905 m (resposta real do centro ao aeroporto)
        durationText: '20 min',
        provider: RoutingProvider.VALHALLA,
      });
    });

    it('decodifica a polyline em pontos numerados na ordem da rota', async () => {
      const result = await gateway.calculateRoute(input);

      expect(result.points).toEqual([
        { sequence: 1, lat: -27.5954, lng: -48.548 },
        { sequence: 2, lat: -27.62, lng: -48.55 },
        { sequence: 3, lat: -27.6703, lng: -48.5525 },
      ]);
    });

    it('usa http://localhost:3001 quando ROUTER_MS_URL não está configurado', async () => {
      config.get.mockReturnValue(undefined);

      await gateway.calculateRoute(input);

      expect(mockedAxios.post.mock.calls[0][0]).toBe('http://localhost:3001/simple_route');
    });
  });

  describe('erros', () => {
    it('lança NotFoundException quando o Valhalla não encontra rota (404)', async () => {
      mockedAxios.post.mockRejectedValue({ response: { status: 404, data: {} }, message: '404' });

      await expect(gateway.calculateRoute(input)).rejects.toThrow(NotFoundException);
    });

    it('avisa que o microserviço está fora do ar quando não há resposta', async () => {
      mockedAxios.post.mockRejectedValue({ message: 'connect ECONNREFUSED 127.0.0.1:3001' });

      await expect(gateway.calculateRoute(input)).rejects.toThrow(
        /Microserviço de rotas indisponível/,
      );
    });

    it('repassa o detalhe do erro quando o microserviço responde 502', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 502, data: { error: 'Falha', details: 'timeout no Valhalla' } },
        message: '502',
      });

      await expect(gateway.calculateRoute(input)).rejects.toThrow(
        new InternalServerErrorException('Erro ao consultar o Valhalla: timeout no Valhalla'),
      );
    });

    it('não chama o microserviço se a geocodificação falhar', async () => {
      geocoding.geocode.mockRejectedValue(new Error('Endereço não encontrado'));

      await expect(gateway.calculateRoute(input)).rejects.toThrow('Endereço não encontrado');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
