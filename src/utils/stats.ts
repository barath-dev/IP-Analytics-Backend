export function buildStats(data: any[]) {
    const reduce = (key: string, fallback = key) =>
        data.reduce((acc: any, item: any) => {
            const val = item[key] || fallback;
            acc[val] = (acc[val] ?? 0) + (key === 'country' ? item.visit_count : 1);
            return acc;
        }, {});

    const countryStats  = reduce('country');
    const orgStats      = reduce('org');
    const browserStats  = reduce('browser');
    const osStats       = reduce('os');
    const deviceStats   = reduce('device');
    const referrerStats = data.reduce((acc: any, item: any) => {
        const ref = item.referrer || 'Direct';
        acc[ref] = (acc[ref] ?? 0) + 1;
        return acc;
    }, {});
    const pageStats = data.reduce((acc: any, item: any) => {
        const path = item.pathname || '/';
        acc[path] = (acc[path] ?? 0) + 1;
        return acc;
    }, {});

    return {
        overallStats: {
            totalVisitors: data.length,
            totalVisits: data.reduce((s: number, r: any) => s + (r.visit_count ?? 1), 0),
            totalCountries: Object.keys(countryStats).length,
            totalOrgs: Object.keys(orgStats).length,
        },
        countryStats,
        orgStats,
        browserStats,
        osStats,
        deviceStats,
        referrerStats,
        pageStats,
    };
}
