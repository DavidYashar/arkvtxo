#!/bin/bash

# Start Token Indexer + ASP VTXO Service
# This combines token indexing and ASP VTXO functionality in one service

cd "$(dirname "$0")"

echo "🚀 Starting Token Indexer + ASP VTXO Service..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if port 3002 is already in use
if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3002 is already in use!"
    echo "   Killing existing process..."
    lsof -ti:3002 | xargs kill -9 2>/dev/null
    sleep 2
fi

# Start the service
npm run dev

