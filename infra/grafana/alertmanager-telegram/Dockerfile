FROM node:24-alpine

WORKDIR /app

# package.json drives the install ; index.js owns the runtime.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./

EXPOSE 9094

USER node

CMD ["node", "index.js"]
