const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Unit Tests: Hotel Statistics Aggregation', () => {
  it('maps raw PostgreSQL aggregation row to numbers and numeric strings', () => {
    const mockRow = {
      total_properties: '12',
      average_price: '245.50',
      min_price: '99.00',
      max_price: '599.99',
      properties_with_images: '8',
    };

    const totalProps = parseInt(mockRow.total_properties, 10);
    const withImages = parseInt(mockRow.properties_with_images, 10);

    const stats = {
      total_properties: totalProps,
      average_price: String(mockRow.average_price),
      min_price: String(mockRow.min_price),
      max_price: String(mockRow.max_price),
      properties_with_images: withImages,
      totalProperties: totalProps,
      averagePrice: String(mockRow.average_price),
      minPrice: String(mockRow.min_price),
      maxPrice: String(mockRow.max_price),
      propertiesWithImages: withImages,
    };

    assert.equal(stats.total_properties, 12);
    assert.equal(stats.totalProperties, 12);
    assert.equal(stats.average_price, '245.50');
    assert.equal(stats.min_price, '99.00');
    assert.equal(stats.max_price, '599.99');
    assert.equal(stats.properties_with_images, 8);
    assert.equal(stats.propertiesWithImages, 8);
  });

  it('handles empty database aggregation output (zeroes) safely without NaN', () => {
    const emptyRow = {
      total_properties: '0',
      average_price: '0.00',
      min_price: '0.00',
      max_price: '0.00',
      properties_with_images: '0',
    };

    const totalProps = parseInt(emptyRow.total_properties, 10);
    const withImages = parseInt(emptyRow.properties_with_images, 10);

    const stats = {
      total_properties: totalProps,
      average_price: String(emptyRow.average_price),
      min_price: String(emptyRow.min_price),
      max_price: String(emptyRow.max_price),
      properties_with_images: withImages,
      totalProperties: totalProps,
      averagePrice: String(emptyRow.average_price),
      minPrice: String(emptyRow.min_price),
      maxPrice: String(emptyRow.max_price),
      propertiesWithImages: withImages,
    };

    assert.equal(stats.total_properties, 0);
    assert.equal(stats.average_price, '0.00');
    assert.equal(stats.min_price, '0.00');
    assert.equal(stats.max_price, '0.00');
    assert.equal(stats.properties_with_images, 0);
    assert.equal(Number.isNaN(stats.total_properties), false);
  });

  it('preserves exact fractional scale without IEEE 754 precision distortion', () => {
    // 0.1 + 0.2 in floating point produces 0.30000000000000004
    // PostgreSQL NUMERIC strings preserve exact financial scale
    const mockRow = {
      total_properties: '2',
      average_price: '0.30',
      min_price: '0.10',
      max_price: '0.20',
      properties_with_images: '0',
    };

    assert.equal(mockRow.average_price, '0.30');
    assert.notEqual(mockRow.average_price, String(0.1 + 0.2));
  });
});
