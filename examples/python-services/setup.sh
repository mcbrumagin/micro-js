#!/bin/bash

# Setup script for Python microservices examples

set -e

echo "Setting up Python microservices examples..."

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r ../../languages/python/requirements.txt

# Make Python scripts executable
echo "Making scripts executable..."
chmod +x simple-service.py
chmod +x service-with-calls.py
chmod +x pubsub-publisher.py
chmod +x pubsub-subscriber.py
chmod +x route-example.py
chmod +x standalone-subscription.py
chmod +x test-client.py

echo ""
echo "✓ Setup complete!"
echo ""
echo "To start the examples:"
echo "  1. Start the registry: node ../../src/micro-core/registry/registry-server.js"
echo "  2. Export registry URL: export MICRO_REGISTRY_URL=http://localhost:3000"
echo "  3. Run any example: ./simple-service.py"
echo ""

