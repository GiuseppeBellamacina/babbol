# Ambiente di build e test di Babbol (niente da installare sul PC).
#
#   docker build -t babbol-build tools/docker
#   docker run --rm -v "$PWD":/app babbol-build node tools/e2e.js
#   docker run --rm -v "$PWD":/app babbol-build ./build.sh
#
# Base: Ubuntu 24.04 con Node e Chromium di Playwright; sopra la toolchain Android dei pacchetti Ubuntu.
FROM mcr.microsoft.com/playwright:v1.50.0-noble

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      aapt apksigner dalvik-exchange zipalign android-sdk-platform-23 default-jdk-headless fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g playwright@1.50.0

ENV NODE_PATH=/usr/lib/node_modules
WORKDIR /app
