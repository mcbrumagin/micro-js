FROM mhart/alpine-node:8

COPY package.json package.json
COPY package-lock.json package-lock.json
RUN npm install --production

WORKDIR .
COPY . .

CMD ["node", "index.js"]
