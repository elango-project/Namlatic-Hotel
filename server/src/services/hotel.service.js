const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const HOTEL_UPLOADS_DIR = path.resolve(__dirname, '../uploads/hotels');

/**
 * Safely unlinks a file located in the uploads directory.
 * Guaranteed protection against directory traversal.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<boolean>}
 */
const safeUnlinkFile = async (filePath) => {
  if (!filePath) return false;
  try {
    const resolved = path.resolve(filePath);
    const relative = path.relative(HOTEL_UPLOADS_DIR, resolved);
    // Ensure path is strictly inside HOTEL_UPLOADS_DIR and not .gitkeep
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      path.basename(resolved) === '.gitkeep'
    ) {
      console.warn(`[SECURITY] Blocked safeUnlink outside uploads directory: ${filePath}`);
      return false;
    }
    await fs.promises.unlink(resolved);
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[FS ERROR] Failed to unlink file ${filePath}:`, err.message);
    }
    return false;
  }
};

/**
 * Safely deletes a hotel image file from disk given its relative URL (e.g. /uploads/hotels/uuid.jpg).
 * Strictly prevents path traversal and will never delete files outside HOTEL_UPLOADS_DIR or .gitkeep.
 *
 * @param {string|null} relativeUrl - The relative image URL stored in the database
 * @returns {Promise<boolean>} True if deleted or already missing, false if invalid
 */
const safeDeleteHotelImage = async (relativeUrl) => {
  if (!relativeUrl || typeof relativeUrl !== 'string') return false;

  const filename = path.basename(relativeUrl);
  if (!filename || filename === '.' || filename === '..' || filename === '.gitkeep') {
    return false;
  }

  const targetPath = path.resolve(HOTEL_UPLOADS_DIR, filename);
  const relative = path.relative(HOTEL_UPLOADS_DIR, targetPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    console.warn(`[SECURITY] Blocked path traversal attempt on file deletion: ${relativeUrl}`);
    return false;
  }

  try {
    await fs.promises.unlink(targetPath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File was already missing on disk - handled safely
      return false;
    }
    console.error(`[FS ERROR] Failed to unlink image ${targetPath}:`, err.message);
    return false;
  }
};

/**
 * Inserts a new hotel record into PostgreSQL using parameterized SQL.
 * If database insertion fails and an image was uploaded, cleans up the file.
 *
 * @param {object} hotelData - Validated hotel payload
 * @param {Express.Multer.File|null} [imageFile] - Uploaded file metadata
 * @returns {Promise<object>} The newly created hotel record
 */
const createHotel = async (hotelData, imageFile) => {
  const { title, description, latitude, longitude, price } = hotelData;
  const imagePath = imageFile ? imageFile.relativeUrl : null;

  const insertSql = `
    INSERT INTO hotels (title, description, latitude, longitude, price, image_path)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, title, description, latitude, longitude, price, image_path, created_at, updated_at;
  `;

  const values = [title, description, latitude, longitude, price, imagePath];

  try {
    const result = await db.query(insertSql, values);
    return result.rows[0];
  } catch (err) {
    // If database insert fails, clean up the newly uploaded image immediately
    if (imageFile && imageFile.path) {
      await safeUnlinkFile(imageFile.path);
    }
    throw err;
  }
};

/**
 * Retrieves a paginated list of hotels matching search and price filter criteria.
 * Executes matching COUNT and SELECT queries with consistent parameterized conditions.
 *
 * @param {object} filters - Validated query parameters
 * @returns {Promise<{ data: object[], pagination: object }>}
 */
const listHotels = async (filters) => {
  const conditions = [];
  const params = [];

  // 1. Case-insensitive title prefix search using text_pattern_ops
  if (filters.title) {
    // Escape standard LIKE wildcard characters: \, %, _
    const escaped = filters.title.replace(/[\\%_]/g, '\\$&');
    params.push(escaped);
    conditions.push(`lower(title) LIKE lower($${params.length}) || '%' ESCAPE '\\'`);
  }

  // 2. Minimum price filter
  if (filters.minPrice !== undefined) {
    params.push(filters.minPrice);
    conditions.push(`price >= $${params.length}`);
  }

  // 3. Maximum price filter
  if (filters.maxPrice !== undefined) {
    params.push(filters.maxPrice);
    conditions.push(`price <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 4. Execute total count query with identical WHERE conditions
  const countSql = `SELECT COUNT(*) AS total FROM hotels ${whereClause};`;
  const countResult = await db.query(countSql, params);
  const total = parseInt(countResult.rows[0].total, 10);

  // 5. Execute data retrieval query with deterministic pagination sorting
  const dataParams = [...params];
  dataParams.push(filters.limit);
  const limitPlaceholder = `$${dataParams.length}`;
  dataParams.push(filters.offset);
  const offsetPlaceholder = `$${dataParams.length}`;

  const dataSql = `
    SELECT id, title, description, latitude, longitude, price, image_path, created_at, updated_at
    FROM hotels
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
  `;

  const dataResult = await db.query(dataSql, dataParams);
  const rows = dataResult.rows;

  return {
    data: rows,
    pagination: {
      total,
      limit: filters.limit,
      offset: filters.offset,
      hasMore: filters.offset + rows.length < total,
    },
  };
};

