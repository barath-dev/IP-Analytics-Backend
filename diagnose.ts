
import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

const BASE_URL = (process.env.DBURL || 'http://127.0.0.1:8090').replace(/\/api\/$/, '');
const token = process.env.POCKETBASE_TOKEN;

async function diagnose() {
    console.log('--- PocketBase Diagnostic ---');
    console.log('Base URL:', BASE_URL);
    console.log('Has Token:', !!token);

    const pb = new PocketBase(BASE_URL);
    if (token) {
        pb.authStore.save(token, null);
    }

    console.log('Auth Store Valid:', pb.authStore.isValid);
    
    try {
        const projects = await pb.collection('Projects').getFullList({ limit: 5 });
        console.log('Successfully fetched Projects. Count:', projects.length);
        if (projects.length > 0) {
            console.log('Sample Project:', JSON.stringify(projects[0], null, 2));
        }

        const ipDetails = await pb.collection('IP_Details').getFullList({ limit: 5 });
        console.log('Successfully fetched IP_Details. Count:', ipDetails.length);
        if (ipDetails.length > 0) {
            console.log('Sample IP_Detail:', JSON.stringify(ipDetails[0], null, 2));
        }
    } catch (err: any) {
        console.error('Fetch Error:', err.message);
        console.error('Status:', err.status);
        console.error('Data:', JSON.stringify(err.data, null, 2));
    }
}

diagnose();
