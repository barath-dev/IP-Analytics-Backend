import { pb, withAuthRetry } from '../config';

export async function getUserSites(userId: string): Promise<string[]> {
    try {
        const records = await withAuthRetry(() => pb.collection('Projects').getFullList({
            filter: `user_id = "${userId}"`,
        }));
        const sites = records.map((p: any) => p.site_id);
        console.log(`[getUserSites] User ID: ${userId}, Allowed:`, sites);
        return sites;
    } catch (err) {
        console.error('[getUserSites Error]', err);
        return [];
    }
}

export async function getAllRecords(siteId?: string, allowedSites?: string[]): Promise<any[]> {
    let filterParts = [];
    if (siteId) filterParts.push(`site_id="${siteId}"`);
    if (allowedSites) {
        if (allowedSites.length === 0) return []; // User has no sites registered
        const siteFilter = allowedSites.map(s => `site_id="${s}"`).join(' || ');
        filterParts.push(`(${siteFilter})`);
    }

    const filter = filterParts.length > 0 ? filterParts.join(' && ') : '';
    
    // Paginated fetch logic
    const PAGE_SIZE = 500;
    let page = 1;
    let allRecords: any[] = [];

    try {
        while (true) {
            const result = await withAuthRetry(() => pb.collection('IP_Details').getList(page, PAGE_SIZE, { filter }));
            allRecords = allRecords.concat(result.items);

            if (page >= result.totalPages) break;
            page++;
        }
        return allRecords;
    } catch (err) {
        console.error('[getAllRecords Error]', err);
        return [];
    }
}
