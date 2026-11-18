import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RoutingProvider } from '../../enums/routing-provider.enum';

@InputType()
export class CalculateRouteInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  originAddress: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  destinationAddress: string;

  /** Opcional: se não vier, usa ROUTING_PROVIDER do .env (padrão GOOGLE). */
  @Field(() => RoutingProvider, { nullable: true })
  @IsOptional()
  @IsEnum(RoutingProvider)
  provider?: RoutingProvider;
}
