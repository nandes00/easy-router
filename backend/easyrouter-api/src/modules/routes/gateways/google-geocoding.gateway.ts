import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GeocodedAddress {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Converte endereço em coordenadas usando a Geocoding API do Google.
 * Usado no modo Valhalla, que só trabalha com coordenadas.
 * Requer a "Geocoding API" habilitada na mesma chave GOOGLE_MAPS_API_KEY.
 */
@Injectable()
export class GoogleGeocodingGateway {
  constructor(private readonly configService: ConfigService) {}

  async geocode(address: string): Promise<GeocodedAddress> {
    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException('Google Maps API key não configurada.');
    }

    let data: any;
    try {
      const response = await axios.get(GEOCODING_API_URL, {
        params: {
          address,
          key: apiKey,
          language: 'pt-BR',
          region: 'br',
        },
      });
      data = response.data;
    } catch (error) {
      const err = error as AxiosError<any>;
      const message = err.response?.data?.error_message ?? err.message;
      throw new InternalServerErrorException(`Erro ao geocodificar endereço: ${message}`);
    }

    if (data?.status === 'ZERO_RESULTS') {
      throw new BadRequestException(`Endereço não encontrado: "${address}".`);
    }

    if (data?.status !== 'OK' || !data.results?.length) {
      const detail = data?.error_message ? ` - ${data.error_message}` : '';
      throw new InternalServerErrorException(
        `Erro ao geocodificar endereço: ${data?.status ?? 'resposta inválida'}${detail}`,
      );
    }

    const result = data.results[0];

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };
  }
}
