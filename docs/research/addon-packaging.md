# Research: How to package a Next.js app as a Home Assistant add-on

Issue: [#2](https://github.com/jtoniolo/bermuda-triangle/issues/2). Date of research: 2026-10-13.

## Note on names

Home Assistant now calls add-ons "apps". The developer docs say "apps (formerly known as add-ons)" ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)). The docs moved from `/docs/add-ons/` to `/docs/apps/` ([developer docs](https://developers.home-assistant.io/docs/apps/configuration)). This file uses "add-on" because the repo uses that term.

## Summary

1. Use `output: 'standalone'` in Next.js. Copy `public` and `.next/static` into the standalone folder. Run `node server.js` ([Next.js output docs](https://github.com/vercel/next.js/blob/7fe50643c8db01233326981aa654e39685511013/docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx)).
2. Use `ghcr.io/home-assistant/base` (Alpine) as the base image, with an explicit `FROM` ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
3. The Ingress path is different for each installation. Next.js `basePath` is fixed at build time. Thus you must rewrite the path at run time, or use only relative URLs. See [Ingress](#ingress-and-the-nextjs-base-path).
4. Build for `aarch64` and `amd64` only. Use the new `home-assistant/builder` composite GitHub Actions ([builder README](https://github.com/home-assistant/builder/blob/795215ad705a684890b4c26b5fd097f418e35ac1/README.md)).
5. Keep all state in `/data`. The Supervisor puts all of `/data` into each backup, less the `backup_exclude` paths ([supervisor app.py](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/apps/app.py#L1512-L1572)).

## 1. Base image and Next.js output mode

### Base image

- The docs show `FROM ghcr.io/home-assistant/base:latest`. The docs recommend a pinned version ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- Since Supervisor 2026.04.0, the Supervisor does not supply `BUILD_FROM`. Set the base image directly with `FROM` ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- `build.yaml` is not used any more. Put `build_from`, `labels` and `args` into the `Dockerfile` ([builder migration post](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/blog/2026-04-02-builder-migration.md)).
- The base images contain S6-Overlay, Bashio and TempIO. They are multi-arch images for `amd64` and `arm64` since release 2026.03.1 ([docker-base README](https://github.com/home-assistant/docker-base/blob/a406440016b7df807877a24e74fab937532fd57e/README.md)).
- Variants: `base` (Alpine 3.22, 3.23, 3.24), `base-python`, `base-debian` (bookworm, trixie) and `base-ubuntu` (22.04, 24.04, 26.04). Home Assistant prefers Alpine ([docker-base README](https://github.com/home-assistant/docker-base/blob/a406440016b7df807877a24e74fab937532fd57e/README.md)).
- Home Assistant does not publish a Node.js base image. The README lists no such image ([docker-base README](https://github.com/home-assistant/docker-base/blob/a406440016b7df807877a24e74fab937532fd57e/README.md)). Real add-ons use one of these two methods:
  - Install `nodejs` with `apk` on the Home Assistant base. Zigbee2MQTT does this ([Zigbee2MQTT Dockerfile](https://github.com/zigbee2mqtt/hassio-zigbee2mqtt/blob/4af4f3808466a2d0aa1aaf4f82975d3afe404290/common/Dockerfile)).
  - Use `node:20-alpine` as the base. Dashboard Builder does this ([Dockerfile.addon](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/Dockerfile.addon)).
- I did not find which Node.js version each Alpine release supplies. Check the Alpine package index before you choose.
- The S6-Overlay base images need `init: false` in `config.yaml` ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).

### Labels

If you do not use the Home Assistant builder actions, add the labels `io.hass.version`, `io.hass.type` and `io.hass.arch` ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)). The new actions do not add `io.hass.type`, `io.hass.name`, `io.hass.description` or `io.hass.url` automatically. Give them in the `labels` input ([builder migration post](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/blog/2026-04-02-builder-migration.md)).

### Next.js output mode

- `output: 'standalone'` makes `.next/standalone`. You can deploy this folder without `node_modules` ([output.mdx](https://github.com/vercel/next.js/blob/7fe50643c8db01233326981aa654e39685511013/docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx)).
- The standalone `server.js` does not copy `public` or `.next/static`. Copy them manually: `cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/` ([output.mdx](https://github.com/vercel/next.js/blob/7fe50643c8db01233326981aa654e39685511013/docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx)).
- Set the port and the host with the `PORT` and `HOSTNAME` environment variables ([output.mdx](https://github.com/vercel/next.js/blob/7fe50643c8db01233326981aa654e39685511013/docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx)).
- Dashboard Builder uses this layout. It copies `.next/standalone`, `.next/static` and `public` into a runner stage ([Dockerfile.addon](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/Dockerfile.addon)).

## 2. Ingress and the Next.js base path

### How Ingress works

- Set `ingress: true`. The default port is 8099. Use `ingress_port` for a different port ([presentation.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md#ingress)).
- Allow connections only from `172.30.32.2`. Deny all other IP addresses ([presentation.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md#ingress)).
- Home Assistant authenticates the user. The add-on does not need its own login ([presentation.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md#ingress)).
- The gateway supports HTTP/1.x, streaming and WebSockets ([presentation.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md#ingress)).
- Ingress gives +2 to the add-on security rating ([presentation.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md#security)).
- Other options: `ingress_entry` (default `/`), `ingress_stream` (default `false`), `panel_icon`, `panel_title`, `panel_admin` (default `true`) ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).

### The request path

- The browser URL is `/api/hassio_ingress/{token}/{path}` ([core hassio/ingress.py, line 66](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/hassio/ingress.py#L66)).
- Home Assistant Core sets the header `X-Ingress-Path: /api/hassio_ingress/{token}`. It also sets `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto` ([core hassio/ingress.py, lines 266-297](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/hassio/ingress.py#L266-L297)).
- The Supervisor sends the request to `http://{app ip}:{ingress_port}/{path}`. The add-on receives the path without the `/api/hassio_ingress/{token}` prefix ([supervisor api/ingress.py, lines 94-96](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/ingress.py#L94-L96)).
- The Supervisor also sends the Home Assistant user in the headers `X-Remote-User-Id`, `X-Remote-User-Name` and `X-Remote-User-Display-Name` (constant names `HEADER_REMOTE_USER_*`) ([supervisor api/ingress.py, lines 333-372](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/ingress.py#L333-L372)). I did not check the exact header strings in `const.py`.
- The token is a random value (`secrets.token_urlsafe`). The Supervisor makes it when it installs the add-on, and keeps it in the add-on user data ([supervisor apps/validate.py, line 615](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/apps/validate.py#L615)). Thus the path is different on each installation. The image cannot know it at build time.

### The problem with Next.js

- `basePath` "must be set at build time and cannot be changed without re-building as the value is inlined in the client-side bundles" ([basePath.mdx](https://github.com/vercel/next.js/blob/7fe50643c8db01233326981aa654e39685511013/docs/01-app/03-api-reference/05-config/01-next-config-js/basePath.mdx)).
- `basePath` must start with `/` and must not end with `/`. If `assetPrefix` is empty, Next.js sets it to `basePath` ([next.js config.ts, lines 720-742](https://github.com/vercel/next.js/blob/7fe50643c8db01233326981aa654e39685511013/packages/next/src/server/config.ts#L720-L742)).
- `assetPrefix` changes only `/_next/static` URLs. It does not change files in `public` ([assetPrefix.mdx](https://github.com/vercel/next.js/blob/7fe50643c8db01233326981aa654e39685511013/docs/01-app/03-api-reference/05-config/01-next-config-js/assetPrefix.mdx)).
- Without a fix, the browser asks for `/_next/...` at the root of Home Assistant, not inside the Ingress path. (This is a deduction from the facts above.)

### Known solution: placeholder base path and a rewrite proxy

Dashboard Builder (a real Next.js add-on) uses this method ([Dockerfile.addon](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/Dockerfile.addon), [ingress-proxy.js](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/homeassistant-addon/rootfs/ingress-proxy.js)):

1. Build Next.js with `basePath` set to the placeholder `/__ha_ingress__`.
2. Run Next.js on `127.0.0.1:3001`.
3. Run a small Node.js proxy on port 8099. It replaces `/__ha_ingress__` with the value of `X-Ingress-Path` in each text, JavaScript, JSON and React Flight response.
4. The proxy must change the length prefix of React Flight (`text/x-component`) rows. A plain string replace breaks the App Router client with "Connection closed".
5. Set `ingress_stream: false`, because the proxy buffers each response ([config.yaml](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/homeassistant-addon/config.yaml)).

Note: this proxy allows all `172.*`, `10.*` and `192.168.*` addresses. That is wider than the documented rule (only `172.30.32.2`) ([ingress-proxy.js](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/homeassistant-addon/rootfs/ingress-proxy.js)).

### Other possible method

A Vite app (not Next.js) uses relative asset URLs (`base: "./"`) and reads the base path from `window.location.pathname` ([sunshare-bridge PR #8](https://github.com/kurim/sunshare-bridge/pull/8)). I did not find a documented Next.js setting for relative asset URLs. I did not test whether `output: 'export'` with relative paths works.

### IP restriction

The Next.js docs that I read show no IP allow-list option. Node-RED puts nginx in front of the app, with `allow 172.30.32.2; deny all;` ([Node-RED ingress.gtpl](https://github.com/hassio-addons/app-node-red/blob/b3db67170b6378f0b7776624108b870171408cb1/node-red/rootfs/etc/nginx/templates/ingress.gtpl)). The docs show the same nginx rule ([presentation.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md#basic-ingress-example-with-nginx)).

## 3. Architectures and builds

### Architectures

- The `arch` key accepts `aarch64` and `amd64` ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- The Supervisor marks `armhf`, `armv7` and `i386` as deprecated. It logs a warning when an add-on lists them ([supervisor const.py, lines 418-426](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/const.py#L418-L426), [apps/validate.py](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/apps/validate.py#L235-L242)).
- Home Assistant ended support for 32-bit systems with release 2025.12 ([Home Assistant blog, 2025-05-22](https://www.home-assistant.io/blog/2025/05/22/deprecating-core-and-supervised-installation-methods-and-32-bit-systems/)).

### Build method

- Pre-built images in a registry are the preferred method. Local builds on the user's device are slow and fail more often ([publishing.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/publishing.md)).
- The old `home-assistant/builder` action is deprecated. Its last release was 2026.02.1. It will be removed ([builder README](https://github.com/home-assistant/builder/blob/795215ad705a684890b4c26b5fd097f418e35ac1/README.md)).
- The new composite actions are `prepare-multi-arch-matrix`, `build-image`, `publish-multi-arch-manifest` and `cosign-verify`. They use Docker Buildx ([builder README](https://github.com/home-assistant/builder/blob/795215ad705a684890b4c26b5fd097f418e35ac1/README.md)).
- `prepare-multi-arch-matrix` runs `amd64` on `ubuntu-24.04` and `aarch64` on `ubuntu-24.04-arm`. Thus each architecture builds on a native runner, without QEMU. Other values cause an error ([action.yml](https://github.com/home-assistant/builder/blob/795215ad705a684890b4c26b5fd097f418e35ac1/actions/prepare-multi-arch-matrix/action.yml)).
- `build-image` pushes per-arch images, for example `ghcr.io/my-org/aarch64-my-app:1.0.0`. `publish-multi-arch-manifest` pushes the generic image `ghcr.io/my-org/my-app:1.0.0` ([publishing.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/publishing.md)).
- Set `image: "ghcr.io/my-org/my-app"` in `config.yaml`. The `{arch}` placeholder still works as a fallback ([publishing.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/publishing.md)).
- With `image`, `version` must be equal to the image tag ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- Full working workflows: [builder.yaml](https://github.com/home-assistant/apps-example/blob/3896b93c5be9433a742199935123cbcbf1c7ccf4/.github/workflows/builder.yaml) and [build-app.yaml](https://github.com/home-assistant/apps-example/blob/3896b93c5be9433a742199935123cbcbf1c7ccf4/.github/workflows/build-app.yaml). The build job needs the permissions `packages: write` and `id-token: write` (for Cosign signing).
- In the example `Dockerfile`, `TARGETARCH` gives `amd64` or `arm64`. The example maps `arm64` to `aarch64` ([example Dockerfile](https://github.com/home-assistant/apps-example/blob/3896b93c5be9433a742199935123cbcbf1c7ccf4/example/Dockerfile)).
- You can build and test locally with `docker build` ([builder migration post](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/blog/2026-04-02-builder-migration.md)).

## 4. Data storage and backups

- `/data` is the volume for persistent storage. `/data/options.json` holds the user options ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- `/data` is always mapped and writable ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- An add-on backup is a tar file. It contains ([supervisor app.py, lines 1512-1572](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/apps/app.py#L1512-L1572)):
  - `addon.json` (options, system data, version, state).
  - The AppArmor profile, if one exists.
  - All of `/data`, as `data/`, less the `backup_exclude` paths.
  - The `app_config` folder, as `config/`, if the add-on maps it.
  - The Docker image, only if the add-on was built locally.
- `backup_exclude` is a list of glob patterns. The Supervisor matches each pattern against the full path that the Supervisor sees, not the relative path ([supervisor app.py, lines 1488-1505](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/apps/app.py#L1488-L1505)).
- `backup: hot` (default) keeps the add-on running. `backup: cold` stops it during the backup. `backup_pre` and `backup_post` run commands before and after a hot backup ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- When you uninstall the add-on, the Supervisor removes the data folder ([supervisor app.py, lines 909-911](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/apps/app.py#L909-L911)).
- For a SQLite file in `/data`, a hot backup copies the file while the app can write to it. The Supervisor code does not stop writes. To get a consistent file, use `backup: cold` or a `backup_pre` command. (This is a deduction. I did not find a Home Assistant document about SQLite.)
- Example: Dashboard Builder stores SQLite at `/data/app.db` and uploads at `/data/uploads` ([Dockerfile.addon](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/Dockerfile.addon)).

## 5. Public add-on repository structure

- The root must contain `repository.yaml` with `name` (required), `url` and `maintainer` ([repository.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/repository.md)). The Supervisor also accepts `.yml` and `.json` ([supervisor store/data.py](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/store/data.py#L88), [const.py, line 47](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/const.py#L47)).
- Each add-on is in its own folder. The `slug` must be unique in the repository ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- The Supervisor searches for `config.yaml` recursively. Do not use that file name for other files ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- Files in an add-on folder ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)): `config.yaml`, `Dockerfile`, `README.md`, `DOCS.md`, `CHANGELOG.md`, `icon.png`, `logo.png`, `apparmor.txt`, `translations/en.yaml`, and a run script.
- Required `config.yaml` keys: `name`, `version`, `slug`, `description`, `arch` ([configuration.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md)).
- The official example repository has this tree ([apps-example](https://github.com/home-assistant/apps-example/tree/3896b93c5be9433a742199935123cbcbf1c7ccf4)):

```text
repository.yaml
README.md
.github/workflows/builder.yaml
.github/workflows/build-app.yaml
.github/workflows/lint.yaml
example/
  config.yaml
  Dockerfile
  DOCS.md  README.md  CHANGELOG.md
  apparmor.txt
  icon.png  logo.png
  translations/en.yaml
  rootfs/etc/services.d/example/run
  rootfs/etc/services.d/example/finish
```

- Users add the repository URL in the add-on store. You can make a my.home-assistant.io link for this ([repository.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/repository.md)).

## 6. Examples of Node.js add-ons with Ingress

| Add-on | Stack | Ingress method | Source |
| --- | --- | --- | --- |
| Dashboard Builder | Next.js standalone, Prisma, SQLite | Placeholder `basePath` and a Node.js rewrite proxy on 8099 | [config.yaml](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/homeassistant-addon/config.yaml), [Dockerfile.addon](https://github.com/hiddevanbrussel/Dashboard-Home-Assistant/blob/8f2628b45a51c45f0eec5cf3f3dc0bba9fc63fe0/Dockerfile.addon) |
| Node-RED (community) | Node.js on `ghcr.io/hassio-addons/base` | nginx in front, `allow 172.30.32.2`, `ingress_port: 0`, `ingress_stream: true` | [config.yaml](https://github.com/hassio-addons/app-node-red/blob/b3db67170b6378f0b7776624108b870171408cb1/node-red/config.yaml), [ingress.gtpl](https://github.com/hassio-addons/app-node-red/blob/b3db67170b6378f0b7776624108b870171408cb1/node-red/rootfs/etc/nginx/templates/ingress.gtpl) |
| Zigbee2MQTT | Node.js from `apk` on the Home Assistant base | `ingress: true` on the default port | [config.json](https://github.com/zigbee2mqtt/hassio-zigbee2mqtt/blob/4af4f3808466a2d0aa1aaf4f82975d3afe404290/zigbee2mqtt/config.json), [Dockerfile](https://github.com/zigbee2mqtt/hassio-zigbee2mqtt/blob/4af4f3808466a2d0aa1aaf4f82975d3afe404290/common/Dockerfile) |

Dashboard Builder is a small project (32 stars on 2026-10-13). It is the only Next.js add-on with Ingress that I found. I did not find an official Home Assistant add-on that uses Next.js.

## Open items

- I did not find the Node.js version in each Alpine release.
- I did not test a Next.js build with relative asset paths.
- I did not find an official Home Assistant guide for SQLite and hot backups.
