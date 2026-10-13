# Research: How an add-on reads Home Assistant floors, areas, devices and states

Issue: [#3](https://github.com/jtoniolo/bermuda-triangle/issues/3). Date: 2026-10-13.

## Sources and versions

All source links go to fixed commits, so the line numbers stay correct:

- Home Assistant Core: commit [`aeb1a1c`](https://github.com/home-assistant/core/tree/aeb1a1c65922739ccb8e7b9abf3d6f554299b912) (branch `dev`).
- Supervisor: commit [`7fd100c`](https://github.com/home-assistant/supervisor/tree/7fd100cfe08b38d9208165040ac958e54b4585cd) (branch `main`).
- Developer documentation: commit [`408e71c`](https://github.com/home-assistant/developers.home-assistant/tree/408e71c49ec96a00de83a80b358f3116af6d948a) (branch `master`).

Note: the developer documentation now uses the word "app" for "add-on" ([communication.md L5](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md?plain=1#L5)). The documents are in `docs/apps/`, not `docs/add-ons/`. This file uses "add-on".

Words used here:

- **Supervisor**: the Home Assistant program that runs add-ons and gives them an internal API.
- **Proxy**: a server that receives a request and sends it to a different server.
- **Ingress**: the Home Assistant function that shows the web page of an add-on inside the Home Assistant UI.
- **Registry**: a list that Home Assistant stores, for example the list of floors.

## Summary

1. Set `homeassistant_api: true` in `config.yaml`. Read the `SUPERVISOR_TOKEN` environment variable. Use it as a bearer token for `http://supervisor/core/api/`, and as the `access_token` for `ws://supervisor/core/websocket`.
2. The REST API has no registry endpoints. Use the WebSocket API for the registries: `config/floor_registry/list`, `config/area_registry/list`, `config/device_registry/list`, `config/entity_registry/list`.
3. Use `subscribe_entities` (or `subscribe_events` with `state_changed`) for state changes. Use `subscribe_events` with `floor_registry_updated`, `area_registry_updated`, `device_registry_updated` and `entity_registry_updated` for registry changes.
4. The browser page cannot get the `SUPERVISOR_TOKEN`. The page must call the add-on server through the Ingress path. The add-on server then calls Home Assistant.

## 1. Access through the Supervisor

### Config options

| Option | Default | Effect | Source |
|---|---|---|---|
| `homeassistant_api` | `false` | Gives access to the Home Assistant REST API proxy at `http://supervisor/core/api`. | [configuration.md L163](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md?plain=1#L163) |
| `hassio_api` | `false` | Gives access to the Supervisor REST API at `http://supervisor`. | [configuration.md L162](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md?plain=1#L162) |
| `hassio_role` | `default` | Role for the Supervisor API. | [configuration.md L161](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md?plain=1#L161) |
| `ingress` | `false` | Turns on Ingress. | [configuration.md L188](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md?plain=1#L188) |
| `ingress_port` | `8099` | Port of the add-on web server for Ingress. | [configuration.md L189](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md?plain=1#L189) |
| `ingress_stream` | `false` | Streams the requests to the add-on. | [configuration.md L191](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md?plain=1#L191) |
| `panel_icon`, `panel_title`, `panel_admin` | `mdi:puzzle`, add-on name, `true` | Menu entry for the Ingress panel. `panel_admin: true` shows the entry only to admin users. | [configuration.md L192-L194](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md?plain=1#L192-L194) |

The add-on needs only `homeassistant_api: true` to read Home Assistant data. The paths `/core/api`, `/core/api/stream` and `/core/websocket` do not need `hassio_api: true` ([communication.md L32-L42](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md?plain=1#L32-L42)).

### REST API

- URL: `http://supervisor/core/api/`. Send the header `Authorization: Bearer ${SUPERVISOR_TOKEN}` ([communication.md L18-L20](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md?plain=1#L18-L20)).
- The Supervisor routes `GET`, `POST` and `DELETE` on `/core/api/{path}` to the proxy ([supervisor/api/\_\_init\_\_.py L707-L713](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/__init__.py#L707-L713)).
- The proxy finds the add-on from the token. It refuses the request with HTTP 401 if the token is unknown, or if the add-on does not have `homeassistant_api` access ([supervisor/api/proxy.py L111-L128](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/proxy.py#L111-L128)). The proxy also accepts the token in the `X-Ha-Access` header (same lines).
- The proxy blocks Core paths that start with `hassio/` or `hassio_` ([proxy.py L38-L42](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/proxy.py#L38-L42)).
- Useful REST endpoints: `GET /api/states` and `GET /api/states/<entity_id>` ([rest.md L412, L443](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/rest.md?plain=1#L412)). The REST API documentation lists no endpoint for the floor, area, device or entity registry ([rest.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/rest.md)). Thus, use the WebSocket API for the registries.

### WebSocket API

- URL: `ws://supervisor/core/websocket`. Use `SUPERVISOR_TOKEN` as the password ([communication.md L22](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md?plain=1#L22)). The Supervisor also accepts `/core/api/websocket` ([\_\_init\_\_.py L707-L708](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/__init__.py#L707-L708)).
- Authentication sequence ([proxy.py L345-L372](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/proxy.py#L345-L372)):
  1. The Supervisor sends `{"type": "auth_required", "ha_version": ...}`.
  2. The add-on sends `{"type": "auth", "access_token": "<SUPERVISOR_TOKEN>"}` in 10 seconds or less. The proxy also reads the field `api_password`.
  3. The Supervisor sends `auth_ok`, or `auth_invalid` if the add-on does not have `homeassistant_api` access.
- This sequence is the same as the normal Home Assistant sequence ([websocket.md L50-L75](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/websocket.md?plain=1#L50-L75)).
- The proxy refuses commands whose `type` starts with `supervisor/` or `hassio/` ([proxy.py L43-L48](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/proxy.py#L43-L48)).
- After the add-on authenticates, the Supervisor opens its own connection to Core ([proxy.py L224-L227](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/proxy.py#L224-L227)). It uses its own refresh token ([supervisor/homeassistant/api.py L186-L193](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/homeassistant/api.py#L186-L193)). Core creates the Supervisor user in the admin group ([hassio/\_\_init\_\_.py L204-L205](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/hassio/__init__.py#L204-L205)). Thus, the add-on commands run with admin rights. Commands with `require_admin` work.

## 2. Registry list commands

All four list commands do not need admin rights (no `require_admin` decorator). The create, update and delete commands need admin rights.

### Floor registry: `config/floor_registry/list`

Request: `{"id": 1, "type": "config/floor_registry/list"}`. The result is a list of floors ([config/floor_registry.py L25-L39](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/config/floor_registry.py#L25-L39)).

Fields of each floor ([floor_registry.py L157-L168](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/config/floor_registry.py#L157-L168)):

| Field | Type |
|---|---|
| `floor_id` | string |
| `name` | string |
| `level` | integer or `null` ([helpers/floor_registry.py L75-L81](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/floor_registry.py#L75-L81)) |
| `icon` | string or `null` |
| `aliases` | list of strings |
| `created_at` | number (Unix timestamp) |
| `modified_at` | number (Unix timestamp) |

Note: `level` can be `null`. The add-on must handle a Floor with no level.

### Area registry: `config/area_registry/list`

Request: `{"id": 2, "type": "config/area_registry/list"}` ([config/area_registry.py L23-L37](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/config/area_registry.py#L23-L37)).

Fields of each area ([helpers/area_registry.py L88-L104](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/area_registry.py#L88-L104)): `area_id`, `name`, `floor_id` (link to the floor, can be `null`), `aliases`, `icon`, `labels`, `picture`, `temperature_entity_id`, `humidity_entity_id`, `created_at`, `modified_at`.

### Device registry: `config/device_registry/list`

Request: `{"id": 3, "type": "config/device_registry/list"}`. The result has the devices and the child devices ([config/device_registry.py L75-L100](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/config/device_registry.py#L75-L100)).

Fields of each device ([helpers/device_registry.py L591-L626](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/device_registry.py#L591-L626)): `id`, `name`, `name_by_user`, `area_id`, `connections` (list of `[type, value]` pairs), `identifiers`, `manufacturer`, `model`, `model_id`, `hw_version`, `sw_version`, `serial_number`, `via_device_id`, `parent_device_id`, `config_entry_id`, `config_subentry_id`, `config_entries`, `config_entries_subentries`, `primary_config_entry`, `disabled_by`, `entry_type`, `labels`, `configuration_url`, `next_name_part`, `created_at`, `modified_at`.

Note: the code marks `config_entries`, `config_entries_subentries` and `primary_config_entry` as deprecated (removal in 2027.8 and 2027.10). Use `config_entry_id` ([same lines](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/device_registry.py#L600-L620)).

### Entity registry: `config/entity_registry/list`

Request: `{"id": 4, "type": "config/entity_registry/list"}` ([config/entity_registry.py L39-L66](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/config/entity_registry.py#L39-L66)).

Fields of each entity ([helpers/entity_registry.py L372-L403](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/entity_registry.py#L372-L403)): `entity_id`, `id`, `unique_id`, `platform`, `device_id`, `area_id`, `config_entry_id`, `config_subentry_id`, `name`, `original_name`, `icon`, `labels`, `categories`, `disabled_by`, `hidden_by`, `entity_category`, `has_entity_name`, `options`, `translation_key`, `next_name_part`, `created_at`, `modified_at`.

Other entity commands:

- `config/entity_registry/get` and `config/entity_registry/get_entries` return more fields, for example `capabilities`, `device_class` and `original_device_class` ([entity_registry.py L98-L134](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/config/entity_registry.py#L98-L134); [helpers/entity_registry.py L405-L420](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/entity_registry.py#L405-L420)).
- `config/entity_registry/list_for_display` returns a short form with short keys, for example `ei` (entity ID), `ai` (area ID), `di` (device ID). It includes only enabled entities ([websocket.md L623-L724](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/websocket.md?plain=1#L623-L724)).

The registry entries do not include the state. Use `get_states` or `subscribe_entities` for the state ([commands.py L417, L489](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/commands.py#L417)).

## 3. Subscribe to changes

### State changes: `subscribe_entities`

Request: `{"id": 5, "type": "subscribe_entities", "entity_ids": ["sensor.x"]}`. The `entity_ids` field is optional. The command also accepts include and exclude filters ([commands.py L486-L494](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/commands.py#L486-L494)).

Behavior:

- The server sends a `result` message. Then it sends one `event` message with all current states under the key `a` ([commands.py L563-L579](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/commands.py#L563-L579)).
- The server reads the states and starts to listen with no `await` between the two steps. The code comment says that this prevents lost changes ([commands.py L500-L516](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/commands.py#L500-L516)).
- Each later `event` message has one of these keys ([websocket_api/messages.py L40-L45, L203-L254](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/messages.py#L203-L254)):
  - `a`: added entities, `{entity_id: compressed_state}`.
  - `c`: changed entities, `{entity_id: {"+": additions, "-": removals}}`.
  - `r`: removed entities, a list of entity IDs.
- Short keys in a compressed state: `s` = state, `a` = attributes, `c` = context, `lc` = last changed, `lu` = last updated ([const.py L914-L918](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/const.py#L914-L918)).
- The developer documentation does not describe `subscribe_entities`. The facts above come only from the source code ([websocket.md](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/websocket.md)).

Alternative: `subscribe_events` with `event_type: "state_changed"` sends the full `old_state` and `new_state` for each change ([websocket.md L121-L160](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/websocket.md?plain=1#L121-L160)). It has no filter for entity IDs ([commands.py L185-L222](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/commands.py#L185-L222)).

### Registry changes: `subscribe_events`

Send one `subscribe_events` command for each event type ([websocket.md L123](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/websocket.md?plain=1#L123)). Example: `{"id": 6, "type": "subscribe_events", "event_type": "floor_registry_updated"}`.

| Event type | Event data | Source |
|---|---|---|
| `floor_registry_updated` | `action` (`create`, `remove`, `update`), `floor_id`; or `action: "reorder"` with no ID | [helpers/floor_registry.py L27-L69](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/floor_registry.py#L27-L69) |
| `area_registry_updated` | `action` (`create`, `remove`, `update`, `reorder`), `area_id` (can be `null`) | [helpers/area_registry.py L36-L71](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/area_registry.py#L36-L71) |
| `device_registry_updated` | `action` (`create`, `remove`, `update`), `device_id`; `remove` adds `device` (old data); `update` adds `changes` | [helpers/device_registry.py L78-L197](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/device_registry.py#L170-L197) |
| `entity_registry_updated` | `action` (`create`, `remove`, `update`), `entity_id`; `update` adds `changes` and can add `old_entity_id` | [helpers/entity_registry.py L85-L192](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/entity_registry.py#L173-L192) |

The events give only IDs and changes, not the full entry. To get the new data, send the list command again.

A non-admin user can subscribe to these four events and to `state_changed`, because they are in `SUBSCRIBE_ALLOWLIST` ([auth/permissions/events.py](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/auth/permissions/events.py); [commands.py L198](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/commands.py#L198)). The add-on connection runs as an admin user (section 1), so this limit does not apply to it.

To stop a subscription, send `unsubscribe_events` with the `id` of the subscription ([websocket.md L294](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/websocket.md?plain=1#L294); [commands.py L297](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/websocket_api/commands.py#L297)).

## 4. Browser page through Ingress

### Request path

1. The browser requests `/api/hassio_ingress/<token>/<path>` from Home Assistant Core. This view has `requires_auth = False` ([hassio/ingress.py L60-L86](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/hassio/ingress.py#L60-L86)).
2. Core sends the request to the Supervisor at `/ingress/<token>/<path>`. It adds the header `X-Ingress-Path: /api/hassio_ingress/<token>` ([hassio/ingress.py L265-L275](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/hassio/ingress.py#L265-L275)).
3. The Supervisor checks the Ingress session cookie. It refuses the request with HTTP 401 if the session is not valid ([supervisor/api/ingress.py L142-L151](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/ingress.py#L142-L151)).
4. The Supervisor sends the request to `http://<add-on IP>:<ingress_port>/<path>` ([ingress.py L94-L96](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/ingress.py#L94-L96)). It adds `X-Remote-User-Id`, `X-Remote-User-Name` and `X-Remote-User-Display-Name` for the logged-in user ([ingress.py L333-L344](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/ingress.py#L333-L344); [supervisor/const.py L103-L105](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/const.py#L103-L105)).

### Rules for the add-on server

- Accept connections only from `172.30.32.2`. Deny all other IP addresses ([presentation.md L138](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md?plain=1#L138)).
- Home Assistant authenticates the user. The add-on does not need its own login ([presentation.md L133, L139](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md?plain=1#L133-L139)).
- The Ingress gateway supports HTTP/1.x, streaming content and WebSockets ([presentation.md L145-L149](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md?plain=1#L145-L149); WebSocket code: [supervisor/api/ingress.py L158-L226](https://github.com/home-assistant/supervisor/blob/7fd100cfe08b38d9208165040ac958e54b4585cd/supervisor/api/ingress.py#L158-L226)).
- Use `X-Ingress-Path` to find the base URL of the page ([presentation.md L142](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/presentation.md?plain=1#L142)).

### How the page gets Home Assistant data

The documentation does not give a direct statement for this case. The facts above lead to this design:

- The `SUPERVISOR_TOKEN` is an environment variable in the add-on container ([communication.md L18](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md?plain=1#L18)). The browser does not get it. Do not send it to the browser.
- The page calls its own add-on server with relative URLs (under the `X-Ingress-Path` base). The page can use HTTP or a WebSocket.
- The add-on server keeps one WebSocket connection to `ws://supervisor/core/websocket`. It reads the registries, subscribes to changes, and sends the data to the page.
- The add-on server can use the `X-Remote-User-*` headers to know which user sends a request.

## Open points

- I did not find documentation for `subscribe_entities` in the developer documentation. The facts come from source code only.
- I did not test the commands on a running Home Assistant.
- I did not find an official statement that the WebSocket proxy runs commands as the Supervisor admin user. This fact comes from the source code (section 1).
