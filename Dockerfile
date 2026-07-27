# Use standard lightweight Node.js base image
FROM node:20-slim

# Set working directory inside container
WORKDIR /usr/src/app

# Copy dependency manifest files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy remaining source code files
COPY . .

# Expose server listener port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start Express + Socket.io server
CMD ["node", "server/server.js"]
