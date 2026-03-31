const PocketBase = require('pocketbase/cjs');
const pb = new PocketBase('https://ip-analytics.pockethost.io/');

async function test() {
    try {
        console.log("Fetching Projects anonymously...");
        const res = await pb.collection('Projects').getFullList();
        console.log("Projects:", res.length);
    } catch (e) {
        console.error("Projects Error:", e.status, e.response);
    }
}
test();
