// require GENERATE_API_KEY in Authorization header
import { Redis } from '@upstash/redis';1
import { nanoid } from 'nanoid';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const authHeader = req.headers.authorization;
  const API_KEY = process.env.GENERATE_API_KEY;

  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== API_KEY) {
    return res.status(401).json({ message: 'Unauthorized: Missing or invalid API Key' });
  }

  const { longUrl } = req.body;

  if (!longUrl) {
    return res.status(400).json({ message: 'Missing longUrl in request body' });
  }

  try {
    new URL(longUrl);
  } catch (error) {
    return res.status(400).json({ message: 'Invalid URL format' });
  }

  let shortCode;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  do {
    shortCode = nanoid(7);
    const exists = await redis.exists(shortCode);
    if (!exists) {
        break;
    }
    attempts++;
  } while (attempts < MAX_ATTEMPTS);

  if (attempts >= MAX_ATTEMPTS) {
    return res.status(500).json({ message: 'Failed to generate unique short code after multiple attempts.' });
  }

  try {
    await redis.set(shortCode, longUrl);

    const shortUrlBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const shortenedUrl = `${shortUrlBase}/${shortCode}`;

    res.status(200).json({ shortUrl: shortenedUrl });
  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
