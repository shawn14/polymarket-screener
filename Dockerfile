FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Create data directory
RUN mkdir -p /app/data

# Run whale watcher with HTTP health endpoint
CMD ["node", "src/whale-server.js"]
