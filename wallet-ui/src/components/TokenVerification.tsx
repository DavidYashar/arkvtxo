'use client';

import { useState } from 'react';
import { Shield, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface TokenVerificationProps {
  privateKey: string;
}

interface VerificationResult {
  token?: {
    tokenId: string;
    name: string;
    symbol: string;
    totalSupply: string;
    decimals: number;
    creator: string;
    vtxoId: string;
  };
  aspVerification?: {
    exists: boolean;
    settled: boolean;
    value?: number;
    status?: any;
  };
  indexerVerification?: {
    found: boolean;
    tokenId?: string;
  };
  verified: boolean;
}

export default function TokenVerification({ privateKey }: TokenVerificationProps) {
  const [vtxoId, setVtxoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatTokenAmount = (amount: string, decimals: number) => {
    const num = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const whole = num / divisor;
    const remainder = num % divisor;
    
    if (decimals === 0) {
      return whole.toString();
    }
    
    // Pad remainder with leading zeros
    const decimalPart = remainder.toString().padStart(decimals, '0');
    return `${whole.toString()}.${decimalPart}`;
  };

  const verifyToken = async () => {
    if (!vtxoId.trim()) {
      setError('Please enter a VTXO ID');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Step 1: Get token metadata from indexer
      const indexerResponse = await fetch(`http://localhost:3003/api/verify/token/${vtxoId}`);
      const indexerData = await indexerResponse.json();

      // Step 2: Verify VTXO exists in wallet via SDK
      const sdkResponse = await fetch('http://localhost:3003/api/sdk/verify-vtxo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey, vtxoId }),
      });
      const sdkData = await sdkResponse.json();

      // Combine results
      setResult({
        token: indexerData.token,
        aspVerification: {
          exists: sdkData.exists,
          settled: sdkData.vtxo?.virtualStatus?.state === 'settled',
          value: sdkData.vtxo?.value,
          status: sdkData.vtxo?.virtualStatus,
        },
        indexerVerification: indexerData.indexerVerification,
        verified: sdkData.exists && indexerData.indexerVerification?.found,
      });

    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-blue-100">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">Token Verification</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            VTXO ID / Token ID
          </label>
          <input
            type="text"
            value={vtxoId}
            onChange={(e) => setVtxoId(e.target.value)}
            placeholder="Enter VTXO ID to verify..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <button
          onClick={verifyToken}
          disabled={loading || !vtxoId.trim()}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? 'Verifying...' : 'Verify Token'}
        </button>

        {error && (
          <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4 mt-4">
            {/* Overall Status */}
            <div className={`p-4 rounded-lg border-2 ${
              result.verified 
                ? 'bg-green-50 border-green-500' 
                : 'bg-red-50 border-red-500'
            }`}>
              <div className="flex items-center gap-2">
                {result.verified ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600" />
                )}
                <span className={`font-bold text-lg ${
                  result.verified ? 'text-green-900' : 'text-red-900'
                }`}>
                  {result.verified ? 'Verified ✓' : 'Not Verified'}
                </span>
              </div>
            </div>

            {/* Token Info */}
            {result.token && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-900 mb-2">Token Information</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Name:</span>
                    <span className="font-semibold text-gray-900">{result.token.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Symbol:</span>
                    <span className="font-semibold text-gray-900">{result.token.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Supply:</span>
                    <span className="font-semibold text-gray-900">
                      {formatTokenAmount(result.token.totalSupply, result.token.decimals)} {result.token.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Decimals:</span>
                    <span className="font-semibold text-gray-900">{result.token.decimals}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Creator:</span>
                    <span className="font-mono text-xs text-gray-900">{result.token.creator.slice(0, 20)}...</span>
                  </div>
                </div>
              </div>
            )}

            {/* ASP Verification */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="font-bold text-purple-900 mb-2">ASP Blockchain Verification</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Exists in Wallet:</span>
                  {result.aspVerification?.exists ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="text-sm font-semibold">
                    {result.aspVerification?.exists ? 'Yes' : 'No'}
                  </span>
                </div>
                {result.aspVerification?.exists && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Settled:</span>
                      {result.aspVerification?.settled ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-yellow-600" />
                      )}
                      <span className="text-sm font-semibold">
                        {result.aspVerification?.settled ? 'Yes' : 'Pending'}
                      </span>
                    </div>
                    {result.aspVerification?.value && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">VTXO Value:</span>
                        <span className="font-semibold text-gray-900">
                          {result.aspVerification.value.toLocaleString()} sats
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Indexer Verification */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-bold text-yellow-900 mb-2">Token Indexer Verification</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Registered:</span>
                {result.indexerVerification?.found ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="text-sm font-semibold">
                  {result.indexerVerification?.found ? 'Yes' : 'No'}
                </span>
              </div>
              {result.indexerVerification?.tokenId && (
                <div className="mt-2 text-xs">
                  <span className="text-gray-600">Token ID: </span>
                  <span className="font-mono text-gray-900">{result.indexerVerification.tokenId.slice(0, 40)}...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
