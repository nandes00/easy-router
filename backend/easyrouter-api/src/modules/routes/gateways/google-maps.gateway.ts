import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as polyline from '@mapbox/polyline';
import { CalculateRouteInput } from '../graphql/inputs/calculate-route.input';
import { CalculatedRouteType } from '../graphql/types/calculated-route.type';
import { RoutingProvider } from '../enums/routing-provider.enum';

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Campos que queremos receber (obrigatório na Routes API)
const FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.localizedValues',
].join(',');

@Injectable()
export class GoogleMapsGateWay {
  constructor(private readonly configService: ConfigService) {}

  async calculateRoute(input: CalculateRouteInput): Promise<CalculatedRouteType> {
    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException('Google Maps API key não configurada.');
    }

    let data: any;
    try {
      const response = await axios.post(
          ROUTES_API_URL,
          {
            origin: { address: input.originAddress },
            destination: { address: input.destinationAddress },
            travelMode: 'DRIVE',
            languageCode: 'pt-BR',
            units: 'METRIC',
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': FIELD_MASK,
            },
          },
      );
      data = response.data;
    } catch (error) {
      const err = error as AxiosError<any>;
      const message = err.response?.data?.error?.message ?? err.message;
      throw new InternalServerErrorException(`Erro ao consultar Google Maps: ${message}`);
    }

    // Quando não encontra rota, a Routes API devolve {} (sem "routes")
    const route = data?.routes?.[0];
    if (!route) {
      throw new InternalServerErrorException(
          'Nenhuma rota encontrada entre os endereços informados.',
      );
    }

    const encodedPolyline: string = route.polyline.encodedPolyline;

    const points = polyline.decode(encodedPolyline).map(([lat, lng], index) => ({
      sequence: index + 1,
      lat,
      lng,
    }));

    const distanceKm = Number((route.distanceMeters / 1000).toFixed(2));

    // Texto amigável ("25 min"); se não vier, monta a partir de "1234s"
    const durationText: string =
        route.localizedValues?.duration?.text ?? this.formatDuration(route.duration);

    return {
      originAddress: input.originAddress,
      destinationAddress: input.destinationAddress,
      distanceKm,
      durationText,
      encodedPolyline,
      points,
      provider: RoutingProvider.GOOGLE,
    };
  }

  private formatDuration(duration: string): string {
    const totalSeconds = parseInt(duration.replace('s', ''), 10);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
  }
}