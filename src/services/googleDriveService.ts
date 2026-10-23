import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
];

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
// Prompt user to select an account if needed
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory token cache (never stored in localStorage per security guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token not cached yet or refreshed
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive OAuth access token.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const googleLogout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

/**
 * Finds or creates a dedicated "Air Canvas Drawings" folder in Google Drive root
 */
export async function getOrCreateAirCanvasFolder(token: string): Promise<string> {
  const query = encodeURIComponent("name = 'Air Canvas Drawings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Air Canvas Drawings',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Drawings, sketches, and project files saved from Air Canvas',
    }),
  });

  if (!createRes.ok) {
    throw new Error('Failed to create Air Canvas folder in Google Drive.');
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * Lists drawings saved in Google Drive (in "Air Canvas Drawings" folder or matching AirCanvas files)
 */
export async function listDriveDrawings(token: string): Promise<DriveFileItem[]> {
  try {
    const folderId = await getOrCreateAirCanvasFolder(token);
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink)&orderBy=modifiedTime desc&pageSize=50`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      throw new Error(`Google Drive API error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.error('Failed to list drawings from Google Drive:', err);
    throw err;
  }
}

/**
 * Saves a canvas snapshot or project file to Google Drive
 */
export async function saveDrawingToDrive(
  token: string,
  fileName: string,
  blob: Blob,
  mimeType: string = 'image/png'
): Promise<DriveFileItem> {
  const folderId = await getOrCreateAirCanvasFolder(token);

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: mimeType,
    description: 'Created with Air Canvas Wireless Tablet Studio',
  };

  const boundary = '-------AirCanvasBoundary' + Math.random().toString(36).substring(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const blobArrayBuffer = await blob.arrayBuffer();

  const multipartBody = new Blob(
    [
      new TextEncoder().encode(metadataPart),
      new TextEncoder().encode(mediaHeader),
      blobArrayBuffer,
      new TextEncoder().encode(closeDelimiter),
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!uploadRes.ok) {
    const errorBody = await uploadRes.text();
    console.error('Upload to Drive failed:', errorBody);
    throw new Error(`Failed to upload to Google Drive: ${uploadRes.statusText}`);
  }

  return await uploadRes.json();
}

/**
 * Downloads a file's content from Google Drive
 */
export async function downloadFileFromDrive(token: string, fileId: string): Promise<Blob> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download file from Google Drive: ${res.statusText}`);
  }

  return await res.blob();
}

/**
 * Deletes a file from Google Drive (MUST be preceded by user confirmation)
 */
export async function deleteFileFromDrive(token: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete file from Google Drive: ${res.statusText}`);
  }
}
