FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

WORKDIR /app

# package.json drives the install ; index.js owns the runtime.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./

EXPOSE 9094

USER node

CMD ["node", "index.js"]
