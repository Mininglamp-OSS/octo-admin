FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html/admin
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_BACKEND=localhost:8090
# Marketplace backend for /market/api/* reverse proxy. Override at deploy time
# when the marketplace service uses a different host:port.
ENV MARKETPLACE_BACKEND=octo-marketplace:8092
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
