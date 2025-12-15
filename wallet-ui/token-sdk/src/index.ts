/**
 * @arkade-token/sdk
 * 
 * Token protocol SDK for Arkade
 * Implements 2-phase token creation:
 * - Phase 1: Bitcoin L1 OP_RETURN (proof)
 * - Phase 2: Arkade L2 Settlement (tracking)
 */

// Export Bitcoin utilities
export {
  BitcoinClient,
  initECC,
  type BitcoinUTXO,
  type BitcoinTransaction,
} from './bitcoin';

// Export fee estimator
export {
  FeeEstimator,
  type FeeEstimate,
} from './feeEstimator';

// Export Bitcoin encoding
export {
  encodeTokenCreationForBitcoin,
  decodeTokenCreationFromBitcoin,
  verifyTokenCreation,
  type TokenCreationData as BitcoinTokenData,
} from './bitcoinEncoding';

// Export token metadata functions
export {
  encodeTokenMetadata,
  decodeTokenMetadata,
  generateTokenId,
  validateTokenCreation,
  validateTransfer,
  formatTokenAmount,
  parseTokenAmount,
  isTokenMetadata,
  extractTokenMetadataFromTree,
  METADATA_VERSION,
  METADATA_MARKER,
  type TokenMetadata,
  type TokenCreationData,
} from './metadata';

// Export VTXO builder
export {
  TokenVTXOBuilder,
  selectTokenVTXOs,
  calculateTotalAmount,
  type TokenVTXOConfig,
} from './vtxo-builder';

// Legacy exports (will be deprecated)
export * from './types';
export * from './encoding';
export * from './provider';
export * from './wallet';

export { TokenProvider } from './provider';
export { TokenWallet } from './wallet';
export {
  encodeCreateToken,
  encodeTransferToken,
  encodeBurnToken,
  createOpReturnScript,
  extractOpReturnData,
  decodeTokenOperation,
} from './encoding';
