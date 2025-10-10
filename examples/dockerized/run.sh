docker run --rm -d --network=host \
  -e MICRO_REGISTRY_URL=http://localhost:13000 \
  --name registry registry

docker run --rm -d --network=host \
  -e MICRO_REGISTRY_URL=http://localhost:13000 \
  -e MICRO_SERVICE_URL=http://localhost:13001 \
  --name service1 service1

docker run --rm -d --network=host \
-e MICRO_REGISTRY_URL=http://localhost:13000 \
  -e MICRO_SERVICE_URL=http://localhost:13002 \
  --name service2 service2

docker run --rm -d --network=host \
  -e MICRO_REGISTRY_URL=http://localhost:13000 \
  -e MICRO_SERVICE_URL=http://localhost:13003 \
  --name service3 service3
