# syntax=docker/dockerfile:1
# Node / TypeScript image. Build + runtime both go through script/*.
# bun installs deps and runs the build; the app serves on the Node runtime
# (BASE.md standard) unless the repo opts into bun as production runtime.
FROM node:22-slim AS build
WORKDIR /app
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
COPY . .
RUN ./script/setup && bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["./script/server"]
