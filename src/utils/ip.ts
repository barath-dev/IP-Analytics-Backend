import axios from 'axios';
import { Request } from 'express';

export async function fetchIPDetails(ip: string): Promise<any> {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,org,query`);
        const data = response.data;
        if (data.status !== 'success') {
            console.error('[IP Lookup Failed]', data.message);
            return null;
        }
        return {
            ip: data.query,
            city: data.city,
            region: data.regionName,
            country: data.country,
            postal: data.zip,
            latitude: data.lat,
            longitude: data.lon,
            timezone: data.timezone,
            org: data.org
        };
    } catch (error) {
        console.error('[IP Lookup Error]', error);
        return null;
    }
}

export function getClientIP(req: Request): string | null {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!ip) return null;
    return (ip as string).split(',')[0].trim();
}
