const axios = require('axios');
const PocketBase = require('pocketbase/cjs');
require('dotenv').config();

const rawDbUrl = process.env.DBURL;
const BASE_URL = rawDbUrl.replace(/\/api\/$/, '');

const pb = new PocketBase(BASE_URL);

async function test() {
    try {
        console.log("Logging in as admin...");
        try {
            await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
        } catch (e) {
            if (e.status === 404) {
                console.log("Falling back...");
                const res = await axios.post(`${BASE_URL}/api/admins/auth-with-password`, {
                    identity: process.env.PB_ADMIN_EMAIL,
                    password: process.env.PB_ADMIN_PASSWORD
                });
                pb.authStore.save(res.data.token, res.data.admin);
            } else {
                throw e;
            }
        }
        console.log("Success! Token received:", !!pb.authStore.token);
        
        console.log("Fetching Projects...");
        const res = await pb.collection('Projects').getFullList();
        console.log("Projects:", res.length);
        
        console.log("Fetching IP_Details...");
        const res2 = await pb.collection('IP_Details').getFullList();
        console.log("IP_Details:", res2.length);
    } catch (e) {
        console.error("Error:", e.response ? e.response.status : e.status, e.response ? e.response.data : e.response);
    }
}
test();
