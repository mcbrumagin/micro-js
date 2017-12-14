FROM mhart/alpine-node:8

WORKDIR .
COPY . .

ENV SERVICE_REGISTRY_HOST localhost:10000

CMD ["node", "examples/all-in-one/index.js"]
