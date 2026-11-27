FROM node:24-alpine
WORKDIR /app
COPY server/server.js ./server/server.js
COPY public/ ./public/
ENV SERVE_STATIC=true DATA_DIR=/data REQUIRE_DATA_VOLUME=true SECURE_COOKIES=true
CMD ["node", "server/server.js"]
