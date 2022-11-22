FROM mhart/alpine-node:8

WORKDIR .
COPY . .

ENV SERVICE_REGISTRY_ENDPOINT localhost:10000

CMD ["node", "examples/all-in-one/index.js"]
