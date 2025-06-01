export default async function handler(req, res) {
  const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    console.error('Missing environment variables for redirect!');
    return res.status(500).send('Server configuration error.');
  }
  
  const shortCode = req.url.split('/')[1];

  if (!shortCode) {
    return res.status(400).send('Short URL not provided.');
  }

  try {
    const getResponse = await fetch(`${UPSTASH_REDIS_REST_URL}/GET/${shortCode}`, {
      headers: { 'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }
    });
    const getResult = await getResponse.json();
    const longUrl = getResult && getResult[0];

    if (longUrl) {
      res.redirect(307, longUrl);
    } else {
      res.status(404).send('Short URL not found.');
    }
  } catch (error) {
    console.error('Error retrieving long URL for redirect:', error);
    res.status(500).send('Internal Server Error.');
  }
}
