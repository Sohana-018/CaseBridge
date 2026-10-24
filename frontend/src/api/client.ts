const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export interface HealthResponse {
  status: string;
}

export async function getHealthStatus(): Promise<HealthResponse> {
  const primaryUrl = `${API_BASE_URL}/api/v1/health`;

  try {
    const response = await fetch(primaryUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Health check request failed with HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err: unknown) {
    // If fetching via localhost failed (e.g. Windows IPv6 [::1] vs IPv4 binding), attempt 127.0.0.1 fallback
    if (primaryUrl.includes('localhost:8000')) {
      try {
        const fallbackUrl = primaryUrl.replace('localhost:8000', '127.0.0.1:8000');
        const fallbackRes = await fetch(fallbackUrl, {
          headers: {
            'Accept': 'application/json',
          },
        });
        if (fallbackRes.ok) {
          return await fallbackRes.json();
        }
      } catch {
        // Fall through to throw original error
      }
    }
    throw err;
  }
}
