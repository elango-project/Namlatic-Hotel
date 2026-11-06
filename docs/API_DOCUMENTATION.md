# API Documentation: Namlatic Hotel Portal

Base URL: `http://localhost:5000/api`

---

## 1. System Health Probes

### `GET /api/health`
Checks whether the Node.js Express process is alive.
- **Status Codes:** `200 OK`
- **Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-11-06T11:45:00.000Z"
}
```

### `GET /api/ready`
Verifies active PostgreSQL database connectivity.
- **Status Codes:** `200 OK` (connected), `503 Service Unavailable` (DB offline)
- **Response:**
```json
{
  "status": "ready",
  "database": "connected",
  "timestamp": "2026-11-06T11:45:00.000Z"
}
```

---

## 2. Hotel Inventory Endpoints

### `POST /api/hotels`
Creates a new hotel inventory record.

- **Content-Type:** `multipart/form-data`
- **Parameters:**
  - `title` *(string, required)*: Hotel name (1-255 characters).
  - `description` *(string, required)*: Full description (1-5000 characters).
  - `latitude` *(number, required)*: Geographic latitude ($-90.000000$ to $90.000000$).
  - `longitude` *(number, required)*: Geographic longitude ($-180.000000$ to $180.000000$).
  - `price` *(number, required)*: Nightly price ($> 0.00$, max 2 decimals).
  - `image` *(binary file, optional)*: Image file (JPEG, PNG, WebP, max 5 MB).
- **Responses:**
  - `201 Created`:
    ```json
    {
      "status": "success",
      "data": {
        "id": "1",
        "title": "Grand Namlatic Palace",
        "description": "Luxury seaside hotel with panoramic views and spa.",
        "latitude": "24.453884",
        "longitude": "54.377344",
        "price": "285.50",
        "image_path": "/uploads/hotels/e13f08af-9029-4265-8a88-db6d1623145b.jpg",
        "created_at": "2026-11-06T11:15:30.120Z",
        "updated_at": "2026-11-06T11:15:30.120Z"
      }
    }
    ```
  - `400 Bad Request`: Validation failure or check constraint violation.

---

### `GET /api/hotels`
Retrieves a paginated list of hotels with optional prefix search and price filters.

- **Query Parameters:**
  - `title` *(string, optional)*: Case-insensitive prefix search.
  - `minPrice` *(number, optional)*: Minimum price filter ($\ge 0$).
  - `maxPrice` *(number, optional)*: Maximum price filter ($\ge \text{minPrice}$).
  - `limit` *(integer, optional, default: 6)*: Page size (1 to 100).
  - `offset` *(integer, optional, default: 0)*: Number of records to skip ($\ge 0$).
- **Responses:**
  - `200 OK`:
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": "1",
          "title": "Grand Namlatic Palace",
          "description": "Luxury seaside hotel with panoramic views and spa.",
          "latitude": "24.453884",
          "longitude": "54.377344",
          "price": "285.50",
          "image_path": "/uploads/hotels/e13f08af-9029-4265-8a88-db6d1623145b.jpg",
          "created_at": "2026-11-06T11:15:30.120Z",
          "updated_at": "2026-11-06T11:15:30.120Z"
        }
      ],
      "pagination": {
        "total": 1,
        "limit": 6,
        "offset": 0,
        "hasMore": false
      }
    }
    ```
  - `400 Bad Request`: Invalid query parameters.

---

### `GET /api/hotels/stats`
Retrieves global portfolio-wide hotel inventory statistics calculated via PostgreSQL server-side aggregation.
Eliminates in-memory pagination distortion by aggregating across the entire database table.

- **Query Parameters:** None.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "status": "success",
      "data": {
        "total_properties": 6,
        "average_price": "270.75",
        "min_price": "165.00",
        "max_price": "410.00",
        "properties_with_images": 4,
        "totalProperties": 6,
        "averagePrice": "270.75",
        "minPrice": "165.00",
        "maxPrice": "410.00",
        "propertiesWithImages": 4
      }
    }
    ```
  - **Terminology Standard:**
    - `total_properties` / `totalProperties`: Exact count of registered properties.
    - `average_price` / `averagePrice`: Exact `ROUND(AVG(price), 2)` formatted as a decimal string.
    - `min_price` / `minPrice`: Minimum registered nightly rate.
    - `max_price` / `maxPrice`: Maximum registered nightly rate.
    - `properties_with_images` / `propertiesWithImages`: Count of properties where `image_path IS NOT NULL` (does not imply file existence or validity).

---

### `GET /api/hotels/:id`
Retrieves a single hotel record by primary key ID.

- **URL Parameter:** `:id` *(positive integer)*
- **Responses:**
  - `200 OK`: Returns single hotel object in `data`.
  - `400 Bad Request`: ID is non-integer, zero, or negative.
  - `404 Not Found`: Hotel with ID does not exist.

---

### `PUT /api/hotels/:id`
Updates an existing hotel record. Supports partial field updates and optional image replacement.

- **URL Parameter:** `:id` *(positive integer)*
- **Content-Type:** `multipart/form-data`
- **Parameters:** Same fields as `POST /api/hotels`. If `image` is omitted, the existing image is preserved.
- **Responses:**
  - `200 OK`: Returns updated hotel record in `data`.
  - `400 Bad Request`: Validation failure.
  - `404 Not Found`: Hotel not found.

---

### `DELETE /api/hotels/:id`
Deletes a hotel record from PostgreSQL and removes its associated photo from disk.

- **URL Parameter:** `:id` *(positive integer)*
- **Responses:**
  - `200 OK`:
    ```json
    {
      "status": "success",
      "message": "Hotel deleted successfully."
    }
    ```
  - `400 Bad Request`: Invalid ID format.
  - `404 Not Found`: Hotel not found.
