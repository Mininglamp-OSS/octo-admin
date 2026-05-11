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
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
