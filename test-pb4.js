const PocketBase = require('pocketbase/cjs');
require('dotenv').config();

const rawDbUrl = process.env.DBURL;
const BASE_URL = rawDbUrl.replace(/\/api\/$/, '');

const pb = new PocketBase(BASE_URL);

async function test() {
    try {
        console.log("has admins?", !!pb.admins);
        console.log("has collection?", !!pb.collection);
        if (pb.admins) {
            await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
        } else {
            console.log("No pb.admins, using generic collection request for admins");
            // Workaround for SDK v0.23+ talking to server v0.22-
            await pb.send("/api/admins/auth-with-password", {
                method: "POST",
                body: {
                    identity: process.env.PB_ADMIN_EMAIL,
                    password: process.env.PB_ADMIN_PASSWORD
                }
            }).then(authData => {
                pb.authStore.save(authData.token, authData.admin);
            });
        }
        
        console.log("Success! Token:", !!pb.authStore.token);
        
        console.log("Fetching Projects...");
        const res = await pb.collection('Projects').getFullList();
        console.log("Projects:", res.length);
        
    } catch (e) {
        console.error("Error:", e.status, e.response);
    }
}
test();
