FROM node:26-alpine
WORKDIR /app

# Install Chromium for Puppeteer:
RUN apk add --no-cache chromium

# Puppeteer must use the system Chromium: its own Chrome download is a glibc build that cannot run on Alpine:
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install PNPM:
RUN npm install -g pnpm

# Install dependencies:
COPY ./package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy all folders and files:
COPY . .

# Run the server:
CMD pnpm run start
