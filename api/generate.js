import { webcrypto } from 'crypto';

const DISALLOWED_EXTENSIONS = [
  '.exe', '.msi', '.bat', '.cmd', '.sh', '.bin', '.dll', '.dmg', '.pkg',
  '.apk', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.iso', '.img', '.vhd',
  '.scr', '.vbs', '.js',
  '.jar', '.class',
  '.app',
];
const DISALLOWED_PROTOCOLS = ['ftp:'];

function generateRandomId(length) {
  const bytes = new Uint8Array(length);
  webcrypto.getRandomValues(bytes);
  const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

export default async function handler(req, res) {
  const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  const API_KEY = process.env.GENERATE_API_KEY;

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN || !API_KEY) {
    console.error('Missing environment variables!');
    return res.status(500).json({ message: 'Server configuration error: Missing environment variables.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== API_KEY) {
    return res.status(401).json({ message: 'Unauthorized: Missing or invalid API Key' });
  }

  const { longUrl } = req.body;

  if (!longUrl) {
    return res.status(400).json({ message: 'Missing longUrl in request body' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(longUrl);
  } catch (error) {
    return res.status(400).json({ message: 'Invalid URL format' });
  }

  if (DISALLOWED_PROTOCOLS.includes(parsedUrl.protocol.toLowerCase())) {
    return res.status(400).json({ message: `Disallowed protocol: ${parsedUrl.protocol}` });
  }

  const pathname = parsedUrl.pathname.toLowerCase();
  const hasDisallowedExtension = DISALLOWED_EXTENSIONS.some(ext => pathname.endsWith(ext));

  if (hasDisallowedExtension) {
    return res.status(400).json({ message: 'Linking to this file type is not allowed.' });
  }

  let shortCode;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  const SHORT_CODE_LENGTH = 7;

  do {
    shortCode = generateRandomId(SHORT_CODE_LENGTH);
    const existsResponse = await fetch(`${UPSTASH_REDIS_REST_URL}/EXISTS/${shortCode}`, {
      headers: { 'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
    });
    const existsResult = await existsResponse.json();
    const exists = existsResult && existsResult[0] === 1;

    if (!exists) {
        break;
    }
    attempts++;
  } while (attempts < MAX_ATTEMPTS);

  if (attempts >= MAX_ATTEMPTS) {
    return res.status(500).json({ message: 'Failed to generate unique short code after multiple attempts.' });
  }

  try {
    const setResponse = await fetch(`${UPSTASH_REDIS_REST_URL}/SET/${shortCode}/${encodeURIComponent(longUrl)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
    });
    const setResult = await setResponse.json();
    if (!setResult || setResult[0] !== 'OK') {
      console.error('Upstash SET failed:', setResult);
      throw new Error('Failed to save short URL in Redis.');
    }

    const shortUrlBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const shortenedUrl = `${shortUrlBase}/${shortCode}`;

    res.status(200).json({ shortUrl: shortenedUrl });
  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ message: 'Internal Server Error', details: error.message });
  }
}
