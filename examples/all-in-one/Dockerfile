FROM mhart/alpine-node:8

WORKDIR .
COPY . .

ENV MICRO_REGISTRY_URL localhost:10000

CMD ["node", "examples/all-in-one/index.js"]
