FROM node:alpine3.18 AS build
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npx tsc

#PROD
FROM node:alpine3.18 AS production
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY --from=build /app/build ./build
COPY . .
CMD ["node", "build/app.js"]    