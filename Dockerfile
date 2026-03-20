# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
# Install only production dependencies
RUN npm install --omit=dev

# Copy built assets and server
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./
COPY --from=build /app/tsconfig.json ./

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Use npx tsx to run the server.ts directly in production for this specific setup
CMD ["npx", "tsx", "server.ts"]
