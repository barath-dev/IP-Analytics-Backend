const PocketBase = require('pocketbase/cjs');
require('dotenv').config();

const rawDbUrl = process.env.DBURL;
const BASE_URL = rawDbUrl.replace(/\/api\/$/, '');
console.log("BASE_URL", BASE_URL);

const pb = new PocketBase(BASE_URL);

async function test() {
    try {
        console.log("Logging in as admin...");
        await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
        console.log("Success! Token:", !!pb.authStore.token);
        
        console.log("Fetching Projects...");
        const res = await pb.collection('Projects').getFullList();
        console.log("Projects:", res.length);
        
        console.log("Fetching IP_Details...");
        const res2 = await pb.collection('IP_Details').getFullList();
        console.log("IP_Details:", res2.length);
    } catch (e) {
        console.error("Error:", e.status, e.response);
    }
}
test();
