# Build registry
mkdir -p build/registry
cp registry/index.js build/registry/
cp registry/package.json build/registry/
cp registry/Dockerfile build/registry/
# Copy micro-js source for registry
mkdir -p build/registry/micro-js
cp -R ../../src build/registry/micro-js/
cp ../../package.json build/registry/micro-js/

# Build services
mkdir -p build/service1
mkdir -p build/service2
mkdir -p build/service3

# Copy service files
cp services/message-publisher-service.js build/service1/index.js
cp services/message-handler.js build/service2/index.js
cp services/message-handler2.js build/service3/index.js

# Copy package.json with local dependency
cp services/service-package.json build/service1/package.json
cp services/service-package.json build/service2/package.json
cp services/service-package.json build/service3/package.json

# Copy micro-js source for each service
mkdir -p build/service1/micro-js
mkdir -p build/service2/micro-js
mkdir -p build/service3/micro-js

cp -R ../../src build/service1/micro-js/
cp ../../package.json build/service1/micro-js/

cp -R ../../src build/service2/micro-js/
cp ../../package.json build/service2/micro-js/

cp -R ../../src build/service3/micro-js/
cp ../../package.json build/service3/micro-js/

# Copy Dockerfile
cp services/Dockerfile build/service1/Dockerfile
cp services/Dockerfile build/service2/Dockerfile
cp services/Dockerfile build/service3/Dockerfile
