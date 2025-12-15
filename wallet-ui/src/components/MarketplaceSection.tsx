'use client';

import { Store, Sparkles, TrendingUp, Users, Zap } from 'lucide-react';

export default function MarketplaceSection() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-6 animate-pulse">
          <Store className="w-12 h-12 text-white" />
        </div>
        
        <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
          Marketplace
        </h1>
        
        <div className="inline-block">
          <p className="text-4xl font-bold text-gray-900 mb-2">
            Coming Soon!
          </p>
          <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full"></div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-200 p-8 mb-8">
        <p className="text-xl text-gray-700 text-center leading-relaxed mb-6">
          The Arkade Token Marketplace is under development. Soon you'll be able to discover, trade, and manage tokens from the Arkade ecosystem.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {/* Feature 1 */}
          <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Buy & Sell Tokens</h3>
              <p className="text-sm text-gray-600">Trade tokens directly with other users using Arkade's instant settlement</p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Discover New Tokens</h3>
              <p className="text-sm text-gray-600">Explore trending tokens and find new opportunities in the ecosystem</p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Instant Transactions</h3>
              <p className="text-sm text-gray-600">Leverage Arkade Layer 2 for fast, cheap token trades</p>
            </div>
          </div>

          {/* Feature 4 */}
          <div className="flex items-start gap-4 p-4 bg-pink-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-pink-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Community Driven</h3>
              <p className="text-sm text-gray-600">Built for the community, by the community</p>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-3">Want to be notified when we launch?</h2>
        <p className="text-blue-100 mb-6">
          Stay tuned for updates on our marketplace launch
        </p>
        <p className="text-sm text-blue-200">
          Follow us on social media and join our community to stay updated
        </p>
      </div>
    </div>
  );
}
