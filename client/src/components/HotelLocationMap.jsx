import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Import marker icon assets directly so Vite bundles them with correct paths
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Explicit Leaflet icon configuration with exact anchor points
const hotelMarkerIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/**
 * Synchronizes the Leaflet map center and zoom when coordinates change.
 * In React Leaflet, MapContainer initialization props (center, zoom) are immutable
 * after initial creation. This controller child component accepts primitive numeric
 * props (latitude, longitude, zoom). By avoiding array references in the useEffect
 * dependency list, it prevents unnecessary re-centering or resetting of manual zoom/pan
 * during unrelated parent re-renders.
 *
 * @param {object} props
 * @param {number} props.latitude
 * @param {number} props.longitude
 * @param {number} props.zoom
 */
export function MapViewController({ latitude, longitude, zoom = 14 }) {
  const map = useMap();

  useEffect(() => {
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      map.setView([latitude, longitude], zoom);
    }
  }, [latitude, longitude, zoom, map]);

  return null;
}

/**
 * Validates geographic coordinate values.
 * - Latitude must be finite and between -90.0 and +90.0.
 * - Longitude must be finite and between -180.0 and +180.0.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
export const isValidCoordinate = (lat, lng) => {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90.0 &&
    lat <= 90.0 &&
    lng >= -180.0 &&
    lng <= 180.0
  );
};

/**
 * Interactive Leaflet Map displaying property location pin and popup.
 *
 * @param {object} props
 * @param {string|number} props.latitude - Raw coordinate (numeric or string from PostgreSQL)
 * @param {string|number} props.longitude - Raw coordinate (numeric or string from PostgreSQL)
 * @param {string} props.title - Property title for marker popup
 */
function HotelLocationMap({ latitude, longitude, title = 'Hotel Property' }) {
  const latNum = typeof latitude === 'number' ? latitude : Number(latitude);
  const lngNum = typeof longitude === 'number' ? longitude : Number(longitude);

  const valid = isValidCoordinate(latNum, lngNum);

  if (!valid) {
    return (
      <div
        className="map-unavailable-container"
        data-testid="map-unavailable"
        role="region"
        aria-label="Location map unavailable"
      >
        <div className="map-unavailable-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h4 className="map-unavailable-title">Location Map Unavailable</h4>
        <p className="map-unavailable-text">
          Coordinates ({String(latitude ?? 'N/A')}, {String(longitude ?? 'N/A')}) are outside valid geographic bounds (-90° to +90° lat, -180° to +180° lng).
        </p>
      </div>
    );
  }

  return (
    <div
      className="hotel-map-container"
      data-testid="hotel-location-map"
      role="region"
      aria-label={`Interactive location map for ${title}`}
    >
      <MapContainer
        center={[latNum, lngNum]}
        zoom={14}
        scrollWheelZoom={false}
        className="hotel-leaflet-map"
      >
        <MapViewController latitude={latNum} longitude={lngNum} zoom={14} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latNum, lngNum]} icon={hotelMarkerIcon}>
          <Popup>
            <div className="map-popup-card">
              <span className="map-popup-badge">Property Location</span>
              <strong className="map-popup-title">{title}</strong>
              <div className="map-popup-coords">
                {latNum.toFixed(6)}°, {lngNum.toFixed(6)}°
              </div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

export default HotelLocationMap;
