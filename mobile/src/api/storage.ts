import * as SecureStore from "expo-secure-store";

/**
 * Where the session lives on the device.
 *
 * SecureStore, never AsyncStorage: this holds a refresh token good for 30 days,
 * and AsyncStorage is an unencrypted file that any backup or a rooted device
 * hands over in plain text. SecureStore is the iOS Keychain and Android
 * Keystore.
 */

const ACCESS = "completepool.accessToken";
const REFRESH = "completepool.refreshToken";
const USER = "completepool.user";

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
};

/**
 * The last identity the server confirmed.
 *
 * Kept so a launch with no signal can still show the right person and route to
 * the right screens. It is a cache, never the authority — every request is
 * still authorized by the token, and the app corrects this from `/me` as soon
 * as it can reach the server.
 */
export type CachedUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "OWNER" | "ADMIN" | "WORKER";
};

export async function readCachedUser(): Promise<CachedUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER);
    return raw ? (JSON.parse(raw) as CachedUser) : null;
  } catch {
    return null;
  }
}

export async function writeCachedUser(user: CachedUser): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER, JSON.stringify(user), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // A missing cache costs a spinner on the next offline launch, nothing more.
  }
}

/**
 * SecureStore throws on a device with no passcode set, on a corrupt keychain
 * entry, and in a few simulator states. A session we cannot read is simply a
 * session we do not have — the app must land on the sign-in screen rather than
 * crash on launch.
 */
export async function readSession(): Promise<StoredSession | null> {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS),
      SecureStore.getItemAsync(REFRESH),
    ]);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  } catch {
    return null;
  }
}

export async function writeSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS, session.accessToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(REFRESH, session.refreshToken, {
      // Not migrated to a new phone by a backup restore, and unreadable while
      // the device is locked. A crew member's credential should not travel.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  ]);
}

export async function clearSession(): Promise<void> {
  // Deleting a key that isn't there is not an error worth surfacing: the
  // caller's intent — "no session on this device" — is satisfied either way.
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS).catch(() => {}),
    SecureStore.deleteItemAsync(REFRESH).catch(() => {}),
    SecureStore.deleteItemAsync(USER).catch(() => {}),
  ]);
}
