import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HotelLocationMap, { isValidCoordinate, parseCoordinate, MapViewController } from '../components/HotelLocationMap';

const mockSetView = vi.fn();
const mockMap = {
  setView: mockSetView,
  getZoom: () => 14,
  invalidateSize: vi.fn(),
};

// Mock react-leaflet components and hooks for jsdom testing
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom, className }) => (
    <div
      data-testid="mock-map-container"
      data-center={JSON.stringify(center)}
      data-zoom={zoom}
      className={className}
    >
      {children}
    </div>
  ),
  useMap: () => mockMap,
  TileLayer: ({ attribution, url }) => (
    <div
      data-testid="mock-tile-layer"
      data-attribution={attribution}
      data-url={url}
    />
  ),
  Marker: ({ children, position }) => (
    <div data-testid="mock-marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="mock-popup">{children}</div>,
}));

// Mock leaflet image imports
vi.mock('leaflet/dist/images/marker-icon-2x.png', () => ({ default: 'marker-icon-2x.png' }));
vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: 'marker-icon.png' }));
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: 'marker-shadow.png' }));

describe('HotelLocationMap Component & Coordinates Validation (Phase 4C)', () => {
  beforeEach(() => {
    mockSetView.mockClear();
  });

  describe('parseCoordinate helper', () => {
    it('accurately preserves numeric zero and string zero as 0', () => {
      expect(parseCoordinate(0)).toBe(0);
      expect(parseCoordinate('0')).toBe(0);
      expect(parseCoordinate('0.0')).toBe(0);
      expect(parseCoordinate(0.0)).toBe(0);
    });

    it('accurately parses standard numbers and string representations', () => {
      expect(parseCoordinate(24.453884)).toBe(24.453884);
      expect(parseCoordinate('24.453884')).toBe(24.453884);
      expect(parseCoordinate(-33.8688)).toBe(-33.8688);
      expect(parseCoordinate('-33.8688')).toBe(-33.8688);
    });

    it('returns NaN for null, undefined, empty string, and whitespace without converting to zero', () => {
      expect(Number.isNaN(parseCoordinate(null))).toBe(true);
      expect(Number.isNaN(parseCoordinate(undefined))).toBe(true);
      expect(Number.isNaN(parseCoordinate(''))).toBe(true);
      expect(Number.isNaN(parseCoordinate('   '))).toBe(true);
    });

    it('returns NaN for non-numeric malformed strings', () => {
      expect(Number.isNaN(parseCoordinate('invalid'))).toBe(true);
      expect(Number.isNaN(parseCoordinate('12abc'))).toBe(true);
      expect(Number.isNaN(parseCoordinate(NaN))).toBe(true);
    });
  });

  describe('isValidCoordinate helper', () => {
    it('accepts standard valid coordinates', () => {
      expect(isValidCoordinate(24.453884, 54.377344)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
    });

    it('accepts valid boundary coordinates', () => {
      expect(isValidCoordinate(90.0, 180.0)).toBe(true);
      expect(isValidCoordinate(-90.0, -180.0)).toBe(true);
      expect(isValidCoordinate(90, 0)).toBe(true);
      expect(isValidCoordinate(-90, 0)).toBe(true);
      expect(isValidCoordinate(0, 180)).toBe(true);
      expect(isValidCoordinate(0, -180)).toBe(true);
    });

    it('accepts negative southern and western coordinates', () => {
      // Sydney, Australia (-33.8688, 151.2093)
      expect(isValidCoordinate(-33.8688, 151.2093)).toBe(true);
      // Santiago, Chile (-33.4489, -70.6693)
      expect(isValidCoordinate(-33.4489, -70.6693)).toBe(true);
      // Rio de Janeiro (-22.9068, -43.1729)
      expect(isValidCoordinate(-22.9068, -43.1729)).toBe(true);
    });

    it('rejects out of bounds latitude', () => {
      expect(isValidCoordinate(90.000001, 50)).toBe(false);
      expect(isValidCoordinate(-90.000001, 50)).toBe(false);
      expect(isValidCoordinate(120, 50)).toBe(false);
      expect(isValidCoordinate(-150, 50)).toBe(false);
    });

    it('rejects out of bounds longitude', () => {
      expect(isValidCoordinate(25, 180.000001)).toBe(false);
      expect(isValidCoordinate(25, -180.000001)).toBe(false);
      expect(isValidCoordinate(25, 200)).toBe(false);
      expect(isValidCoordinate(25, -200)).toBe(false);
    });

    it('rejects NaN, Infinity, and non-numeric inputs', () => {
      expect(isValidCoordinate(NaN, 50)).toBe(false);
      expect(isValidCoordinate(50, NaN)).toBe(false);
      expect(isValidCoordinate(Infinity, 50)).toBe(false);
      expect(isValidCoordinate(-Infinity, 50)).toBe(false);
      expect(isValidCoordinate(50, Infinity)).toBe(false);
    });
  });

  describe('Component Rendering & OpenStreetMap Compliance', () => {
    it('renders interactive map with valid numeric coordinates and compliant OSM tile URL', () => {
      render(
        <HotelLocationMap
          latitude={24.453884}
          longitude={54.377344}
          title="Grand Palace Abu Dhabi"
        />
      );

      const mapContainer = screen.getByTestId('hotel-location-map');
      expect(mapContainer).toBeInTheDocument();
      expect(mapContainer).toHaveAttribute(
        'aria-label',
        'Interactive location map for Grand Palace Abu Dhabi'
      );

      const marker = screen.getByTestId('mock-marker');
      expect(marker).toBeInTheDocument();
      expect(marker).toHaveAttribute(
        'data-position',
        JSON.stringify([24.453884, 54.377344])
      );

      // Verifies official OSM tile URL (no deprecated {s}. subdomain sharding)
      const tileLayer = screen.getByTestId('mock-tile-layer');
      expect(tileLayer).toHaveAttribute(
        'data-url',
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      );
      expect(tileLayer).toHaveAttribute(
        'data-attribution',
        expect.stringContaining('OpenStreetMap')
      );

      expect(screen.getByText('Grand Palace Abu Dhabi')).toBeInTheDocument();
      expect(screen.getByText(/24\.453884°, 54\.377344°/)).toBeInTheDocument();

      // Confirms MapViewController initialized center on mount
      expect(mockSetView).toHaveBeenCalledWith([24.453884, 54.377344], 14);
    });

    it('correctly accepts zero coordinates (latitude 0, longitude 0) without treating as missing', () => {
      render(
        <HotelLocationMap
          latitude={0}
          longitude={0}
          title="Equator Meridian Hotel"
        />
      );

      const mapContainer = screen.getByTestId('hotel-location-map');
      expect(mapContainer).toBeInTheDocument();

      const marker = screen.getByTestId('mock-marker');
      expect(marker).toHaveAttribute('data-position', JSON.stringify([0, 0]));
      expect(mockSetView).toHaveBeenCalledWith([0, 0], 14);
    });

    it('dynamically updates map view and moves marker when coordinates change after mount', () => {
      // 1. Initial render with Hotel 1 coordinates (Abu Dhabi)
      const { rerender } = render(
        <HotelLocationMap
          latitude={24.453884}
          longitude={54.377344}
          title="Grand Palace Abu Dhabi"
        />
      );

      expect(mockSetView).toHaveBeenCalledWith([24.453884, 54.377344], 14);

      // 2. Direct coordinate update without remounting (navigating to Hotel 2: Manhattan)
      rerender(
        <HotelLocationMap
          latitude={40.712776}
          longitude={-74.005974}
          title="Manhattan Boutique Suites"
        />
      );

      // 3. Verifies marker position updated
      const marker = screen.getByTestId('mock-marker');
      expect(marker).toHaveAttribute(
        'data-position',
        JSON.stringify([40.712776, -74.005974])
      );

      // 4. Verifies map.setView was invoked with the new coordinates to re-center viewport
      expect(mockSetView).toHaveBeenCalledWith([40.712776, -74.005974], 14);
      expect(screen.getByText('Manhattan Boutique Suites')).toBeInTheDocument();
    });

    it('does not re-invoke map.setView on unrelated parent rerenders with unchanged coordinates', () => {
      const { rerender } = render(
        <HotelLocationMap
          latitude={24.453884}
          longitude={54.377344}
          title="Initial Hotel Title"
        />
      );

      // Called once on initial mount
      expect(mockSetView).toHaveBeenCalledTimes(1);
      expect(mockSetView).toHaveBeenCalledWith([24.453884, 54.377344], 14);

      // Re-render with only title changed (unrelated state change, identical numeric coordinates)
      rerender(
        <HotelLocationMap
          latitude={24.453884}
          longitude={54.377344}
          title="Updated Hotel Title"
        />
      );

      // mockSetView is NOT called a second time because latitude and longitude are primitive numbers that did not change
      expect(mockSetView).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Updated Hotel Title')).toBeInTheDocument();
    });

    it('safely handles string coordinates from PostgreSQL NUMERIC columns', () => {
      render(
        <HotelLocationMap
          latitude="25.204849"
          longitude="55.270783"
          title="Burj View Resort"
        />
      );

      const marker = screen.getByTestId('mock-marker');
      expect(marker).toHaveAttribute(
        'data-position',
        JSON.stringify([25.204849, 55.270783])
      );
      expect(screen.getByText('Burj View Resort')).toBeInTheDocument();
      expect(screen.getByText(/25\.204849°, 55\.270783°/)).toBeInTheDocument();
    });

    it('renders map with valid negative coordinates (southern/western hemispheres)', () => {
      render(
        <HotelLocationMap
          latitude={-33.8688}
          longitude={-70.6693}
          title="Santiago Andes Hotel"
        />
      );

      const map = screen.getByTestId('hotel-location-map');
      expect(map).toBeInTheDocument();

      const marker = screen.getByTestId('mock-marker');
      expect(marker).toHaveAttribute(
        'data-position',
        JSON.stringify([-33.8688, -70.6693])
      );
      expect(screen.getByText(/Santiago Andes Hotel/)).toBeInTheDocument();
    });

    it('renders fallback state when latitude is out of bounds (> 90)', () => {
      render(
        <HotelLocationMap
          latitude={95.0}
          longitude={54.0}
          title="Invalid Hotel"
        />
      );

      expect(screen.queryByTestId('hotel-location-map')).not.toBeInTheDocument();
      const fallback = screen.getByTestId('map-unavailable');
      expect(fallback).toBeInTheDocument();
      expect(screen.getByText('Location Map Unavailable')).toBeInTheDocument();
      expect(screen.getByText(/Coordinates \(95, 54\) are outside valid geographic bounds/)).toBeInTheDocument();
    });

    it('renders fallback state when longitude is out of bounds (< -180)', () => {
      render(
        <HotelLocationMap
          latitude={25.0}
          longitude={-185.0}
          title="Invalid Hotel"
        />
      );

      expect(screen.queryByTestId('hotel-location-map')).not.toBeInTheDocument();
      const fallback = screen.getByTestId('map-unavailable');
      expect(fallback).toBeInTheDocument();
      expect(screen.getByText('Location Map Unavailable')).toBeInTheDocument();
    });

    it('renders fallback state when coordinates are invalid non-numeric strings or NaN', () => {
      render(
        <HotelLocationMap
          latitude="invalid-lat"
          longitude="54.0"
          title="Invalid Hotel"
        />
      );

      expect(screen.queryByTestId('hotel-location-map')).not.toBeInTheDocument();
      const fallback = screen.getByTestId('map-unavailable');
      expect(fallback).toBeInTheDocument();
      expect(screen.getByText('Location Map Unavailable')).toBeInTheDocument();
    });

    it('renders fallback state when coordinates are null without converting to zero', () => {
      render(
        <HotelLocationMap
          latitude={null}
          longitude={null}
          title="Null Coordinates Hotel"
        />
      );

      expect(screen.queryByTestId('hotel-location-map')).not.toBeInTheDocument();
      const fallback = screen.getByTestId('map-unavailable');
      expect(fallback).toBeInTheDocument();
      expect(screen.getByText('Location Map Unavailable')).toBeInTheDocument();
      expect(screen.getByText(/Coordinates \(N\/A, N\/A\) are outside valid geographic bounds/)).toBeInTheDocument();
    });

    it('renders fallback state when coordinates are missing or undefined', () => {
      render(
        <HotelLocationMap
          latitude={undefined}
          longitude={undefined}
          title="Unlocated Hotel"
        />
      );

      expect(screen.queryByTestId('hotel-location-map')).not.toBeInTheDocument();
      const fallback = screen.getByTestId('map-unavailable');
      expect(fallback).toBeInTheDocument();
      expect(screen.getByText(/Coordinates \(N\/A, N\/A\) are outside valid geographic bounds/)).toBeInTheDocument();
    });
  });
});
