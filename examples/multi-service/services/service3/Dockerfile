FROM mhart/alpine-node:8

WORKDIR .
COPY . .

RUN npm install --production

CMD ["node", "index.js"]
