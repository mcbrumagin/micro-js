mkdir -p build/registry
cp -R registry build

mkdir -p build/service1
mkdir -p build/service2
mkdir -p build/service3

cp services/service1.js build/service1/index.js
cp services/service2.js build/service2/index.js
cp services/service3.js build/service3/index.js

cp services/package.json build/service1/package.json
cp services/package.json build/service2/package.json
cp services/package.json build/service3/package.json

cp services/Dockerfile build/service1/Dockerfile
cp services/Dockerfile build/service2/Dockerfile
cp services/Dockerfile build/service3/Dockerfile


# use local micro-js
cd build/service1
rm -rf node_modules
rm -rf package-lock.json
npm install ../../../..
cd ../..

cd build/service2
rm -rf node_modules
rm -rf package-lock.json
npm install ../../../..
cd ../..

cd build/service3
rm -rf node_modules
rm -rf package-lock.json
npm install ../../../..
cd ../..

cd build/registry
rm -rf node_modules
rm -rf package-lock.json
npm install ../../../..
cd ../..
