/**
 * Shared types for POI (Point of Interest) annotations.
 * POIs are polygon-shaped markers on the panorama/blueprint representing
 * places of interest (amenities, landmarks, etc.) distinct from real estate lots.
 */

/**
 * Annotation object for a POI as stored in the editor's annotations array.
 * Shares coordinate fields with lots but has POI-specific metadata.
 * @typedef {Object} PoiAnnotation
 * @property {string} id - Local UI identifier (matches backend uuid after save)
 * @property {'poi'} type - Annotation type discriminator
 * @property {string} [uuid] - Backend POI ID (present after first save)
 * @property {boolean} [pending] - True if created locally, not yet saved to backend
 * @property {string} tooltip - Display title (maps to backend `title` field)
 * @property {string} [icon_type] - Icon classification key (e.g. 'pool', 'gym', 'entrance'). Controlled vocabulary — see POI_ICON_OPTIONS in POIInspector.jsx
 * @property {string} [description] - Free-text description
 * @property {string} [link_url] - Optional URL
 * @property {string} [color] - Hex color for polygon fill/stroke (e.g. '#ff6b6b')
 * @property {Array<[number, number]>} [polygonPixels] - Active-mode coordinates (derived)
 * @property {Array<[number, number]>} [panorama_coordinates] - 360 panorama coords
 * @property {Array<[number, number]>} [blueprint_coordinates] - Blueprint coords
 * @property {Object} [svgStyle] - Override SVG styling
 */

/**
 * Form state for creating a new POI in the inspector.
 * @typedef {Object} PoiFormState
 * @property {string} title
 * @property {string} [icon_type]
 * @property {string} [description]
 * @property {string} [link_url]
 * @property {string} [color]
 */

/**
 * Form state for updating an existing POI metadata.
 * @typedef {Object} PoiUpdateFormState
 * @property {string} title
 * @property {string} [icon_type]
 * @property {string} [description]
 * @property {string} [link_url]
 * @property {string} [color]
 */