import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/appParams';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Create a client with authentication configuration
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '', // Default server URL
  requiresAuth: false,
  appBaseUrl
});
