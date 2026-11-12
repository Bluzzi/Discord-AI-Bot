FROM node:26-alpine
WORKDIR /app

# Install PNPM:
RUN npm install -g pnpm

# Install dependencies:
COPY ./package.json ./pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy all folders and files:
COPY . .

# Run the server:
CMD pnpm run start