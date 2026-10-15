# A HACS integration with a Lit panel, not a Home Assistant app

The project is one custom integration in Python that the user installs with HACS (Marketplace from Home Assistant 2026.11). The floor plan editor and the live map are a sidebar panel in TypeScript with Lit. The panel uses the Home Assistant theme variables. (Changed by [ADR-0002](0002-panel-architecture.md): the panel does not use the `ha-*` components.) We do not make a Home Assistant app (formerly "add-on"). The integration reads the Bermuda distances, calculates the Positions, stores the floor plans with the Home Assistant storage helper, and sends live data to the panel through Home Assistant WebSocket subscriptions. Its entities go on the existing Bermuda device of each Tracked device, with `entity.device_entry`.

## Considered options

- **An app with Next.js and a TypeScript server, and MQTT discovery for the entities.** Rejected. After Home Assistant 2026.8, a device belongs to one config entry, so MQTT makes a second device for each Tracked device. No MQTT option links to the Bermuda device. An app cannot run on Home Assistant Container (17.5% of installs on 2026-10-15). An Ingress iframe gets no theme and no dark mode flag, so the UI cannot follow the Home Assistant look.
- **An app with a companion integration.** Rejected. It puts the entities on the Bermuda device, but it needs two installs, two languages for the server part, and still excludes Container.
- **REST `POST /api/states`.** Rejected. The entities have no registry entry, no device, and no state after a restart.

## Consequences

- The stack that was fixed at the start (Next.js, Redux, Tailwind CSS, shadcn/ui, a TypeScript server) is replaced.
- The position calculation runs in Python, so the entities update when no browser is open. It can use NumPy and SciPy, as BPS does.
- The `ha-*` components are not a supported API for custom panels. Home Assistant can change them in a release. Alarmo uses them with the same risk. [ADR-0002](0002-panel-architecture.md) does not use them.
- Bermuda is also a Python HACS integration. This form makes a later merge into Bermuda possible.
- Battery Notes and Powercalc use the same `entity.device_entry` method. Home Assistant documents it only for helpers. No rule forbids it for other integrations.
- No v1 decision may prevent a later floor plan image with a scale. Thus v1 accepts negative coordinates, and the stored floor plan data has a version number.
