# Use Node 20 alpine
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port (Vite default)
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev", "--", "--host"]
