import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
export type StorageProvider = 'google_drive' | 's3' | 'dropbox';

export interface GoogleDriveStatus {
  connected: boolean;
  provider: string;
  email: string | null;
  folder_id: string | null;
}

export interface S3Status {
  connected: boolean;
  provider: string;
  bucket: string | null;
  region: string | null;
  prefix: string | null;
}

export interface DropboxStatus {
  connected: boolean;
  provider: string;
  email: string | null;
  folder_path: string | null;
}

export interface S3Config {
  bucket: string;
  region: string;
  prefix?: string;
  access_key_id: string;
  secret_access_key: string;
}

// Google Drive Hook
export function useGoogleDriveAuth(teamId: string) {
  const queryClient = useQueryClient();

  // Get connection status
  const { data: status, isLoading } = useQuery({
    queryKey: ['google-drive-status', teamId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/google-drive/status?team_id=${teamId}`,
        { headers: await getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to get status');
      return response.json() as Promise<GoogleDriveStatus>;
    },
    enabled: !!teamId,
  });

  // Connect (get auth URL and redirect)
  const connect = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/google-drive/auth-url`,
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ team_id: teamId }),
        }
      );
      if (!response.ok) throw new Error('Failed to get auth URL');
      const data = await response.json();
      window.location.href = data.url;
    },
  });

  // Disconnect
  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/google-drive/disconnect`,
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ team_id: teamId }),
        }
      );
      if (!response.ok) throw new Error('Failed to disconnect');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['google-drive-status', teamId],
        refetchType: 'none',
      });
    },
  });

  return {
    status,
    isLoading,
    isConnected: status?.connected ?? false,
    email: status?.email,
    connect: connect.mutate,
    disconnect: disconnect.mutate,
    isConnecting: connect.isPending,
    isDisconnecting: disconnect.isPending,
  };
}

// S3 Hook
export function useS3Storage(teamId: string) {
  const queryClient = useQueryClient();

  // Get connection status
  const { data: status, isLoading } = useQuery({
    queryKey: ['s3-status', teamId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/s3/status?team_id=${teamId}`,
        { headers: await getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to get status');
      return response.json() as Promise<S3Status>;
    },
    enabled: !!teamId,
  });

  // Validate S3 config
  const validate = useMutation({
    mutationFn: async (config: S3Config) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/s3/validate`,
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ team_id: teamId, ...config }),
        }
      );
      if (!response.ok) throw new Error('Failed to validate');
      return response.json() as Promise<{
        valid: boolean;
        error: string | null;
      }>;
    },
  });

  // Configure S3
  const configure = useMutation({
    mutationFn: async (config: S3Config) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/s3/configure`,
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ team_id: teamId, ...config }),
        }
      );
      if (!response.ok) throw new Error('Failed to configure');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['s3-status', teamId],
        refetchType: 'none',
      });
    },
  });

  // Disconnect
  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/s3/disconnect`,
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ team_id: teamId }),
        }
      );
      if (!response.ok) throw new Error('Failed to disconnect');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['s3-status', teamId],
        refetchType: 'none',
      });
    },
  });

  return {
    status,
    isLoading,
    isConnected: status?.connected ?? false,
    bucket: status?.bucket,
    region: status?.region,
    validate: validate.mutateAsync,
    configure: configure.mutate,
    disconnect: disconnect.mutate,
    isValidating: validate.isPending,
    isConfiguring: configure.isPending,
    isDisconnecting: disconnect.isPending,
    validationResult: validate.data,
  };
}

// Dropbox Hook
export function useDropboxAuth(teamId: string) {
  const queryClient = useQueryClient();

  // Get connection status
  const { data: status, isLoading } = useQuery({
    queryKey: ['dropbox-status', teamId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/dropbox/status?team_id=${teamId}`,
        { headers: await getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to get status');
      return response.json() as Promise<DropboxStatus>;
    },
    enabled: !!teamId,
  });

  // Connect (get auth URL and redirect)
  const connect = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/dropbox/auth-url`,
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ team_id: teamId }),
        }
      );
      if (!response.ok) throw new Error('Failed to get auth URL');
      const data = await response.json();
      window.location.href = data.url;
    },
  });

  // Disconnect
  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/storage/dropbox/disconnect`,
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ team_id: teamId }),
        }
      );
      if (!response.ok) throw new Error('Failed to disconnect');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['dropbox-status', teamId],
        refetchType: 'none',
      });
    },
  });

  return {
    status,
    isLoading,
    isConnected: status?.connected ?? false,
    email: status?.email,
    connect: connect.mutate,
    disconnect: disconnect.mutate,
    isConnecting: connect.isPending,
    isDisconnecting: disconnect.isPending,
  };
}

// Helper to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  // @ts-expect-error - Clerk is available globally
  const token = await window.Clerk?.session?.getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
