# Stage 1: Build the frontend
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend (Vite)
# This will create the dist/ folder
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine

WORKDIR /app

# Copy package files and install ONLY production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy backend source code
COPY server.js ./
COPY services ./services

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Create a non-root user for security (optional but recommended)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p data && chown -R appuser:appgroup /app/data
USER appuser

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
