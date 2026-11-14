FROM node:26-alpine
WORKDIR /app

# Install Chromium for Puppeteer — its own Chrome download is a glibc build that cannot run on Alpine (musl):
# Also installs shared libraries and fonts required for correct PDF text/emoji rendering.
# The version check fails the build early if the browser binary is unusable:
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-emoji \
  && chromium-browser --version

# Tell Puppeteer to use the system Chromium instead of downloading its own:
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
