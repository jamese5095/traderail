import { deployment } from './chain';

/** Fields supplied by the V2 deployment manifest; V1 manifests never enable guided signing. */
export const orderDeployment = deployment as typeof deployment & {
  buyer?: string; orderAmount?: string; protocolVersion?: number; demoOnly?: boolean; deploymentBlockHash?: string;
};
export const isOrderProtocol = orderDeployment.protocolVersion === 2;
