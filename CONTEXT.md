# bermuda-triangle

A Home Assistant custom integration. The user draws the floor plans of a home, places the scanners on the plans, and gets the calculated position of each tracked device. It works with the Bermuda integration.

## Language

**Integration**:
The Home Assistant custom integration that this repo makes. The Bermuda integration is a different integration.
_Avoid_: App, add-on, addon

**Panel**:
The page of the Integration in the Home Assistant sidebar. It has the floor plan editor and the live map.
_Avoid_: App, UI, dashboard

### Geometry

**Area**:
A region of a floor plan, linked to zero or one Home Assistant area. An Area can be a full room or a section of a room. Each Area is on one Floor plan. More than one Area can link to the same Home Assistant area. Areas cannot overlap. Two Areas that share at least one Edge are adjacent.
_Avoid_: Room, zone

**Floor**:
One level of the home, linked to one Home Assistant floor. Its number is the Home Assistant floor level. Each Area is on one Floor.
_Avoid_: Level, storey

**Elevation**:
The height of the surface of a Floor above the surface of the ground floor, in meters. It is negative for a Floor below the ground floor. A Floor is flat: each Position on a Floor has the Elevation of that Floor as its z.
_Avoid_: Altitude, floor height

**Floor plan**:
The drawing of one Floor: its Corners, Edges and Areas. A Floor has no Floor plan until the user draws one. Positions are only available on a Floor that has a Floor plan.
_Avoid_: Map, layout

**Edge**:
A straight line on a floor plan, between two Corners. Two adjacent Areas share the Edges where they touch.
_Avoid_: Segment, line

**Corner**:
A point where two Edges meet. Two Areas that touch use the same Corners and the same Edges. The Integration stores the x and y of each Corner in meters, in the coordinate system of the home. The lengths and angles of the Edges come from the Corners.
_Avoid_: Vertex, node, point

**Position**:
A point in x, y and z, in meters, in the coordinate system of the home. All Floors use the same x and y. The point (0, 0) is at the top left. z is the height above the surface of the ground floor.
_Avoid_: Location, coordinates

### Tracking

**Scanner**:
A Bluetooth receiver that Bermuda uses, for example an ESPHome Bluetooth proxy. Each Scanner has a Position.
_Avoid_: Proxy, receiver, node, beacon

**Tracked device**:
A Bluetooth device that Bermuda follows, and that the Integration calculates a Position for.
_Avoid_: Tag, beacon, target
