# bermuda-triangle

A Home Assistant app. The user draws the floor plans of a home, places the scanners on the plans, and gets the calculated position of each tracked device. It works with the Bermuda integration.

## Language

**App**:
The Home Assistant app that this repo makes. Home Assistant used the name "add-on" before.
_Avoid_: Add-on, addon

### Geometry

**Area**:
A region of a floor plan, linked to one Home Assistant area. An Area can be a full room or a section of a room.
_Avoid_: Room, zone

**Floor**:
One level of the home, linked to one Home Assistant floor. Its number is the Home Assistant floor level. Each Area is on one Floor.
_Avoid_: Level, storey

**Elevation**:
The height of the surface of a Floor above the surface of the ground floor, in meters. It is negative for a Floor below the ground floor.
_Avoid_: Altitude, floor height

**Edge**:
A straight line on a floor plan, between two corners. An Edge is a Wall or an Open edge, and the user can change one kind to the other.
_Avoid_: Segment, line

**Wall**:
An Edge that is a physical wall. The editor shows it as a solid line.

**Open edge**:
An Edge that is only a boundary between Areas, or between an Area and no Area. The editor shows it as a dotted line.
_Avoid_: Virtual wall, divider

**Position**:
A point in x, y and z, in meters.
_Avoid_: Location, coordinates

### Tracking

**Scanner**:
A Bluetooth receiver that Bermuda uses, for example an ESPHome Bluetooth proxy. Each Scanner has a Position.
_Avoid_: Proxy, receiver, node, beacon

**Tracked device**:
A Bluetooth device that Bermuda follows, and that the app calculates a Position for.
_Avoid_: Tag, beacon, target
