# Use an official Node runtime as a parent image
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

ARG CACHEBUST=1
RUN echo "CACHEBUST=$CACHEBUST"

# Build the app (since you have vite.config.ts, you likely need a build step)
RUN npm run build

# Expose the port the app runs on
EXPOSE 8080

# Start the application
# Based on your file list, 'server.js' is likely your entry point.
CMD ["node", "server.js"]
