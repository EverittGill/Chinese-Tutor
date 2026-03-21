import { authenticateRequest } from './authMiddleware.js';

export default async function handler(req, res) {
  // Authenticate
  const auth = await authenticateRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return res.status(503).json({ error: 'Speech service not configured' });
  }

  try {
    const tokenRes = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Length': '0'
        }
      }
    );
    if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status}`);
    const token = await tokenRes.text();
    res.json({ token, region });
  } catch (err) {
    console.error('[speech-token] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
