FROM node:22-bookworm-slim

# The Java compiler is an OS dependency, not an npm dependency.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates coreutils gcc g++ python3 openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node server.js runtime-check.js ./

# Verify the image has every tool used by the existing server.
RUN node runtime-check.js
USER node
EXPOSE 3000
CMD ["sh", "-c", "node runtime-check.js && exec node server.js"]
