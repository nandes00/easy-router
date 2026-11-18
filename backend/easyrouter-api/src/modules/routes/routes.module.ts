import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouteEntity } from './entities/route.entity';
import { RouteRepository } from './repositories/route.repository';
import { RoutesResolver } from './graphql/resolvers/routes.resolver';
import { RoutesService } from './routes.service';
import { GoogleMapsGateWay } from './gateways/google-maps.gateway';
import { GoogleGeocodingGateway } from './gateways/google-geocoding.gateway';
import { ValhallaGateway } from './gateways/valhalla.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([RouteEntity])],
  providers: [
    RoutesResolver,
    RoutesService,
    GoogleMapsGateWay,
    GoogleGeocodingGateway,
    ValhallaGateway,
    RouteRepository,
  ],
})
export class RoutesModule {}