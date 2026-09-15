# Two stages so the runtime image carries no build toolchain and no node_modules full of Vite.
#
# The art is NOT generated here. `public/art/` is committed (it has to be — `check_cards_frozen`
# pins those bytes), so the image needs no Python and the build stays reproducible from the
# repo alone.
FROM node:22-slim AS build
WORKDIR /app

# Dependencies first, as their own layer: package.json changes far less often than source, so
# an ordinary code-only deploy reuses this layer instead of reinstalling everything.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Builds BOTH halves: `vite build` emits dist/ (the client, precached by the service worker) and
# esbuild bundles the server to dist-server/index.js. `build` also runs tsc --noEmit, so a type
# error fails the image rather than shipping.
RUN npm run build:all

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `ws` is the server's one runtime dependency; everything else it uses is bundled or built in.
# `--omit=dev` keeps Vite, vitest and Playwright out of the running image entirely.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# Runs as root, deliberately. The obvious instinct is `USER node`, and it was the first thing
# written here — but Fly mounts a volume root-owned, so a non-root process cannot write
# /data/rooms.json, and the usual workaround (chown in an entrypoint, then drop privileges with
# runuser/gosu) is a moving part that cannot be tested from this repo: there is no Docker here,
# builds happen on Fly's remote builder. Trading a testable, working deploy for an untestable
# privilege drop is the wrong trade when the isolation boundary is already a Firecracker
# microVM with one tenant in it. If this ever moves to a shared-kernel host, revisit it there.

EXPOSE 8787
CMD ["node", "dist-server/index.js"]
