import { registerEnumType } from '@nestjs/graphql';

export enum RoutingProvider {
  GOOGLE = 'GOOGLE',
  VALHALLA = 'VALHALLA',
}

registerEnumType(RoutingProvider, {
  name: 'RoutingProvider',
  description: 'Motor usado para calcular a rota',
});

/**
 * Lê o provider padrão do .env (ROUTING_PROVIDER=GOOGLE|VALHALLA).
 * Qualquer valor inválido ou ausente cai em GOOGLE.
 */
export function parseRoutingProvider(value?: string | null): RoutingProvider {
  const normalized = (value ?? '').trim().toUpperCase();
  return normalized === RoutingProvider.VALHALLA
    ? RoutingProvider.VALHALLA
    : RoutingProvider.GOOGLE;
}
