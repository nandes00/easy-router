import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleGeocodingGateway } from './google-geocoding.gateway';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleGeocodingGateway', () => {
  const config = { get: jest.fn() };
  let gateway: GoogleGeocodingGateway;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue('chave-de-teste');
    gateway = new GoogleGeocodingGateway(config as unknown as ConfigService);
  });

  it('devolve lat/lng e endereço formatado do primeiro resultado', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 'OK',
        results: [
          {
            formatted_address: 'Praça XV de Novembro - Centro, Florianópolis - SC',
            geometry: { location: { lat: -27.5969, lng: -48.5495 } },
          },
        ],
      },
    });

    const result = await gateway.geocode('Praça XV de Novembro, Florianópolis SC');

    expect(result).toEqual({
      lat: -27.5969,
      lng: -48.5495,
      formattedAddress: 'Praça XV de Novembro - Centro, Florianópolis - SC',
    });
  });

  it('consulta o Google em português e priorizando o Brasil', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { status: 'OK', results: [{ formatted_address: 'x', geometry: { location: { lat: 1, lng: 2 } } }] },
    });

    await gateway.geocode('Centro, Florianópolis');

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/geocode/json'),
      { params: expect.objectContaining({ address: 'Centro, Florianópolis', language: 'pt-BR', region: 'br' }) },
    );
  });

  it('lança BadRequestException quando o endereço não existe (ZERO_RESULTS)', async () => {
    mockedAxios.get.mockResolvedValue({ data: { status: 'ZERO_RESULTS', results: [] } });

    await expect(gateway.geocode('Rua que não existe 99999')).rejects.toThrow(BadRequestException);
  });

  it('lança erro de configuração quando a Geocoding API não está habilitada (REQUEST_DENIED)', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { status: 'REQUEST_DENIED', error_message: 'This API project is not authorized', results: [] },
    });

    await expect(gateway.geocode('Centro')).rejects.toThrow(/REQUEST_DENIED/);
  });

  it('não chama o Google quando a chave não está configurada', async () => {
    config.get.mockReturnValue(undefined);

    await expect(gateway.geocode('Centro')).rejects.toThrow(InternalServerErrorException);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('trata falha de rede', async () => {
    mockedAxios.get.mockRejectedValue({ message: 'getaddrinfo ENOTFOUND maps.googleapis.com' });

    await expect(gateway.geocode('Centro')).rejects.toThrow(/ENOTFOUND/);
  });
});
