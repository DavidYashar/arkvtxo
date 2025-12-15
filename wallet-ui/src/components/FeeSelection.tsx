'use client';

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

export interface FeeOption {
  label: string;
  speed: string;
  feeRate: number;
  icon: string;
}

interface FeeSelectionProps {
  onFeeSelect: (feeRate: number) => void;
  estimatedVbytes: number;
  selectedFee?: number;
}

export default function FeeSelection({ onFeeSelect, estimatedVbytes, selectedFee }: FeeSelectionProps) {
  const [feeOptions, setFeeOptions] = useState<FeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [customFee, setCustomFee] = useState<string>('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFees();
    // Refresh every 60 seconds
    const interval = setInterval(fetchFees, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchFees = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const network = process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
      const apiUrl = network === 'mainnet' 
        ? 'https://mempool.space/api/v1/fees/recommended'
        : 'https://mempool.space/testnet/api/v1/fees/recommended';
      
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch fees');
      
      const fees = await response.json();
      
      // Use minimum fee + 1 sat/vbyte as recommended
      const minimumFee = fees.minimumFee || fees.hourFee || 5;
      const recommendedFee = minimumFee + 1;
      
      const options: FeeOption[] = [
        {
          label: 'Recommended',
          speed: 'Next block',
          feeRate: recommendedFee,
          icon: '',
        },
      ];
      
      setFeeOptions(options);
      
      // Auto-select recommended if no selection yet
      if (!selectedFee) {
        onFeeSelect(recommendedFee);
      }
    } catch (err) {
      console.error('Failed to fetch fees:', err);
      setError('Failed to fetch current fees. Using safe defaults.');
      
      // Safe fallback value for mainnet (minimum + 1)
      const fallbackOptions: FeeOption[] = [
        { label: 'Recommended', speed: 'Next block', feeRate: 6, icon: '' },
      ];
      
      setFeeOptions(fallbackOptions);
      
      if (!selectedFee) {
        onFeeSelect(6);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCustomFeeChange = (value: string) => {
    console.log('🔧 Custom fee changed:', value);
    setCustomFee(value);
    const feeRate = parseInt(value);
    if (!isNaN(feeRate) && feeRate > 0) {
      console.log('✅ Calling onFeeSelect with custom fee:', feeRate);
      onFeeSelect(feeRate);
      // Force deselect radio buttons when custom fee is entered
      setFeeOptions(feeOptions.map(opt => ({ ...opt })));
    }
  };

  const calculateFeeCost = (feeRate: number) => {
    const totalSats = feeRate * estimatedVbytes;
    const btc = (totalSats / 100_000_000).toFixed(8);
    return { sats: totalSats, btc };
  };

  if (loading) {
    return (
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-gray-900">Network Fee</h4>
        </div>
        <div className="text-sm text-gray-600">Loading current fees...</div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-gray-900">Bitcoin Network Fee</h4>
        </div>
        <button
          type="button"
          onClick={fetchFees}
          className="text-xs text-blue-600 hover:text-blue-700 underline"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-3">
        {feeOptions.map((option) => {
          const cost = calculateFeeCost(option.feeRate);
          // Only select if matches AND custom fee is not being used
          const isSelected = selectedFee === option.feeRate && !customFee;
          
          return (
            <label
              key={option.label}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-100 border-2 border-blue-500'
                  : 'bg-white border-2 border-gray-200 hover:border-blue-300'
              }`}
            >
              <input
                type="radio"
                name="feeRate"
                checked={isSelected}
                onChange={() => {
                  onFeeSelect(option.feeRate);
                  setShowCustom(false);
                  setCustomFee(''); // Clear custom fee when selecting preset
                }}
                className="w-4 h-4 text-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{option.label}</span>
                  <span className="text-sm text-gray-600">({option.speed})</span>
                </div>
                <div className="text-sm text-gray-600">
                  {option.feeRate} sat/vbyte • {cost.sats.toLocaleString()} sats (~{cost.btc} BTC)
                </div>
              </div>
            </label>
          );
        })}

        <div>
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            {showCustom ? 'Hide custom fee' : 'Set custom fee'}
          </button>

          {showCustom && (
            <div className="mt-2 p-3 bg-white rounded-lg border-2 border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Fee Rate (sat/vbyte)
              </label>
              <input
                type="number"
                value={customFee}
                onChange={(e) => handleCustomFeeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                onFocus={() => setShowCustom(true)}
                placeholder="e.g., 4"
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {customFee && !isNaN(parseInt(customFee)) && parseInt(customFee) > 0 && (
                <div className="mt-2 text-sm text-gray-600">
                  Cost: {calculateFeeCost(parseInt(customFee)).sats.toLocaleString()} sats (~
                  {calculateFeeCost(parseInt(customFee)).btc} BTC)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 border-t border-blue-200 pt-2 mt-2">
        <div>Estimated transaction size: ~{estimatedVbytes} vbytes</div>
        <div className="mt-1">
          Fees are automatically set to <strong>1 sat/vbyte above</strong> current mempool block minimum
        </div>
      </div>
    </div>
  );
}
