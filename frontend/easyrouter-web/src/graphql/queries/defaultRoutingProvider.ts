import { gql } from '@apollo/client/core';

export const DEFAULT_ROUTING_PROVIDER_QUERY = gql`
  query DefaultRoutingProvider {
    defaultRoutingProvider
  }
`;
