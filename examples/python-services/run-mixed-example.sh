#!/bin/bash

# Run mixed Node.js + Python example
# This script demonstrates polyglot microservices

set -e

echo "======================================"
echo "Mixed Language Microservices Example"
echo "======================================"
echo ""

# Check if registry is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "⚠️  Registry not detected on port 3000"
    echo ""
    echo "Please start the registry first:"
    echo "  cd ../.."
    echo "  node src/micro-core/registry/registry-server.js"
    echo ""
    exit 1
fi

echo "✓ Registry detected"
echo ""

# Set environment variable
export MICRO_REGISTRY_URL=http://localhost:3000

# Start Node.js services in background
echo "Starting Node.js services..."
node mixed-example.js &
NODE_PID=$!

sleep 2

# Start Python services in background
echo "Starting Python services..."
python simple-service.py &
PYTHON1_PID=$!

sleep 1

python service-with-calls.py &
PYTHON2_PID=$!

sleep 2

echo ""
echo "✓ All services started!"
echo ""
echo "Services running:"
echo "  Node.js:"
echo "    - nodeToPythonService"
echo "    - nodePublisher"
echo "    - nodeService"
echo "  Python:"
echo "    - simple-service"
echo "    - service-with-calls"
echo ""
echo "Testing inter-service communication..."
echo ""

# Test 1: Node calling Python
echo "Test 1: Node.js → Python"
curl -s -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: nodeToPythonService" \
  -H "Content-Type: application/json" \
  -d '{"test": "Node calling Python"}' | python -m json.tool
echo ""

# Test 2: Python calling Node
echo "Test 2: Python → Node.js"
curl -s -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: service-with-calls" \
  -H "Content-Type: application/json" \
  -d '{"callService": "nodeService", "from": "Python"}' | python -m json.tool
echo ""

# Test 3: Python calling Python
echo "Test 3: Python → Python"
curl -s -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: service-with-calls" \
  -H "Content-Type: application/json" \
  -d '{"callService": "simple-service", "from": "Python"}' | python -m json.tool
echo ""

echo "======================================"
echo "All tests complete!"
echo "======================================"
echo ""
echo "Services are still running. Press Ctrl+C to stop all services..."

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $NODE_PID $PYTHON1_PID $PYTHON2_PID 2>/dev/null || true
    echo "✓ All services stopped"
    exit 0
}

trap cleanup INT TERM

# Wait for user interrupt
wait

