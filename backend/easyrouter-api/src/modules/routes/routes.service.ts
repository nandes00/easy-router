import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalculateRouteInput } from '../routes/graphql/inputs/calculate-route.input';
import { CalculatedRouteType } from './graphql/types/calculated-route.type';
import { SaveRouteInput } from './graphql/inputs/save-route.input';
import { RouteType } from './graphql/types/route.type';
import { GoogleMapsGateWay } from '../routes/gateways/google-maps.gateway';
import { RouteRepository } from './repositories/route.repository';
import { ValhallaGateway } from './gateways/valhalla.gateway';
import { parseRoutingProvider, RoutingProvider } from './enums/routing-provider.enum';

@Injectable()
export class RoutesService {

  constructor(
    private readonly googleMapsGateWay: GoogleMapsGateWay,
    private readonly valhallaGateway: ValhallaGateway,
    private readonly routeRepository: RouteRepository,
    private readonly configService: ConfigService,
  ) {}

  health(): string {
    return 'easyrouter API Online';
  }

  /** Provider padrão quando a requisição não informa um (ROUTING_PROVIDER no .env). */
  defaultProvider(): RoutingProvider {
    return parseRoutingProvider(this.configService.get<string>('ROUTING_PROVIDER'));
  }

  calculateRoute(input: CalculateRouteInput): Promise<CalculatedRouteType> {
    const provider = input.provider ?? this.defaultProvider();

    if (provider === RoutingProvider.VALHALLA) {
      return this.valhallaGateway.calculateRoute(input);
    }

    return this.googleMapsGateWay.calculateRoute(input);
  }

  saveRoute(input: SaveRouteInput, userId: string): Promise<RouteType> {
    return this.routeRepository.saveRoute(input, userId);
  }

  findAll(userId: string): Promise<RouteType[]> {
    return this.routeRepository.findAll(userId);
  }

  findById(id: string, userId: string): Promise<RouteType | null> {
    return this.routeRepository.findById(id, userId);
  }
}