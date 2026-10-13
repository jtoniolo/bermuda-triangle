# Bermuda distance data

Research for issue [#5](https://github.com/jtoniolo/bermuda-triangle/issues/5).

Date: 2026-10-13.

Sources: the Bermuda source code at commit
[`cd46d17`](https://github.com/agittins/bermuda/tree/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6)
(`main`, 2026-07-22), the [Bermuda wiki](https://github.com/agittins/bermuda/wiki),
and the Bermuda issues and discussions. Between the release `v0.8.7` and this commit, the
integration code has one change only, in `handle_devreg_changes`. The distance code is the same
in `v0.8.7` and in `cd46d17`.

In this document, the abbreviation "HA" is Home Assistant. "RSSI" is the received signal
strength, in dBm. "Advert" is one Bluetooth advertisement packet that a Scanner receives.
All code links go to commit `cd46d17`.

## 1. Entities that give the distance

### 1.1 Entities for each Tracked device and each Scanner

For each Tracked device, Bermuda makes two sensor entities for each Scanner
([sensor.py L110-L126][s-create]):

| Entity name | Value | Unique ID |
|---|---|---|
| `Distance to <Scanner name>` | Smoothed distance | `<device unique_id>_<scanner MAC>_range` |
| `Unfiltered Distance to <Scanner name>` | Distance with no smoothing | `<device unique_id>_<scanner MAC>_range_raw` |

- The entity names come from [sensor.py L369-L370][s-name] and [sensor.py L412-L413][s-rawname].
- The unique IDs come from [sensor.py L364-L366][s-uid] and [sensor.py L405-L409][s-rawuid].
  `<scanner MAC>` is the Wi-Fi MAC of the Scanner if Bermuda knows it. If not, it is the
  Scanner address. The code keeps the Wi-Fi MAC for old entities, because ESPHome 2025.3 changed
  the address that the proxies send ([sensor.py L405-L408][s-rawuid]).
- The entities have `has_entity_name = True` ([sensor.py L160-L166][s-hasname]). Thus HA puts the
  Tracked device name before the entity name. The entity ID pattern is
  `sensor.<device>_distance_to_<scanner>` and `sensor.<device>_unfiltered_distance_to_<scanner>`.
  The wiki uses the glob `sensor.*_distance_to_*` for these entities
  ([wiki Settings][w-settings]). Note: this glob also gets the unfiltered entities.
- Both entities are **disabled by default**. Only the entities with the names `Area`, `Distance`
  and `Floor` are enabled by default ([sensor.py L195-L198][s-enabled]). The wiki also says this
  ([wiki Home][w-home]). The add-on must tell the user to enable them, or enable them through the
  HA entity registry.
- The entity belongs to the HA device of the **Tracked device**, not to the HA device of the
  Scanner ([sensor.py L357-L361][s-init], [entity.py L108-L168][e-devinfo]).

### 1.2 Entity for the nearest Scanner only

Each Tracked device also has a `Distance` sensor. It gives the smoothed distance to the nearest
Scanner only ([sensor.py L309-L344][s-range]). It is not sufficient for a Position calculation.

### 1.3 Units

- The native unit is metres (`UnitOfLength.METERS`) and the device class is `distance`
  ([sensor.py L332-L339][s-unit]).
- HA can show the value in a different unit. In the US customary unit system, HA changes a
  `distance` sensor in metres to feet
  ([HA core unit_system.py L362][ha-us]). A user in issue #21 saw Bermuda distances in feet, and
  a third-party tool read them as metres by mistake
  ([issue #21 comment][i21-feet]). **The add-on must read the `unit_of_measurement` attribute and
  change the value to metres.**
- Rounding: `Distance to` and `Unfiltered Distance to` have 3 decimal places. `Distance` has 1
  decimal place ([sensor.py L329][s-range], [sensor.py L383][s-val], [sensor.py L425][s-rawval],
  [wiki Settings][w-settings]).

### 1.4 State attributes

The code tries to give these attributes on `Distance to`: `area_id`, `area_name`,
`area_scanner_mac`, `area_scanner_name` ([sensor.py L386-L398][s-attr]). But the code gives them
only if the advert object has an attribute `source`. The advert class (`BermudaAdvert`) has no
attribute `source` ([bermuda_advert.py L76-L105][a-init]). The commit
[`52740ea`](https://github.com/agittins/bermuda/commit/52740ea0f84e4770bcaa441df474e8fe145307bb)
(first release `v0.8.2`) removed `self.source`. Thus, from the code, these attributes are not
present in `v0.8.2` and later. I did not test this on a live system. I did not find an issue
about it. **The add-on must not use these attributes.**

### 1.5 Update rate

- Bermuda processes the Bluetooth data every 1.05 s ([const.py L54][c-upd],
  [coordinator.py L178][co-upd]).
- The `Distance to` sensor uses a rate limit ([sensor.py L383][s-val],
  [entity.py L57-L84][e-rate]). A distance that decreases goes out immediately. A distance that
  increases goes out only when the last value is older than the option `update_interval`.
- The default `update_interval` in the code is **10 s** ([const.py L185][c-opts]). The wiki says
  the default is 5 s ([wiki Settings][w-settings]). The code is the authority. The wiki text is
  old.
- The `Unfiltered Distance to` sensor has no rate limit ([sensor.py L415-L426][s-rawval]). It can
  change on each 1.05 s cycle.
- A new value needs a new advert. The wiki says: if a device transmits each second, a new distance
  can take up to 2 s, and lost packets are frequent ([wiki FAQ][w-faq]).
- If no advert comes from a Scanner for 30 s (`DISTANCE_TIMEOUT`), the smoothed distance becomes
  `None` ([const.py L67][c-timeout], [bermuda_advert.py L384-L390][a-away]). The `Distance to`
  state then has no value (HA shows "unknown").
- From the code, the timeout does not clear the raw distance (`rssi_distance_raw`)
  ([bermuda_advert.py L384-L390][a-away]). Thus the `Unfiltered Distance to` sensor can keep an
  old value after the device goes away. I did not test this on a live system. The add-on must use
  the `last_updated` time of the state, or use the smoothed sensor, to find old values.

### 1.6 Other way to read the data: the `bermuda.dump_devices` action

- Bermuda has the action (service) `bermuda.dump_devices`. It returns data only
  (`SupportsResponse.ONLY`) ([coordinator.py L272-L285][co-svc]).
- Fields: `addresses` (list of addresses, with spaces between them), `configured_devices`
  (boolean), `redact` (boolean) ([services.yaml][svc-yaml], [coordinator.py L1596-L1631][co-dump]).
- For each device, it returns all its variables, and one entry for each Scanner advert
  ([bermuda_device.py L811-L834][d-dict], [bermuda_advert.py L495-L540][a-dict]). Each advert
  entry has `rssi`, `rssi_distance` (smoothed), `rssi_distance_raw`, `stamp`, `hist_rssi`,
  `hist_distance`, `hist_interval`, `conf_rssi_offset` and more.
- The release `v0.8.2` changed the format of this output
  ([commit 52740ea](https://github.com/agittins/bermuda/commit/52740ea0f84e4770bcaa441df474e8fe145307bb)).
  The format can change again. The wiki uses it for diagnostics
  ([wiki Troubleshooting][w-trouble]).
- The HA REST API can call an action that returns data, with `?return_response` on the URL
  ([HA REST API docs][ha-rest]).

## 2. Raw or smoothed, and the options that change the distance

### 2.1 The distance formula

`distance = 10 ** ((ref_power - (rssi + rssi_offset)) / (10 * attenuation))`

- The formula is in [util.py L87-L108][u-rssi]. Bermuda adds the per-Scanner RSSI offset to the
  RSSI first ([bermuda_advert.py L283][a-raw]). The wiki gives the same formula
  ([wiki FAQ][w-faq]).
- `ref_power` is the per-device value if it is not 0. If it is 0, Bermuda uses the global value
  ([bermuda_advert.py L276-L281][a-raw]).

### 2.2 The two values

- **Unfiltered (`rssi_distance_raw`)**: the formula above, for the latest advert
  ([bermuda_advert.py L265-L304][a-raw]). It is "unfiltered" only because it has no smoothing.
  It **includes** the effect of `ref_power`, `attenuation` and the RSSI offsets.
- **Smoothed (`rssi_distance`)**: Bermuda calculates it in `calculate_data`
  ([bermuda_advert.py L326-L486][a-calc]). The steps are:
  1. Velocity filter: if a new reading shows that the device goes away faster than `max_velocity`,
     Bermuda ignores the reading and repeats the last value ([bermuda_advert.py L398-L454][a-velo]).
     A reading that shows the device comes nearer always passes.
  2. Bermuda keeps the last `smoothing_samples` values, one for each cycle
     ([bermuda_advert.py L456-L458][a-avg]).
  3. Bermuda calculates an average of a running minimum over these values
     ([bermuda_advert.py L469-L479][a-avg]).
  4. The result is the lower of this average and the raw value ([bermuda_advert.py L481-L486][a-avg]).
- Thus the smoothed value has a bias to the near side. It follows a decrease quickly and an
  increase slowly. This is intentional. The author says that RSSI noise almost always makes the
  distance longer, not shorter ([bermuda_advert.py L351-L355][a-calc], [wiki FAQ][w-faq]).

### 2.3 Options

| Option | Key | Default | Effect | Source |
|---|---|---|---|---|
| Reference power at 1 m (global) | `ref_power` | -55.0 dBm | Formula, raw and smoothed | [const.py L178][c-opts] |
| Attenuation | `attenuation` | 3 | Formula, raw and smoothed | [const.py L176][c-opts] |
| Per-Scanner RSSI offset | `rssi_offsets` | 0 for each Scanner | Added to RSSI, raw and smoothed. Limited to -127 to 127 | [bermuda_advert.py L97][a-init], [config_flow.py L478-L484][cf-off] |
| Per-device reference power | number entity `Calibration Ref Power at 1m. 0 for default.` | 0 (use global) | Formula, raw and smoothed | [number.py L69-L113][n-num] |
| Maximum velocity | `max_velocity` | 3 m/s | Smoothed only | [const.py L167][c-opts] |
| Smoothing samples | `smoothing_samples` | 20 | Smoothed only | [const.py L191][c-opts] |
| Update interval | `update_interval` | 10 s | Rate limit of the smoothed sensors only | [const.py L185][c-opts], [entity.py L53][e-rate] |
| Maximum radius | `max_area_radius` | 20 m | Area choice only, not the distance | [const.py L164][c-opts] |

- The user sets the global options in the Bermuda options flow ([config_flow.py L197-L234][cf-glob]).
- The wiki describes the calibration of `ref_power`, `attenuation`, the per-Scanner offsets and
  the per-device reference power ([wiki Calibration][w-calib]).
- Bermuda keeps the RSSI offsets by Scanner address ([config_flow.py L478-L484][cf-off]).

## 3. How to find the HA device of each Scanner

- Bermuda gets its Scanners from the HA Bluetooth manager (`async_current_scanners()`). The
  Scanner address is the normalized (lower case) `source` of the HA scanner
  ([coordinator.py L1507-L1529][co-scan]).
- Bermuda then finds the HA device registry entries of the Scanner. It searches the registry for
  the connections `("bluetooth", MAC upper case)` and `("mac", MAC lower case)`, for the address
  and for the addresses -3 to +2 in the last octet
  ([bermuda_device.py L311-L336][d-resolve]).
  - The `bluetooth` connection is the device of the HA Bluetooth integration.
  - The `mac` connection is the device of ESPHome or Shelly.
- Bermuda uses the `area_id` of the Bluetooth device first, then the ESPHome or Shelly device
  ([bermuda_device.py L363-L381][d-resolve]). It keeps the device registry ID in `entry_id`.
- Bermuda sets `unique_id` and `address_wifi_mac` to the `mac` connection value, and
  `address_ble_mac` to the `bluetooth` connection value ([bermuda_device.py L382-L389][d-resolve]).

**Methods for the add-on** (my proposal, from the facts above):

1. **Entity registry**: read the unique ID of each `Distance to` entity. The part between the
   device unique ID and `_range` is the Scanner MAC (`address_wifi_mac`, or the Scanner address).
   Search the device registry for a device with connection `("mac", <MAC lower case>)` or
   `("bluetooth", <MAC upper case>)`. Note: the unique ID of a Tracked device can contain `_`
   (for example an iBeacon `uuid_major_minor`, [bermuda_device.py L127][d-init]). Thus the
   add-on must split from the end of the string.
2. **`bermuda.dump_devices`**: the output has `entry_id` (the HA device registry ID),
   `address_wifi_mac`, `address_ble_mac` and `area_id` for each Scanner
   ([bermuda_device.py L811-L834][d-dict]). This gives the link directly.
3. The `area_scanner_mac` attribute is **not** a usable method (see section 1.4).

- If a remote Scanner has no Wi-Fi MAC, Bermuda does not make the per-Scanner entities for any
  Scanner ([sensor.py L101-L108][s-create]).
- Issue [#817](https://github.com/agittins/bermuda/issues/817) (open, `v0.8.7`, 2026-08-20) says
  that the `Distance to` sensors stop or are not made again in some conditions. The cause is not
  known yet. The owner says it is possibly a fault in how Bermuda makes these sensors.

## 4. Data on the error of the distances

I did not find a measured error value (for example, in metres) for Bermuda distances in the
code, the wiki, the issues or the discussions. I found these statements only:

- The author says that RSSI is "a horribly inaccurate and unreliable method of measuring a
  distance" ([wiki Home][w-home]).
- RSSI noise is asymmetric: a closer reading is almost always more accurate. A long reading is
  usually longer than the true distance ([bermuda_advert.py L351-L355][a-calc],
  [wiki Settings][w-settings]).
- Bodies, reflections and walls weaken the signal. This makes the distance longer
  ([wiki Troubleshooting][w-trouble]).
- If a Scanner sends adverts more than 5 s apart, results are bad
  ([wiki Troubleshooting][w-trouble]).
- The calibration page shows an "OK" result at 1 m and an "OKish" result at 4 m. It says that
  noise increases with distance. The values are in screenshots only, and I did not read numbers
  from them ([wiki Calibration][w-calib]).
- The author says the 10 cm rounding is more precise than the real accuracy
  ([wiki Settings][w-settings]).
- The research page of the wiki gives a paper that says indoor, calibrated RSSI systems get a
  Position error of 2 m to 5 m. This is a value from the literature, not a Bermuda measurement
  ([wiki Research and References][w-research]).
- In issue #21, one user said that a third-party trilateration tool (BPS) with about 20 Scanners
  became "very accurate". The user gave no number
  ([issue #21 comment](https://github.com/agittins/bermuda/issues/21#issuecomment-4886922594)).
- Bermuda does not calculate a Position itself. Trilateration is an open feature request
  ([issue #21](https://github.com/agittins/bermuda/issues/21)).

## 5. Necessary Bermuda version

| Version | Change | Source |
|---|---|---|
| `v0.5.0` (2024-03-18) | First release with `Distance to` sensors and `Unfiltered Distance to` sensors | commits [`71a7018`](https://github.com/agittins/bermuda/commit/71a7018), [`338b5e0`](https://github.com/agittins/bermuda/commit/338b5e0) |
| `v0.7.0` | First stable release with per-Scanner RSSI offsets | commit [`5b826d7`](https://github.com/agittins/bermuda/commit/5b826d7) |
| `v0.8.0` (2025-04-23) | Unique IDs keep the Wi-Fi MAC after ESPHome 2025.3. Needs HA 2025.3 | commits [`1cdee7f`](https://github.com/agittins/bermuda/commit/1cdee7f), [`01b4197`](https://github.com/agittins/bermuda/commit/01b4197) |
| `v0.8.2` (2025-05-20) | `dump_devices` format changes. Per-Scanner sensors are made and removed at run time. Per-Scanner attributes stop (section 1.4) | commit [`52740ea`](https://github.com/agittins/bermuda/commit/52740ea0f84e4770bcaa441df474e8fe145307bb) |
| `v0.8.7` (2026-07-11) | Latest release. Same distance code as `main` | [release v0.8.7](https://github.com/agittins/bermuda/releases/tag/v0.8.7) |

- The current code needs HA 2025.3 or later ([hacs.json L4](https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/hacs.json#L4)).
  The code also uses a device registry call that "Requires 2025.3"
  ([bermuda_device.py L320-L321][d-resolve]).
- My proposal: the add-on supports `v0.8.2` or later, and is tested on `v0.8.7`. Reason: the
  entity unique IDs and the `dump_devices` format are stable from `v0.8.2` to `v0.8.7`. This is a
  proposal, not a fact from Bermuda.

## 6. Open points

- I did not test the facts in sections 1.4 and 1.5 (missing attributes, old raw value) on a live
  system.
- I found no measured error data for Bermuda distances.
- The cause of issue #817 is not known.

[s-create]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L96-L126
[s-name]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L368-L370
[s-rawname]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L411-L413
[s-uid]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L363-L366
[s-rawuid]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L404-L409
[s-hasname]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L160-L166
[s-enabled]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L195-L198
[s-init]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L350-L361
[s-range]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L309-L344
[s-unit]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L332-L339
[s-val]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L372-L384
[s-rawval]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L415-L426
[s-attr]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/sensor.py#L386-L398
[e-rate]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/entity.py#L53-L84
[e-devinfo]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/entity.py#L108-L168
[c-upd]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/const.py#L54
[c-timeout]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/const.py#L67
[c-opts]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/const.py#L164-L195
[co-upd]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/coordinator.py#L174-L179
[co-svc]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/coordinator.py#L272-L285
[co-dump]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/coordinator.py#L1596-L1631
[co-scan]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/coordinator.py#L1497-L1533
[svc-yaml]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/services.yaml
[d-init]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_device.py#L79-L145
[d-resolve]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_device.py#L276-L416
[d-dict]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_device.py#L811-L834
[a-init]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L69-L118
[a-raw]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L265-L304
[a-calc]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L326-L493
[a-away]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L368-L391
[a-velo]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L396-L454
[a-avg]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L456-L486
[a-dict]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/bermuda_advert.py#L495-L540
[u-rssi]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/util.py#L87-L108
[cf-glob]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/config_flow.py#L197-L234
[cf-off]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/config_flow.py#L474-L484
[n-num]: https://github.com/agittins/bermuda/blob/cd46d17e8469b9a761ebdb49ce3b33da51b0b1f6/custom_components/bermuda/number.py#L69-L113
[w-settings]: https://github.com/agittins/bermuda/wiki/Settings
[w-calib]: https://github.com/agittins/bermuda/wiki/Calibration
[w-faq]: https://github.com/agittins/bermuda/wiki/FAQ
[w-home]: https://github.com/agittins/bermuda/wiki
[w-trouble]: https://github.com/agittins/bermuda/wiki/Troubleshooting
[w-research]: https://github.com/agittins/bermuda/wiki/Research-and-References
[i21-feet]: https://github.com/agittins/bermuda/issues/21#issuecomment-4896062150
[ha-us]: https://github.com/home-assistant/core/blob/aeb1a1c65922739ccb8e7b9abf3d6f554299b912/homeassistant/util/unit_system.py#L362
[ha-rest]: https://developers.home-assistant.io/docs/api/rest/
