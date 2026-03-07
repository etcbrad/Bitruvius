#!/bin/bash

# Bitruvius Netlify Deployment Script
echo "🚀 Deploying Bitruvius to Netlify..."

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "❌ Netlify CLI not found. Installing..."
    if ! npm install -g netlify-cli; then
        echo "❌ Failed to install Netlify CLI. Please try:"
        echo "   1. Running with elevated privileges: sudo npm install -g netlify-cli"
        echo "   2. Or check your npm permissions and try again"
        exit 1
    fi
    echo "✅ Netlify CLI installed successfully"
fi

# Build the project first
echo "📦 Building project..."
npm run build:deploy

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Exiting."
    exit 1
fi

# Deploy to Netlify
echo "🌐 Deploying to Netlify..."

# Check if deploy directory exists
if [ ! -d "deploy" ]; then
    echo "❌ Deploy directory not found. Please run the build command first."
    exit 1
fi

# Change to deploy directory and verify success
cd deploy || {
    echo "❌ Failed to change to deploy directory."
    exit 1
}

# Deploy with CLI (will prompt for login if needed)
if netlify deploy --prod --dir=.; then
    echo "✅ Deployment complete!"
    echo "🌍 Your site should be live at: https://bitruvius.netlify.app"
else
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi
