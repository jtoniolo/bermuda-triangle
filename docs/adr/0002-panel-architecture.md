# The architecture of the Integration and the Panel

The Panel uses its own Lit components, not the Home Assistant `ha-*` components. The components copy the Home Assistant look with the Home Assistant theme variables (color, `--ha-space-*`, `--ha-font-size-*`, `--ha-border-radius-*`), each with a fallback value. They follow the rules of design.home-assistant.io. The Panel includes its own copy of Lit, and Vite builds one modern JavaScript module. Each element name starts with `bermuda-triangle-`.

The Panel and the Integration use three WebSocket commands:

- `bermuda_triangle/config/get` returns the full stored file.
- `bermuda_triangle/config/save` replaces the full stored file. Only an admin can use it.
- `bermuda_triangle/config/subscribe` sends the full stored file after each save. All users can use it.

The editor has a Save button, as the Home Assistant editors have. The last save wins, as in the Home Assistant dashboard editor. After a save, a browser with no unsaved changes loads the new file. A browser with unsaved changes shows "updated elsewhere" with a Refresh button. The live map reads the Positions from the entity states in `hass`, and it has no custom subscription.

## Considered options

- **The `ha-*` components, defined with a trick.** Rejected. Home Assistant does not support their use in custom code. To define them, Alarmo creates the Home Assistant config panel in memory. Home Assistant renamed `ha-textfield` to `ha-input` in 2026.5, so a release can break the Panel.
- **`@home-assistant/webawesome`, the Home Assistant fork of Web Awesome.** Rejected. It has no documentation for use outside Home Assistant. It uses the same `wa-*` element names as the Home Assistant page, so a second copy can clash.
- **Borrow the copy of Lit from Home Assistant at runtime.** Rejected. Home Assistant advises against it. The cost of our own copy is about 15 KB.
- **A save of each change (autosave).** Rejected. The Home Assistant editors use a Save button.
- **A revision check that refuses an old save.** Rejected. Home Assistant uses no revision check. The user edits the Floor plans rarely, for example after a move or a renovation.
- **Redux for the state of the Panel.** Rejected. The Home Assistant frontend uses Lit properties and context. The Panel has one store class, shared with `@lit/context`.

## Consequences

- The Panel looks like Home Assistant only as far as our copies of the styles go. When Home Assistant changes its look, we change our components by hand.
- A save from one browser can overwrite a change from another browser, also a change to a different Floor plan.
- The custom subscribe command is necessary because Home Assistant does not let a user who is not an admin subscribe to a custom bus event.
- The Integration uses only NumPy, which is in Home Assistant core, with no version pin. It uses no SciPy. "Grilling: The position calculation method for v1" can change this.
- The minimum version is Home Assistant 2026.8. Versions 2026.9 and 2026.10 add no option that the Panel needs.
- The domain is `bermuda_triangle`. Python is in `custom_components/bermuda_triangle/`, the Panel source is in `frontend/`, and the tests are in `tests/`. The repo has `brand/icon.png` and `hacs.json` at the root.
- `hacs.json` has `zip_release`, `filename` and `hide_default_branch: true`. A GitHub Action builds the Panel and attaches the zip file to each GitHub release. `main` has no built file. The HACS Action and hassfest run on each push.
- The Panel URL has `?v=<version>`, so a browser loads the new file after an update. Each `customElements.define` has a guard, because a second load of the module can define an element two times.
