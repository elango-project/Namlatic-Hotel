const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/db');

const UPLOAD_DIR = path.resolve(__dirname, '../uploads/hotels');

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fullPath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    return `/uploads/hotels/${filename}`;
  } catch (err) {
    console.warn(`[WARN] Could not download image from ${url}:`, err.message);
    return null;
  }
}

async function seed() {
  console.log('[SEED] Resetting and seeding real property inventory into PostgreSQL...');

  // Clean existing hotels and uploads (keep .gitkeep)
  await pool.query('DELETE FROM hotels;');
  const existingFiles = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep');
  for (const f of existingFiles) {
    fs.unlinkSync(path.join(UPLOAD_DIR, f));
  }

  const sampleHotels = [
    {
      title: 'Grand Namlatic Luxury Resort',
      description: 'Exclusive 5-star oceanfront resort featuring private cabanas, infinity pools, Michelin-rated dining, and panoramic sunset views over the Arabian Gulf.',
      latitude: 24.453884,
      longitude: 54.377344,
      price: 349.0,
      imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
    },
    {
      title: 'The Azure Marina Hotel',
      description: 'Contemporary waterfront hotel situated on the marina promenade with a private yacht dock, rooftop infinity lounge, and luxury wellness spa.',
      latitude: 25.080512,
      longitude: 55.140321,
      price: 220.0,
      imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
    },
    {
      title: 'Alpine Panorama Mountain Lodge',
      description: 'Idyllic ski-in ski-out chalet nestled amidst snow-capped peaks. Features heated stone fireplaces, alpine saunas, and guided hiking excursions.',
      latitude: 46.519962,
      longitude: 6.633597,
      price: 185.5,
      imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80',
    },
    {
      title: 'Desert Oasis Royal Palace',
      description: 'Architectural masterpiece in the golden dunes offering luxury desert glamping, private temperature-controlled plunge pools, and stargazing observatories.',
      latitude: 24.120531,
      longitude: 55.740212,
      price: 410.0,
      imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80',
    },
    {
      title: 'Manhattan Urban Boutique Suites',
      description: 'Sophisticated downtown boutique hotel located in the heart of the arts district. Features floor-to-ceiling city views and artisanal cocktail lounges.',
      latitude: 40.712776,
      longitude: -74.005974,
      price: 295.0,
      imageUrl: null, // Verifies fallback verified property placeholder
    },
    {
      title: 'Coral Reef Beachfront Cabanas',
      description: 'Eco-conscious tropical resort with overwater bungalows, direct coral reef access, private catamaran charters, and fresh seafood grill.',
      latitude: 4.175496,
      longitude: 73.509347,
      price: 165.0,
      imageUrl: null, // Verifies fallback verified property placeholder
    },
  ];

  for (const hotel of sampleHotels) {
    let savedImagePath = null;
    if (hotel.imageUrl) {
      const filename = `${crypto.randomUUID()}.jpg`;
      savedImagePath = await downloadImage(hotel.imageUrl, filename);
    }

    const insertSql = `
      INSERT INTO hotels (title, description, latitude, longitude, price, image_path)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title;
    `;
    const res = await pool.query(insertSql, [
      hotel.title,
      hotel.description,
      hotel.latitude,
      hotel.longitude,
      hotel.price,
      savedImagePath,
    ]);
    console.log(`[SEED] Created: #${res.rows[0].id} - ${res.rows[0].title}`);
  }

  const countRes = await pool.query('SELECT COUNT(*) FROM hotels');
  console.log(`[SEED] Done! Total active properties in database: ${countRes.rows[0].count}`);
  await pool.end();
}

seed().catch((err) => {
  console.error('[SEED ERROR]', err);
  process.exit(1);
});
