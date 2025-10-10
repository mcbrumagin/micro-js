cd build/service1
docker build -t service1 .
cd ../..

cd build/service2
docker build -t service2 .
cd ../..

cd build/service3
docker build -t service3 .
cd ../..

cd build/registry
docker build -t registry .
cd ../..
