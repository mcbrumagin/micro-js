# Examples

This directory contains various examples demonstrating different features of micro-js.

## Media Streaming Example (NEW)

**File**: `media-streaming-example.js`

Demonstrates the new range request support for audio/video streaming with full seeking capabilities.

**Features:**
- ✅ Audio/video streaming with instant seeking
- ✅ Pre-seeking (drag slider before playback)
- ✅ Proper buffering indicators
- ✅ Bandwidth efficient (only requested ranges transferred)
- ✅ Chrome, Firefox, Safari compatible

**Quick Start:**
```bash
# From the project root
node examples/media-streaming-example.js

# Open browser to http://localhost:10000/
```

**To use with actual media files:**
```bash
# Create media directories
mkdir -p examples/media/audio
mkdir -p examples/media/video

# Add your media files
cp your-audio.mp3 examples/media/audio/sample.mp3
cp your-video.mp4 examples/media/video/sample.mp4

# Run the example
node examples/media-streaming-example.js
```

**What you'll see:**
- Initial request: `200 OK` with `Accept-Ranges: bytes` header
- Seek requests: `Range: bytes=X-Y` header
- Seek responses: `206 Partial Content` with `Content-Range: bytes X-Y/Total`
- Invalid ranges: `416 Range Not Satisfiable`

## Other Examples

### All-in-One Example
**Directory**: `all-in-one/`

Complete single-file deployment example with registry and services bundled together.

### Distributed Events Example
**Directory**: `distributed-events/`

Demonstrates pub/sub messaging between distributed services.

### Dockerized Example
**Directory**: `dockerized/`

Shows how to containerize micro-js services with Docker.

### Kubernetes Example
**Directory**: `kubernetes/`

Complete Kubernetes deployment with config maps, pods, and services.

### Python Services Example
**Directory**: `python-services/`

Examples of using Python services with JavaScript micro-js registry. Includes:
- Simple Python service
- Python pub/sub publisher/subscriber
- Mixed JavaScript/Python examples
- Service-to-service calls

## Running Examples

Most examples include their own README or setup scripts. Generally:

```bash
# Navigate to example directory
cd examples/[example-name]

# Run setup if available
./setup.sh  # or npm install

# Run the example
./run.sh    # or node [example-file].js
```

## Creating Your Own Examples

When adding new examples:

1. Create a directory or file in `examples/`
2. Include a README if it's a complex example
3. Make it self-contained (include setup/teardown)
4. Document required dependencies
5. Add it to this README

## Documentation

For more information about specific features:

- **Range Requests**: See `/RANGE_REQUEST_SUPPORT.md`
- **Proxy Architecture**: See `/PROXY_ARCHITECTURE_CHANGES.md`
- **Subscriptions**: See `/SUBSCRIPTION_GUIDE.md`
- **Multi-language Support**: See `/MULTI_LANGUAGE_GUIDE.md`
- **Python Implementation**: See `/PYTHON_IMPLEMENTATION_SUMMARY.md`

## Getting Help

If you have questions or issues with any examples:

1. Check the example's README if it has one
2. Review the main project README
3. Look at the relevant documentation files
4. Check test files in `/test/cases/` for usage patterns