/**
 * Retrieves a single hotel record by its primary key ID.
 *
 * @param {string} id - The validated hotel ID
 * @returns {Promise<object|null>} The hotel record or null if not found
 */
const getHotelById = async (id) => {
  const sql = `
    SELECT id, title, description, latitude, longitude, price, image_path, created_at, updated_at
    FROM hotels
    WHERE id = $1;
  `;
  const result = await db.query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Updates an existing hotel record.
 * Handles image replacement with filesystem atomicity:
 * - If no new image is provided, keeps the existing image_path.
 * - If a new image is provided, replaces image_path in DB, and removes old file AFTER commit.
 * - If DB update fails, removes new file and leaves old file intact.
 *
 * @param {string} id - The validated hotel ID
 * @param {object} hotelData - Validated payload { title, description, latitude, longitude, price }
 * @param {Express.Multer.File|null} [imageFile] - Uploaded file metadata if present
 * @returns {Promise<object|null>} Updated hotel record or null if hotel not found
 */
const updateHotel = async (id, hotelData, imageFile) => {
  const { title, description, latitude, longitude, price } = hotelData;
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock existing record for update to prevent concurrent race conditions
    const checkSql = `SELECT id, image_path FROM hotels WHERE id = $1 FOR UPDATE;`;
    const checkRes = await client.query(checkSql, [id]);

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      // If hotel does not exist, clean up uploaded image immediately
      if (imageFile && imageFile.path) {
        await safeUnlinkFile(imageFile.path);
      }
      return null;
    }

    const oldImagePath = checkRes.rows[0].image_path;
    // Preserve existing image_path if no new file is uploaded
    const finalImagePath = imageFile ? imageFile.relativeUrl : oldImagePath;

    // 2. Perform parameterized update
    const updateSql = `
      UPDATE hotels
      SET title = $1, description = $2, latitude = $3, longitude = $4, price = $5, image_path = $6
      WHERE id = $7
      RETURNING id, title, description, latitude, longitude, price, image_path, created_at, updated_at;
    `;

    const updateRes = await client.query(updateSql, [
      title,
      description,
      latitude,
      longitude,
      price,
      finalImagePath,
      id,
    ]);

    await client.query('COMMIT');

    const updatedHotel = updateRes.rows[0];

    // 3. Delete old image ONLY AFTER database update has successfully committed
    if (imageFile && oldImagePath && oldImagePath !== finalImagePath) {
      await safeDeleteHotelImage(oldImagePath);
    }

    return updatedHotel;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // If update fails, clean up the newly uploaded image immediately
    if (imageFile && imageFile.path) {
      await safeUnlinkFile(imageFile.path);
    }
    // Existing image remains untouched on disk and in database
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Deletes a hotel record by ID.
 * If the hotel had an associated image, removes it from disk ONLY AFTER successful database deletion.
 *
 * @param {string} id - The validated hotel ID
 * @returns {Promise<object|null>} Deleted hotel metadata or null if not found
 */
const deleteHotel = async (id) => {
  const deleteSql = `
    DELETE FROM hotels
    WHERE id = $1
    RETURNING id, image_path;
  `;

  const result = await db.query(deleteSql, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const deletedRow = result.rows[0];

  // Delete the corresponding image file ONLY AFTER successful database deletion
  if (deletedRow.image_path) {
    await safeDeleteHotelImage(deletedRow.image_path);
  }

  return deletedRow;
};

/**
 * Retrieves portfolio-wide hotel statistics using PostgreSQL server-side aggregation.
 * Calculates total properties, average price, minimum price, maximum price,
 * and count of properties with recorded image paths.
 * Preserves exact numeric precision and avoids in-memory pagination distortion.
 *
 * @returns {Promise<{
 *   total_properties: number,
 *   average_price: string,
 *   min_price: string,
 *   max_price: string,
 *   properties_with_images: number,
 *   totalProperties: number,
 *   averagePrice: string,
 *   minPrice: string,
 *   maxPrice: string,
 *   propertiesWithImages: number
 * }>}
 */
const getHotelStats = async () => {
  const statsSql = `
    SELECT
      COUNT(*)::bigint AS total_properties,
      ROUND(COALESCE(AVG(price), 0), 2) AS average_price,
      COALESCE(MIN(price), 0)::numeric(12,2) AS min_price,
      COALESCE(MAX(price), 0)::numeric(12,2) AS max_price,
      COUNT(image_path)::bigint AS properties_with_images
    FROM hotels;
  `;

  const result = await db.query(statsSql);
  const row = result.rows[0];

  const totalProps = parseInt(row.total_properties, 10);
  const withImages = parseInt(row.properties_with_images, 10);

  return {
    total_properties: totalProps,
    average_price: String(row.average_price),
    min_price: String(row.min_price),
    max_price: String(row.max_price),
    properties_with_images: withImages,
    // CamelCase aliases for frontend convenience:
    totalProperties: totalProps,
    averagePrice: String(row.average_price),
    minPrice: String(row.min_price),
    maxPrice: String(row.max_price),
    propertiesWithImages: withImages,
  };
};

module.exports = {
  createHotel,
  listHotels,
  getHotelById,
  updateHotel,
  deleteHotel,
  getHotelStats,
  safeDeleteHotelImage,
  safeUnlinkFile,
};
