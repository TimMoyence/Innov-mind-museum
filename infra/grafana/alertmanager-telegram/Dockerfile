FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

WORKDIR /app

# package.json drives the install ; index.js owns the runtime.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./

EXPOSE 9094

USER node

CMD ["node", "index.js"]
