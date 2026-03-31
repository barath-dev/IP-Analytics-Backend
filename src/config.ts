import PocketBase from 'pocketbase';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const rawDbUrl = process.env.DBURL || 'http://127.0.0.1:8090';
export const DBURL = rawDbUrl.endsWith('/api/') ? rawDbUrl : `${rawDbUrl.replace(/\/$/, '')}/api/`;
export const BASE_URL = rawDbUrl.replace(/\/api\/$/, '');

export const pb = new PocketBase(BASE_URL);

/**
 * Programmatically login as admin so we don't need a hardcoded JWT.
 * Throws a loud error in production to trigger restart.
 */
export async function initAdminAuth() {
    if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
        try {
            // PocketBase SDK >= 0.23 maps pb.admins to _superusers.
            // If the server is <= 0.22, this fails. We can use a direct axios call for older versions.
            try {
                await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
            } catch (e: any) {
                if (e.status === 404) {
                    // Fall back to legacy admin auth for PocketBase <= 0.22 servers
                    const res = await axios.post(`${BASE_URL}/api/admins/auth-with-password`, {
                        identity: process.env.PB_ADMIN_EMAIL,
                        password: process.env.PB_ADMIN_PASSWORD
                    });
                    pb.authStore.save(res.data.token, res.data.admin);
                } else {
                    throw e;
                }
            }
            console.log('[Auth] Admin authenticated successfully');
        } catch (error) {
            console.error('[Auth] CRITICAL: Failed to authenticate admin client:', error);
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            }
        }
    } else if (process.env.POCKETBASE_TOKEN) {
        pb.authStore.save(process.env.POCKETBASE_TOKEN, null);
    }
}

/**
 * Resilient wrapper for PocketBase calls that may fail due to a dropped admin token.
 */
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
        if (!pb.authStore.isValid) {
            console.warn('[Auth] pb.authStore invalid, re-authenticating...');
            await initAdminAuth();
        }
        return await fn();
    } catch (err: any) {
        // PocketBase returns 401 when the admin token expires
        if (err?.status === 401) {
            console.warn('[Auth] Admin token expired (401), re-authenticating...');
            await initAdminAuth();
            return await fn(); // retry once after re-auth
        }
        throw err;
    }
}

initAdminAuth();
