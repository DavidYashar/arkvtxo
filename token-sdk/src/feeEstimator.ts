/**
 * Bitcoin fee estimation using mempool.space API
 */

export interface FeeEstimate {
  fastestFee: number;    // ~10 min (high priority)
  halfHourFee: number;   // ~30 min (medium priority)
  hourFee: number;       // ~1 hour (economy)
  economyFee: number;    // ~6+ hours (low priority)
  minimumFee: number;    // Network minimum
}

export class FeeEstimator {
  private esploraUrl: string;

  constructor(esploraUrl: string = 'https://mempool.space/api') {
    this.esploraUrl = esploraUrl;
  }

  /**
   * Get recommended fees from mempool.space
   * Returns fees that are 1 sat/vbyte above current mempool block minimum
   */
  async getRecommendedFees(): Promise<FeeEstimate> {
    try {
      const response = await fetch(`${this.esploraUrl}/v1/fees/recommended`);
      if (!response.ok) {
        throw new Error('Failed to fetch fee estimates');
      }
      
      const fees = await response.json() as any;
      
      // Add 1 sat/vbyte to each tier as per requirement
      return {
        fastestFee: (fees.fastestFee || 50) + 1,
        halfHourFee: (fees.halfHourFee || 30) + 1,
        hourFee: (fees.hourFee || 20) + 1,
        economyFee: (fees.economyFee || 10) + 1,
        minimumFee: (fees.minimumFee || 5) + 1,
      };
    } catch (error) {
      console.error('Failed to fetch fees, using safe defaults:', error);
      // Safe fallback values for mainnet (already +1 sat added)
      return {
        fastestFee: 51,
        halfHourFee: 31,
        hourFee: 21,
        economyFee: 11,
        minimumFee: 6,
      };
    }
  }

  /**
   * Calculate total fee cost in sats
   */
  calculateFeeCost(feeRate: number, estimatedVbytes: number): number {
    return feeRate * estimatedVbytes;
  }

  /**
   * Get current mempool block minimum fee + 1 sat
   */
  async getCurrentBlockMinimum(): Promise<number> {
    try {
      const fees = await this.getRecommendedFees();
      return fees.minimumFee;
    } catch (error) {
      console.error('Failed to get minimum fee:', error);
      return 6; // Safe default (5 + 1)
    }
  }
}
