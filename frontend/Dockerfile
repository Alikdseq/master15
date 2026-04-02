# syntax=docker/dockerfile:1.7
FROM node:22-slim

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libnss3 \
      libnspr4 \
      libatk-bridge2.0-0 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libgbm1 \
      libgtk-3-0 \
      libasound2 \
      libxshmfence1 \
      libxext6 \
      libxfixes3 \
      libxrender1 \
      libxkbcommon0 \
      libu2f-udev \
      libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json /app/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . /app

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

