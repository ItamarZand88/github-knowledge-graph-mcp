#!/bin/bash

# GitHub Knowledge Graph MCP Server Installation Script

set -e

echo "🚀 Installing GitHub Knowledge Graph MCP Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the server
echo "🔨 Building MCP server..."
npm run build

# Create default data directory for graphs
DEFAULT_DATA_DIR="$HOME/.github-knowledge-graph/data/graphs"
echo "📁 Creating default data directory..."
mkdir -p "$DEFAULT_DATA_DIR"

# Create logs directory
mkdir -p logs

echo "✅ Installation completed successfully!"
echo ""
echo "🎉 GitHub Knowledge Graph MCP Server is ready!"
echo ""
echo "📚 Usage:"
echo "  npm start                 # Start the MCP server"
echo "  npm run dev               # Start in development mode"
echo "  npm test                  # Run tests"
echo ""
echo "🔧 Configuration:"
echo "  Set LOG_LEVEL=debug for verbose logging"
echo "  Set MCP_DATA_DIR=/custom/path for custom storage location (default: $HOME/.github-knowledge-graph/data)"
echo ""
echo "📖 For more information, see README.md"