# Research: how the add-on creates entities for Tracked devices

Issue: [#4](https://github.com/jtoniolo/bermuda-triangle/issues/4)
Date: 2026-10-13

## Question

How can the add-on publish the Position, the Floor and the Area of each Tracked device as Home Assistant entities? This document compares three methods:

1. MQTT discovery.
2. A companion custom integration that the add-on talks to.
3. The REST API `POST /api/states/<entity_id>`.

For each method, it gives how the new entity links to the existing Home Assistant device of the Tracked device, and examples of add-ons that use the method.

Note: Home Assistant now calls add-ons "apps". The developer docs use the word "app (formerly known as add-on)" ([source](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md)). This document uses "add-on".

## Important background: device registry change in Home Assistant 2026.8

This change has an effect on all three methods. Read it first.

- From Home Assistant Core 2026.8, a device belongs to one config entry only. Devices are no longer merged across integrations ([blog, 2026-07-21](https://developers.home-assistant.io/blog/2026/07/21/device-registry-single-config-entry)).
- "A physical device that is supported by several integrations [...] is represented by one device entry per config entry rather than a single shared device." Identifiers and connections are unique per config entry ([device registry docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/device_registry_index.md)).
- The registry migration splits old shared devices into one device per config entry ([core source, `device_registry.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/device_registry.py#L1062-L1070)).
- Before 2026.8, an entity of a different integration could join the Bermuda device if it gave the same connection (for example the Bluetooth MAC). This is no longer true.

The device of a Tracked device belongs to the Bermuda config entry. Bermuda creates it with the identifier `("bermuda", <unique_id>)` and the connection `("bluetooth", <MAC in upper case>)`. For iBeacon and Private BLE devices, it uses other connection types ([Bermuda source, `entity.py`](https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/entity.py#L109-L168)).

The new way to show an entity on the device of a different integration is to set `entity.device_entry` to that device. The helper functions that copied the identifiers of the other device are deprecated and always return `None` ([core source, `helpers/device.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/device.py#L39-L56)). The entity platform uses `entity.device_entry` when the entity has no `device_info` ([core source, `entity_platform.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/entity_platform.py#L1065-L1067)). The blog post documents this pattern for helper integrations ([blog, 2025-07-18](https://developers.home-assistant.io/blog/2025/07/18/updated-pattern-for-helpers-linking-to-devices)).

## Method 1: MQTT discovery

### What the user must install

- An MQTT broker. The official Mosquitto broker add-on provides the `mqtt` service (`services: - mqtt:provide`) ([Mosquitto `config.yaml`](https://github.com/home-assistant/addons/blob/f9fa97ab7569ce5456e46684248187a411a75abc/mosquitto/config.yaml#L49-L50)).
- The MQTT integration. After the user starts Mosquitto, Home Assistant shows MQTT as a discovered integration. The user selects it and submits ([Mosquitto `DOCS.md`](https://github.com/home-assistant/addons/blob/f9fa97ab7569ce5456e46684248187a411a75abc/mosquitto/DOCS.md)).
- The add-on gets the broker host, user and password from the Supervisor services API. It must declare `mqtt:want` or `mqtt:need` in `services` in its `config.yaml` ([add-on configuration](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/configuration.md), [add-on communication, "Services API"](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md#services-api)).

### Entity types

- The topic format is `<discovery_prefix>/<component>/[<node_id>/]<object_id>/config`. The default prefix is `homeassistant`. With `component` = `device`, one message can define all entities of one device ([MQTT docs](https://github.com/home-assistant/home-assistant.io/blob/a37b81633d047f39a089ef823ddb2675380ffb4d/source/_integrations/mqtt.markdown)).
- `device_tracker` is a supported component. Its state is `home`, `not_home` "or any other custom location or zone name". It can also get attributes from a JSON message on `json_attributes_topic` ([MQTT device tracker docs](https://github.com/home-assistant/home-assistant.io/blob/a37b81633d047f39a089ef823ddb2675380ffb4d/source/_integrations/device_tracker.mqtt.markdown)).
- `sensor` is a supported component. It also supports `json_attributes_topic` ([MQTT sensor docs](https://github.com/home-assistant/home-assistant.io/blob/a37b81633d047f39a089ef823ddb2675380ffb4d/source/_integrations/sensor.mqtt.markdown)).
- A possible design: one `sensor` for the Area name, one `sensor` for the Floor name, and x, y, z of the Position as attributes. Home Assistant has no entity type for a Position in meters. This document did not find one.
- MQTT entities with a `unique_id` are in the entity registry. All entities are registered if they have a `unique_id` ([entity registry docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/entity_registry_index.md)).

### Restart behavior

- When MQTT starts, all MQTT entities are unavailable until Home Assistant gets a discovery message. The publisher must listen to the birth message (`homeassistant/status`) and send the discovery messages again, or send them with the retain flag ([MQTT docs](https://github.com/home-assistant/home-assistant.io/blob/a37b81633d047f39a089ef823ddb2675380ffb4d/source/_integrations/mqtt.markdown)).
- Retained messages stay on the broker after the publisher stops. They "can create ghost entities that keep coming back" ([MQTT docs](https://github.com/home-assistant/home-assistant.io/blob/a37b81633d047f39a089ef823ddb2675380ffb4d/source/_integrations/mqtt.markdown)).

### Link to the existing device

- The discovery payload has a `device` block with `identifiers` and `connections`. An example of a connection is `["mac", "02:5b:26:a8:dc:12"]` ([MQTT sensor docs](https://github.com/home-assistant/home-assistant.io/blob/a37b81633d047f39a089ef823ddb2675380ffb4d/source/_integrations/sensor.mqtt.markdown)).
- The MQTT integration creates the device under the MQTT config entry. After 2026.8, the same connection as the Bermuda device does not make one shared device. It makes a second, separate device (see background above).
- The `via_device` option looks up the device only in the MQTT config entry ([core source, `mqtt/entity.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/mqtt/entity.py#L1381-L1398)). Thus `via_device` cannot point to the Bermuda device.
- Result: with MQTT, the entities cannot be on the Bermuda device. They are on a new MQTT device. This document did not find an MQTT option that attaches an entity to a device of a different integration.

### Example add-ons

- ESPresense Companion. It publishes a `device_tracker` discovery message for each device. The attributes topic has `x`, `y`, `z`, `confidence` and optional `latitude`/`longitude` ([`AutoDiscovery.cs`](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Models/AutoDiscovery.cs), [`MultiScenarioLocator.cs`](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Services/MultiScenarioLocator.cs)). Its device has its own identifier `espresense-<id>`, not a link to an existing device. It reads the broker settings from `http://supervisor/services/mqtt` ([`SupervisorConfigLoader.cs`](https://github.com/ESPresense/ESPresense-companion/blob/b3ba8488f5f03c0f2cabdf0db01aec2645ce755e/src/Services/SupervisorConfigLoader.cs)). This add-on is the nearest example to this project.
- Frigate add-on. It declares `mqtt:want` ([Frigate add-on `config.yaml`](https://github.com/blakeblackshear/frigate-hass-addons/blob/8dfef47b149f16adfe4889396168ecd267ef618b/frigate/config.yaml#L63-L64)).
- Zigbee2MQTT is a well-known MQTT discovery add-on. This document did not read its source.

## Method 2: companion custom integration

### How it works

- The add-on runs a server. A custom integration in Home Assistant connects to it and creates the entities. The add-on and the integration use a protocol that the developer defines (HTTP, WebSocket or other).
- The add-on can also call the Home Assistant WebSocket API at `ws://supervisor/core/websocket` with `SUPERVISOR_TOKEN`. It needs `homeassistant_api: true` ([add-on communication](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md#home-assistant-core)). The integration can register custom WebSocket commands that the add-on calls. Node-RED does this (see examples).
- The user must install the integration separately, for example with HACS, and add it in **Settings > Devices & Services** ([hass-node-red README](https://github.com/zachowj/hass-node-red/blob/7e58fbf0df937ce6a9d3717d4e7aa9fa48ec30ce/README.md)). This document did not find a way for an add-on to install an integration automatically.

### Entity types

- All entity types are available, because the integration is normal Home Assistant code. It can use `device_tracker`, `sensor` with attributes, or other types.
- Entities with a `unique_id` from a config entry are in the entity registry ([entity registry docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/entity_registry_index.md)). An entity can extend `RestoreEntity` to keep its last state after a restart ([core source, `restore_state.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/restore_state.py#L372-L374)).

### Link to the existing device

- The integration can find the Bermuda device, for example from a Bermuda entity ID with `async_entity_id_to_device()`. Then it sets `entity.device_entry` to that device and does not set `device_info` (see background above).
- With this method, the entity shows on the existing Bermuda device. The device stays owned by the Bermuda config entry.
- Limit: Home Assistant documents this pattern for helper integrations. This document did not find a rule that allows or forbids it for other integrations. The core code does not block it ([`entity_platform.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/entity_platform.py#L1065-L1067)).
- Only this method can put the entities on the Bermuda device.

### Example add-ons

- Node-RED with the Node-RED Companion integration. The integration registers WebSocket commands such as `nodered/discovery` and `nodered/entity`. Node-RED calls them to create and update entities ([`websocket.py`](https://github.com/zachowj/hass-node-red/blob/7e58fbf0df937ce6a9d3717d4e7aa9fa48ec30ce/custom_components/nodered/websocket.py#L191-L218)). The entities get their own device with `nodered` identifiers ([`entity.py`](https://github.com/zachowj/hass-node-red/blob/7e58fbf0df937ce6a9d3717d4e7aa9fa48ec30ce/custom_components/nodered/entity.py#L78-L85)).
- Frigate add-on with the Frigate integration. The integration calls the HTTP API of the Frigate server, for example `api/config` ([`api.py`](https://github.com/blakeblackshear/frigate-hass-integration/blob/24660181d6fd73af0ddf27a74e6bb608c96026b6/custom_components/frigate/api.py#L240)).

## Method 3: REST API `POST /api/states/<entity_id>`

### How it works

- The add-on sends requests to `http://supervisor/core/api/` with `SUPERVISOR_TOKEN`. It needs `homeassistant_api: true` ([add-on communication](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/apps/communication.md#home-assistant-core)).
- The endpoint "updates or creates a state. [...] it does not have to be backed by an entity in Home Assistant." The body has `state` and `attributes` ([REST API docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/rest.md)).
- The handler requires an admin user. It calls `hass.states.async_set()` only ([core source, `api/__init__.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/components/api/__init__.py#L260-L308)). It writes the state machine. It does not write the entity registry or the device registry.
- The entity ID prefix can be any domain, for example `sensor.` or `device_tracker.`. The handler only checks that the ID format and state are valid (same source).

### Limits

- No entity registry entry. The entity registry only has entities with a `unique_id` ([entity registry docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/entity_registry_index.md)). The state has no `unique_id`.
- The user cannot manage the entity in the UI. Home Assistant shows "This entity [...] does not have a unique ID, therefore its settings cannot be managed from the UI." The user cannot rename it, give it an area or add Assist aliases ([FAQ, unique ID](https://github.com/home-assistant/home-assistant.io/blob/a37b81633d047f39a089ef823ddb2675380ffb4d/source/_faq/unique_id.markdown)).
- The state does not persist after a restart. The restore-state store saves only states of `RestoreEntity` objects ([core source, `restore_state.py`](https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/helpers/restore_state.py#L250-L275)). A state from the REST API is not such an object. The entity is missing after a restart until the add-on posts it again.
- The REST API docs say the endpoint "will not communicate with the actual device" ([REST API docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/api/rest.md)).

### Link to the existing device

- None. A device link is a field of the entity registry entry. The state has no registry entry, thus it cannot link to a device ([entity registry docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/entity_registry_index.md), [device registry docs](https://github.com/home-assistant/developers.home-assistant/blob/408e71c49ec96a00de83a80b358f3116af6d948a/docs/device_registry_index.md)).

### Example add-ons

- AppDaemon. Its `set_state` sends `POST api/states/{entity_id}` ([AppDaemon `hassplugin.py`](https://github.com/AppDaemon/appdaemon/blob/b8b06ba7e39b19674c49c2e0d196f10f422a107c/appdaemon/plugins/hass/hassplugin.py#L878-L892)). The AppDaemon add-on sets `homeassistant_api: true` ([add-on `config.yaml`](https://github.com/hassio-addons/addon-appdaemon/blob/185183c8fde61f0547deb1cd75b903dd01f47f2d/appdaemon/config.yaml#L12)).

## Comparison

| Item | MQTT discovery | Companion integration | REST `POST /api/states` |
|---|---|---|---|
| User must install | Broker add-on and MQTT integration | Custom integration (for example with HACS) | Nothing |
| Entity registry | Yes, with `unique_id` | Yes | No |
| UI management (rename, area) | Yes | Yes | No |
| After restart | Unavailable until discovery is sent again, or retained | Normal; `RestoreEntity` is possible | Missing until posted again |
| Entity types | MQTT platforms, for example `device_tracker`, `sensor` | All | Any domain prefix, state only |
| On the Bermuda device | No (separate MQTT device after 2026.8) | Yes, with `entity.device_entry` | No |
| Example | ESPresense Companion | Node-RED, Frigate | AppDaemon |

## Facts not found

- An MQTT discovery option that attaches an entity to a device of a different integration. This document found none.
- A documented rule that allows non-helper integrations to use `entity.device_entry` for a device of a different integration.
- An entity type in Home Assistant for an x, y, z Position in meters.
- How the Home Assistant UI shows two device entries (Bermuda and MQTT) of the same physical device after 2026.8.
- Whether the user that `SUPERVISOR_TOKEN` maps to passes the admin check of `POST /api/states`. AppDaemon uses this endpoint from an add-on, but this document did not find a statement in the docs.
