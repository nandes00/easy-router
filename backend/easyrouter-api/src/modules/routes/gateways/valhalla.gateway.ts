import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as polyline from '@mapbox/polyline';
import { CalculateRouteInput } from '../graphql/inputs/calculate-route.input';
import { CalculatedRouteType } from '../graphql/types/calculated-route.type';
import { RoutingProvider } from '../enums/routing-provider.enum';
import { formatDurationSeconds } from '../utils/format-duration';
import { GoogleGeocodingGateway } from './google-geocoding.gateway';

interface SimpleRouteResponse {
  provider: string;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  polylinePrecision: number;
}

/**
 * Calcula a rota pelo microserviço de roteirização (track-router), que usa o Valhalla.
 * Fluxo: endereço -> Google Geocoding -> [lat, lng] -> POST {ROUTER_MS_URL}/simple_route
 */
@Injectable()
export class ValhallaGateway {
  constructor(
    private readonly configService: ConfigService,
    private readonly geocodingGateway: GoogleGeocodingGateway,
  ) {}

  async calculateRoute(input: CalculateRouteInput): Promise<CalculatedRouteType> {
    const baseUrl = this.configService.get<string>('ROUTER_MS_URL') ?? 'http://localhost:3001';

    const [origin, destination] = await Promise.all([
      this.geocodingGateway.geocode(input.originAddress),
      this.geocodingGateway.geocode(input.destinationAddress),
    ]);

    let data: SimpleRouteResponse;
    try {
      const response = await axios.post<SimpleRouteResponse>(
        `${baseUrl}/simple_route`,
        {
          origin: [origin.lat, origin.lng],
          destination: [destination.lat, destination.lng],
          travelMode: 'DRIVE',
        },
        { timeout: 30000 },
      );
      data = response.data;
    } catch (error) {
      const err = error as AxiosError<any>;

      if (err.response?.status === 404) {
        throw new NotFoundException(
          'Nenhuma rota encontrada pelo Valhalla entre os endereços informados. ' +
            'Verifique se a região está coberta pelos dados de mapa carregados.',
        );
      }

      if (!err.response) {
        throw new InternalServerErrorException(
          `Microserviço de rotas indisponível em ${baseUrl}: ${err.message}`,
        );
      }

      const detail = err.response.data?.details ?? err.response.data?.error ?? err.message;
      throw new InternalServerErrorException(`Erro ao consultar o Valhalla: ${detail}`);
    }

    const precision = data.polylinePrecision ?? 5;
    const points = polyline.decode(data.encodedPolyline, precision).map(([lat, lng], index) => ({
      sequence: index + 1,
      lat,
      lng,
    }));

    return {
      originAddress: input.originAddress,
      destinationAddress: input.destinationAddress,
      distanceKm: Number((data.distanceMeters / 1000).toFixed(2)),
      durationText: formatDurationSeconds(data.durationSeconds),
      encodedPolyline: data.encodedPolyline,
      points,
      provider: RoutingProvider.VALHALLA,
    };
  }
}
