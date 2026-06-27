FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Vite inlines env at build time, so VITE_API_BASE must be set before build.
ARG VITE_API_BASE=http://localhost:3001
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview", "--", "--host", "--port", "5173"]
